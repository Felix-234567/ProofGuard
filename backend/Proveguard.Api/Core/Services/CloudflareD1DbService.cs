using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Core.Services;

public class CloudflareD1DbService : IDbService
{
    private readonly HttpClient _httpClient;
    private readonly string _accountId;
    private readonly string _databaseId;
    private readonly ILogger<CloudflareD1DbService> _logger;
    private readonly JsonSerializerOptions _jsonSerializerOptions;
    private readonly string? _schemaSql;
    private bool _schemaApplied;
    private bool _schemaMigrated;
    private readonly SemaphoreSlim _schemaLock = new(1, 1);

    public CloudflareD1DbService(IConfiguration configuration, ILogger<CloudflareD1DbService> logger)
    {
        _logger = logger;

        _accountId = configuration["Cloudflare:D1:AccountId"] ?? throw new InvalidOperationException("D1 AccountId not configured");
        _databaseId = configuration["Cloudflare:D1:DatabaseId"] ?? throw new InvalidOperationException("D1 DatabaseId not configured");
        var apiToken = configuration["Cloudflare:D1:ApiToken"] ?? throw new InvalidOperationException("D1 ApiToken not configured");

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri("https://api.cloudflare.com/client/v4/")
        };
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiToken);
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        _jsonSerializerOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
        _jsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());

        // Load schema.sql for auto-creation of tables
        _schemaSql = LoadSchemaSql();

        // Try to apply schema on startup (async-over-sync acceptable here — runs once)
        if (_schemaSql != null)
        {
            try
            {
                ApplySchemaAsync().GetAwaiter().GetResult();
                _logger.LogInformation("D1 schema applied successfully on startup");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to apply D1 schema on startup — will retry on first data query");
            }
        }
    }

    /// <summary>
    /// Locate and load the schema.sql file. Returns null if not found.
    /// </summary>
    private string? LoadSchemaSql()
    {
        var schemaPath = Path.Combine(AppContext.BaseDirectory, "schema.sql");
        if (File.Exists(schemaPath))
        {
            _logger.LogInformation("Found schema at {Path}", schemaPath);
            return File.ReadAllText(schemaPath);
        }

        schemaPath = Path.Combine(Directory.GetCurrentDirectory(), "schema.sql");
        if (File.Exists(schemaPath))
        {
            _logger.LogInformation("Found schema at {Path}", schemaPath);
            return File.ReadAllText(schemaPath);
        }

        _logger.LogWarning("schema.sql not found — D1 tables MUST already exist");
        return null;
    }

    /// <summary>
    /// Apply idempotent CREATE TABLE IF NOT EXISTS to ensure D1 schema exists.
    /// Safe to call multiple times — no-op if tables already exist.
    /// </summary>
    private async Task ApplySchemaAsync()
    {
        if (string.IsNullOrEmpty(_schemaSql) || _schemaApplied) return;
        await _schemaLock.WaitAsync();
        try
        {
            if (_schemaApplied) return;
            await SendD1QueryAsync<object>(_schemaSql, Array.Empty<object>());
            _schemaApplied = true;
            _logger.LogInformation("D1 schema applied successfully");
        }
        finally
        {
            _schemaLock.Release();
        }
    }

    /// <summary>
    /// Safely add new columns to existing D1 tables.
    /// Each ALTER TABLE is wrapped in try/catch — if the column already exists
    /// D1 throws, and we silently skip.
    /// </summary>
    private async Task MigrateSchemaAsync()
    {
        var migrations = new[]
        {
            "ALTER TABLE Designers ADD COLUMN phone TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN momo_provider TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN momo_number TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN business_name TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0"
        };

        foreach (var sql in migrations)
        {
            try
            {
                await SendD1QueryAsync<object>(sql, Array.Empty<object>(), suppressErrors: true);
                _logger.LogInformation("D1 column migration applied: {Sql}", sql);
            }
            catch (Exception ex)
            {
                // Column likely already exists — safe to ignore on subsequent runs
                _logger.LogTrace("D1 migration expected failure: {Sql} — {Message}", sql, ex.Message);
            }
        }
    }

    /// <summary>
    /// Ensure schema + migrations are applied before any query.
    /// Retries schema apply on each query until it succeeds
    /// (handles D1 cold-start / first-use scenarios).
    /// The _schemaMigrated flag is separate from _schemaApplied so that
    /// migrations still run even if the initial schema was already applied
    /// by the constructor (e.g. when adding new columns to an existing DB).
    /// </summary>
    private async Task EnsureSchemaAsync()
    {
        if (_schemaSql == null) return;

        if (!_schemaApplied)
        {
            await ApplySchemaAsync();
        }

        if (!_schemaMigrated)
        {
            await MigrateSchemaAsync();
            _schemaMigrated = true;
        }
    }

    public async Task<IEnumerable<T>> QueryAsync<T>(string sql, params object[] parameters)
    {
        await EnsureSchemaAsync();
        var result = await SendD1QueryAsync<T>(sql, parameters);
        return result?.Results ?? Enumerable.Empty<T>();
    }

    public async Task<T?> QuerySingleOrDefaultAsync<T>(string sql, params object[] parameters)
    {
        await EnsureSchemaAsync();
        var result = await SendD1QueryAsync<T>(sql, parameters);
        return result != null && result.Results.Any() ? result.Results.First() : default;
    }

    public async Task<int> ExecuteAsync(string sql, params object[] parameters)
    {
        await EnsureSchemaAsync();
        var result = await SendD1QueryAsync<object>(sql, parameters);
        return result?.Meta?.Changes ?? 0;
    }

    private static bool IsScalarType<T>()
    {
        var type = typeof(T);
        return type.IsPrimitive
            || type == typeof(string)
            || type == typeof(decimal)
            || type == typeof(DateTime)
            || type == typeof(Guid)
            || type == typeof(byte[]);
    }

    private async Task<D1Result<T>?> SendD1QueryAsync<T>(string sql, object[] parameters, bool suppressErrors = false)
    {
        var requestUrl = $"accounts/{_accountId}/d1/database/{_databaseId}/query";
        
        // Format parameters: convert DateTime to ISO string
        var formattedParams = parameters.Select(p => p switch
        {
            DateTime dt => dt.ToString("o"),
            decimal dec => (double)dec, // D1 uses REAL (double) for decimal numbers
            _ => p
        }).ToArray();

        var payload = new D1QueryRequest
        {
            Sql = sql,
            Params = formattedParams
        };

        try
        {
            var response = await _httpClient.PostAsJsonAsync(requestUrl, payload);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                if (suppressErrors)
                {
                    _logger.LogDebug("D1 query non-critical: {StatusCode} — {Content}", response.StatusCode, errorContent);
                }
                else
                {
                    _logger.LogError("D1 query failed with status code {StatusCode}. Content: {Content}", response.StatusCode, errorContent);
                }
                throw new HttpRequestException($"Cloudflare D1 REST API query error: {response.StatusCode}");
            }

            // D1 returns SELECT results as objects even for scalars: [{"COUNT(*)": 0}] not [0]
            // So we deserialize the raw JSON first, then convert based on T type
            var rawResponse = await response.Content.ReadFromJsonAsync<D1RawResponse>(_jsonSerializerOptions);

            if (rawResponse == null || !rawResponse.Success)
            {
                var errorMsg = rawResponse?.Errors != null && rawResponse.Errors.Any()
                    ? string.Join(", ", rawResponse.Errors.Select(e => $"[{e.Code}] {e.Message}"))
                    : "Unknown API error";
                
                _logger.LogError("D1 API error: {Error}", errorMsg);
                throw new InvalidOperationException($"Cloudflare D1 API execution failed: {errorMsg}");
            }

            var rawResult = rawResponse.Result?.FirstOrDefault();
            if (rawResult == null) return null;

            var converted = new D1Result<T>
            {
                Success = rawResult.Success,
                Meta = rawResult.Meta,
                Results = new List<T>()
            };

            if (rawResult.ResultsJson != null && rawResult.ResultsJson.Count > 0)
            {
                bool isScalar = IsScalarType<T>();
                foreach (var row in rawResult.ResultsJson)
                {
                    if (isScalar)
                    {
                        // Scalar: row is like { "COUNT(*)": 0 } — extract first property value
                        foreach (var prop in row.EnumerateObject())
                        {
                            var val = JsonSerializer.Deserialize<T>(prop.Value.GetRawText(), _jsonSerializerOptions);
                            if (val != null)
                            {
                                converted.Results.Add(val);
                                break;
                            }
                        }
                    }
                    else
                    {
                        // Complex type: deserialize the whole row as T
                        var obj = JsonSerializer.Deserialize<T>(row.GetRawText(), _jsonSerializerOptions);
                        if (obj != null)
                        {
                            converted.Results.Add(obj);
                        }
                    }
                }
            }

            return converted;
        }
        catch (Exception ex)
        {
            if (suppressErrors)
                _logger.LogTrace(ex, "D1 query suppressed: {Sql}", sql);
            else
                _logger.LogError(ex, "Exception querying D1 for SQL: {Sql}", sql);
            throw;
        }
    }

    // D1 API Payload Types
    private class D1QueryRequest
    {
        [JsonPropertyName("sql")]
        public required string Sql { get; set; }

        [JsonPropertyName("params")]
        public object[] Params { get; set; } = Array.Empty<object>();
    }

    /// <summary>
    /// Raw (non-generic) response — deserializes results as JsonElement
    /// so scalar types (COUNT(*), etc.) are handled correctly.
    /// </summary>
    private class D1RawResponse
    {
        public bool Success { get; set; }
        public List<D1Error> Errors { get; set; } = new();
        public List<string> Messages { get; set; } = new();
        public List<D1RawResult>? Result { get; set; }
    }

    private class D1RawResult
    {
        public bool Success { get; set; }
        public D1Meta? Meta { get; set; }

        [JsonPropertyName("results")]
        public List<JsonElement>? ResultsJson { get; set; }
    }

    private class D1Result<T>
    {
        public List<T> Results { get; set; } = new();
        public bool Success { get; set; }
        public D1Meta? Meta { get; set; }
    }

    private class D1Error
    {
        public int Code { get; set; }
        public string Message { get; set; } = "";
    }

    private class D1Meta
    {
        public double Duration { get; set; }
        public int Changes { get; set; }
        [JsonPropertyName("last_row_id")]
        public long LastRowId { get; set; }
    }
}
