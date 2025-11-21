# Multi-stage build for Meta-Runner
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json tsconfig.json ./
COPY packages packages
COPY agents/meta-runner agents/meta-runner

# Install dependencies (use npm install to tolerate workspace lockfile differences)
RUN npm install --legacy-peer-deps

# Build shared package first so its dist is available
RUN cd packages/shared && npx tsc -p tsconfig.json

# Build meta-runner
RUN npm run -w agents/meta-runner build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json tsconfig.json ./
COPY packages packages
COPY agents/meta-runner agents/meta-runner

# Install production dependencies only
RUN npm install --omit=dev --production --legacy-peer-deps

# Copy built dist from builder
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/agents/meta-runner/dist agents/meta-runner/dist

EXPOSE 3001

CMD ["node", "agents/meta-runner/dist/server.js"]
