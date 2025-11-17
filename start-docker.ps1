# Thor Stack - Start Docker Containers
# Stops native services and starts Docker containers

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Thor Stack - Start Docker Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Docker is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop" -ForegroundColor Red
    exit 1
}

# Stop native services
Write-Host "`nStopping native services..." -ForegroundColor Yellow
if (Test-Path ".\stop-services.ps1") {
    & .\stop-services.ps1
} else {
    Write-Host "⚠️  stop-services.ps1 not found" -ForegroundColor Yellow
}

# Check if images exist
Write-Host "`nChecking Docker images..." -ForegroundColor Yellow
$images = docker images --format "{{.Repository}}" | Select-String "thor"
if (-not $images) {
    Write-Host "⚠️  No Thor images found" -ForegroundColor Yellow
    Write-Host "Building images first..." -ForegroundColor Yellow
    docker compose build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        exit 1
    }
}

# Start Docker Compose
Write-Host "`nStarting Docker containers..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Services Started Successfully! 🎉" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Access your services:" -ForegroundColor Cyan
    Write-Host "  🌐 Web Dashboard: " -NoNewline; Write-Host "http://localhost:3001" -ForegroundColor Yellow
    Write-Host "  ⚡ REST API:      " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Yellow
    Write-Host "  🤖 Agent API:     " -NoNewline; Write-Host "http://localhost:3002" -ForegroundColor Yellow
    Write-Host "  🔌 MCP Server:    " -NoNewline; Write-Host "http://localhost:3003" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Cyan
    Write-Host "  View logs:    " -NoNewline; Write-Host "docker compose logs -f" -ForegroundColor White
    Write-Host "  Check status: " -NoNewline; Write-Host "docker compose ps" -ForegroundColor White
    Write-Host "  Stop:         " -NoNewline; Write-Host "docker compose down" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    Write-Host "Check logs with: docker compose logs" -ForegroundColor Yellow
    exit 1
}
