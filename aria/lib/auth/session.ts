/**
 * Session cookie creation, parsing, and clearing. Works with
 * both Astro's cookie API and raw headers.
 */

import { SESSION_COOKIE, SESSION_DURATION, RATE_LIMIT } from "./types";

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge?: number;
  expires?: Date;
}

export interface AstroCookies {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: { path?: string }): void;
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Get session ID from cookies
 *
 * @param cookies - Astro cookies object
 * @returns Session ID or null if not found
 */
export function getSessionIdFromCookies(cookies: AstroCookies): string | null {
  const cookie = cookies.get(SESSION_COOKIE.NAME);
  return cookie?.value ?? null;
}

/**
 * Set session cookie
 *
 * @param cookies - Astro cookies object
 * @param sessionId - Session ID to store
 * @param rememberMe - If true, cookie lasts 30 days; otherwise 7 days
 */
export function setSessionCookie(
  cookies: AstroCookies,
  sessionId: string,
  rememberMe: boolean = false,
): void {
  const maxAge = rememberMe
    ? SESSION_DURATION.REMEMBER_ME / 1000 // Convert ms to seconds
    : SESSION_DURATION.DEFAULT / 1000;

  const secure =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.PROD
      : true;

  cookies.set(SESSION_COOKIE.NAME, sessionId, {
    ...SESSION_COOKIE.OPTIONS,
    secure,
    maxAge,
  });
}

/**
 * Clear session cookie (logout)
 *
 * @param cookies - Astro cookies object
 */
export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE.NAME, { path: SESSION_COOKIE.OPTIONS.path });
}

/**
 * Calculate session expiry datetime
 *
 * @param rememberMe - If true, 30 days; otherwise 7 days
 * @returns ISO datetime string
 */
export function calculateSessionExpiry(rememberMe: boolean = false): string {
  const duration = rememberMe
    ? SESSION_DURATION.REMEMBER_ME
    : SESSION_DURATION.DEFAULT;

  return new Date(Date.now() + duration).toISOString();
}

/**
 * Check if a datetime string is in the past (expired)
 *
 * @param expiresAt - ISO datetime string
 * @returns True if expired
 */
export function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * Get current ISO datetime string
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Generate KV key for session storage
 * Format: aria:session:{sessionId}
 */
export function sessionKey(sessionId: string): string {
  return `aria:session:${sessionId}`;
}

/**
 * Generate KV key for rate limiting
 * Format: ratelimit:{ip}
 */
export function rateLimitKey(ip: string): string {
  return `ratelimit:${ip}`;
}

/**
 * Generate KV key for IP lockout tracking
 * Format: lockout:{ip}
 */
export function lockoutKey(ip: string): string {
  return `lockout:${ip}`;
}

/**
 * Extract client IP from request
 * Client IP from Cloudflare / forwarded headers
 *
 * @param request - Incoming request
 * @returns Client IP address or "unknown"
 */
export function getClientIp(request: Request): string {
  // Cloudflare header (most reliable on CF)
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Forwarded headers are client-spoofable unless a trusted reverse proxy
  // overwrites them. They are useful for local proxy development only; the
  // production Cloudflare path must use CF-Connecting-IP above.
  if (import.meta.env.DEV) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      return realIp;
    }
  }

  return "unknown";
}

// TTL CALCULATIONS (for KV)

/**
 * Calculate TTL in seconds for KV session storage
 *
 * @param rememberMe - If true, 30 days; otherwise 7 days
 * @returns TTL in seconds
 */
export function getSessionTtlSeconds(rememberMe: boolean = false): number {
  const duration = rememberMe
    ? SESSION_DURATION.REMEMBER_ME
    : SESSION_DURATION.DEFAULT;

  return Math.floor(duration / 1000);
}

/**
 * Rate limit window TTL in seconds (1 hour - matches RATE_LIMIT.WINDOW_MS)
 */
export const RATE_LIMIT_TTL_SECONDS = Math.floor(RATE_LIMIT.WINDOW_MS / 1000);
