using System;
using System.Text.Json.Serialization;

namespace Proveguard.Api.Core.Models;

public class Project
{
    [JsonPropertyName("id")]
    public required string Id { get; set; } // UUID

    [JsonPropertyName("designer_id")]
    public required string DesignerId { get; set; }

    [JsonPropertyName("title")]
    public required string Title { get; set; }

    [JsonPropertyName("client_email")]
    public required string ClientEmail { get; set; }

    [JsonPropertyName("price")]
    public decimal Price { get; set; }

    [JsonPropertyName("status")]
    public required string Status { get; set; } // 'Not Viewed', 'Viewed', 'Paid'

    [JsonPropertyName("original_file_key")]
    public required string OriginalFileKey { get; set; }

    [JsonPropertyName("preview_file_key")]
    public required string PreviewFileKey { get; set; }

    [JsonPropertyName("public_link_token")]
    public required string PublicLinkToken { get; set; }

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("viewed_at")]
    public DateTime? ViewedAt { get; set; }

    [JsonPropertyName("paid_at")]
    public DateTime? PaidAt { get; set; }
}
