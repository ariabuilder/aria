import type { StorageAdapter } from "../../adapter";

export type RateLimitStorageDomain = Pick<StorageAdapter, "consumeRateLimit">;

type RateLimitStorageContext = {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  now(): number;
};

async function hashSubject(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(subject),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Uses one atomic SQLite/D1 upsert per request. Unlike KV read-modify-write,
 * this remains correct across Worker instances and never stores raw IPs.
 */
export function createRateLimitStorageDomain(
  context: RateLimitStorageContext,
): RateLimitStorageDomain {
  return {
    async consumeRateLimit(input) {
      const now = context.now();
      const resetAt = now + input.windowMs;
      const subjectHash = await hashSubject(input.subject);
      const row = await context.queryFirst<{
        count: number;
        reset_at: number;
      }>(
        `INSERT INTO aria_rate_limits (scope, subject_hash, count, reset_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(scope, subject_hash) DO UPDATE SET
           count = CASE
             WHEN aria_rate_limits.reset_at <= ? THEN 1
             WHEN aria_rate_limits.count < ? THEN aria_rate_limits.count + 1
             ELSE aria_rate_limits.count
           END,
           reset_at = CASE
             WHEN aria_rate_limits.reset_at <= ? THEN excluded.reset_at
             ELSE aria_rate_limits.reset_at
           END
         RETURNING count, reset_at`,
        [input.scope, subjectHash, resetAt, now, input.limit + 1, now],
      );

      if (!row) {
        throw new Error("Rate-limit upsert did not return a result");
      }

      const count = Number(row.count);
      const resolvedResetAt = Number(row.reset_at);
      return {
        allowed: count <= input.limit,
        count: Math.min(count, input.limit),
        remaining: Math.max(0, input.limit - count),
        resetAt: resolvedResetAt,
      };
    },
  };
}
