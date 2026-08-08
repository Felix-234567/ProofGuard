FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/Proveguard.Api/Proveguard.Api.csproj backend/Proveguard.Api/
RUN dotnet restore backend/Proveguard.Api/Proveguard.Api.csproj

COPY . .
WORKDIR /src/backend/Proveguard.Api
RUN dotnet publish Proveguard.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Proveguard.Api.dll"]
