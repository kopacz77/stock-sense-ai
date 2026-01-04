/**
 * JWT Authentication Middleware
 *
 * Provides secure token-based authentication for API endpoints.
 * Tokens are generated on login and validated on protected routes.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const JWT_EXPIRES_IN_SECONDS = Number.parseInt(process.env.JWT_EXPIRES_IN_SECONDS || "86400", 10); // 24 hours
const JWT_REFRESH_EXPIRES_IN_SECONDS = Number.parseInt(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS || "604800", 10); // 7 days

// API key for simple authentication (alternative to username/password)
const API_KEY = process.env.STOCK_SENSE_API_KEY;

// Token payload interface
export interface TokenPayload {
  userId: string;
  role: "admin" | "user" | "readonly";
  iat?: number;
  exp?: number;
}

// Extended request with user info
export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

// In-memory token blacklist for logout functionality
// In production, use Redis or database
const tokenBlacklist = new Set<string>();

/**
 * Generate a JWT access token
 */
export function generateAccessToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN_SECONDS,
    algorithm: "HS256",
  });
}

/**
 * Generate a JWT refresh token (longer expiration)
 */
export function generateRefreshToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN_SECONDS,
    algorithm: "HS256",
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Add token to blacklist (for logout)
 */
export function blacklistToken(token: string): void {
  tokenBlacklist.add(token);

  // Clean up expired tokens from blacklist periodically
  // In production, use Redis with TTL
  setTimeout(() => {
    tokenBlacklist.delete(token);
  }, 24 * 60 * 60 * 1000); // 24 hours
}

/**
 * Authentication middleware - validates JWT or API key
 *
 * Supports multiple authentication methods:
 * 1. Bearer token in Authorization header: "Authorization: Bearer <token>"
 * 2. API key in header: "X-API-Key: <key>"
 * 3. API key in query string: "?api_key=<key>"
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip auth for health check endpoint
  if (req.path === "/api/health") {
    next();
    return;
  }

  // Method 1: Check for Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      req.user = payload;
      next();
      return;
    }

    res.status(401).json({
      error: "Invalid or expired token",
      code: "INVALID_TOKEN",
    });
    return;
  }

  // Method 2: Check for API key in header
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
  if (apiKeyHeader && API_KEY && apiKeyHeader === API_KEY) {
    req.user = { userId: "api-key-user", role: "admin" };
    next();
    return;
  }

  // Method 3: Check for API key in query string
  const apiKeyQuery = req.query.api_key as string | undefined;
  if (apiKeyQuery && API_KEY && apiKeyQuery === API_KEY) {
    req.user = { userId: "api-key-user", role: "admin" };
    next();
    return;
  }

  // No valid authentication found
  res.status(401).json({
    error: "Authentication required",
    code: "AUTH_REQUIRED",
    hint: "Provide a valid Bearer token in Authorization header or API key",
  });
}

/**
 * Optional authentication - doesn't block request but attaches user if authenticated
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      req.user = payload;
    }
  }

  // Check API key as fallback
  const apiKey = (req.headers["x-api-key"] as string) || (req.query.api_key as string);
  if (apiKey && API_KEY && apiKey === API_KEY) {
    req.user = { userId: "api-key-user", role: "admin" };
  }

  next();
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: Array<"admin" | "user" | "readonly">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
        required: allowedRoles,
        current: req.user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Generate authentication tokens for a user
 * Used by login endpoint
 */
export function generateAuthTokens(userId: string, role: "admin" | "user" | "readonly" = "user"): {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
} {
  const payload = { userId, role };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
  };
}

/**
 * Refresh an access token using a valid refresh token
 */
export function refreshAccessToken(refreshToken: string): {
  accessToken: string;
  expiresInSeconds: number;
} | null {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as TokenPayload & { type?: string };

    // Verify it's a refresh token
    if (decoded.type !== "refresh") {
      return null;
    }

    // Check blacklist
    if (tokenBlacklist.has(refreshToken)) {
      return null;
    }

    // Generate new access token
    const { userId, role } = decoded;
    return {
      accessToken: generateAccessToken({ userId, role }),
      expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
    };
  } catch {
    return null;
  }
}
