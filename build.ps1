# Thor Stack - Build Script for Windows PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Thor Stack - Docker Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker status..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Docker is not running." -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

# Stop any running native services on ports 3000-3002
Write-Host "`nStopping native services (if any)..." -ForegroundColor Yellow
if (Test-Path ".\stop-services.ps1") {
    & .\stop-services.ps1
} else {
    Write-Host "⚠️  stop-services.ps1 not found, skipping..." -ForegroundColor Yellow
}

# Check for .env.docker file
Write-Host "`nChecking configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env.docker")) {
    Write-Host "⚠️  Warning: .env.docker not found" -ForegroundColor Yellow
    Write-Host "Creating from example..." -ForegroundColor Yellow
    Copy-Item ".env.docker.example" ".env.docker"
    Write-Host "✅ Created .env.docker (please review and edit if needed)" -ForegroundColor Green
} else {
    Write-Host "✅ Configuration file found" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Building Docker Images" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Build thor-api
Write-Host "`n[1/4] Building thor-api (REST API + SQLite)..." -ForegroundColor Yellow
docker compose build thor-api
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build thor-api" -ForegroundColor Red
    exit 1
}
Write-Host "✅ thor-api built successfully" -ForegroundColor Green

# Build thor-web
Write-Host "`n[2/4] Building thor-web (Web Dashboard)..." -ForegroundColor Yellow
docker compose build thor-web
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build thor-web" -ForegroundColor Red
    exit 1
}
Write-Host "✅ thor-web built successfully" -ForegroundColor Green

# Build thor-mcp
Write-Host "`n[3/4] Building thor-mcp (MCP Server)..." -ForegroundColor Yellow
docker compose build thor-mcp
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build thor-mcp" -ForegroundColor Red
    exit 1
}
Write-Host "✅ thor-mcp built successfully" -ForegroundColor Green

# Build thor-agent
Write-Host "`n[4/4] Building thor-agent (AI Agent)..." -ForegroundColor Yellow
docker compose build thor-agent
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build thor-agent" -ForegroundColor Red
    exit 1
}
Write-Host "✅ thor-agent built successfully" -ForegroundColor Green

# Success
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Build Complete! 🎉" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Images built:" -ForegroundColor Green
Write-Host "  • thor-api    (Port 3000)" -ForegroundColor White
Write-Host "  • thor-web    (Port 3001)" -ForegroundColor White
Write-Host "  • thor-agent  (Port 3002)" -ForegroundColor White
Write-Host "  • thor-mcp    (Port 3003)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review .env.docker configuration" -ForegroundColor White
Write-Host "  2. Start services: " -NoNewline -ForegroundColor White
Write-Host "docker compose up -d" -ForegroundColor Cyan
Write-Host "  3. View logs: " -NoNewline -ForegroundColor White
Write-Host "docker compose logs -f" -ForegroundColor Cyan
Write-Host "  4. Access web UI: " -NoNewline -ForegroundColor White
Write-Host "http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
