# OpenClawSpace Hub Dockerfile
# Multi-stage build for production deployment to Docker Swarm

# Stage 1: Build the web frontend
FROM node:20-alpine AS web-builder

WORKDIR /app/ocs-hub-web

# Copy web package files first (for better caching)
COPY packages/ocs-hub-web/package.json ./
COPY packages/ocs-hub-web/tsconfig.json ./
COPY packages/ocs-hub-web/tsconfig.node.json ./
COPY packages/ocs-hub-web/vite.config.ts ./
COPY packages/ocs-hub-web/index.html ./

# Install dependencies
RUN npm install

# Copy web source code
COPY packages/ocs-hub-web/src ./src

# Build the web app
RUN npm run build

# Stage 2: Build the service
FROM node:20-alpine AS service-builder

WORKDIR /app/ocs-hub-service

# Copy service package files first (for better caching)
COPY packages/ocs-hub-service/package.json ./
COPY packages/ocs-hub-service/tsconfig.json ./

# Install dependencies
RUN npm install

# Copy service source code (excluding node_modules via .dockerignore)
COPY packages/ocs-hub-service/src ./src

# Build the service (override types for Node.js, not Cloudflare Workers)
RUN npx tsc --types node

# Stage 3: Production image
FROM node:20-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built web assets
COPY --from=web-builder --chown=nodejs:nodejs /app/ocs-hub-web/dist ./ocs-hub-web/dist

# Copy service files
COPY --from=service-builder --chown=nodejs:nodejs /app/ocs-hub-service/dist ./ocs-hub-service/dist
COPY --from=service-builder --chown=nodejs:nodejs /app/ocs-hub-service/node_modules ./ocs-hub-service/node_modules
COPY --from=service-builder --chown=nodejs:nodejs /app/ocs-hub-service/package.json ./ocs-hub-service/

# Create spaces directory for file storage
RUN mkdir -p /app/.ocs-client/spaces && chown -R nodejs:nodejs /app/.ocs-client

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8787
ENV HOME=/app

# Switch to non-root user
USER nodejs

# Expose the service port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8787/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set working directory to service
WORKDIR /app/ocs-hub-service

# Start the service
CMD ["node", "dist/index.js"]
