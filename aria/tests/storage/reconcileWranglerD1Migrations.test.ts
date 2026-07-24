import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  reconcileLegacyWranglerD1Migrations,
  WRANGLER_D1_BASELINE_MIGRATION,
} from "../../lib/storage/reconcileWranglerD1Migrations";
import { bootstrapLegacyWranglerCanonicalColumns } from "../../lib/storage/bootstrapLegacyWranglerCanonicalColumns";

describe("reconcileLegacyWranglerD1Migrations", () => {
  let tempDir: string;
  let dbPath: string;
  let client: Client;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-wrangler-d1-"));
    dbPath = path.join(tempDir, "local.sqlite");
    client = createClient({ url: `file:${dbPath}` });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects legacy incremental wrangler migrations without recording baseline", async () => {
    await client.executeMultiple(`
      CREATE TABLE d1_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO d1_migrations (id, name) VALUES (1, '0001_init_dsl_schema.sql');

      CREATE TABLE aria_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    client.close();

    const result = await reconcileLegacyWranglerD1Migrations(dbPath);
    expect(result).toBe("stale_baseline");

    const verify = createClient({ url: `file:${dbPath}` });
    const migrations = await verify.execute(
      `SELECT name FROM d1_migrations ORDER BY id`,
    );
    expect(migrations.rows.map((row) => row.name)).toEqual([
      "0001_init_dsl_schema.sql",
    ]);

    verify.close();
  });

  it("returns already_current when baseline is recorded", async () => {
    await client.executeMultiple(`
      CREATE TABLE d1_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO d1_migrations (id, name) VALUES (1, '${WRANGLER_D1_BASELINE_MIGRATION}');
    `);
    client.close();

    const result = await reconcileLegacyWranglerD1Migrations(dbPath);
    expect(result).toBe("already_current");
  });

  it("widens legacy page meta system_role checks during bootstrap", async () => {
    await client.executeMultiple(`
      CREATE TABLE aria_page_meta (
        id TEXT PRIMARY KEY,
        slug TEXT,
        title TEXT,
        status TEXT,
        parent TEXT,
        layout TEXT,
        draft_version TEXT,
        published_version TEXT,
        current_version TEXT NOT NULL,
        system_role TEXT NOT NULL DEFAULT 'standard' CHECK (system_role IN ('standard', 'not-found')),
        access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'password', 'private', 'unlisted')),
        access_password_hash TEXT,
        access_prompt_title TEXT,
        access_prompt_description TEXT,
        access_remember_for_days INTEGER CHECK (access_remember_for_days IS NULL OR access_remember_for_days BETWEEN 1 AND 30),
        access_policy_version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE aria_entries (
        id TEXT PRIMARY KEY,
        collection_id TEXT,
        slug TEXT,
        data_json TEXT NOT NULL,
        status TEXT NOT NULL,
        author_id TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE aria_entry_revisions (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        version TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        actor_id TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO aria_page_meta (
        id,
        slug,
        title,
        status,
        parent,
        layout,
        draft_version,
        published_version,
        current_version,
        system_role,
        access_mode,
        access_policy_version,
        updated_at
      )
      VALUES (
        'posts',
        'posts',
        'Posts',
        'draft',
        NULL,
        NULL,
        'v1',
        NULL,
        'v1',
        'standard',
        'public',
        1,
        '2026-07-05T00:00:00.000Z'
      );
    `);

    await bootstrapLegacyWranglerCanonicalColumns(client);

    await client.execute({
      sql: `UPDATE aria_page_meta SET system_role = ? WHERE id = ?`,
      args: ["cms-collection", "posts"],
    });

    const ddl = await client.execute(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_page_meta'`,
    );
    expect(String(ddl.rows[0]?.sql)).toContain("'cms-entry'");
    expect(String(ddl.rows[0]?.sql)).toContain("'cms-collection'");
  });
});
