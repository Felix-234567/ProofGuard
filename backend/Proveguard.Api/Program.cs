using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Proveguard.Api.Core.Interfaces;
using Proveguard.Api.Core.Services;

// Register PDFsharp Font Resolver
PdfSharp.Fonts.GlobalFontSettings.FontResolver = new SimpleFontResolver();

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

// ──────────────────────────────────────────────
// 0. Load shared .env (or .env.local) from project root
// ──────────────────────────────────────────────
var projectRoot = Path.Combine(Directory.GetCurrentDirectory(), "..", "..");
var envPath = Path.Combine(projectRoot, ".env");
if (!File.Exists(envPath))
{
    envPath = Path.Combine(projectRoot, ".env.local");
}

if (File.Exists(envPath))
{
    Console.WriteLine($"[ProofGuard] Loading env from {envPath}");
    DotNetEnv.Env.Load(envPath);

    // Map flat env var names to .NET configuration hierarchical keys
    var envToConfigMap = new Dictionary<string, string>
    {
        ["FIREBASE_PROJECT_ID"] = "Firebase:ProjectId",
        ["CLOUDFLARE_D1_ACCOUNT_ID"] = "Cloudflare:D1:AccountId",
        ["CLOUDFLARE_D1_DATABASE_ID"] = "Cloudflare:D1:DatabaseId",
        ["CLOUDFLARE_D1_API_TOKEN"] = "Cloudflare:D1:ApiToken",
        ["CLOUDFLARE_R2_ACCOUNT_ID"] = "Cloudflare:R2:AccountId",
        ["CLOUDFLARE_R2_ACCESS_KEY_ID"] = "Cloudflare:R2:AccessKeyId",
        ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"] = "Cloudflare:R2:SecretAccessKey",
        ["CLOUDFLARE_R2_BUCKET_NAME"] = "Cloudflare:R2:BucketName",
        ["PAYSTACK_SECRET_KEY"] = "Paystack:SecretKey",
        ["PAYSTACK_CALLBACK_URL"] = "Paystack:CallbackUrl",
        ["APP_BASE_URL"] = "App:BaseUrl",
        ["DB_CONNECTION_STRING"] = "ConnectionStrings:DefaultConnection",
        ["STORAGE_LOCAL_FOLDER"] = "Storage:LocalFolder",
        ["RESEND_API_KEY"] = "Resend:ApiKey",
        ["RESEND_FROM_EMAIL"] = "Resend:FromEmail"
    };

    foreach (var (envKey, configKey) in envToConfigMap)
    {
        var value = Environment.GetEnvironmentVariable(envKey);
        if (!string.IsNullOrEmpty(value))
        {
            builder.Configuration[configKey] = value;
        }
    }
}

// 1. Setup CORS
var allowedOrigins = new List<string>
{
    "http://localhost:3000",
    "https://proofguard.vercel.app"
};

var corsOriginsEnv = Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS");
if (!string.IsNullOrEmpty(corsOriginsEnv))
{
    allowedOrigins.AddRange(corsOriginsEnv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 2. Setup Firebase JWT Bearer Authentication
var firebaseProjectId = builder.Configuration["Firebase:ProjectId"] ?? "YOUR_FIREBASE_PROJECT_ID";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = $"https://securetoken.google.com/{firebaseProjectId}";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = $"https://securetoken.google.com/{firebaseProjectId}",
            ValidateAudience = true,
            ValidAudience = firebaseProjectId,
            ValidateLifetime = true
        };
    });

builder.Services.AddAuthorization();

// 3. Register Controllers and JSON formatting options
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Serialize enums as strings and format dates cleanly
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// 4. Register Infrastructure and Core Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IWatermarkService, WatermarkService>();

// Register Resend email service
var resendApiKey = builder.Configuration["Resend:ApiKey"];
if (!string.IsNullOrEmpty(resendApiKey) && resendApiKey != "your_resend_api_key_here")
{
    var resendOptions = new Resend.ResendClientOptions
    {
        ApiToken = resendApiKey
    };
    var httpClient = new HttpClient();
    builder.Services.AddSingleton<Resend.IResend>(Resend.ResendClient.Create(resendOptions, httpClient));
    builder.Services.AddSingleton<IEmailService, ResendEmailService>();
    Console.WriteLine("[ProofGuard] Resend email service registered");
}
else
{
    // Register a no-op email service for development
    builder.Services.AddSingleton<IEmailService>(sp => new NoOpEmailService());
    Console.WriteLine("[ProofGuard] Email service disabled (RESEND_API_KEY not set)");
}

// ─── Feature-driven service selection ────────────────────
// Use Cloudflare if env vars are populated with real values;
// fall back to local services for development.
static bool IsConfigReady(IConfiguration config, params string[] keys)
{
    foreach (var key in keys)
    {
        var val = config[key];
        if (string.IsNullOrWhiteSpace(val) || val.Trim().StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase))
            return false;
    }
    return true;
}

var cloudflareD1Ready = IsConfigReady(builder.Configuration,
    "Cloudflare:D1:AccountId", "Cloudflare:D1:DatabaseId", "Cloudflare:D1:ApiToken");

var cloudflareR2Ready = IsConfigReady(builder.Configuration,
    "Cloudflare:R2:AccountId", "Cloudflare:R2:AccessKeyId",
    "Cloudflare:R2:SecretAccessKey", "Cloudflare:R2:BucketName");

var firebaseReady = IsConfigReady(builder.Configuration, "Firebase:ProjectId");

if (cloudflareD1Ready)
{
    builder.Services.AddSingleton<IDbService, CloudflareD1DbService>();
    Console.WriteLine("[ProofGuard] Using Cloudflare D1 database");
}
else
{
    builder.Services.AddSingleton<IDbService, LocalSqliteDbService>();
    Console.WriteLine("[ProofGuard] Using local SQLite database (Cloudflare D1 env vars not set)");
}

if (cloudflareR2Ready)
{
    builder.Services.AddSingleton<IStorageService, R2StorageService>();
    Console.WriteLine("[ProofGuard] Using Cloudflare R2 storage");
}
else
{
    builder.Services.AddSingleton<IStorageService, LocalStorageService>();
    Console.WriteLine("[ProofGuard] Using local file storage (Cloudflare R2 env vars not set)");
}

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowFrontend");

// Development convenience: accept both real Firebase JWTs AND mock tokens.
// Firebase JWTs are decoded locally without signature verification (dev only)
// so the backend doesn't need network access to Google's JWKS endpoint.
if (app.Environment.IsDevelopment())
{
    Console.WriteLine("[ProofGuard] Dev mode: Firebase JWTs decoded locally + mock tokens accepted");
    app.Use(async (context, next) =>
    {
        var authHeader = context.Request.Headers.Authorization.ToString();

        // Case 1: Mock token (mock-token-{email})
        if (authHeader.StartsWith("Bearer mock-token-", StringComparison.OrdinalIgnoreCase))
        {
            var email = authHeader["Bearer mock-token-".Length..].Trim();
            var claims = new[]
            {
                new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, email),
                new System.Security.Claims.Claim("user_id", email),
                new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, email.Split('@')[0]),
                new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Email, email)
            };
            var identity = new System.Security.Claims.ClaimsIdentity(claims, "DevAuth");
            context.User = new System.Security.Claims.ClaimsPrincipal(identity);
        }
        // Case 2: Firebase JWT (starts with "Bearer eyJ...")
        else if (authHeader.StartsWith("Bearer eyJ", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var token = authHeader["Bearer ".Length..].Trim();
                var parts = token.Split('.');
                if (parts.Length == 3)
                {
                    // Decode the payload (middle segment)
                    var payloadBase64 = parts[1];
                    // Pad Base64Url to standard Base64
                    var rem = payloadBase64.Length % 4;
                    var padded = rem == 2 ? payloadBase64 + "=="
                              : rem == 3 ? payloadBase64 + "="
                              : payloadBase64;
                    // Replace Base64Url chars with Base64 chars
                    padded = padded.Replace('-', '+').Replace('_', '/');
                    var payloadBytes = Convert.FromBase64String(padded);
                    var payloadJson = System.Text.Encoding.UTF8.GetString(payloadBytes);
                    
                    using var doc = System.Text.Json.JsonDocument.Parse(payloadJson);
                    var root = doc.RootElement;

                    var sub = root.TryGetProperty("sub", out var subProp) ? subProp.GetString() : null;
                    var email = root.TryGetProperty("email", out var emailProp) ? emailProp.GetString() : null;
                    var name = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;

                    if (!string.IsNullOrEmpty(sub))
                    {
                        var claimsList = new List<System.Security.Claims.Claim>
                        {
                            new(System.Security.Claims.ClaimTypes.NameIdentifier, sub),
                            new("user_id", sub)
                        };
                        if (!string.IsNullOrEmpty(email))
                            claimsList.Add(new(System.Security.Claims.ClaimTypes.Email, email));
                        if (!string.IsNullOrEmpty(name))
                            claimsList.Add(new(System.Security.Claims.ClaimTypes.Name, name));
                        else if (!string.IsNullOrEmpty(email))
                            claimsList.Add(new(System.Security.Claims.ClaimTypes.Name, email.Split('@')[0]));

                        var identity = new System.Security.Claims.ClaimsIdentity(claimsList, "DevFirebase");
                        context.User = new System.Security.Claims.ClaimsPrincipal(identity);
                        Console.WriteLine($"[ProofGuard] Dev Firebase JWT decoded: sub={sub.Substring(0, Math.Min(8, sub.Length))}..., email={email}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ProofGuard] Failed to decode Firebase JWT in dev mode: {ex.Message}");
            }
        }
        await next();
    });
}
else
{
    Console.WriteLine("[ProofGuard] Production mode: only real Firebase JWTs accepted");
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
