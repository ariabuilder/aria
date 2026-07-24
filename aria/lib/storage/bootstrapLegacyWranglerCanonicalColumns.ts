import type { Client } from "@libsql/client";

import {
  applyAuthorshipBackfill,
  applyAuthorshipColumnMigrations,
  type AuthorshipColumnName,
  type AuthorshipTableName,
} from "../authorship/schemaMigrations";
import { bootstrapAuthUserColumnMigrations } from "../auth/adapterBootstrap";
import { ensureCmsAuthorshipSchema } from "../cms/storage/schema";
import { ensurePageMetaSystemRoleConstraint } from "./pageMetaSystemRoleMigration";

async function hasTable(
  client: Client,
  tableName: string | AuthorshipTableName,
): Promise<boolean> {
  const result = await client.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    args: [tableName],
  });
  return result.rows.length > 0;
}

async function hasColumn(
  client: Client,
  tableName: string | AuthorshipTableName,
  columnName: string | AuthorshipColumnName,
): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${tableName})`);
  return result.rows.some((row) => String(row.name) === columnName);
}

async function safeAddColumn(
  client: Client,
  tableName: string,
  columnDefinition: string,
): Promise<void> {
  const columnName = columnDefinition.trim().split(/\s+/)[0];
  if (!columnName || (await hasColumn(client, tableName, columnName))) {
    return;
  }

  try {
    await client.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`,
    );
  } catch {
    // Column already exists or table is not ready.
  }
}

/**
 * Idempotent additive schema for wrangler local D1 databases that
 * predate the consolidated baseline migration. Mirrors runtime bootstraps in.
 */
export async function bootstrapLegacyWranglerCanonicalColumns(
  client: Client,
): Promise<void> {
  await bootstrapAuthUserColumnMigrations(async (sql) => {
    await client.execute(sql);
  });

  if (await hasTable(client, "aria_entries")) {
    await safeAddColumn(client, "aria_entries", "schedule_lease_token TEXT");
    await safeAddColumn(
      client,
      "aria_entries",
      "schedule_lease_expires_at TEXT",
    );
    await safeAddColumn(
      client,
      "aria_entries",
      "schedule_attempt_count INTEGER NOT NULL DEFAULT 0",
    );
    await safeAddColumn(client, "aria_entries", "last_schedule_error TEXT");
  }

  if (await hasTable(client, "aria_page_versions")) {
    await safeAddColumn(
      client,
      "aria_page_versions",
      "compiler_metadata_json TEXT",
    );
  }

  if (!(await hasTable(client, "aria_page_meta"))) {
    return;
  }

  await safeAddColumn(client, "aria_page_meta", "scheduled_for TEXT");
  await safeAddColumn(client, "aria_page_meta", "schedule_lease_token TEXT");
  await safeAddColumn(
    client,
    "aria_page_meta",
    "schedule_lease_expires_at TEXT",
  );
  await safeAddColumn(
    client,
    "aria_page_meta",
    "schedule_attempt_count INTEGER NOT NULL DEFAULT 0",
  );
  await safeAddColumn(client, "aria_page_meta", "last_schedule_error TEXT");

  try {
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_aria_page_meta_scheduled_for
        ON aria_page_meta (scheduled_for)
        WHERE status = 'scheduled'
    `);
  } catch {
    // Index already exists or table is not ready.
  }

  await ensurePageMetaSystemRoleConstraint({
    queryFirst: async <T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ) => {
      const result = await client.execute({ sql, args: args as never[] });
      return (result.rows[0] as unknown as T | undefined) ?? null;
    },
    run: async (sql: string, args: unknown[] = []) => {
      await client.execute({ sql, args: args as never[] });
    },
  });

  const authorshipContext = {
    hasTable: (table: AuthorshipTableName) => hasTable(client, table),
    hasColumn: (table: AuthorshipTableName, column: AuthorshipColumnName) =>
      hasColumn(client, table, column),
    execute: async (sql: string) => {
      await client.execute(sql);
    },
  };

  await applyAuthorshipColumnMigrations(authorshipContext);
  await applyAuthorshipBackfill(authorshipContext);

  await ensureCmsAuthorshipSchema({
    queryAll: async <T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ) => {
      const result = await client.execute({ sql, args: args as never[] });
      return result.rows as unknown as T[];
    },
    queryFirst: async <T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ) => {
      const result = await client.execute({ sql, args: args as never[] });
      return (result.rows[0] as unknown as T | undefined) ?? null;
    },
    run: async (sql: string, args: unknown[] = []) => {
      await client.execute({ sql, args: args as never[] });
    },
  });
}
