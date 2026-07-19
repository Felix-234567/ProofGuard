using System;

namespace Proveguard.Api.Core.Models;

public class Designer
{
    public required string Id { get; set; } // Firebase UID
    public required string Name { get; set; }
    public required string Email { get; set; }
    public DateTime CreatedAt { get; set; }
}
