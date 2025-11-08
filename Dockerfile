# Use Node.js LTS version
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM node:18-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=base /app/dist ./dist

# Create necessary directories
RUN mkdir -p data/cache logs && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (if needed for future web interface)
EXPOSE 3000

# Set the entrypoint
ENTRYPOINT ["node", "dist/index.js"]

# Default command
CMD ["--help"]