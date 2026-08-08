using System;
using System.Threading.Tasks;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Core.Services;

public class NoOpEmailService : IEmailService
{
    public Task SendProjectNotificationAsync(string clientEmail, string projectTitle, string previewUrl, decimal price)
    {
        Console.WriteLine($"[NoOpEmailService] Email NOT sent (Resend not configured)");
        Console.WriteLine($"  To: {clientEmail}");
        Console.WriteLine($"  Project: {projectTitle}");
        Console.WriteLine($"  Preview: {previewUrl}");
        Console.WriteLine($"  Price: ${price:F2}");
        return Task.CompletedTask;
    }
}
