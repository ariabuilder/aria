import { createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pushAuthFromLocalDb } from "../../lib/auth/push-auth";

describe("pushAuthFromLocalDb", () => {
  let tempDir: string;
  let sourcePath: string;
  let targetPath: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "aria-auth-push-"));
    sourcePath = join(tempDir, "source.db");
    targetPath = join(tempDir, "target.db");

    const source = createClient({ url: `file:${sourcePath}` });
    await source.execute(`
      CREATE TABLE aria_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        backup_codes TEXT,
        backup_codes_used TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        avatar_url TEXT,
        permission_profile TEXT
      );
    `);
    await source.execute(`
      INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES ('user-1', 'admin', 'a@example.com', 'hash', 'administrator', '2026-01-01T00:00:00.000Z');
    `);
    await source.execute(`
      CREATE TABLE aria_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        remember_me INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    await source.execute(`
      INSERT INTO aria_sessions VALUES ('sess-1', 'user-1', '2099-01-01T00:00:00.000Z', 0, '2026-01-01T00:00:00.000Z');
    `);
    await source.execute(`
      CREATE TABLE aria_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await source.execute(`
      INSERT INTO aria_config VALUES ('bootstrap_user_id', '"user-1"', '2026-01-01T00:00:00.000Z');
    `);

    const target = createClient({ url: `file:${targetPath}` });
    await target.execute(`
      CREATE TABLE aria_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        backup_codes TEXT,
        backup_codes_used TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        avatar_url TEXT,
        permission_profile TEXT
      );
    `);
    await target.execute(`
      CREATE TABLE aria_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("upserts users and config without copying sessions", async () => {
    const result = await pushAuthFromLocalDb({
      sourceDbPath: sourcePath,
      target: {
        local: true,
        sqlite: createClient({ url: `file:${targetPath}` }),
      },
    });

    expect(result.users).toBe(1);
    expect(result.configKeys).toBe(1);

    const target = createClient({ url: `file:${targetPath}` });
    const users = await target.execute("SELECT id FROM aria_users");
    expect(users.rows).toHaveLength(1);

    const sessions = await target.execute("SELECT id FROM aria_sessions").catch(() => ({
      rows: [],
    }));
    expect(sessions.rows).toHaveLength(0);
  });
});
