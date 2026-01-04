# Docker Hosting Plan for Stock Sense AI

## Current State Analysis

### What Exists
- **Dockerfile**: Single-stage CLI-focused build (keeps container alive with `tail -f /dev/null`)
- **docker-compose.yml**: Basic single-service setup exposing port 3000
- **Backend**: Express server on port 3001 serving API + static files from `web/public/`
- **Frontend**: Vite React app with dev proxy to backend

### Issues with Current Setup
1. Dockerfile is CLI-oriented, not web dashboard-focused
2. Frontend build not included in Docker image
3. Single port exposure (should be 3001 for the unified server)
4. No health checks
5. No nginx for production-grade static serving
6. Missing frontend environment variable handling

---

## Proposed Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Docker Host                     │
                    │                                             │
   Port 80/443      │  ┌─────────────────────────────────────┐   │
   ──────────────────▶ │         Nginx (optional)            │   │
                    │  │    - SSL termination                │   │
                    │  │    - Static file caching            │   │
                    │  │    - Gzip compression               │   │
                    │  └──────────────┬──────────────────────┘   │
                    │                 │                           │
                    │                 ▼                           │
   Port 3001        │  ┌─────────────────────────────────────┐   │
   ──────────────────▶ │      stock-sense-ai container       │   │
                    │  │                                     │   │
                    │  │  ┌───────────────────────────────┐  │   │
                    │  │  │   Node.js Express Server      │  │   │
                    │  │  │   - REST API (/api/*)         │  │   │
                    │  │  │   - WebSocket (Socket.IO)     │  │   │
                    │  │  │   - Static files (web/public) │  │   │
                    │  │  └───────────────────────────────┘  │   │
                    │  │                                     │   │
                    │  │  Volumes:                           │   │
                    │  │  - /app/data (cache, paper-trading)│   │
                    │  │  - /app/config (encrypted config)  │   │
                    │  └─────────────────────────────────────┘   │
                    │                                             │
                    └─────────────────────────────────────────────┘
```

---

## Implementation Plan

### Option A: Simple (Single Container)
Best for: Personal use, small deployments, VPS hosting

**Changes needed:**
1. Update Dockerfile to build frontend and copy to `web/public/`
2. Change CMD to run the dashboard server
3. Update port mapping to 3001
4. Add health check endpoint

### Option B: Production (Multi-Container with Nginx)
Best for: Production deployments, multiple users, SSL/HTTPS

**Changes needed:**
1. All of Option A changes
2. Add nginx container for reverse proxy
3. SSL certificate management (Let's Encrypt)
4. Static file caching and compression

---

## Files to Create/Modify

### 1. Dockerfile (Updated)
```dockerfile
# Multi-stage build for full-stack application

# Stage 1: Build backend
FROM node:20-alpine AS backend-builder
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build

# Stage 2: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web/frontend
COPY web/frontend/package.json web/frontend/pnpm-lock.yaml ./
RUN npm install
COPY web/frontend/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app

# Copy backend build
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/package.json ./
COPY --from=backend-builder /app/pnpm-lock.yaml ./

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy frontend build
COPY --from=frontend-builder /app/web/frontend/dist ./web/public

# Create data directories
RUN mkdir -p /app/data/cache /app/data/paper-trading /app/config && \
    chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js", "dashboard", "--port", "3001"]
```

### 2. docker-compose.yml (Updated)
```yaml
version: '3.8'

services:
  stock-sense-ai:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: stock-sense-ai
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - stock-data:/app/data
      - stock-config:/app/config
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - PORT=3001
      - AUTH_REQUIRED=true
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - stock-sense-network

volumes:
  stock-data:
  stock-config:

networks:
  stock-sense-network:
    driver: bridge
```

### 3. docker-compose.prod.yml (Optional - with Nginx)
```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: stock-sense-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx-cache:/var/cache/nginx
    depends_on:
      stock-sense-ai:
        condition: service_healthy
    networks:
      - stock-sense-network

  stock-sense-ai:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: stock-sense-ai
    restart: unless-stopped
    expose:
      - "3001"
    volumes:
      - stock-data:/app/data
      - stock-config:/app/config
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - PORT=3001
      - AUTH_REQUIRED=true
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - stock-sense-network

volumes:
  stock-data:
  stock-config:
  nginx-cache:

networks:
  stock-sense-network:
    driver: bridge
```

### 4. nginx/nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    upstream backend {
        server stock-sense-ai:3001;
    }

    server {
        listen 80;
        server_name _;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # API and WebSocket proxy
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /socket.io/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Static files (cached)
        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;

            # Cache static assets
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
                proxy_pass http://backend;
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }
    }
}
```

### 5. .dockerignore (Create/Update)
```
node_modules
web/frontend/node_modules
dist
web/frontend/dist
web/public
.git
.env
*.log
.DS_Store
coverage
.nyc_output
```

### 6. Health Check Endpoint (Add to server.ts)
```typescript
// Add to setupRoutes()
this.app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
  });
});
```

---

## Deployment Commands

### Build and Run (Simple)
```bash
# Build the image
docker compose build

# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Build and Run (Production with Nginx)
```bash
# Build and start with nginx
docker compose -f docker-compose.prod.yml up -d --build

# Check health
curl http://localhost/api/health
```

---

## Environment Variables for Docker

Create `.env` file (copy from `.env.example`):
```bash
# Required
ALPHA_VANTAGE_API_KEY=your_key
FINNHUB_API_KEY=your_key
STOCK_SENSE_API_KEY=your_api_key_for_dashboard_auth

# Optional - Notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SENDGRID_API_KEY=

# Docker-specific
NODE_ENV=production
PORT=3001
AUTH_REQUIRED=true
LOG_LEVEL=info
```

---

## Security Considerations

1. **API Authentication**: `AUTH_REQUIRED=true` enables JWT auth for the dashboard
2. **Secrets**: Use Docker secrets or external vault for sensitive keys
3. **Network**: Only nginx exposed to host, backend on internal network
4. **Non-root user**: Container runs as `nodejs` user (UID 1001)
5. **Health checks**: Kubernetes/Docker Swarm readiness probes

---

## Hosting Options

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| **Raspberry Pi / Home Server** | Free | Low | Personal, local network |
| **VPS (DigitalOcean, Linode)** | $5-20/mo | Medium | Personal, remote access |
| **AWS ECS / Google Cloud Run** | $10-50/mo | High | Production, auto-scaling |
| **Railway / Render** | $5-25/mo | Low | Quick deployment, managed |

---

## Next Steps After Approval

1. Update `Dockerfile` with multi-stage build
2. Update `docker-compose.yml` with proper configuration
3. Add health check endpoint to server
4. Create `.dockerignore`
5. (Optional) Create `docker-compose.prod.yml` and nginx config
6. Test build: `docker compose build`
7. Test run: `docker compose up`
