using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
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
    }

    public async Task<IEnumerable<T>> QueryAsync<T>(string sql, params object[] parameters)
    {
        var result = await SendD1QueryAsync<T>(sql, parameters);
        return result?.Results ?? Enumerable.Empty<T>();
    }

    public async Task<T?> QuerySingleOrDefaultAsync<T>(string sql, params object[] parameters)
    {
        var result = await SendD1QueryAsync<T>(sql, parameters);
        return result != null && result.Results.Any() ? result.Results.First() : default;
    }

    public async Task<int> ExecuteAsync(string sql, params object[] parameters)
    {
        // Executes standard query but returns changes count
        var result = await SendD1QueryAsync<object>(sql, parameters);
        return result?.Meta?.Changes ?? 0;
    }

    private async Task<D1Result<T>?> SendD1QueryAsync<T>(string sql, object[] parameters)
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
                _logger.LogError("D1 query failed with status code {StatusCode}. Content: {Content}", response.StatusCode, errorContent);
                throw new HttpRequestException($"Cloudflare D1 REST API query error: {response.StatusCode}");
            }

            var apiResponse = await response.Content.ReadFromJsonAsync<D1Response<T>>(_jsonSerializerOptions);

            if (apiResponse == null || !apiResponse.Success)
            {
                var errorMsg = apiResponse?.Errors != null && apiResponse.Errors.Any()
                    ? string.Join(", ", apiResponse.Errors.Select(e => $"[{e.Code}] {e.Message}"))
                    : "Unknown API error";
                
                _logger.LogError("D1 API error: {Error}", errorMsg);
                throw new InvalidOperationException($"Cloudflare D1 API execution failed: {errorMsg}");
            }

            return apiResponse.Result.FirstOrDefault();
        }
        catch (Exception ex)
        {
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

    private class D1Response<T>
    {
        public bool Success { get; set; }
        public List<D1Error> Errors { get; set; } = new();
        public List<string> Messages { get; set; } = new();
        public List<D1Result<T>> Result { get; set; } = new();
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
