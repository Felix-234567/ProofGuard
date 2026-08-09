# Email Notification Setup - Resend Integration

## Overview
Email notifications are now sent to clients when designers create new projects. The system uses [Resend](https://resend.com) for reliable email delivery.

## Setup Instructions

### 1. Get Your Resend API Key
1. Sign up or log in at [resend.com](https://resend.com)
2. Navigate to **API Keys** in your dashboard
3. Create a new API key
4. Copy the key (starts with `re_`)

### 2. Configure Your Sending Domain (Important!)
**Note:** The default `onboarding@resend.dev` email only works in test mode and has sending limits.

For production use:
1. Add your domain in Resend dashboard
2. Add the required DNS records (MX, TXT, DKIM)
3. Verify domain ownership
4. Update the `RESEND_FROM_EMAIL` to use your verified domain (e.g., `notifications@yourdomain.com`)

### 3. Add Configuration to .env

Update your `.env` file with your Resend credentials:

```env
# ---- Resend (Email Notifications) ----
RESEND_API_KEY=re_your_actual_api_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev  # Change to your verified domain email
```

### 4. Update appsettings.json (Backend)

The `backend/Proveguard.Api/appsettings.json` file already has the Resend configuration structure.
For production deployment, update these values or use environment variables.

### 5. Set the Base URL (Frontend!)

The emails include a preview button. `App:BaseUrl` must be the **frontend** URL (the
Next.js app that serves `/preview/[token]`), NOT the API URL — the API has no `/preview` route.

**Production (appsettings.json or environment variables):**
```json
{
  "App": {
    "BaseUrl": "https://proofguard-bay.vercel.app"
  }
}
```

Env var: `APP_BASE_URL=https://proofguard-bay.vercel.app`

**Paystack callback:** `Paystack:CallbackUrl` (env `PAYSTACK_CALLBACK_URL`) must point to the
frontend callback page too, e.g. `https://proofguard-bay.vercel.app/callback` — the backend
appends `?token=...` automatically. (The frontend `/callback` page polls the API and redirects
to the preview; there is no `/api/payments/verify` endpoint.)

### 6. Restart the Backend

After updating the configuration:
```bash
cd backend/Proveguard.Api
dotnet run
```

You should see this message in the console:
```
[ProofGuard] Resend email service registered
```

If Resend is not configured, you'll see:
```
[ProofGuard] Email service disabled (RESEND_API_KEY not set)
```

## How It Works

### Email Trigger
When a designer creates a new project (`POST /api/projects`), the system:
1. Uploads and watermarks the files
2. Creates the project in the database
3. **Sends an email notification to the client** (fire-and-forget, non-blocking)

### Email Content
The email includes:
- Project title
- Release price
- Secure preview link with the project's unique token
- Instructions for reviewing and purchasing
- Professional branding and styling

### Email Template
The email is fully styled with:
- Responsive HTML design
- ProofGuard branding (🛡️)
- Clear call-to-action button
- Security notice about watermarking
- Step-by-step instructions

### Error Handling
- Email sending happens asynchronously (fire-and-forget)
- Email failures are logged but don't block project creation
- If Resend is not configured, a NoOpEmailService logs the email details to console without sending

## Testing

### Test Without Real Emails (Development)
Leave `RESEND_API_KEY` unset or set to `your_resend_api_key_here`.
The NoOpEmailService will log email details to console instead of sending.

### Test With Real Emails
1. Configure your Resend API key
2. Create a test project with your own email as the client email
3. Check your inbox for the notification
4. Verify the preview link works

## Files Changed

### New Files
- `backend/Proveguard.Api/Core/Interfaces/IEmailService.cs` - Email service interface
- `backend/Proveguard.Api/Core/Services/ResendEmailService.cs` - Resend implementation
- `backend/Proveguard.Api/Core/Services/NoOpEmailService.cs` - Development fallback

### Modified Files
- `backend/Proveguard.Api/Program.cs` - Service registration
- `backend/Proveguard.Api/Controllers/ProjectsController.cs` - Email trigger on project creation
- `backend/Proveguard.Api/Proveguard.Api.csproj` - Added Resend NuGet package
- `backend/Proveguard.Api/appsettings.json` - Resend configuration
- `.env` - Resend environment variables

## Dependencies
- **Resend** NuGet package (v1.6.0) - Official Resend SDK for .NET

## Security Notes
- Never commit your actual Resend API key to version control
- The API key in `.env` is gitignored
- Emails are sent asynchronously to avoid blocking the API response
- Client emails are validated by the database schema

## Troubleshooting

### Emails not sending
1. Check backend console for error messages
2. Verify `RESEND_API_KEY` is set correctly
3. Ensure your sending email domain is verified (if not using `onboarding@resend.dev`)
4. Check Resend dashboard for delivery logs

### Emails going to spam
1. Verify your domain in Resend
2. Set up proper SPF, DKIM, and DMARC records
3. Use a verified domain email instead of `onboarding@resend.dev`
4. Add a proper reply-to address

### Preview link not working
1. Verify `App:BaseUrl` matches your frontend URL
2. Check that the project token is valid
3. Ensure the frontend route `/preview/[token]` is working

## Next Steps (Optional Enhancements)

1. **Email Templates**: Create template variations for different project types
2. **Payment Receipt**: Send another email after successful payment with download link
3. **Designer Notifications**: Notify designers when clients make payments
4. **Email Tracking**: Log email opens and clicks (Resend supports webhooks)
5. **Customization**: Allow designers to customize email branding per project
