# Thor Stack - Windows Quick Start

Run Thor Stack on Windows using Docker Desktop.

## 🚀 Quick Start (2 Steps!)

### 1. Open PowerShell in Project Directory

**Option A: From File Explorer**
```
1. Press Win + E (open File Explorer)
2. Navigate to: \\wsl$\Ubuntu\home\strick\projects\thor\
3. Right-click → "Open in Terminal"
```

**Option B: From PowerShell directly**
```powershell
cd \\wsl$\Ubuntu\home\strick\projects\thor\
```

### 2. Start Everything (One Command!)

```powershell
.\start-docker.ps1
```

This script will:
- ✅ Check Docker is running
- ✅ Stop any native services on ports 3000-3002
- ✅ Build images (if not already built)
- ✅ Start all Docker containers
- ✅ Show you the service URLs

Access the web UI at: **http://localhost:3001**

---

## 📜 Alternative: Manual Steps

### Build Docker Images

**Using build script (recommended):**
```powershell
.\build.ps1
```

**Or manually:**
```powershell
# Stop native services first (important!)
.\stop-services.ps1

# Build images
docker compose build
```

### Start Services

```powershell
docker compose up -d
```

Access the web UI at: **http://localhost:3001**

## 📋 Helper Scripts

```powershell
# Quick start (stop services, build if needed, start containers)
.\start-docker.ps1

# Stop native services on ports 3000-3002
.\stop-services.ps1

# Build all Docker images
.\build.ps1
```

## 📋 All Commands

```powershell
# Stop native services first (important!)
.\stop-services.ps1

# Build all services
docker compose build

# Start all services (detached)
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps

# Stop all services
docker compose down

# Restart services
docker compose restart
```

## 🔧 Configuration

Edit `.env.docker` for your setup:

```powershell
# Copy example
copy .env.docker.example .env.docker

# Edit configuration
notepad .env.docker
```

**For local Ollama:**
```env
USE_OLLAMA=true
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1:8b
```

**For OpenAI:**
```env
USE_OLLAMA=false
OPENAI_API_KEY=sk-your-key-here
```

## 🌐 Service URLs

- **Web Dashboard**: http://localhost:3001
- **REST API**: http://localhost:3000
- **Agent API**: http://localhost:3002
- **MCP Server**: http://localhost:3003
- **Health Check**: http://localhost:3000/health

## 🐳 Docker Desktop Requirements

1. **Docker Desktop** installed and running
2. **WSL 2 backend** enabled (Settings → General)
3. **WSL Integration** enabled for Ubuntu (Settings → Resources → WSL Integration)

### Verify Docker is Running

```powershell
docker --version
docker compose version
docker ps
```

## 📊 Service Architecture

```
┌──────────────────────────────────────────────────────┐
│          Docker Desktop (Windows)                    │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌────────┐│
│  │thor-web  │  │thor-agent│  │thor-mcp│  │thor-api││
│  │:3001     │  │:3002     │  │:3003   │  │:3000   ││
│  └──────────┘  └────┬─────┘  └───┬────┘  └───┬────┘│
│                     │            │           │      │
│                     └────────────┴───────────┘      │
│                                  ↓                  │
│                           ┌──────────────┐          │
│                           │  thor-data   │          │
│                           │  (SQLite)    │          │
│                           └──────────────┘          │
└──────────────────────────────────────────────────────┘

Architecture:
• thor-web: Static frontend dashboard
• thor-agent: AI conversational agent (connects to MCP via HTTP)
• thor-mcp: MCP server with 8 tools (HTTP mode for Docker)
• thor-api: REST API + SQLite database
```

## 💾 Data Persistence

Database is stored in Docker volume `thor-data`.

**Backup database:**
```powershell
docker cp thor-api:/app/apps/thor-api/workout.db .\backup-workout.db
```

**Restore database:**
```powershell
docker compose down
docker cp .\backup-workout.db thor-api:/app/apps/thor-api/workout.db
docker compose up -d
```

## 🔍 Troubleshooting

### "Cannot connect to Docker daemon"
→ Start Docker Desktop from Windows Start Menu

### "Port already in use"
→ Stop existing containers: `docker compose down`

### "Build failed" or timeout errors
→ Increase Docker Desktop resources (Settings → Resources)

### Files not found
→ Ensure you're in the correct directory:
```powershell
# Should show docker-compose.yml
ls
```

## 📖 More Documentation

- **BUILD-WINDOWS.md** - Detailed Windows build guide
- **DOCKER.md** - Complete Docker deployment guide
- **CLAUDE.md** - Project architecture and development

## ⚡ Development Workflow

```powershell
# Stop services
docker compose down

# Make code changes in WSL or Windows editor
# ...

# Rebuild and restart
docker compose build
docker compose up -d

# View logs
docker compose logs -f thor-api
```

## 🧹 Cleanup

```powershell
# Stop and remove containers
docker compose down

# Remove all (including data volume)
docker compose down -v

# Remove images
docker rmi thor-thor-api thor-thor-web thor-thor-agent
```

## 📞 Support

For issues:
1. Check logs: `docker compose logs`
2. Check Docker Desktop is running
3. See BUILD-WINDOWS.md for detailed troubleshooting
4. Review DOCKER.md for advanced usage

---

**Happy lifting! 💪⚡**
