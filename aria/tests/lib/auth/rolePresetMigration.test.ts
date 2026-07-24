import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { applyUserRolePresetMigrationIfNeeded } from "../../../lib/auth/rolePresetMigration";

const LEGACY_USERS_TABLE = `
CREATE TABLE aria_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  backup_codes TEXT,
  backup_codes_used TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL
)`;

async function createLegacyAuthDb() {
  const client = createClient({ url: ":memory:" });
  await client.executeMultiple(`${LEGACY_USERS_TABLE};
INSERT INTO aria_users (
  id, username, email, password_hash, role, created_at
) VALUES (
  'user-1', 'admin', 'admin@example.com', 'hash', 'admin', '2026-01-01T00:00:00.000Z'
);`);
  return client;
}

describe("rolePresetMigration", () => {
  it("migrates legacy admin/editor roles and accepts manager inserts", async () => {
    const client = await createLegacyAuthDb();

    const migrated = await applyUserRolePresetMigrationIfNeeded({
      getUsersTableSql: async () => {
        const result = await client.execute(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_users'",
        );
        return (result.rows[0] as { sql?: string } | undefined)?.sql ?? null;
      },
      execute: async (sql) => {
        await client.executeMultiple(sql);
      },
    });

    expect(migrated).toBe(true);

    const adminRow = await client.execute(
      "SELECT role FROM aria_users WHERE id = 'user-1'",
    );
    expect(adminRow.rows[0]?.role).toBe("administrator");

    await client.execute(
      `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES (
        'user-2', 'manager', 'manager@example.com', 'hash', 'manager', '2026-01-02T00:00:00.000Z'
      )`,
    );

    const managerRow = await client.execute(
      "SELECT role FROM aria_users WHERE username = 'manager'",
    );
    expect(managerRow.rows[0]?.role).toBe("manager");
  });

  it("skips migration when the four-preset CHECK constraint is already present", async () => {
    const client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
CREATE TABLE aria_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'manager', 'content-editor', 'contributor')),
  created_at TEXT NOT NULL
);`);

    const migrated = await applyUserRolePresetMigrationIfNeeded({
      getUsersTableSql: async () => {
        const result = await client.execute(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_users'",
        );
        return (result.rows[0] as { sql?: string } | undefined)?.sql ?? null;
      },
      execute: async (sql) => {
        await client.executeMultiple(sql);
      },
    });

    expect(migrated).toBe(false);
  });
});
