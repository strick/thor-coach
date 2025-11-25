# Health Agent Dockerfile
# Health events conversational agent with MCP client

# ============================================
# Stage 1: Build stage
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY agents/health/package*.json ./agents/health/

# Install all dependencies
RUN npm ci --workspaces

# Copy shared package source and build
COPY packages/shared/ ./packages/shared/
RUN cd packages/shared && npx tsc -p tsconfig.json

# Copy agent-core source and build
COPY packages/agent-core/ ./packages/agent-core/
RUN cd packages/agent-core && npx tsc -p tsconfig.json

# Copy health agent source and build
COPY agents/health/ ./agents/health/
RUN cd agents/health && npx tsc -p tsconfig.json

# ============================================
# Stage 2: Production stage
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY agents/health/package*.json ./agents/health/

# Install only production dependencies
RUN npm ci --workspaces --omit=dev

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/agent-core/dist ./packages/agent-core/dist
COPY --from=builder /app/agents/health/dist ./agents/health/dist

# Copy package.json files (needed for module resolution)
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-core/package.json ./packages/agent-core/

# Set working directory to health-agent
WORKDIR /app/agents/health

# Expose agent port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3006/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the agent server
CMD ["node", "dist/server.js"]
