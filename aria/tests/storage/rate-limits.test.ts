import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createRateLimitStorageDomain } from "../../lib/storage/internal/domains/rateLimits";
import { SQLiteStoragePlatform } from "../../lib/storage/sqlitePlatform";

describe("database rate limits", () => {
  let client: Client | undefined;
  let tempDir: string | undefined;

  afterEach(async () => {
    client?.close();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    client = undefined;
    tempDir = undefined;
  });

  it("hashes the subject and sends one atomic upsert", async () => {
    const calls: Array<{ sql: string; args: readonly unknown[] }> = [];
    const domain = createRateLimitStorageDomain({
      now: () => 1_000,
      queryFirst: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ): Promise<T | null> => {
        calls.push({ sql, args });
        return { count: 1, reset_at: 61_000 } as unknown as T;
      },
    });

    await expect(
      domain.consumeRateLimit({
        scope: "page-access-password:home",
        subject: "203.0.113.1",
        limit: 10,
        windowMs: 60_000,
      }),
    ).resolves.toEqual({
      allowed: true,
      count: 1,
      remaining: 9,
      resetAt: 61_000,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("ON CONFLICT(scope, subject_hash)");
    expect(calls[0]?.sql).toContain("RETURNING count, reset_at");
    expect(calls[0]?.args[1]).not.toBe("203.0.113.1");
  });

  it("reports a capped blocked result", async () => {
    const domain = createRateLimitStorageDomain({
      now: () => 1_000,
      queryFirst: async <
        T extends Record<string, unknown>,
      >(): Promise<T | null> =>
        ({ count: 11, reset_at: 61_000 }) as unknown as T,
    });

    await expect(
      domain.consumeRateLimit({
        scope: "media-action:delete",
        subject: "user-1",
        limit: 10,
        windowMs: 60_000,
      }),
    ).resolves.toEqual({
      allowed: false,
      count: 10,
      remaining: 0,
      resetAt: 61_000,
    });
  });

  it("enforces a shared threshold through the real SQLite adapter", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-rate-limits-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    const adapter = new SQLiteStoragePlatform(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
      snapshotDir: path.join(tempDir, "snapshots"),
      uploadDir: path.join(tempDir, "uploads"),
      thumbnailsDir: path.join(tempDir, "thumbnails"),
    });

    const input = {
      scope: "page-access-password:home",
      subject: "203.0.113.1",
      limit: 2,
      windowMs: 60_000,
    };

    await expect(adapter.consumeRateLimit(input)).resolves.toMatchObject({
      allowed: true,
      count: 1,
      remaining: 1,
    });
    await expect(adapter.consumeRateLimit(input)).resolves.toMatchObject({
      allowed: true,
      count: 2,
      remaining: 0,
    });
    await expect(adapter.consumeRateLimit(input)).resolves.toMatchObject({
      allowed: false,
      count: 2,
      remaining: 0,
    });

    const rows = await client.execute({
      sql: `SELECT subject_hash, count FROM aria_rate_limits WHERE scope = ?`,
      args: [input.scope],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.subject_hash).not.toBe(input.subject);
    expect(rows.rows[0]?.count).toBe(3);
  });
});
