using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Core.Services;

public class LocalStorageService : IStorageService
{
    private readonly string _uploadFolder;
    private readonly string _baseUrl;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public LocalStorageService(IConfiguration configuration, IHttpContextAccessor httpContextAccessor)
    {
        _uploadFolder = configuration["Storage:LocalFolder"] ?? Path.Combine(Directory.GetCurrentDirectory(), "uploads");
        _baseUrl = configuration["App:BaseUrl"] ?? "";
        _httpContextAccessor = httpContextAccessor;

        if (!Directory.Exists(_uploadFolder))
        {
            Directory.CreateDirectory(_uploadFolder);
        }
    }

    public async Task<string> UploadFileAsync(string fileKey, Stream fileStream, string contentType, bool isPublic)
    {
        var filePath = Path.Combine(_uploadFolder, fileKey);
        
        // Ensure subdirectories exist if fileKey contains slashes
        var directory = Path.GetDirectoryName(filePath);
        if (directory != null && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        using var destStream = File.Create(filePath);
        await fileStream.CopyToAsync(destStream);

        return fileKey;
    }

    public Task<Stream> DownloadFileAsync(string fileKey)
    {
        var filePath = Path.Combine(_uploadFolder, fileKey);
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException("File not found in local storage", fileKey);
        }

        Stream stream = File.OpenRead(filePath);
        return Task.FromResult(stream);
    }

    public Task<string> GetPresignedUrlAsync(string fileKey, TimeSpan expiry)
    {
        // Construct local URL like https://proofguard.onrender.com/api/local-files/{fileKey}
        var request = _httpContextAccessor.HttpContext?.Request;
        var schemeHost = request != null ? $"{request.Scheme}://{request.Host}" : "https://proofguard.onrender.com";
        
        var baseAddress = string.IsNullOrEmpty(_baseUrl) ? schemeHost : _baseUrl;
        var localUrl = $"{baseAddress.TrimEnd('/')}/api/local-files/{fileKey}";
        
        return Task.FromResult(localUrl);
    }

    public Task DeleteFileAsync(string fileKey)
    {
        var filePath = Path.Combine(_uploadFolder, fileKey);
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }
        return Task.CompletedTask;
    }
}
