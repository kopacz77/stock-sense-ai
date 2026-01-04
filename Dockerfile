# =============================================================================
# Stock Sense AI - Multi-stage Docker Build
# =============================================================================
# Builds both backend (Node.js/TypeScript) and frontend (React/Vite) into a
# single production-ready image that serves the dashboard on port 3001.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Backend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 2: Build Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web/frontend

# Copy frontend package files
COPY web/frontend/package.json ./
COPY web/frontend/package-lock.json* ./

# Install dependencies with npm
RUN npm install

# Copy frontend source
COPY web/frontend/ ./

# Build frontend (outputs to dist/)
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Production Image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built backend
COPY --from=backend-builder /app/dist ./dist

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && \
    pnpm store prune

# Copy built frontend to web/public (where Express serves static files)
COPY --from=frontend-builder /app/web/frontend/dist ./web/public

# Create data directories with proper permissions
RUN mkdir -p /app/data/cache /app/data/paper-trading /app/config && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the dashboard port
EXPOSE 3001

# Health check - verify the server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Run the dashboard server
CMD ["node", "dist/index.js", "dashboard", "--port", "3001"]
