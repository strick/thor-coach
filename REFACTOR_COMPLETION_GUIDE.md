# Phase 1 Refactor Completion Guide

## ✅ Completed
1. Created new directory structure (`agents/`, `mcp/`, `tests/`)
2. Copied all files to new locations
3. Simplified thor-agent (single MCP connection to thor-mcp)
4. Created health-agent (single MCP connection to health-mcp)
5. Updated package names (health-agent)

## 🔧 Remaining Configuration Changes

### 1. Update Root package.json Workspaces

**File:** `/home/strick/projects/thor/package.json`

Change workspaces from:
```json
"workspaces": [
  "apps/*",
  "packages/*"
],
```

To:
```json
"workspaces": [
  "apps/*",
  "agents/*",
  "mcp/*",
  "packages/*"
],
```

Add new scripts:
```json
"scripts": {
  // ... existing scripts ...
  "dev:thor-agent": "npm run dev --workspace=thor-agent",
  "dev:health-agent": "npm run dev --workspace=health-agent",
  "build:thor-agent": "npm run build --workspace=thor-agent",
  "build:health-agent": "npm run build --workspace=health-agent",
  "build:thor-mcp": "npm run build --workspace=thor-mcp",
  "build:health-mcp": "npm run build --workspace=health-mcp"
}
```

### 2. Update Dockerfiles

**File:** `agents/thor/Dockerfile`
```dockerfile
# Change references from apps/thor-agent to agents/thor
COPY agents/thor/package*.json ./agents/thor/
# ... etc
WORKDIR /app/agents/thor
```

**File:** `agents/health/Dockerfile`
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY agents/health/package*.json ./agents/health/

RUN npm ci --workspaces

COPY packages/shared/ ./packages/shared/
RUN cd packages/shared && npx tsc -p tsconfig.json

COPY agents/health/ ./agents/health/
RUN cd agents/health && npx tsc -p tsconfig.json

FROM node:22-alpine AS production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY agents/health/package*.json ./agents/health/

RUN npm ci --workspaces --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/agents/health/dist ./agents/health/dist
COPY packages/shared/package.json ./packages/shared/

WORKDIR /app/agents/health

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3006/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
```

**File:** `mcp/thor/Dockerfile`
```dockerfile
# Change references from apps/thor-mcp to mcp/thor
COPY mcp/thor/package*.json ./mcp/thor/
# ... etc
WORKDIR /app/mcp/thor
```

**File:** `mcp/health/Dockerfile`
```dockerfile
# Change references from apps/health-mcp to mcp/health
COPY mcp/health/package*.json ./mcp/health/
# ... etc
WORKDIR /app/mcp/health
```

### 3. Update docker-compose.yml

**File:** `/home/strick/projects/thor/docker-compose.yml`

```yaml
services:
  # ... thor-api and thor-web unchanged ...

  # Thor MCP - UPDATED PATH
  thor-mcp:
    build:
      context: .
      dockerfile: mcp/thor/Dockerfile
    container_name: thor-mcp
    ports:
      - "3003:3003"
    environment:
      - MCP_PORT=3003
      - NODE_ENV=production
      - TZ=America/New_York
      - THOR_API_URL=http://thor-api:3000
    networks:
      - thor-network
    depends_on:
      thor-api:
        condition: service_healthy
    restart: unless-stopped

  # Health MCP - UPDATED PATH
  health-mcp:
    build:
      context: .
      dockerfile: mcp/health/Dockerfile
    container_name: health-mcp
    ports:
      - "3005:3005"
    environment:
      - MCP_PORT=3005
      - NODE_ENV=production
      - TZ=America/New_York
      - THOR_API_URL=http://thor-api:3000
    networks:
      - thor-network
    depends_on:
      thor-api:
        condition: service_healthy
    restart: unless-stopped

  # Thor Agent - UPDATED PATH
  thor-agent:
    build:
      context: .
      dockerfile: agents/thor/Dockerfile
    container_name: thor-agent
    ports:
      - "3002:3002"
    environment:
      - PORT=3002
      - NODE_ENV=production
      - TZ=America/New_York
      - THOR_API_URL=http://thor-api:3000
      - MCP_SERVER_URL=http://thor-mcp:3003
      - USE_OLLAMA=${USE_OLLAMA:-true}
      - OLLAMA_URL=${OLLAMA_URL:-http://host.docker.internal:11434}
      - OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.1:8b}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
    networks:
      - thor-network
    depends_on:
      thor-api:
        condition: service_healthy
      thor-mcp:
        condition: service_healthy
    restart: unless-stopped

  # Health Agent - NEW SERVICE
  health-agent:
    build:
      context: .
      dockerfile: agents/health/Dockerfile
    container_name: health-agent
    ports:
      - "3006:3006"
    environment:
      - PORT=3006
      - NODE_ENV=production
      - TZ=America/New_York
      - THOR_API_URL=http://thor-api:3000
      - MCP_SERVER_URL=http://health-mcp:3005
      - USE_OLLAMA=${USE_OLLAMA:-true}
      - OLLAMA_URL=${OLLAMA_URL:-http://host.docker.internal:11434}
      - OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.1:8b}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
    networks:
      - thor-network
    depends_on:
      thor-api:
        condition: service_healthy
      health-mcp:
        condition: service_healthy
    restart: unless-stopped

  # Thor Meta-Runner - UPDATE ENVIRONMENT
  thor-meta-runner:
    # ... keep existing build config ...
    environment:
      - PORT=3001
      - NODE_ENV=production
      - THOR_API_URL=http://thor-api:3000
      - THOR_AGENT_URL=http://thor-agent:3002
      - HEALTH_AGENT_URL=http://health-agent:3006  # NEW
      - USE_OLLAMA=${USE_OLLAMA:-true}
      - OLLAMA_URL=${OLLAMA_URL:-http://host.docker.internal:11434}
      - OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.1:8b}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
    # ... rest unchanged ...
```

### 4. Update Meta-Runner to Route to Health-Agent

**File:** `apps/thor-meta-runner/src/clients/thorApiClient.ts`

Rename to `apps/thor-meta-runner/src/clients/agentClient.ts` and update:

```typescript
const THOR_AGENT_URL = process.env.THOR_AGENT_URL || 'http://thor-agent:3002';
const HEALTH_AGENT_URL = process.env.HEALTH_AGENT_URL || 'http://health-agent:3006';

export class AgentClient {
  private thorAgent = axios.create({ baseURL: THOR_AGENT_URL });
  private healthAgent = axios.create({ baseURL: HEALTH_AGENT_URL });

  async sendToThorAgent(message: string, sessionId?: string) {
    const response = await this.thorAgent.post('/chat', { message, sessionId });
    return response.data;
  }

  async sendToHealthAgent(message: string, sessionId?: string) {
    const response = await this.healthAgent.post('/chat', { message, sessionId });
    return response.data;
  }

  // Legacy methods for backwards compat
  async logWorkout(text: string) {
    return this.sendToThorAgent(`Log this workout: "${text}"`);
  }

  async logHealthEvent(description: string) {
    return this.sendToHealthAgent(`Log this health event: "${description}"`);
  }

  // ... rest of methods ...
}
```

**File:** `apps/thor-meta-runner/src/services/metaRunner.ts`

Update imports and usage:
```typescript
import { AgentClient } from '../clients/agentClient.js';

// In handleHealthLog method:
private async handleHealthLog(text: string) {
  try {
    const result = await this.agentClient.sendToHealthAgent(text);
    // ... rest
  }
}
```

### 5. Create Health-Agent Server

**File:** `agents/health/src/server.ts`

Copy from `agents/thor/src/server.ts` and update:
```typescript
import { HealthAgent } from './agent.js';  // Change import

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3006;  // Change port
const agent = new HealthAgent();  // Change class name

// ... rest similar to thor-agent server
```

### 6. Clean Up Old Directories

After verifying everything works:
```bash
rm -rf apps/thor-agent
rm -rf apps/thor-mcp
rm -rf apps/health-mcp
```

## 🚀 Build & Deploy Steps

1. **Install dependencies for new workspaces:**
```bash
npm install
```

2. **Build all services:**
```bash
npm run build
```

3. **Build Docker images:**
```bash
docker compose build
```

4. **Start services:**
```bash
docker compose up
```

5. **Verify services:**
```bash
# Check all services are healthy
docker compose ps

# Test thor-agent
curl http://localhost:3002/health

# Test health-agent
curl http://localhost:3006/health

# Test thor-mcp
curl http://localhost:3003/health

# Test health-mcp
curl http://localhost:3005/health
```

## 📝 Phase 2 Planning (Next Session)

Once Phase 1 is complete and verified, we'll implement:

1. **Test Infrastructure** (`tests/helpers/`)
   - Test database utilities
   - API test helpers
   - MCP client mocks

2. **API Tests** (`apps/thor-api/tests/`)
   - Health events CRUD
   - Workout logging
   - Integration tests

3. **MCP Tool Tests** (`mcp/*/tests/`)
   - Thor-MCP tool tests
   - Health-MCP tool tests

4. **Agent Tests** (`agents/*/tests/`)
   - Thor-agent chat flow
   - Health-agent chat flow

5. **E2E Tests** (`tests/e2e/`)
   - Full workout flow
   - Full health logging flow
   - Router classification tests

**Target:** ~80% code coverage with Vitest
