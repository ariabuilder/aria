import { createClient, type Client } from "@libsql/client";

import { BASELINE_MIGRATION_ID } from "./runStorageMigrations";

export const WRANGLER_D1_BASELINE_MIGRATION = BASELINE_MIGRATION_ID;

const LEGACY_BASELINE_TABLES = ["aria_page_meta", "aria_users"] as const;

export type ReconcileWranglerD1MigrationsResult =
  | "already_current"
  | "stale_baseline"
  | "fresh_database";

async function hasLegacyBaselineTables(client: Client): Promise<boolean> {
  for (const tableName of LEGACY_BASELINE_TABLES) {
    const result = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      args: [tableName],
    });
    if (result.rows.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Wrangler local D1 databases created before the baseline migration
 * consolidation may still list old incremental files in `d1_migrations`.
 */
export async function reconcileLegacyWranglerD1Migrations(
  sqlitePath: string,
): Promise<ReconcileWranglerD1MigrationsResult> {
  const client = createClient({ url: `file:${sqlitePath}` });

  try {
    const d1MigrationsTable = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations' LIMIT 1`,
      args: [],
    });
    if (d1MigrationsTable.rows.length === 0) {
      return "fresh_database";
    }

    const applied = await client.execute(`SELECT name FROM d1_migrations`);
    const names = applied.rows.map((row) => String(row.name));

    if (names.includes(WRANGLER_D1_BASELINE_MIGRATION)) {
      return "already_current";
    }

    const hasLegacyMigrations = names.length > 0;
    const hasLegacyTables = await hasLegacyBaselineTables(client);

    if (!hasLegacyMigrations && !hasLegacyTables) {
      return "fresh_database";
    }

    return "stale_baseline";
  } finally {
    client.close();
  }
}
