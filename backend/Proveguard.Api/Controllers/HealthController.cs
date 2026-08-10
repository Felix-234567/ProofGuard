using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IDbService _dbService;
    private readonly IStorageService _storageService;
    private readonly IEmailService _emailService;
    private readonly IConfiguration _configuration;

    public HealthController(IDbService dbService, IStorageService storageService, IEmailService emailService, IConfiguration configuration)
    {
        _dbService = dbService;
        _storageService = storageService;
        _emailService = emailService;
        _configuration = configuration;
    }

    [HttpGet]
    public IActionResult Get()
    {
        // Report which providers are actually wired up (no secrets exposed).
        // Use this to verify production is on Cloudflare D1 + R2 and not
        // silently falling back to ephemeral local storage.
        return Ok(new
        {
            status = "healthy",
            timestamp = DateTime.UtcNow,
            services = new
            {
                database = _dbService.GetType().Name,
                storage = _storageService.GetType().Name,
                email = _emailService.GetType().Name,
                firebaseProjectId = _configuration["Firebase:ProjectId"]
            }
        });
    }
}
