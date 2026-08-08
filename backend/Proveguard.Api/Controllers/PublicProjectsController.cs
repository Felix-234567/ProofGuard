using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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
[Route("api/public/projects")]
public class PublicProjectsController : ControllerBase
{
    private readonly IDbService _dbService;
    private readonly IStorageService _storageService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PublicProjectsController> _logger;
    private readonly HttpClient _httpClient;

    public PublicProjectsController(IDbService dbService, IStorageService storageService, IConfiguration configuration, ILogger<PublicProjectsController> logger)
    {
        _dbService = dbService;
        _storageService = storageService;
        _configuration = configuration;
        _logger = logger;

        _httpClient = new HttpClient();
        var paystackSecret = _configuration["Paystack:SecretKey"] ?? "";
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", paystackSecret);
    }

    [HttpGet("{token}")]
    public async Task<IActionResult> GetProjectByToken(string token)
    {
        var query = @"
            SELECT p.*, d.name as DesignerName 
            FROM Projects p
            JOIN Designers d ON p.designer_id = d.id
            WHERE p.public_link_token = ?1";

        // Map DTO to return clean public details
        var project = await _dbService.QuerySingleOrDefaultAsync<ProjectWithDesignerDto>(query, token);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        return Ok(project);
    }

    [HttpPost("{token}/view")]
    public async Task<IActionResult> MarkAsViewed(string token)
    {
        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE public_link_token = ?1", token);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        // Only update if not already paid and not already viewed
        if (project.Status == "Not Viewed")
        {
            var now = DateTime.UtcNow;
            await _dbService.ExecuteAsync(
                "UPDATE Projects SET status = 'Viewed', viewed_at = ?1 WHERE id = ?2",
                now, project.Id);
            
            project.Status = "Viewed";
            project.ViewedAt = now;
        }

        return Ok(new { status = project.Status, viewedAt = project.ViewedAt });
    }

    [HttpGet("{token}/download-preview")]
    public async Task<IActionResult> DownloadPreview(string token)
    {
        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE public_link_token = ?1", token);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        try
        {
            var fileStream = await _storageService.DownloadFileAsync(project.PreviewFileKey);
            var contentType = project.PreviewFileKey.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
                ? "application/pdf"
                : "image/jpeg";

            // Return stream
            return File(fileStream, contentType, Path.GetFileName(project.PreviewFileKey));
        }
        catch (FileNotFoundException)
        {
            return NotFound("Preview file not found in storage.");
        }
    }

    [HttpPost("{token}/pay")]
    public async Task<IActionResult> InitiatePayment(string token)
    {
        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE public_link_token = ?1", token);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        if (project.Status == "Paid")
        {
            return BadRequest("Project has already been paid for.");
        }

        var paymentId = Guid.NewGuid().ToString();
        var callbackBaseUrl = _configuration["Paystack:CallbackUrl"] ?? "https://proofguard.onrender.com/api/payments/verify";
        var callbackUrl = $"{callbackBaseUrl}?token={token}";

        // Paystack expects amount in kobo (cents)
        var amountInKobo = Convert.ToInt32(project.Price * 100);

        // Development bypass for unconfigured/mock payments
        var paystackSecret = _configuration["Paystack:SecretKey"] ?? "";
        if (string.IsNullOrEmpty(paystackSecret) || paystackSecret == "sk_test_placeholder")
        {
            _logger.LogInformation("Bypassing Paystack payment initialization in development for project {ProjectId}", project.Id);
            
            await _dbService.ExecuteAsync(
                "UPDATE Projects SET status = 'Paid', paid_at = ?1 WHERE id = ?2",
                DateTime.UtcNow, project.Id);

            await _dbService.ExecuteAsync(
                @"INSERT INTO Payments (id, project_id, amount, payment_provider_ref, status, created_at) 
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                paymentId, project.Id, project.Price, "pay_bypass_" + Guid.NewGuid().ToString("N")[..8], "Completed", DateTime.UtcNow);

            return Ok(new
            {
                authorizationUrl = "",
                accessCode = "bypass",
                reference = "bypass"
            });
        }

        var paystackRequest = new PaystackInitializeRequest
        {
            Email = project.ClientEmail,
            Amount = amountInKobo,
            CallbackUrl = callbackUrl,
            Reference = paymentId
        };

        // Create pending payment record BEFORE calling Paystack to prevent
        // orphaned payments (customer pays but we have no DB record)
        await _dbService.ExecuteAsync(
            @"INSERT INTO Payments (id, project_id, amount, payment_provider_ref, status, created_at) 
              VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            paymentId, project.Id, project.Price, paymentId, "Pending", DateTime.UtcNow);

        try
        {
            _logger.LogInformation("Initializing Paystack payment of {Amount} kobo for project {ProjectId}", amountInKobo, project.Id);
            var response = await _httpClient.PostAsJsonAsync("https://api.paystack.co/transaction/initialize", paystackRequest);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("Paystack initialization failed: {ErrorContent}", errorContent);

                await _dbService.ExecuteAsync(
                    "UPDATE Payments SET status = 'Failed' WHERE id = ?1", paymentId);

                return StatusCode(StatusCodes.Status502BadGateway, "Failed to initialize payment gateway.");
            }

            var paystackResponse = await response.Content.ReadFromJsonAsync<PaystackInitializeResponse>();

            if (paystackResponse == null || !paystackResponse.Status)
            {
                await _dbService.ExecuteAsync(
                    "UPDATE Payments SET status = 'Failed' WHERE id = ?1", paymentId);

                return StatusCode(StatusCodes.Status502BadGateway, "Invalid response from payment gateway.");
            }

            return Ok(new
            {
                authorizationUrl = paystackResponse.Data.AuthorizationUrl,
                accessCode = paystackResponse.Data.AccessCode,
                reference = paystackResponse.Data.Reference
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initiating Paystack payment for project {ProjectId}", project.Id);

            // Clean up the pending payment record on failure
            await _dbService.ExecuteAsync(
                "UPDATE Payments SET status = 'Failed' WHERE id = ?1", paymentId);

            return StatusCode(StatusCodes.Status500InternalServerError, $"Error initiating payment: {ex.Message}");
        }
    }

    [HttpGet("{token}/verify-payment")]
    public async Task<IActionResult> VerifyPayment(string token)
    {
        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE public_link_token = ?1", token);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        // If already paid, no need to re-verify
        if (project.Status == "Paid")
        {
            return Ok(new { status = "Paid", verified = true });
        }

        // Find the pending payment for this project
        var payment = await _dbService.QuerySingleOrDefaultAsync<Payment>(
            "SELECT * FROM Payments WHERE project_id = ?1 AND status = 'Pending'", project.Id);

        if (payment == null)
        {
            return Ok(new { status = project.Status, verified = false });
        }

        var paystackSecret = _configuration["Paystack:SecretKey"] ?? "";
        if (string.IsNullOrEmpty(paystackSecret) || paystackSecret == "sk_test_placeholder")
        {
            return Ok(new { status = project.Status, verified = false });
        }

        try
        {
            // Call Paystack's verify endpoint to check payment status directly
            var verifyResponse = await _httpClient.GetAsync(
                $"https://api.paystack.co/transaction/verify/{payment.PaymentProviderRef}");

            if (!verifyResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Paystack verification failed for reference {Ref}: {StatusCode}",
                    payment.PaymentProviderRef, verifyResponse.StatusCode);
                return Ok(new { status = project.Status, verified = false });
            }

            var verifyResult = await verifyResponse.Content.ReadFromJsonAsync<PaystackVerifyResponse>();

            if (verifyResult?.Data?.Status == "success")
            {
                // Payment confirmed — update records
                await _dbService.ExecuteAsync(
                    "UPDATE Payments SET status = 'Completed' WHERE id = ?1", payment.Id);

                await _dbService.ExecuteAsync(
                    "UPDATE Projects SET status = 'Paid', paid_at = ?1 WHERE id = ?2",
                    DateTime.UtcNow, project.Id);

                _logger.LogInformation("Payment verified directly for payment {PaymentId}, project {ProjectId}",
                    payment.Id, project.Id);

                return Ok(new { status = "Paid", verified = true });
            }

            return Ok(new { status = project.Status, verified = false });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying payment for project {ProjectId}", project.Id);
            return StatusCode(StatusCodes.Status500InternalServerError, "Payment verification error.");
        }
    }

    [HttpGet("{token}/download-original")]
    public async Task<IActionResult> DownloadOriginal(string token)
    {
        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE public_link_token = ?1", token);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        if (project.Status != "Paid")
        {
            return Forbid("Access denied. Project payment has not been completed.");
        }

        try
        {
            var fileStream = await _storageService.DownloadFileAsync(project.OriginalFileKey);
            var contentType = project.OriginalFileKey.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
                ? "application/pdf"
                : "image/jpeg";

            var fileName = Path.GetFileName(project.OriginalFileKey);

            // Set Content-Disposition to force download instead of inline display
            Response.Headers.Append("Content-Disposition", $"attachment; filename=\"{fileName}\"");

            return File(fileStream, contentType, fileName);
        }
        catch (FileNotFoundException)
        {
            return NotFound("Original file not found in storage.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading original file for project {ProjectId}", project.Id);
            return StatusCode(StatusCodes.Status500InternalServerError, $"Error downloading file: {ex.Message}");
        }
    }

    // DTO for join results
    private class ProjectWithDesignerDto
    {
        public string Id { get; set; } = "";
        public string DesignerId { get; set; } = "";
        public string Title { get; set; } = "";
        public string ClientEmail { get; set; } = "";
        public decimal Price { get; set; }
        public string Status { get; set; } = "";
        public string OriginalFileKey { get; set; } = "";
        public string PreviewFileKey { get; set; } = "";
        public string PublicLinkToken { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public DateTime? ViewedAt { get; set; }
        public DateTime? PaidAt { get; set; }
        public string DesignerName { get; set; } = "";
    }

    // Paystack payload mapping classes
    private class PaystackInitializeRequest
    {
        [JsonPropertyName("email")]
        public required string Email { get; set; }

        [JsonPropertyName("amount")]
        public int Amount { get; set; }

        [JsonPropertyName("callback_url")]
        public string? CallbackUrl { get; set; }

        [JsonPropertyName("reference")]
        public string? Reference { get; set; }
    }

    private class PaystackInitializeResponse
    {
        [JsonPropertyName("status")]
        public bool Status { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = "";

        [JsonPropertyName("data")]
        public PaystackData Data { get; set; } = new();
    }

    private class PaystackData
    {
        [JsonPropertyName("authorization_url")]
        public string AuthorizationUrl { get; set; } = "";

        [JsonPropertyName("access_code")]
        public string AccessCode { get; set; } = "";

        [JsonPropertyName("reference")]
        public string Reference { get; set; } = "";
    }

    // Paystack transaction verify response
    private class PaystackVerifyResponse
    {
        [JsonPropertyName("status")]
        public bool Status { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = "";

        [JsonPropertyName("data")]
        public PaystackVerifyData Data { get; set; } = new();
    }

    private class PaystackVerifyData
    {
        [JsonPropertyName("reference")]
        public string Reference { get; set; } = "";

        [JsonPropertyName("status")]
        public string Status { get; set; } = "";
    }
}
