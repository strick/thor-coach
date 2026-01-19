# Thor API Dockerfile
# Multi-stage build for optimized production image

# ============================================
# Stage 1: Build stage
# ============================================
FROM node:22-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/shared/package*.json ./packages/shared/
COPY apps/thor-api/package*.json ./apps/thor-api/

# Install all dependencies (including devDependencies for build)
RUN npm ci --workspaces

# Copy shared package source
COPY packages/shared/ ./packages/shared/

# Build shared package directly (skip bash/nvm wrapper)
RUN cd packages/shared && npx tsc -p tsconfig.json

# Copy thor-api source
COPY apps/thor-api/ ./apps/thor-api/

# Build thor-api directly (skip bash/nvm wrapper)
RUN cd apps/thor-api && npx tsc -p tsconfig.json

# ============================================
# Stage 2: Production stage
# ============================================
FROM node:22-alpine AS production

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/shared/package*.json ./packages/shared/
COPY apps/thor-api/package*.json ./apps/thor-api/

# Install only production dependencies
RUN npm ci --workspaces --omit=dev

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/thor-api/dist ./apps/thor-api/dist

# Copy migrations folder for database setup
COPY apps/thor-api/migrations ./apps/thor-api/migrations

# Copy shared package.json (needed for module resolution)
COPY packages/shared/package.json ./packages/shared/

# Create directory for SQLite database
RUN mkdir -p /app/data

# Set working directory to thor-api
WORKDIR /app/apps/thor-api

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the API server
CMD ["node", "dist/server.js"]
