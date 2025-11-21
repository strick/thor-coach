# Thor MCP Server Dockerfile
# Standalone MCP server for AI agent integration

# ============================================
# Stage 1: Build stage
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package files
COPY packages/shared/package*.json ./packages/shared/
COPY mcp/thor/package*.json ./mcp/thor/

# Install all dependencies
RUN npm ci --workspaces

# Copy shared package source
COPY packages/shared/ ./packages/shared/

# Build shared package directly (skip bash/nvm wrapper)
RUN cd packages/shared && npx tsc -p tsconfig.json

# Copy thor-mcp source
COPY mcp/thor/ ./mcp/thor/

# Build thor-mcp directly (skip bash/nvm wrapper)
RUN cd mcp/thor && npx tsc -p tsconfig.json

# ============================================
# Stage 2: Production stage
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package files
COPY packages/shared/package*.json ./packages/shared/
COPY mcp/thor/package*.json ./mcp/thor/

# Install only production dependencies
RUN npm ci --workspaces --omit=dev

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/mcp/thor/dist ./mcp/thor/dist

# Copy shared package.json (needed for module resolution)
COPY packages/shared/package.json ./packages/shared/

# Set working directory to thor-mcp
WORKDIR /app/mcp/thor

# Expose MCP HTTP port
EXPOSE 3003

# Health check for HTTP MCP server
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3003/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the MCP server in HTTP mode
CMD ["node", "dist/index.js"]
