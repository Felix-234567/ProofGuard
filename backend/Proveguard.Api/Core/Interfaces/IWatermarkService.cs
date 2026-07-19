using System.IO;
using System.Threading.Tasks;

namespace Proveguard.Api.Core.Interfaces;

public interface IWatermarkService
{
    Task<byte[]> WatermarkImageAsync(Stream originalImageStream, string watermarkText);
    Task<byte[]> WatermarkPdfAsync(Stream originalPdfStream, string watermarkText);
}
