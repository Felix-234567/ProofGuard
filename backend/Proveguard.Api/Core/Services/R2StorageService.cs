using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Core.Services;

public class R2StorageService : IStorageService
{
    private readonly IAmazonS3 _s3Client;
    private readonly string _bucketName;
    private readonly string _localFallbackFolder;
    private readonly bool _useR2;
    private static readonly HttpClient _httpClient = new();

    public R2StorageService(IConfiguration configuration)
    {
        var accessKey = configuration["Cloudflare:R2:AccessKeyId"];
        var secretKey = configuration["Cloudflare:R2:SecretAccessKey"];
        var accountId = configuration["Cloudflare:R2:AccountId"];
        _bucketName = configuration["Cloudflare:R2:BucketName"] ?? "proofguard";
        _localFallbackFolder = configuration["Storage:LocalFolder"] ?? Path.Combine(Directory.GetCurrentDirectory(), "uploads");

        // Only initialize S3 if all R2 credentials are present and not placeholders
        var allCredsPresent = !string.IsNullOrWhiteSpace(accessKey)
            && !string.IsNullOrWhiteSpace(secretKey)
            && !string.IsNullOrWhiteSpace(accountId)
            && !accessKey.Trim().StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase);

        if (allCredsPresent)
        {
            var s3Config = new AmazonS3Config
            {
                ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com",
                ForcePathStyle = true
            };

            _s3Client = new AmazonS3Client(accessKey, secretKey, s3Config);
            _useR2 = true;
            Console.WriteLine("[R2Storage] Initialized with R2 credentials");
        }
        else
        {
            _useR2 = false;
            Console.WriteLine("[R2Storage] R2 credentials missing, using local file fallback");
        }

        if (!Directory.Exists(_localFallbackFolder))
        {
            Directory.CreateDirectory(_localFallbackFolder);
        }
    }

    public async Task<string> UploadFileAsync(string fileKey, Stream fileStream, string contentType, bool isPublic)
    {
        // Try R2 upload first (if configured)
        if (_useR2)
        {
            try
            {
                return await UploadToR2Async(fileKey, fileStream, contentType);
            }
            catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Forbidden)
            {
                Console.WriteLine($"[R2Storage] R2 upload forbidden (403), falling back to local storage: {ex.Message}");
                // Fall through to local fallback below
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[R2Storage] R2 upload failed, falling back to local storage: {ex.Message}");
                // Fall through to local fallback below
            }

            // Reset stream position - UploadToR2Async consumed it to a MemoryStream
            if (fileStream.CanSeek)
            {
                fileStream.Position = 0;
            }
        }

        // Fallback: save to local filesystem
        return await UploadToLocalAsync(fileKey, fileStream);
    }

    private async Task<string> UploadToR2Async(string fileKey, Stream fileStream, string contentType)
    {
        // Generate a presigned PUT URL (standard SigV4, no chunked encoding)
        var presignRequest = new GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = fileKey,
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = contentType
        };

        var presignedUrl = await Task.Run(() => _s3Client.GetPreSignedURL(presignRequest));

        // Copy to MemoryStream so the original stream is NOT consumed/disposed
        // (the caller reuses the stream for watermarking after upload).
        using var memStream = new MemoryStream();
        await fileStream.CopyToAsync(memStream);
        memStream.Position = 0;

        var content = new StreamContent(memStream);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);

        var response = await _httpClient.PutAsync(presignedUrl, content);
        response.EnsureSuccessStatusCode();

        Console.WriteLine($"[R2Storage] Uploaded to R2: {fileKey}");
        return fileKey;
    }

    private async Task<string> UploadToLocalAsync(string fileKey, Stream fileStream)
    {
        var filePath = Path.Combine(_localFallbackFolder, fileKey.Replace('/', Path.DirectorySeparatorChar));

        // Ensure subdirectories exist
        var directory = Path.GetDirectoryName(filePath);
        if (directory != null && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        using var destStream = File.Create(filePath);
        await fileStream.CopyToAsync(destStream);

        Console.WriteLine($"[R2Storage] Saved locally: {filePath}");
        return fileKey;
    }

    public async Task<Stream> DownloadFileAsync(string fileKey)
    {
        if (_useR2)
        {
            try
            {
                var request = new GetObjectRequest
                {
                    BucketName = _bucketName,
                    Key = fileKey
                };
                var response = await _s3Client.GetObjectAsync(request);
                return response.ResponseStream;
            }
            catch
            {
                // Fall through to local
            }
        }

        // Local fallback
        var filePath = Path.Combine(_localFallbackFolder, fileKey.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException("File not found", fileKey);
        }
        return File.OpenRead(filePath);
    }

    public async Task<string> GetPresignedUrlAsync(string fileKey, TimeSpan expiry)
    {
        if (_useR2)
        {
            try
            {
                // Verify the object exists on R2 before generating a pre-signed URL.
                // GetPreSignedURL generates a URL string without checking existence,
                // which causes NoSuchKey errors when the file was saved locally
                // (e.g. R2 upload failed during project creation).
                try
                {
                    await _s3Client.GetObjectMetadataAsync(new GetObjectMetadataRequest
                    {
                        BucketName = _bucketName,
                        Key = fileKey
                    });
                }
                catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
                {
                    Console.WriteLine($"[R2Storage] File not on R2, using local fallback: {fileKey}");
                    return $"/api/local-files/{fileKey}";
                }
                catch
                {
                    Console.WriteLine($"[R2Storage] R2 metadata check failed, using local fallback: {fileKey}");
                    return $"/api/local-files/{fileKey}";
                }

                var request = new GetPreSignedUrlRequest
                {
                    BucketName = _bucketName,
                    Key = fileKey,
                    Expires = DateTime.UtcNow.Add(expiry)
                };
                return await Task.Run(() => _s3Client.GetPreSignedURL(request));
            }
            catch
            {
                // Fall through to local
            }
        }

        // Local fallback: return a relative URL
        return $"/api/local-files/{fileKey}";
    }

    public async Task DeleteFileAsync(string fileKey)
    {
        if (_useR2)
        {
            try
            {
                var request = new DeleteObjectRequest
                {
                    BucketName = _bucketName,
                    Key = fileKey
                };
                await _s3Client.DeleteObjectAsync(request);
                return;
            }
            catch
            {
                // Fall through to local
            }
        }

        // Local fallback
        var filePath = Path.Combine(_localFallbackFolder, fileKey.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }
    }
}
