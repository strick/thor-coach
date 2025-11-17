# Thor Stack - Docker Deployment Guide

Deploy Thor Stack with Docker and Docker Compose for easy setup and portability.

## Quick Start

### 1. Prerequisites

- Docker 20.10+ installed
- Docker Compose 1.29+ installed
- (Optional) Ollama running on host machine for local LLM

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.docker.example .env.docker

# Edit configuration (optional - defaults work with Ollama on host)
nano .env.docker
```

### 3. Build and Run

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 4. Access Services

- **Web Dashboard**: http://localhost:3001
- **REST API**: http://localhost:3000
- **Agent API**: http://localhost:3002
- **API Health**: http://localhost:3000/health

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Docker Network                       │
│                  (thor-network)                      │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  thor-web    │  │ thor-agent   │  │ thor-api  │ │
│  │  :3001       │  │ :3002        │  │ :3000     │ │
│  │              │  │ (+ MCP)      │  │           │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                 │       │
│         └─────────────────┴─────────────────┘       │
│                           │                         │
│                    ┌──────▼──────┐                  │
│                    │ thor-data   │                  │
│                    │ (SQLite DB) │                  │
│                    └─────────────┘                  │
└─────────────────────────────────────────────────────┘
```

## Services

### thor-api (Port 3000)
- REST API with SQLite database
- Workout parsing and storage
- Weekly summary generation
- Persists data in `thor-data` volume

### thor-web (Port 3001)
- Web dashboard frontend
- Progress tracking and charts
- Workout management interface

### thor-agent (Port 3002)
- Conversational AI agent
- Includes MCP server as subprocess
- Natural language workout logging

## Configuration

### Using Local Ollama

Ensure Ollama is running on your host machine, then use these settings in `.env.docker`:

```bash
USE_OLLAMA=true
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1:8b
```

### Using OpenAI

To use OpenAI instead of Ollama:

```bash
USE_OLLAMA=false
OPENAI_API_KEY=sk-your-api-key-here
```

## Common Commands

### Start Services
```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d thor-api

# Start with rebuild
docker-compose up -d --build
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data!)
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f thor-api

# Last 100 lines
docker-compose logs --tail=100
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart thor-api
```

### Rebuild Services
```bash
# Rebuild all
docker-compose build

# Rebuild specific service
docker-compose build thor-api

# Rebuild without cache
docker-compose build --no-cache
```

## Data Persistence

The SQLite database is stored in a Docker volume named `thor-data`.

### Backup Database
```bash
# Copy database from container
docker cp thor-api:/app/apps/thor-api/workout.db ./backup-workout.db
```

### Restore Database
```bash
# Stop services
docker-compose down

# Remove old volume
docker volume rm thor-data

# Start services (creates new volume)
docker-compose up -d

# Wait for initialization, then stop
docker-compose stop

# Copy backup to container
docker cp ./backup-workout.db thor-api:/app/apps/thor-api/workout.db

# Restart
docker-compose start
```

### View Volume
```bash
# Inspect volume
docker volume inspect thor-data

# List all thor volumes
docker volume ls | grep thor
```

## Troubleshooting

### Service Won't Start

Check logs for errors:
```bash
docker-compose logs thor-api
```

### Can't Connect to Ollama

Ensure:
1. Ollama is running on host: `ollama list`
2. URL is correct: `http://host.docker.internal:11434`
3. Model is downloaded: `ollama pull llama3.1:8b`

Test from within container:
```bash
docker exec -it thor-api sh
wget -O- http://host.docker.internal:11434/api/tags
```

### Database Errors

Reset database:
```bash
docker-compose down
docker volume rm thor-data
docker-compose up -d
```

### Build Failures

Clean build:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Port Already in Use

Change ports in `docker-compose.yml`:
```yaml
ports:
  - "3100:3000"  # Map external 3100 to internal 3000
```

## Health Checks

All services include health checks:

```bash
# Check all services
docker-compose ps

# Check specific service health
docker inspect thor-api --format='{{.State.Health.Status}}'
```

## Development

### Mount Source Code (Hot Reload)

For development with hot reload, modify `docker-compose.yml`:

```yaml
thor-api:
  volumes:
    - ./apps/thor-api/src:/app/apps/thor-api/src
  command: npm run dev
```

### Shell Access

```bash
# Access container shell
docker exec -it thor-api sh

# Run commands
docker exec thor-api npm run test
```

## Production Deployment

### Environment Variables

- Set `NODE_ENV=production`
- Use secrets for API keys
- Configure proper logging
- Set up monitoring

### Security

- Use Docker secrets for sensitive data
- Run containers as non-root user
- Enable Docker security features
- Keep images updated

### Scaling

```bash
# Scale services
docker-compose up -d --scale thor-web=3
```

## Cleanup

### Remove All Thor Resources

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes data!)
docker-compose down -v

# Remove images
docker rmi thor-stack-thor-api thor-stack-thor-web thor-stack-thor-agent

# Remove network
docker network rm thor-network
```

## Support

For issues or questions:
- Check logs: `docker-compose logs`
- Review health: `docker-compose ps`
- See CLAUDE.md for project details
- GitHub Issues: [your-repo-url]
