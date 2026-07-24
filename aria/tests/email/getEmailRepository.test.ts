import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { AriaCloudflareEnv } from "../../lib/cloudflare/env";
import {
  clearEmailRepositoryCache,
  getEmailRepositoryAsync,
} from "../../lib/email/getEmailRepository";
import {
  BASELINE_MIGRATION_ID,
  runPendingStorageMigrations,
} from "../../lib/storage/runStorageMigrations";
import { createD1Mock } from "../helpers/d1Mock";

function toMigrationClient(client: Client) {
  return {
    executeMultiple: (sql: string) => client.executeMultiple(sql),
    execute: async (sql: string, args: unknown[] = []) => {
      const result = await client.execute({ sql, args: args as never[] });
      return { rows: result.rows };
    },
  };
}

async function hasEmailTables(client: Client): Promise<boolean> {
  const result = await client.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aria_email_connections' LIMIT 1`,
    args: [],
  });
  return result.rows.length > 0;
}

describe("getEmailRepositoryAsync", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-email-repo-"));
    await fs.mkdir(path.join(tempDir, "aria/storage"), { recursive: true });
    await fs.symlink(
      path.join(originalCwd, "aria/migrations"),
      path.join(tempDir, "aria/migrations"),
    );
    process.chdir(tempDir);
    clearEmailRepositoryCache();
  });

  afterEach(async () => {
    clearEmailRepositoryCache();
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("bootstraps a fresh local database with email tables", async () => {
    const repository = await getEmailRepositoryAsync();
    const connections = await repository.listConnections("default");

    expect(connections).toEqual([]);

    const client = createClient({
      url: `file:${path.join(tempDir, "aria/storage/aria.db")}`,
    });
    try {
      expect(await hasEmailTables(client)).toBe(true);
    } finally {
      client.close();
    }
  });

  it("does not fail when the baseline migration was already applied", async () => {
    const dbPath = path.join(tempDir, "aria/storage/aria.db");
    const client = createClient({ url: `file:${dbPath}` });
    const migrationClient = toMigrationClient(client);

    await runPendingStorageMigrations(migrationClient, { baseDir: originalCwd });
    client.close();

    const repository = await getEmailRepositoryAsync();
    const connections = await repository.listConnections("default");

    expect(connections).toEqual([]);
  });

  it("rejects legacy databases that skipped baseline SQL", async () => {
    const dbPath = path.join(tempDir, "aria/storage/aria.db");
    const client = createClient({ url: `file:${dbPath}` });

    await client.executeMultiple(`
      CREATE TABLE aria_page_meta (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        layout TEXT,
        draft_version TEXT,
        published_version TEXT,
        current_version TEXT,
        system_role TEXT,
        access_mode TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    await expect(
      runPendingStorageMigrations(toMigrationClient(client), {
        baseDir: originalCwd,
      }),
    ).rejects.toThrow("Phase 34 baseline schema is stale");
    expect(await hasEmailTables(client)).toBe(false);
    client.close();
  });

  it("ensures email tables on D1-backed locals", async () => {
    const client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
      CREATE TABLE aria_page_meta (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        layout TEXT,
        draft_version TEXT,
        published_version TEXT,
        current_version TEXT,
        system_role TEXT,
        access_mode TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE aria_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      INSERT INTO aria_schema_migrations (id, applied_at)
      VALUES ('${BASELINE_MIGRATION_ID}', '2026-01-01T00:00:00.000Z');
    `);

    const repository = await getEmailRepositoryAsync({
      cfBindings: {
        aria_db: createD1Mock(client) as unknown as AriaCloudflareEnv["aria_db"],
      },
    });

    expect(await repository.listConnections("default")).toEqual([]);
    expect(await hasEmailTables(client)).toBe(true);

    client.close();
  });
});
