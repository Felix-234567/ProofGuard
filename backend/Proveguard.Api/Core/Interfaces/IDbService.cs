using System.Collections.Generic;
using System.Threading.Tasks;

namespace Proveguard.Api.Core.Interfaces;

public interface IDbService
{
    Task<IEnumerable<T>> QueryAsync<T>(string sql, params object[] parameters);
    Task<T?> QuerySingleOrDefaultAsync<T>(string sql, params object[] parameters);
    Task<int> ExecuteAsync(string sql, params object[] parameters);
}
