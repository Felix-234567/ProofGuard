using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Proveguard.Api.Core.Interfaces;
using Resend;

namespace Proveguard.Api.Core.Services;

public class ResendEmailService : IEmailService
{
    private readonly IResend _resend;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ResendEmailService> _logger;
    private readonly string _fromEmail;

    public ResendEmailService(IResend resend, IConfiguration configuration, ILogger<ResendEmailService> logger)
    {
        _resend = resend;
        _configuration = configuration;
        _logger = logger;
        _fromEmail = _configuration["Resend:FromEmail"] ?? "onboarding@resend.dev";
    }

    public async Task SendProjectNotificationAsync(string clientEmail, string projectTitle, string previewUrl, decimal price)
    {
        try
        {
            var message = new EmailMessage
            {
                From = _fromEmail,
                To = clientEmail,
                Subject = $"New Design Ready for Review: {projectTitle}",
                HtmlBody = GenerateEmailHtml(projectTitle, previewUrl, price)
            };

            var response = await _resend.EmailSendAsync(message);

            if (response != null)
            {
                _logger.LogInformation("Email sent successfully to {Email} for project {Title}",
                    clientEmail, projectTitle);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Email} for project {Title}", clientEmail, projectTitle);
            // Don't throw - email failure shouldn't block project creation
        }
    }

    private string GenerateEmailHtml(string projectTitle, string previewUrl, decimal price)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .header {{
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
        }}
        .logo {{
            font-size: 24px;
            font-weight: bold;
            color: #1a1a1a;
        }}
        .badge {{
            display: inline-block;
            background-color: #4CAF50;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 10px;
            text-transform: uppercase;
        }}
        h1 {{
            color: #1a1a1a;
            font-size: 24px;
            margin: 0 0 20px 0;
        }}
        .project-info {{
            background-color: #f8f9fa;
            border-left: 4px solid #4CAF50;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }}
        .project-title {{
            font-size: 18px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 10px;
        }}
        .price {{
            font-size: 20px;
            font-weight: bold;
            color: #4CAF50;
            margin-top: 10px;
        }}
        .btn {{
            display: inline-block;
            background-color: #4CAF50;
            color: white !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            transition: background-color 0.3s;
        }}
        .btn:hover {{
            background-color: #45a049;
        }}
        .info-box {{
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 4px;
            padding: 15px;
            margin: 20px 0;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class=""container"">
        <div class=""header"">
            <div class=""logo"">🛡️ ProofGuard</div>
            <span class=""badge"">SECURE PREVIEW</span>
        </div>

        <h1>Your Design is Ready for Review!</h1>

        <p>A new design has been submitted for your approval. Review the watermarked preview below and complete payment to unlock the high-resolution original files.</p>

        <div class=""project-info"">
            <div class=""project-title"">{projectTitle}</div>
            <div class=""price"">Release Price: ₵{price:F2}</div>
        </div>

        <center>
            <a href=""{previewUrl}"" class=""btn"">View Secure Preview →</a>
        </center>

        <div class=""info-box"">
            <strong>🔒 What happens next?</strong><br>
            1. Click the button above to view the watermarked preview<br>
            2. Review the design in our secure proofing environment<br>
            3. Complete payment to unlock and download the original high-resolution files
        </div>

        <p style=""margin-top: 30px; color: #666;"">
            <strong>Security Notice:</strong> The preview is watermarked to protect the designer's work.
            Once payment is completed, you'll receive immediate access to download the clean, unwatermarked original files.
        </p>

        <div class=""footer"">
            <p>This is an automated message from ProofGuard.</p>
            <p>If you did not expect this email, please disregard it.</p>
        </div>
    </div>
</body>
</html>";
    }
}
