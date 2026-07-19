using System;

namespace Proveguard.Api.Core.Models;

public class Project
{
    public required string Id { get; set; } // UUID
    public required string DesignerId { get; set; }
    public required string Title { get; set; }
    public required string ClientEmail { get; set; }
    public decimal Price { get; set; }
    public required string Status { get; set; } // 'Not Viewed', 'Viewed', 'Paid'
    public required string OriginalFileKey { get; set; }
    public required string PreviewFileKey { get; set; }
    public required string PublicLinkToken { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ViewedAt { get; set; }
    public DateTime? PaidAt { get; set; }
}
