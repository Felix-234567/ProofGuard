using System;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Proveguard.Api.Core.Interfaces;
using Proveguard.Api.Core.Models;

namespace Proveguard.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/designers")]
public class DesignersController : ControllerBase
{
    private readonly IDbService _dbService;
    private readonly ILogger<DesignersController> _logger;

    public DesignersController(IDbService dbService, ILogger<DesignersController> logger)
    {
        _dbService = dbService;
        _logger = logger;
    }

    private string GetDesignerId()
    {
        return User.FindFirst("user_id")?.Value
               ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
               ?? throw new UnauthorizedAccessException("Designer ID not found in token claims.");
    }

    /// <summary>
    /// GET /api/designers/profile — Returns the authenticated designer's full profile.
    /// </summary>
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var designerId = GetDesignerId();

        var designer = await _dbService.QuerySingleOrDefaultAsync<Designer>(
            "SELECT * FROM Designers WHERE id = ?1", designerId);

        if (designer == null)
        {
            return NotFound("Designer not found.");
        }

        return Ok(designer);
    }

    /// <summary>
    /// PUT /api/designers/profile — Updates the authenticated designer's payout/profile info.
    /// Accepts partial updates. Columns not sent keep their current DB value.
    /// </summary>
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var designerId = GetDesignerId();

        // Ensure the designer row exists first (create if needed)
        var existing = await _dbService.QuerySingleOrDefaultAsync<Designer>(
            "SELECT * FROM Designers WHERE id = ?1", designerId);

        if (existing == null)
        {
            // Auto-create the designer record from JWT claims
            var name = User.FindFirst("name")?.Value
                       ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
                       ?? request.Name
                       ?? "Designer";

            var email = User.FindFirst("email")?.Value
                        ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
                        ?? "";

            await _dbService.ExecuteAsync(
                "INSERT INTO Designers (id, name, email, created_at) VALUES (?1, ?2, ?3, ?4)",
                designerId, name, email, DateTime.UtcNow);

            _logger.LogInformation("Auto-created Designer record for {DesignerId} during profile update", designerId);
        }

        // Build UPDATE SET clauses dynamically — only update provided fields
        var setClauses = new System.Collections.Generic.List<string>();
        var parameters = new System.Collections.Generic.List<object>();

        if (request.Phone != null)
        {
            setClauses.Add("phone = ?" + (parameters.Count + 1));
            parameters.Add(request.Phone);
        }

        if (request.MomoProvider != null)
        {
            setClauses.Add("momo_provider = ?" + (parameters.Count + 1));
            parameters.Add(request.MomoProvider);
        }

        if (request.MomoNumber != null)
        {
            setClauses.Add("momo_number = ?" + (parameters.Count + 1));
            parameters.Add(request.MomoNumber);
        }

        if (request.BusinessName != null)
        {
            setClauses.Add("business_name = ?" + (parameters.Count + 1));
            parameters.Add(request.BusinessName);
        }

        if (request.Name != null)
        {
            setClauses.Add("name = ?" + (parameters.Count + 1));
            parameters.Add(request.Name);
        }

        // Always set profile_completed = 1 when this endpoint is called
        setClauses.Add("profile_completed = ?" + (parameters.Count + 1));
        parameters.Add(1);

        // Add designer ID as the last parameter for WHERE clause
        parameters.Add(designerId);

        var sql = $"UPDATE Designers SET {string.Join(", ", setClauses)} WHERE id = ?{parameters.Count}";

        await _dbService.ExecuteAsync(sql, parameters.ToArray());

        // Return the updated designer
        var updated = await _dbService.QuerySingleOrDefaultAsync<Designer>(
            "SELECT * FROM Designers WHERE id = ?1", designerId);

        _logger.LogInformation("Designer {DesignerId} updated profile (business: {Business})", designerId, request.BusinessName ?? "not-set");

        return Ok(updated);
    }

    /// <summary>
    /// DTO for updating a designer's profile.
    /// All fields are optional — only provided fields are updated in the DB.
    /// Property names match the snake_case convention the frontend sends.
    /// </summary>
    public class UpdateProfileRequest
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("phone")]
        public string? Phone { get; set; }

        [JsonPropertyName("momo_provider")]
        public string? MomoProvider { get; set; }

        [JsonPropertyName("momo_number")]
        public string? MomoNumber { get; set; }

        [JsonPropertyName("business_name")]
        public string? BusinessName { get; set; }
    }
}
