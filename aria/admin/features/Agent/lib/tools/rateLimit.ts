import { getTokenDb } from "../mcp/tokenDb";

export const DEFAULT_RATE_LIMIT_RPM = 60;
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Sliding-window rate limit check. 1.
 */
export async function checkRateLimit(
  locals: App.Locals,
  bucketKey: string,
  limit: number = DEFAULT_RATE_LIMIT_RPM,
): Promise<RateLimitResult> {
  const db = await getTokenDb(locals);

  await db.execute(
    `CREATE TABLE IF NOT EXISTS agent_rate_limit_buckets (
      bucket_key TEXT PRIMARY KEY,
      timestamps TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const row = await db.queryFirst(
    `SELECT timestamps FROM agent_rate_limit_buckets WHERE bucket_key = ?`,
    [bucketKey],
  );

  let timestamps: number[] = [];
  if (row) {
    try {
      const parsed = JSON.parse(String(row.timestamps));
      timestamps = Array.isArray(parsed) ? parsed : [];
    } catch {
      timestamps = [];
    }
  }

  timestamps = timestamps.filter((ts) => ts > cutoff);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0]!;
    const retryAfterMs = oldest + WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
  }

  timestamps.push(now);
  await db.execute(
    `INSERT OR REPLACE INTO agent_rate_limit_buckets (bucket_key, timestamps, updated_at)
     VALUES (?, ?, ?)`,
    [bucketKey, JSON.stringify(timestamps), new Date(now).toISOString()],
  );

  return { allowed: true };
}
