using System;

namespace Proveguard.Api.Core.Models;

public class Payment
{
    public required string Id { get; set; }
    public required string ProjectId { get; set; }
    public decimal Amount { get; set; }
    public string? PaymentProviderRef { get; set; }
    public required string Status { get; set; } // 'Pending', 'Completed', 'Failed'
    public DateTime CreatedAt { get; set; }
}
