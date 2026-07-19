using System;
using System.IO;
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

    public R2StorageService(IConfiguration configuration)
    {
        var accessKey = configuration["Cloudflare:R2:AccessKeyId"] ?? throw new InvalidOperationException("R2 AccessKeyId not configured");
        var secretKey = configuration["Cloudflare:R2:SecretAccessKey"] ?? throw new InvalidOperationException("R2 SecretAccessKey not configured");
        var accountId = configuration["Cloudflare:R2:AccountId"] ?? throw new InvalidOperationException("R2 AccountId not configured");
        _bucketName = configuration["Cloudflare:R2:BucketName"] ?? throw new InvalidOperationException("R2 BucketName not configured");

        var config = new AmazonS3Config
        {
            ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com",
            ForcePathStyle = true
        };

        _s3Client = new AmazonS3Client(accessKey, secretKey, config);
    }

    public async Task<string> UploadFileAsync(string fileKey, Stream fileStream, string contentType, bool isPublic)
    {
        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = fileKey,
            InputStream = fileStream,
            ContentType = contentType
        };

        await _s3Client.PutObjectAsync(request);
        return fileKey;
    }

    public async Task<Stream> DownloadFileAsync(string fileKey)
    {
        var request = new GetObjectRequest
        {
            BucketName = _bucketName,
            Key = fileKey
        };

        var response = await _s3Client.GetObjectAsync(request);
        return response.ResponseStream;
    }

    public async Task<string> GetPresignedUrlAsync(string fileKey, TimeSpan expiry)
    {
        var request = new GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = fileKey,
            Expires = DateTime.UtcNow.Add(expiry)
        };

        // R2 requires Signature Version 4 which is default in modern AWSSDK.S3
        return await Task.Run(() => _s3Client.GetPreSignedURL(request));
    }

    public async Task DeleteFileAsync(string fileKey)
    {
        var request = new DeleteObjectRequest
        {
            BucketName = _bucketName,
            Key = fileKey
        };

        await _s3Client.DeleteObjectAsync(request);
    }
}
