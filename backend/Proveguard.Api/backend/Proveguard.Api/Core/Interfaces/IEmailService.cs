using System.Threading.Tasks;

namespace Proveguard.Api.Core.Interfaces;

public interface IEmailService
{
    Task SendProjectNotificationAsync(string clientEmail, string projectTitle, string previewUrl, decimal price);
}
