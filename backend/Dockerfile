FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Proveguard.Api/Proveguard.Api.csproj Proveguard.Api/
RUN dotnet restore Proveguard.Api/Proveguard.Api.csproj

COPY . .
WORKDIR /src/Proveguard.Api
# -r linux-x64 is required so RID-specific native assets (libSkiaSharp.so) are
# copied into the publish output; a portable publish omits them and SkiaSharp
# watermarking fails at runtime. --self-contained false keeps the lean
# aspnet runtime image.
RUN dotnet publish Proveguard.Api.csproj -c Release -r linux-x64 --self-contained false -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libfontconfig1 \
    libfreetype6 \
    fonts-dejavu-core \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENV DOTNET_HOSTBUILDER__RELOADCONFIGONCHANGE=false
EXPOSE 8080

ENTRYPOINT ["dotnet", "Proveguard.Api.dll"]
