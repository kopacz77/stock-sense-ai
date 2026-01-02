# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (ignore prepare script since source isn't copied yet)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Build TypeScript
RUN pnpm run build

# Production stage
FROM node:18-alpine

RUN npm install -g pnpm@8.15.0

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy built code first
COPY --from=builder /app/dist ./dist

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only (ignore prepare script)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Create data directories
RUN mkdir -p /app/data/cache /app/data/paper-trading /app/config && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Keep container running and ready for CLI commands
# Use tail -f /dev/null to keep container alive
CMD ["tail", "-f", "/dev/null"]
