using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Proveguard.Api.Core.Interfaces;

namespace Proveguard.Api.Core.Services;

public class LocalSqliteDbService : IDbService
{
    private readonly string _connectionString;
    private readonly ILogger<LocalSqliteDbService> _logger;

    public LocalSqliteDbService(IConfiguration configuration, ILogger<LocalSqliteDbService> logger)
    {
        _logger = logger;
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? "Data Source=proveguard.db";
        InitializeDatabase();
    }

    private void InitializeDatabase()
    {
        try
        {
            var dbPath = "proveguard.db";
            // Check if connection string specifies a path
            var builder = new SqliteConnectionStringBuilder(_connectionString);
            if (!string.IsNullOrEmpty(builder.DataSource))
            {
                dbPath = builder.DataSource;
            }

            _logger.LogInformation("Initializing local SQLite database at {Path}...", dbPath);

            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            // Check if schema file exists in the application directory
            var schemaPath = Path.Combine(AppContext.BaseDirectory, "schema.sql");
            if (!File.Exists(schemaPath))
            {
                // Try parent directories in development
                schemaPath = Path.Combine(Directory.GetCurrentDirectory(), "schema.sql");
            }

            if (File.Exists(schemaPath))
            {
                _logger.LogInformation("Applying SQL schema from {SchemaPath}...", schemaPath);
                var schemaSql = File.ReadAllText(schemaPath);
                using var command = new SqliteCommand(schemaSql, connection);
                command.ExecuteNonQuery();
            }
            else
            {
                _logger.LogWarning("schema.sql not found at {SchemaPath}. Skipping automatic migration.", schemaPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize SQLite database.");
        }
    }

    public async Task<IEnumerable<T>> QueryAsync<T>(string sql, params object[] parameters)
    {
        var list = new List<T>();
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var command = new SqliteCommand(sql, connection);
        BindParameters(command, parameters);

        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(MapRow<T>(reader));
        }

        return list;
    }

    public async Task<T?> QuerySingleOrDefaultAsync<T>(string sql, params object[] parameters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var command = new SqliteCommand(sql, connection);
        BindParameters(command, parameters);

        using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return MapRow<T>(reader);
        }

        return default;
    }

    public async Task<int> ExecuteAsync(string sql, params object[] parameters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var command = new SqliteCommand(sql, connection);
        BindParameters(command, parameters);

        return await command.ExecuteNonQueryAsync();
    }

    private void BindParameters(SqliteCommand command, object[] parameters)
    {
        for (int i = 0; i < parameters.Length; i++)
        {
            var parameterName = $"?{i + 1}";
            var value = parameters[i] switch
            {
                null => DBNull.Value,
                DateTime dt => dt.ToString("o"), // ISO 8601 string for SQLite
                decimal dec => Convert.ToDouble(dec), // SQLite REAL/double for decimals
                _ => parameters[i]
            };
            command.Parameters.AddWithValue(parameterName, value);
        }
    }

    private T MapRow<T>(SqliteDataReader reader)
    {
        var type = typeof(T);
        var obj = Activator.CreateInstance(type) ?? throw new InvalidOperationException($"Could not create instance of {type.Name}");
        
        for (int i = 0; i < reader.FieldCount; i++)
        {
            var colName = reader.GetName(i);
            // Replace underscores with empty to match C# camelCase or PascalCase if necessary, or check direct match
            var prop = type.GetProperty(colName, BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.Instance)
                       ?? type.GetProperty(colName.Replace("_", ""), BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.Instance);

            if (prop != null)
            {
                var val = reader.GetValue(i);
                if (val == DBNull.Value)
                {
                    prop.SetValue(obj, null);
                }
                else
                {
                    var propType = Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType;
                    if (propType == typeof(DateTime))
                    {
                        prop.SetValue(obj, DateTime.Parse(val.ToString()!));
                    }
                    else if (propType == typeof(decimal))
                    {
                        prop.SetValue(obj, Convert.ToDecimal(val));
                    }
                    else if (propType == typeof(double))
                    {
                        prop.SetValue(obj, Convert.ToDouble(val));
                    }
                    else if (propType == typeof(Guid))
                    {
                        prop.SetValue(obj, Guid.Parse(val.ToString()!));
                    }
                    else
                    {
                        prop.SetValue(obj, Convert.ChangeType(val, propType));
                    }
                }
            }
        }

        return (T)obj;
    }
}
