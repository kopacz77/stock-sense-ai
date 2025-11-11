# Parallel Work Plan - Q1 Completion

## 🤖 Claude's Tasks (Automated)
I will systematically fix the remaining 251 TypeScript errors.

## 👤 Your Tasks (Manual - Start Now)

### Task 1: Docker Setup & Validation (30 minutes)

**Step 1: Review Dockerfile**
```bash
cd /home/kopacz/stock-sense-ai
cat Dockerfile
```

**Step 2: Create Production Dockerfile**
Create a new file `Dockerfile` with this content:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

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

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built code
COPY --from=builder /app/dist ./dist

# Create data directories
RUN mkdir -p /app/data/cache /app/data/paper-trading /app/config && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
```

**Step 3: Create docker-compose.yml**
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
      - "3000:3000"
    volumes:
      - ./data/cache:/app/data/cache
      - ./data/paper-trading:/app/data/paper-trading
      - ./config:/app/config
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    networks:
      - stock-sense-network

networks:
  stock-sense-network:
    driver: bridge
```

**Step 4: Create .dockerignore**
```
node_modules
dist
.git
.gitignore
*.md
.DS_Store
coverage
.vscode
.idea
tests
*.test.ts
data/cache/*
data/paper-trading/*
config/*.enc
.claude
```

**Step 5: Test Docker Build (DON'T RUN YET - wait for TypeScript fixes)**
```bash
# Just validate the files are correct
docker compose config
```

---

### Task 2: Create Missing Documentation (20 minutes)

**Create .env.example**
```bash
cat > .env.example << 'EOF'
# API Keys (configure via stock-analyzer setup)
ALPHA_VANTAGE_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# SendGrid (optional)
SENDGRID_API_KEY=your_key_here
SENDGRID_FROM_EMAIL=your_email_here
SENDGRID_TO_EMAIL=your_email_here

# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Paper Trading
PAPER_TRADING_ENABLED=true
PAPER_TRADING_INITIAL_CAPITAL=10000

# Risk Management
RISK_MAX_POSITION_SIZE_PERCENT=25
RISK_MAX_DAILY_LOSS_PERCENT=5
EOF
```

**Create CONTRIBUTING.md**
```bash
cat > CONTRIBUTING.md << 'EOF'
# Contributing to Stock Sense AI

## Development Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Run in development mode**
   ```bash
   pnpm run dev
   ```

3. **Run tests**
   ```bash
   pnpm test
   ```

4. **Build**
   ```bash
   pnpm run build
   ```

## Code Style

- Use Biome for linting: `pnpm run lint`
- Follow TypeScript strict mode
- Add tests for new features
- Update documentation

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Ensure all tests pass
6. Submit PR with clear description

## Questions?

Open an issue or reach out to maintainers.
EOF
```

---

### Task 3: Validate Existing Setup (15 minutes)

**Check package.json scripts**
```bash
cat package.json | grep -A 20 '"scripts"'
```

**Verify all directories exist**
```bash
mkdir -p data/cache data/paper-trading config tests docs examples scripts
ls -la
```

**Check git status**
```bash
git status
```

---

### Task 4: Review Documentation (10 minutes)

**Read the integration reports**
```bash
cat Q1_INTEGRATION_REPORT.md
cat INTEGRATION_NEXT_STEPS.md
cat TEST_SUITE_REPORT.md
```

Take notes on:
- Any unclear sections
- Missing information
- Questions you have

---

### Task 5: Test Existing Features (15 minutes)

**While TypeScript is being fixed, test what currently works:**

```bash
# Test development mode
pnpm run dev -- --help

# Should show CLI help even with TypeScript errors
# These existing features should work:
npx tsx src/index.ts --version
npx tsx src/index.ts health
npx tsx src/index.ts cache --stats
```

---

### Task 6: Monitor Progress (Ongoing)

**Watch the TypeScript error count go down:**
```bash
# In a separate terminal, run this every few minutes:
watch -n 60 'pnpm run build 2>&1 | grep "error TS" | wc -l'
```

---

## 🔔 Checkpoints

**After 30 minutes:**
- ✅ Docker files created
- ✅ Documentation added
- ✅ Directories validated

**After 60 minutes:**
- ✅ TypeScript errors significantly reduced (Claude's work)
- ✅ All parallel tasks completed (your work)

**After 90 minutes:**
- ✅ TypeScript compiles successfully
- ✅ Ready to test Docker build
- ✅ Ready for integration testing

---

## 📞 Need Help?

If you encounter issues:
1. Check the error message
2. Look in TROUBLESHOOTING.md
3. Ask me specific questions

## 🚀 Next Steps After Parallel Work

Once TypeScript compiles:
1. Test Docker build: `docker compose build`
2. Run integration tests: `pnpm test`
3. Start paper trading locally
4. Deploy!
EOF
