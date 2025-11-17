# Building Thor Stack with Docker Desktop on Windows

This guide shows how to build and run Thor Stack using Docker Desktop on Windows.

## Prerequisites

1. **Docker Desktop** installed and running on Windows
2. **WSL 2 integration** enabled in Docker Desktop settings
3. (Optional) **Git for Windows** if you want to clone to a Windows directory

## Option 1: Build from WSL Directory (Recommended)

### Access Your Project from Windows

Your WSL project is accessible from Windows at:
```
\\wsl$\Ubuntu\home\strick\projects\thor\
```

### Build from Windows PowerShell

Open **PowerShell** or **Command Prompt** on Windows:

```powershell
# Navigate to project (using WSL path)
cd \\wsl$\Ubuntu\home\strick\projects\thor\

# Build all services
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

### Build from Windows Explorer

1. Open File Explorer
2. Navigate to: `\\wsl$\Ubuntu\home\strick\projects\thor\`
3. Right-click in the folder → "Open in Terminal" (PowerShell)
4. Run: `docker compose build`

## Option 2: Copy to Windows Directory

If you prefer to work from a native Windows directory:

### From WSL

```bash
# Create Windows directory (adjust path as needed)
mkdir -p /mnt/c/Projects/thor

# Copy project to Windows
cp -r /home/strick/projects/thor/* /mnt/c/Projects/thor/

# Verify
ls -la /mnt/c/Projects/thor/
```

### From Windows PowerShell

```powershell
# Navigate to Windows directory
cd C:\Projects\thor

# Build and run
docker compose build
docker compose up -d
```

## Environment Configuration

Create `.env.docker` file with your settings:

```powershell
# Copy example (from PowerShell)
copy .env.docker.example .env.docker

# Edit with notepad
notepad .env.docker
```

**For Ollama on Windows:**
```env
USE_OLLAMA=true
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1:8b
```

**For OpenAI:**
```env
USE_OLLAMA=false
OPENAI_API_KEY=sk-your-api-key-here
```

## Common Commands (PowerShell)

### Build
```powershell
# Build all services
docker compose build

# Build specific service
docker compose build thor-api

# Rebuild without cache
docker compose build --no-cache
```

### Run
```powershell
# Start all services (detached)
docker compose up -d

# Start with logs visible
docker compose up

# Start specific service
docker compose up -d thor-api
```

### Monitor
```powershell
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f thor-api

# Check status
docker compose ps

# Check health
docker ps
```

### Stop
```powershell
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes data!)
docker compose down -v
```

### Access Services
- **Web Dashboard**: http://localhost:3001
- **REST API**: http://localhost:3000
- **Agent API**: http://localhost:3002

## PowerShell Build Script

Create `build.ps1`:

```powershell
# Thor Stack - Build Script for Windows

Write-Host "Building Thor Stack Docker Images..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker ps | Out-Null
} catch {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Build all services
Write-Host "`nBuilding thor-api..." -ForegroundColor Yellow
docker compose build thor-api

Write-Host "`nBuilding thor-web..." -ForegroundColor Yellow
docker compose build thor-web

Write-Host "`nBuilding thor-agent..." -ForegroundColor Yellow
docker compose build thor-agent

Write-Host "`n✅ Build complete!" -ForegroundColor Green
Write-Host "`nTo start services, run: docker compose up -d" -ForegroundColor Cyan
```

Run with: `.\build.ps1`

## Batch File Alternative

Create `build.bat`:

```batch
@echo off
echo Building Thor Stack Docker Images...

REM Check if Docker is running
docker ps >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Please start Docker Desktop.
    exit /b 1
)

echo.
echo Building thor-api...
docker compose build thor-api

echo.
echo Building thor-web...
docker compose build thor-web

echo.
echo Building thor-agent...
docker compose build thor-agent

echo.
echo Build complete!
echo To start services, run: docker compose up -d
```

Run with: `build.bat`

## Troubleshooting

### "docker: command not found"

Docker Desktop is not installed or not in PATH.

**Solution:**
1. Install Docker Desktop for Windows
2. Restart your terminal
3. Verify: `docker --version`

### "Cannot connect to the Docker daemon"

Docker Desktop is not running.

**Solution:**
1. Start Docker Desktop from Windows Start Menu
2. Wait for it to fully start (whale icon in system tray)
3. Try again

### "Access Denied" or Permission Errors

**Solution:**
1. Run PowerShell as Administrator
2. Or ensure your user is in the "docker-users" group

### Line Ending Issues (LF vs CRLF)

If you get errors about line endings when running containers:

**Solution:**
```powershell
# Configure git to use LF (not CRLF)
git config --global core.autocrlf input

# Re-clone or re-checkout files
git checkout .
```

### Build is Very Slow

**Solution:**
1. Check Docker Desktop → Settings → Resources
2. Increase CPU and Memory allocation
3. Enable WSL 2 backend if available

## Docker Desktop Settings

Recommended settings for Thor Stack:

1. **General**
   - ✅ Use the WSL 2 based engine

2. **Resources** (WSL 2 backend)
   - Memory: At least 4 GB
   - CPUs: At least 2

3. **Resources > WSL Integration**
   - ✅ Enable integration with your WSL distro (Ubuntu)

## Next Steps

After building:

1. **Configure environment**: Edit `.env.docker`
2. **Start services**: `docker compose up -d`
3. **Access web UI**: http://localhost:3001
4. **Check logs**: `docker compose logs -f`
5. **Test API**: http://localhost:3000/health

## See Also

- `DOCKER.md` - Complete Docker deployment guide
- `docker-compose.yml` - Service definitions
- `.env.docker.example` - Environment variables
