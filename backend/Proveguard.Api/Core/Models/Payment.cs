using System;
using System.Text.Json.Serialization;

namespace Proveguard.Api.Core.Models;

public class Payment
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("project_id")]
    public required string ProjectId { get; set; }

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("payment_provider_ref")]
    public string? PaymentProviderRef { get; set; }

    [JsonPropertyName("status")]
    public required string Status { get; set; } // 'Pending', 'Completed', 'Failed'

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; }
}
