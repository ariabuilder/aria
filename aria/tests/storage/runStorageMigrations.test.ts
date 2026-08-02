import { createClient, type Client, type InStatement } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  BASELINE_MIGRATION_ID,
  runPendingStorageMigrations,
  type StorageMigrationClient,
} from "../../lib/storage/runStorageMigrations";

function toMigrationClient(client: Client): StorageMigrationClient {
  return {
    executeMultiple: (sql) => client.executeMultiple(sql),
    execute: async (sql, args = []) => {
      const result = await client.execute({ sql, args: args as never[] });
      return { rows: result.rows };
    },
  };
}

describe("runPendingStorageMigrations", () => {
  let tempDir: string;
  let client: Client;
  let migrationClient: StorageMigrationClient;
  let executeMultipleCalls: number;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-migrations-test-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    migrationClient = toMigrationClient(client);
    executeMultipleCalls = 0;

    const originalExecuteMultiple =
      migrationClient.executeMultiple.bind(migrationClient);
    migrationClient.executeMultiple = async (sql) => {
      executeMultipleCalls += 1;
      return originalExecuteMultiple(sql);
    };
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("applies baseline on a fresh database and records the migration", async () => {
    const applied = await runPendingStorageMigrations(migrationClient, {
      baseDir: process.cwd(),
    });

    expect(applied).toBe(true);

    const row = await client.execute({
      sql: `SELECT id FROM aria_schema_migrations WHERE id = ?`,
      args: [BASELINE_MIGRATION_ID],
    } satisfies InStatement);
    expect(row.rows).toHaveLength(1);

    const usersTable = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aria_users'`,
      args: [],
    } satisfies InStatement);
    expect(usersTable.rows).toHaveLength(1);

    const consolidatedTables = await client.execute(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN (
           'aria_agent_mutations',
           'aria_ai_inference_runs',
           'aria_collection_policies',
           'aria_cms_audit_events',
           'aria_cms_search_documents',
           'aria_cms_search_scopes'
         )
       ORDER BY name`,
    );
    expect(consolidatedTables.rows.map((row) => row.name)).toEqual([
      "aria_agent_mutations",
      "aria_ai_inference_runs",
      "aria_cms_audit_events",
      "aria_cms_search_documents",
      "aria_cms_search_scopes",
      "aria_collection_policies",
    ]);

    const searchColumns = await client.execute(
      `PRAGMA table_info(aria_cms_search_documents)`,
    );
    expect(
      searchColumns.rows.some((column) => column.name === "generation"),
    ).toBe(true);

    const auditForeignKeys = await client.execute({
      sql: `PRAGMA foreign_key_list(aria_cms_audit_events)`,
      args: [],
    } satisfies InStatement);
    expect(auditForeignKeys.rows).toHaveLength(0);
  });

  it("skips baseline on subsequent calls", async () => {
    await runPendingStorageMigrations(migrationClient, {
      baseDir: process.cwd(),
    });
    executeMultipleCalls = 0;

    const applied = await runPendingStorageMigrations(migrationClient, {
      baseDir: process.cwd(),
    });

    expect(applied).toBe(false);
    expect(executeMultipleCalls).toBe(1);
  });

  it("keeps the baseline and forward migrations within D1 schema limits", async () => {
    const migrationsDir = path.join(process.cwd(), "aria/migrations");
    const migrationIds = (await fs.readdir(migrationsDir)).sort();
    expect(migrationIds).toEqual([
      BASELINE_MIGRATION_ID,
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
      "0005_integration_events.sql",
      "0006_webhook_delivery.sql",
      "0007_oauth_provider.sql",
      "0008_published_dependency_pins.sql",
      "0009_studio_presence_sessions.sql",
    ]);

    for (const migrationId of migrationIds) {
      const sql = await fs.readFile(
        path.join(migrationsDir, migrationId),
        "utf-8",
      );
      const longestStatementBytes = Math.max(
        ...sql
          .split(";")
          .map((statement) => Buffer.byteLength(statement, "utf-8")),
      );
      expect(longestStatementBytes).toBeLessThanOrEqual(100_000);
      await client.executeMultiple(sql);
    }
    const tables = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    for (const table of tables.rows) {
      const tableName = String(table.name).replaceAll("'", "''");
      const columns = await client.execute(
        `SELECT COUNT(*) AS count FROM pragma_table_info('${tableName}')`,
      );
      expect(Number(columns.rows[0]?.count ?? 0)).toBeLessThanOrEqual(100);
    }
  });

  it("rejects legacy databases instead of recording a stale consolidated baseline", async () => {
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
    executeMultipleCalls = 0;

    await expect(
      runPendingStorageMigrations(migrationClient, { baseDir: process.cwd() }),
    ).rejects.toThrow(/reset\/reprovision/i);
    expect(executeMultipleCalls).toBe(1);

    const row = await client.execute({
      sql: `SELECT id FROM aria_schema_migrations WHERE id = ?`,
      args: [BASELINE_MIGRATION_ID],
    } satisfies InStatement);
    expect(row.rows).toHaveLength(0);

    const usersTable = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aria_users'`,
      args: [],
    } satisfies InStatement);
    expect(usersTable.rows).toHaveLength(0);

    const skippedBaselineTables = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aria_ai_inference_runs'`,
      args: [],
    } satisfies InStatement);
    expect(skippedBaselineTables.rows).toHaveLength(0);
  });
});
