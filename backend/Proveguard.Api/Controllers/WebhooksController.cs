using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Proveguard.Api.Core.Interfaces;
using Proveguard.Api.Core.Models;

namespace Proveguard.Api.Controllers;

[ApiController]
[Route("api/webhooks")]
public class WebhooksController : ControllerBase
{
    private readonly IDbService _dbService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<WebhooksController> _logger;
    private readonly JsonSerializerOptions _jsonSerializerOptions;

    public WebhooksController(IDbService dbService, IConfiguration configuration, ILogger<WebhooksController> logger)
    {
        _dbService = dbService;
        _configuration = configuration;
        _logger = logger;
        
        _jsonSerializerOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
    }

    [HttpPost("payment")]
    public async Task<IActionResult> HandlePaystackWebhook()
    {
        // 1. Read request body
        Request.EnableBuffering();
        using var reader = new StreamReader(Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);
        var requestBody = await reader.ReadToEndAsync();
        Request.Body.Position = 0;

        // 2. Verify Paystack HMAC-SHA512 signature
        var paystackSignature = Request.Headers["x-paystack-signature"].ToString();
        var secretKey = _configuration["Paystack:SecretKey"] ?? "";

        if (string.IsNullOrEmpty(paystackSignature) || !VerifySignature(requestBody, paystackSignature, secretKey))
        {
            _logger.LogWarning("Invalid Paystack webhook signature.");
            return BadRequest("Signature verification failed.");
        }

        // 3. Parse webhook payload
        try
        {
            var payload = JsonSerializer.Deserialize<PaystackWebhookPayload>(requestBody, _jsonSerializerOptions);
            if (payload == null)
            {
                return BadRequest("Invalid JSON payload.");
            }

            _logger.LogInformation("Received Paystack webhook event: {Event}", payload.Event);

            if (payload.Event == "charge.success")
            {
                var reference = payload.Data.Reference;
                _logger.LogInformation("Processing charge.success for payment reference: {Ref}", reference);

                // Fetch payment using Paystack provider reference
                var payment = await _dbService.QuerySingleOrDefaultAsync<Payment>(
                    "SELECT * FROM Payments WHERE payment_provider_ref = ?1", reference);

                if (payment == null)
                {
                    _logger.LogWarning("Payment record not found for provider reference: {Ref}", reference);
                    return Ok(); // Return 200 to prevent Paystack from retrying endlessly
                }

                if (payment.Status != "Completed")
                {
                    // Update Payment status
                    await _dbService.ExecuteAsync(
                        "UPDATE Payments SET status = 'Completed' WHERE id = ?1", payment.Id);

                    // Update corresponding Project status to 'Paid'
                    await _dbService.ExecuteAsync(
                        "UPDATE Projects SET status = 'Paid', paid_at = ?1 WHERE id = ?2",
                        DateTime.UtcNow, payment.ProjectId);

                    _logger.LogInformation("Successfully completed payment and unlocked project: {ProjectId}", payment.ProjectId);
                }
            }

            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling Paystack webhook.");
            return StatusCode(StatusCodes.Status500InternalServerError, "Webhook processing error");
        }
    }

    private bool VerifySignature(string body, string signatureHeader, string secretKey)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secretKey);
        var bodyBytes = Encoding.UTF8.GetBytes(body);

        using var hmac = new HMACSHA512(keyBytes);
        var hashBytes = hmac.ComputeHash(bodyBytes);
        
        // Convert to lowercase hex representation
        var sb = new StringBuilder();
        foreach (var b in hashBytes)
        {
            sb.Append(b.ToString("x2"));
        }
        var computedSignature = sb.ToString();

        return string.Equals(computedSignature, signatureHeader, StringComparison.OrdinalIgnoreCase);
    }

    // Webhook mapping DTOs
    private class PaystackWebhookPayload
    {
        [JsonPropertyName("event")]
        public string Event { get; set; } = "";

        [JsonPropertyName("data")]
        public PaystackWebhookData Data { get; set; } = new();
    }

    private class PaystackWebhookData
    {
        [JsonPropertyName("reference")]
        public string Reference { get; set; } = "";

        [JsonPropertyName("amount")]
        public int Amount { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = "";
    }
}
