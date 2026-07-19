using System;
using System.IO;
using System.Threading.Tasks;

namespace Proveguard.Api.Core.Interfaces;

public interface IStorageService
{
    Task<string> UploadFileAsync(string fileKey, Stream fileStream, string contentType, bool isPublic);
    Task<Stream> DownloadFileAsync(string fileKey);
    Task<string> GetPresignedUrlAsync(string fileKey, TimeSpan expiry);
    Task DeleteFileAsync(string fileKey);
}
