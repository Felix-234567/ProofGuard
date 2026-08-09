using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Proveguard.Api.Core.Interfaces;
using Proveguard.Api.Core.Models;

namespace Proveguard.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly IDbService _dbService;
    private readonly IStorageService _storageService;
    private readonly IWatermarkService _watermarkService;
    private readonly IEmailService _emailService;
    private readonly IConfiguration _configuration;

    public ProjectsController(IDbService dbService, IStorageService storageService, IWatermarkService watermarkService, IEmailService emailService, IConfiguration configuration)
    {
        _dbService = dbService;
        _storageService = storageService;
        _watermarkService = watermarkService;
        _emailService = emailService;
        _configuration = configuration;
    }

    private string GetDesignerId()
    {
        // Try Firebase specific user_id claim first, fallback to NameIdentifier
        return User.FindFirst("user_id")?.Value 
               ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
               ?? throw new UnauthorizedAccessException("Designer ID not found in token claims.");
    }

    private async Task EnsureDesignerRegisteredAsync(string designerId)
    {
        var exists = await _dbService.QuerySingleOrDefaultAsync<int>(
            "SELECT COUNT(*) FROM Designers WHERE id = ?1", designerId);

        if (exists == 0)
        {
            var name = User.FindFirst("name")?.Value 
                       ?? User.FindFirst(ClaimTypes.Name)?.Value 
                       ?? "Designer";
            
            var email = User.FindFirst("email")?.Value 
                        ?? User.FindFirst(ClaimTypes.Email)?.Value 
                        ?? "";

            await _dbService.ExecuteAsync(
                "INSERT INTO Designers (id, name, email, created_at) VALUES (?1, ?2, ?3, ?4)",
                designerId, name, email, DateTime.UtcNow);
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateProject([FromForm] string title, [FromForm] string clientEmail, [FromForm] decimal price, IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest("File is required.");
        }

        if (string.IsNullOrWhiteSpace(title))
        {
            return BadRequest("Title is required.");
        }

        if (string.IsNullOrWhiteSpace(clientEmail))
        {
            return BadRequest("Client email is required.");
        }

        var designerId = GetDesignerId();
        await EnsureDesignerRegisteredAsync(designerId);

        var projectId = Guid.NewGuid().ToString();
        var publicToken = Guid.NewGuid().ToString("N");
        var originalExtension = Path.GetExtension(file.FileName).ToLower();

        // Validate file type and set preview format
        bool isPdf = originalExtension == ".pdf";
        bool isImage = new[] { ".jpg", ".jpeg", ".png", ".webp" }.Contains(originalExtension);

        if (!isPdf && !isImage)
        {
            return BadRequest("Unsupported file type. Only PDF and images (JPG, PNG, WebP) are allowed.");
        }

        var previewExtension = isPdf ? ".pdf" : ".jpg";
        var originalFileKey = $"originals/{designerId}/{projectId}{originalExtension}";
        var previewFileKey = $"previews/{designerId}/{projectId}{previewExtension}";

        try
        {
            byte[] watermarkedBytes;
            using (var originalStream = file.OpenReadStream())
            {
                // Upload original private file
                await _storageService.UploadFileAsync(originalFileKey, originalStream, file.ContentType, isPublic: false);
                
                // Reset stream for watermarking
                originalStream.Position = 0;

                // Process watermark
                if (isPdf)
                {
                    watermarkedBytes = await _watermarkService.WatermarkPdfAsync(originalStream, "PROVEGUARD PROOF");
                }
                else
                {
                    watermarkedBytes = await _watermarkService.WatermarkImageAsync(originalStream, "PROVEGUARD PROOF");
                }
            }

            // Upload watermarked preview
            var previewContentType = isPdf ? "application/pdf" : "image/jpeg";
            using (var previewStream = new MemoryStream(watermarkedBytes))
            {
                await _storageService.UploadFileAsync(previewFileKey, previewStream, previewContentType, isPublic: true);
            }

            // Write metadata to database
            var project = new Project
            {
                Id = projectId,
                DesignerId = designerId,
                Title = title,
                ClientEmail = clientEmail,
                Price = price,
                Status = "Not Viewed",
                OriginalFileKey = originalFileKey,
                PreviewFileKey = previewFileKey,
                PublicLinkToken = publicToken,
                CreatedAt = DateTime.UtcNow
            };

            await _dbService.ExecuteAsync(
                @"INSERT INTO Projects (id, designer_id, title, client_email, price, status, original_file_key, preview_file_key, public_link_token, created_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                project.Id, project.DesignerId, project.Title, project.ClientEmail, project.Price, project.Status,
                project.OriginalFileKey, project.PreviewFileKey, project.PublicLinkToken, project.CreatedAt);

            // Send email notification to client
            // App:BaseUrl is the FRONTEND url — the preview page is served by
            // the Next.js app (https://proofguard-bay.vercel.app/preview/{token}),
            // NOT by this API. The backend has no /preview route.
            var baseUrl = _configuration["App:BaseUrl"] ?? "https://proofguard-bay.vercel.app";
            var previewUrl = $"{baseUrl.TrimEnd('/')}/preview/{project.PublicLinkToken}";

            // Fire and forget - don't block response on email delivery
            _ = _emailService.SendProjectNotificationAsync(
                project.ClientEmail,
                project.Title,
                previewUrl,
                project.Price);

            return CreatedAtAction(nameof(GetProjectById), new { id = projectId }, project);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, $"Error uploading project: {ex.Message}");
        }
    }

    [HttpGet]
    public async Task<IActionResult> ListProjects()
    {
        var designerId = GetDesignerId();
        await EnsureDesignerRegisteredAsync(designerId);

        var projects = await _dbService.QueryAsync<Project>(
            "SELECT * FROM Projects WHERE designer_id = ?1 ORDER BY created_at DESC", 
            designerId);
        
        return Ok(projects);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetProjectById(string id)
    {
        var designerId = GetDesignerId();
        await EnsureDesignerRegisteredAsync(designerId);

        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE id = ?1 AND designer_id = ?2", 
            id, designerId);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        return Ok(project);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteProject(string id)
    {
        var designerId = GetDesignerId();
        var project = await _dbService.QuerySingleOrDefaultAsync<Project>(
            "SELECT * FROM Projects WHERE id = ?1 AND designer_id = ?2", id, designerId);

        if (project == null)
        {
            return NotFound("Project not found.");
        }

        try
        {
            await _dbService.ExecuteAsync("DELETE FROM Payments WHERE project_id = ?1", id);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ProofGuard] Failed to delete payments for project {id}: {ex.Message}");
        }

        try
        {
            await _storageService.DeleteFileAsync(project.OriginalFileKey);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ProofGuard] Failed to delete original file {project.OriginalFileKey}: {ex.Message}");
        }

        try
        {
            await _storageService.DeleteFileAsync(project.PreviewFileKey);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ProofGuard] Failed to delete preview file {project.PreviewFileKey}: {ex.Message}");
        }

        try
        {
            await _dbService.ExecuteAsync("DELETE FROM Projects WHERE id = ?1 AND designer_id = ?2", id, designerId);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ProofGuard] Failed to delete project {id}: {ex.Message}");
            return StatusCode(StatusCodes.Status500InternalServerError, $"Failed to delete project: {ex.Message}");
        }

        return NoContent();
    }

    [HttpGet("analytics")]
    public async Task<IActionResult> GetAnalytics()
    {
        var designerId = GetDesignerId();
        await EnsureDesignerRegisteredAsync(designerId);

        // Subquery counts safely inside SQLite / D1
        var totalCount = await _dbService.QuerySingleOrDefaultAsync<long>(
            "SELECT COUNT(*) FROM Projects WHERE designer_id = ?1", designerId);

        var viewedCount = await _dbService.QuerySingleOrDefaultAsync<long>(
            "SELECT COUNT(*) FROM Projects WHERE designer_id = ?1 AND status IN ('Viewed', 'Paid')", designerId);

        var paidCount = await _dbService.QuerySingleOrDefaultAsync<long>(
            "SELECT COUNT(*) FROM Projects WHERE designer_id = ?1 AND status = 'Paid'", designerId);

        // Sum returns real/null. Fetch safely using double
        var earningsResult = await _dbService.QuerySingleOrDefaultAsync<double>(
            "SELECT IFNULL(SUM(price), 0.0) FROM Projects WHERE designer_id = ?1 AND status = 'Paid'", designerId);

        double conversionRate = totalCount > 0 ? (double)paidCount / totalCount : 0.0;

        return Ok(new
        {
            TotalProjects = totalCount,
            ViewedProjects = viewedCount,
            PaidProjects = paidCount,
            TotalEarnings = (decimal)earningsResult,
            ConversionRate = Math.Round(conversionRate, 4)
        });
    }
}
