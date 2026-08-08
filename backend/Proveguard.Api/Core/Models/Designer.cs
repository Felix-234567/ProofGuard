using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proveguard.Api.Core.Models;

public class Designer
{
    [JsonPropertyName("id")]
    public required string Id { get; set; } // Firebase UID

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("email")]
    public required string Email { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("momo_provider")]
    public string? MomoProvider { get; set; }

    [JsonPropertyName("momo_number")]
    public string? MomoNumber { get; set; }

    [JsonPropertyName("business_name")]
    public string? BusinessName { get; set; }

    [JsonPropertyName("profile_completed")]
    [JsonConverter(typeof(IntToBoolConverter))]
    public bool ProfileCompleted { get; set; }

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Converts D1/SQLite integer booleans (0/1) to/from C# bool.
/// D1 returns integers for boolean columns, but System.Text.Json
/// cannot convert a JSON number to a bool by default.
/// </summary>
public class IntToBoolConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.True) return true;
        if (reader.TokenType == JsonTokenType.False) return false;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32() != 0;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (str == "1" || str == "true" || str == "True") return true;
            if (str == "0" || str == "false" || str == "False") return false;
        }
        throw new JsonException($"Cannot convert JSON token '{reader.TokenType}' to bool.");
    }

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
    {
        writer.WriteBooleanValue(value);
    }
}
