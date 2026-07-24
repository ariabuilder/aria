import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { LibSQLAdapter } from "../../lib/auth/libsql-adapter";
import { CloudflareAdapter } from "../../lib/auth/cloudflare-adapter";
import * as schema from "../../lib/auth/schema";
import { getBootstrapAdministratorProfile } from "../../lib/auth/bootstrapUser";
import { SQLiteStoragePlatform } from "../../lib/storage/sqlitePlatform";
import { createD1Mock } from "../helpers/d1Mock";

async function createUsersTable(client: ReturnType<typeof createClient>) {
  await client.executeMultiple(`
    CREATE TABLE aria_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT,
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
      permission_profile TEXT,
      preferences TEXT,
      oauth_provider TEXT,
      oauth_id TEXT
    );
  `);
}

const firstAdmin = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "first-admin",
  email: "first@example.com",
  passwordHash: "hash-1",
  role: "administrator" as const,
  createdAt: "2026-07-10T00:00:00.000Z",
  permissionProfile: getBootstrapAdministratorProfile(),
};

const secondAdmin = {
  ...firstAdmin,
  id: "22222222-2222-4222-8222-222222222222",
  username: "second-admin",
  email: "second@example.com",
  passwordHash: "hash-2",
};

describe("atomic bootstrap administrator creation", () => {
  it("records the canonical migration when auth initializes a fresh database", async () => {
    const client = createClient({ url: "file::memory:" });
    const adapter = new LibSQLAdapter(drizzle(client, { schema }), client);

    await adapter.initialize();

    const migrations = await client.execute(
      `SELECT id FROM aria_schema_migrations WHERE id = '0001_baseline_schema.sql'`,
    );
    const entries = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aria_entries'`,
    );
    expect(migrations.rows).toHaveLength(1);
    expect(entries.rows).toHaveLength(1);

    const storage = new SQLiteStoragePlatform(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await expect(storage.getSiteSettings()).resolves.toBeNull();
    client.close();
  });

  it("allows exactly one concurrent first-user insert", async () => {
    const client = createClient({ url: "file::memory:" });
    await createUsersTable(client);

    const adapter = new LibSQLAdapter(drizzle(client, { schema }), client);
    const [first, second] = await Promise.all([
      adapter.createFirstUser(firstAdmin),
      adapter.createFirstUser(secondAdmin),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await adapter.countUsers()).toBe(1);
    client.close();
  });

  it("uses the same atomic claim through the D1 adapter", async () => {
    const client = createClient({ url: "file::memory:" });
    await createUsersTable(client);
    const d1 = createD1Mock(client);
    const kv = {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    };
    const adapter = new CloudflareAdapter(
      drizzleD1(d1 as never, { schema }),
      d1 as never,
      kv,
    );

    const [first, second] = await Promise.all([
      adapter.createFirstUser(firstAdmin),
      adapter.createFirstUser(secondAdmin),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await adapter.countUsers()).toBe(1);
    client.close();
  });
});
