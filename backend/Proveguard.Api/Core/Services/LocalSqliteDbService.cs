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
    private readonly string? _schemaSql;

    public LocalSqliteDbService(IConfiguration configuration, ILogger<LocalSqliteDbService> logger)
    {
        _logger = logger;
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? "Data Source=proveguard.db";
        _schemaSql = LoadSchemaSql();
        
        // Ensure tables exist on startup
        if (_schemaSql != null)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();
            ApplySchema(connection);
        }
    }

    /// <summary>
    /// Locate and load the schema.sql file. Returns null if not found.
    /// </summary>
    private string? LoadSchemaSql()
    {
        // Check output directory first (for published/deployed builds)
        var schemaPath = Path.Combine(AppContext.BaseDirectory, "schema.sql");
        if (File.Exists(schemaPath))
        {
            _logger.LogInformation("Found schema at {Path}", schemaPath);
            return File.ReadAllText(schemaPath);
        }

        // Fallback: project root (for development)
        schemaPath = Path.Combine(Directory.GetCurrentDirectory(), "schema.sql");
        if (File.Exists(schemaPath))
        {
            _logger.LogInformation("Found schema at {Path}", schemaPath);
            return File.ReadAllText(schemaPath);
        }

        _logger.LogWarning("schema.sql not found — tables MUST already exist.");
        return null;
    }

    /// <summary>
    /// Apply idempotent CREATE TABLE IF NOT EXISTS statements to ensure schema exists.
    /// Safe to call on every connection — no-op if tables already exist.
    /// </summary>
    private void ApplySchema(SqliteConnection connection)
    {
        if (_schemaSql == null) return;
        using var command = new SqliteCommand(_schemaSql, connection);
        command.ExecuteNonQuery();
        MigrateSchema(connection);
    }

    /// <summary>
    /// Safely add new columns that may not exist in older databases.
    /// Each ALTER TABLE is wrapped in try/catch — if the column already exists
    /// SQLite throws, and we silently skip.
    /// </summary>
    private void MigrateSchema(SqliteConnection connection)
    {
        var migrations = new[]
        {
            "ALTER TABLE Designers ADD COLUMN phone TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN momo_provider TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN momo_number TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN business_name TEXT DEFAULT ''",
            "ALTER TABLE Designers ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0"
        };

        foreach (var sql in migrations)
        {
            try
            {
                using var cmd = new SqliteCommand(sql, connection);
                cmd.ExecuteNonQuery();
                _logger.LogInformation("Applied column migration: {Sql}", sql);
            }
            catch (Exception ex)
            {
                // Column likely already exists — safe to ignore
                _logger.LogDebug("Migration skipped (column may already exist): {Sql} — {Message}", sql, ex.Message);
            }
        }
    }

    /// <summary>
    /// Ensure tables exist and run pending migrations before any query.
    /// Must be called after opening a connection.
    /// Both the schema and migration calls are idempotent — safe to run every time.
    /// </summary>
    private async Task EnsureSchemaAsync(SqliteConnection connection)
    {
        if (_schemaSql == null) return;
        using var command = new SqliteCommand(_schemaSql, connection);
        await command.ExecuteNonQueryAsync();
        // Run migrations every time — ALTER TABLE ADD COLUMN is wrapped in try/catch
        // and is a no-op if the column already exists.
        MigrateSchema(connection);
    }

    public async Task<IEnumerable<T>> QueryAsync<T>(string sql, params object[] parameters)
    {
        var list = new List<T>();
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureSchemaAsync(connection);

        using var command = new SqliteCommand(sql, connection);
        BindParameters(command, parameters);

        using var reader = await command.ExecuteReaderAsync();
        bool isScalar = IsScalarType<T>();
        while (await reader.ReadAsync())
        {
            list.Add(isScalar ? ReadScalar<T>(reader) : MapRow<T>(reader));
        }

        return list;
    }

    public async Task<T?> QuerySingleOrDefaultAsync<T>(string sql, params object[] parameters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureSchemaAsync(connection);

        using var command = new SqliteCommand(sql, connection);
        BindParameters(command, parameters);

        using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            if (IsScalarType<T>())
            {
                return ReadScalar<T>(reader);
            }
            return MapRow<T>(reader);
        }

        return default;
    }

    private static bool IsScalarType<T>()
    {
        var type = typeof(T);
        return type.IsPrimitive
            || type == typeof(string)
            || type == typeof(decimal)
            || type == typeof(DateTime)
            || type == typeof(Guid)
            || type == typeof(byte[]);
    }

    private static T ReadScalar<T>(SqliteDataReader reader)
    {
        var val = reader.GetValue(0);
        if (val == DBNull.Value)
        {
            return default!;
        }
        return (T)Convert.ChangeType(val, typeof(T));
    }

    public async Task<int> ExecuteAsync(string sql, params object[] parameters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureSchemaAsync(connection);

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
