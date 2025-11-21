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
COPY agents/health/package*.json ./agents/health/

# Install all dependencies
RUN npm ci --workspaces

# Copy shared package source
COPY packages/shared/ ./packages/shared/

# Build shared package directly (skip bash/nvm wrapper)
RUN cd packages/shared && npx tsc -p tsconfig.json

# Copy thor-agent source
COPY agents/health/ ./agents/health/

# Build thor-agent directly (skip bash/nvm wrapper)
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
COPY agents/health/package*.json ./agents/health/

# Install only production dependencies
RUN npm ci --workspaces --omit=dev

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/agents/health/dist ./agents/health/dist

# Copy shared package.json (needed for module resolution)
COPY packages/shared/package.json ./packages/shared/

# Set working directory to thor-agent
WORKDIR /app/agents/health

# Expose agent port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3002/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the agent server
CMD ["node", "dist/server.js"]
