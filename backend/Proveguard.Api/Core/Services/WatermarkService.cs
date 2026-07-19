using System;
using System.IO;
using System.Threading.Tasks;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using SkiaSharp;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Core.Services;

public class WatermarkService : IWatermarkService
{
    public Task<byte[]> WatermarkImageAsync(Stream originalImageStream, string watermarkText)
    {
        // 1. Decode original image
        using var originalBitmap = SKBitmap.Decode(originalImageStream);
        if (originalBitmap == null)
        {
            throw new ArgumentException("Invalid image stream provided.");
        }

        // 2. Cap width at 800px as per PRD requirements
        int targetWidth = originalBitmap.Width;
        int targetHeight = originalBitmap.Height;
        if (originalBitmap.Width > 800)
        {
            targetWidth = 800;
            targetHeight = (int)(originalBitmap.Height * (800.0 / originalBitmap.Width));
        }

        using var resizedBitmap = originalBitmap.Width > 800
            ? originalBitmap.Resize(new SKImageInfo(targetWidth, targetHeight), SKFilterQuality.Medium)
            : null;

        // 3. Create drawing canvas
        using var surface = SKSurface.Create(new SKImageInfo(targetWidth, targetHeight));
        var canvas = surface.Canvas;

        // Draw background image
        canvas.DrawBitmap(resizedBitmap ?? originalBitmap, 0, 0);

        // 4. Overlay repeating diagonal text watermark
        using var paint = new SKPaint
        {
            Color = new SKColor(128, 128, 128, 60), // Semi-transparent grey
            TextSize = 36,
            IsAntialias = true,
            Typeface = SKTypeface.FromFamilyName("Arial", SKFontStyle.Bold)
        };

        canvas.Save();
        canvas.RotateDegrees(-30);

        // Draw a repeating grid of watermark text
        // Cover wider bounds because of rotation
        for (int y = -targetHeight; y < targetHeight * 2; y += 150)
        {
            for (int x = -targetWidth; x < targetWidth * 2; x += 300)
            {
                canvas.DrawText(watermarkText, x, y, paint);
            }
        }
        canvas.Restore();

        // 5. Apply noise / grain overlay
        var rand = new Random();
        using var noisePaint = new SKPaint
        {
            Color = new SKColor(255, 255, 255, 12) // Faint white noise
        };
        for (int i = 0; i < (targetWidth * targetHeight) / 50; i++)
        {
            int nx = rand.Next(targetWidth);
            int ny = rand.Next(targetHeight);
            canvas.DrawRect(nx, ny, 1, 1, noisePaint);
        }

        // 6. Return high compression JPG byte array
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 75); // Caps quality slightly to prevent clean exports
        return Task.FromResult(data.ToArray());
    }

    public async Task<byte[]> WatermarkPdfAsync(Stream originalPdfStream, string watermarkText)
    {
        // Copy to memory stream to ensure it's seekable
        using var ms = new MemoryStream();
        await originalPdfStream.CopyToAsync(ms);
        ms.Position = 0;

        using var document = PdfReader.Open(ms, PdfDocumentOpenMode.Modify);
        
        foreach (PdfPage page in document.Pages)
        {
            // Get Overpage graphics context (so watermark is on top of content)
            using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);

            var font = new XFont("Arial", 36, XFontStyleEx.Bold);
            var brush = new XSolidBrush(XColor.FromArgb(45, 128, 128, 128)); // Semi-transparent grey

            double width = page.Width.Point;
            double height = page.Height.Point;

            // Save state, transform, draw repeating text, and restore state
            var state = gfx.Save();
            gfx.RotateAtTransform(-30, new XPoint(width / 2, height / 2));

            for (double y = -height; y < height * 2; y += 150)
            {
                for (double x = -width; x < width * 2; x += 300)
                {
                    gfx.DrawString(watermarkText, font, brush, x, y);
                }
            }

            gfx.Restore(state);
        }

        using var outputMs = new MemoryStream();
        document.Save(outputMs);
        return outputMs.ToArray();
    }
}
