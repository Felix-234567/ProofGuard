using System.IO;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace Proveguard.Api.Controllers;

[ApiController]
[Route("api/local-files")]
public class LocalFilesController : ControllerBase
{
    private readonly string _uploadFolder;

    public LocalFilesController(IConfiguration configuration)
    {
        _uploadFolder = configuration["Storage:LocalFolder"] ?? Path.Combine(Directory.GetCurrentDirectory(), "uploads");
    }

    [HttpGet("{*fileKey}")]
    public IActionResult GetFile(string fileKey)
    {
        // Prevent path traversal
        var fileName = Path.GetFileName(fileKey);
        var subDir = Path.GetDirectoryName(fileKey) ?? "";
        var filePath = Path.GetFullPath(Path.Combine(_uploadFolder, subDir, fileName));

        if (!filePath.StartsWith(Path.GetFullPath(_uploadFolder)))
        {
            return BadRequest("Access denied.");
        }

        if (!System.IO.File.Exists(filePath))
        {
            return NotFound("File not found in local storage.");
        }

        var contentType = fileKey.EndsWith(".pdf", System.StringComparison.OrdinalIgnoreCase) 
            ? "application/pdf" 
            : "image/jpeg";

        return PhysicalFile(filePath, contentType);
    }
}
