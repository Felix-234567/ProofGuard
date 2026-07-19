using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Proveguard.Api.Core.Interfaces;
using Proveguard.Api.Core.Services;

// Register PDFsharp Font Resolver
PdfSharp.Fonts.GlobalFontSettings.FontResolver = new SimpleFontResolver();

var builder = WebApplication.CreateBuilder(args);

// 1. Setup CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000") // Next.js frontend local port
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

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSingleton<IDbService, LocalSqliteDbService>();
    builder.Services.AddSingleton<IStorageService, LocalStorageService>();
}
else
{
    // Use Cloudflare services in staging / production
    builder.Services.AddSingleton<IDbService, CloudflareD1DbService>();
    builder.Services.AddSingleton<IStorageService, R2StorageService>();
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

// Mock Authentication Bypass for Local Development
if (app.Environment.IsDevelopment())
{
    app.Use(async (context, next) =>
    {
        var authHeader = context.Request.Headers.Authorization.ToString();
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
            var identity = new System.Security.Claims.ClaimsIdentity(claims, "MockAuth");
            context.User = new System.Security.Claims.ClaimsPrincipal(identity);
        }
        await next();
    });
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
