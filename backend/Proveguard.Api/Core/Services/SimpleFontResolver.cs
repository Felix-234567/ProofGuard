using System;
using System.IO;
using PdfSharp.Fonts;

namespace Proveguard.Api.Core.Services;

public class SimpleFontResolver : IFontResolver
{
    public string DefaultFontName => "Arial";

    public byte[] GetFont(string faceName)
    {
        string fontPath;

        if (faceName.Contains("bold", StringComparison.OrdinalIgnoreCase))
        {
            fontPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Fonts), "arialbd.ttf");
            if (File.Exists(fontPath))
            {
                return File.ReadAllBytes(fontPath);
            }

            // Linux fallback
            var linuxBold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
            if (File.Exists(linuxBold))
            {
                return File.ReadAllBytes(linuxBold);
            }
        }

        // Regular font
        fontPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Fonts), "arial.ttf");
        if (File.Exists(fontPath))
        {
            return File.ReadAllBytes(fontPath);
        }

        // Linux fallback
        var linuxRegular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
        if (File.Exists(linuxRegular))
        {
            return File.ReadAllBytes(linuxRegular);
        }

        throw new FileNotFoundException($"Font face '{faceName}' could not be resolved on this system.");
    }

    public FontResolverInfo ResolveTypeface(string familyName, bool isBold, bool isItalic)
    {
        // Match Arial requests
        if (familyName.Contains("Arial", StringComparison.OrdinalIgnoreCase))
        {
            if (isBold)
            {
                return new FontResolverInfo("Arial#bold");
            }
            return new FontResolverInfo("Arial");
        }

        // Fallback default
        return new FontResolverInfo("Arial");
    }
}
