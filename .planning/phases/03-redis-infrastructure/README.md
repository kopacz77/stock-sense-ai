# Phase 3: Redis Infrastructure

## Overview

Implement Redis-backed persistence for JWT token blacklist, rate limiting state, and JWT secret storage to ensure auth state survives server restarts.

## Requirements Covered

| REQ-ID | Description | Status |
|--------|-------------|--------|
| AUTH-01 | JWT token blacklist persists in Redis across server restarts | pending |
| AUTH-02 | Rate limiting state persists in Redis across server restarts | pending |
| AUTH-03 | JWT secret is stored persistently (not regenerated on restart) | pending |

## Problem Statement

Current auth state is entirely in-memory:

```typescript
// src/web/auth-middleware.ts line 35
const tokenBlacklist = new Set<string>();

// src/web/server.ts line 76
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// src/web/auth-middleware.ts line 13
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
```

All of this is lost on server restart, causing:
- Logged-out tokens become valid again
- Rate limits reset
- All existing JWTs invalidate (new secret)

## Key Files

- `src/web/auth-middleware.ts` - Token blacklist, JWT secret
- `src/web/server.ts` - Rate limiting map
- `docker-compose.yml` - Add Redis service

## Success Criteria

1. Blacklisted token still rejected after server restart
2. Rate limit state preserved after server restart
3. JWT secret loaded from persistent storage
4. Graceful fallback to in-memory with warning
5. Docker Compose includes Redis service

## Dependencies

- None (can run in parallel with Phase 2)

## Plans

Plans will be created in this directory as work progresses.

---

*Phase Status: pending*
