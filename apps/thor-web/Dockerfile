# Thor Web Dockerfile
# Static file server for the web dashboard

FROM node:22-alpine AS production

WORKDIR /app

# Copy package files
COPY apps/thor-web/package*.json ./

# Install dependencies (use npm install since this isn't a workspace)
RUN npm install --omit=dev

# Copy server and static files
COPY apps/thor-web/server.js ./
COPY apps/thor-web/public ./public/

# Expose web port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the web server
CMD ["node", "server.js"]
