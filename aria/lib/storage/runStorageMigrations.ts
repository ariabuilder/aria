import fs from "fs/promises";
import path from "path";
import {
  formatLocalizationSchemaVerificationFailure,
  verifyLocalizationSchema,
} from "./verifyLocalizationSchema";

export const BASELINE_MIGRATION_ID = "0001_baseline_schema.sql" as const;

const LEGACY_BASELINE_TABLES = ["aria_page_meta", "aria_users"] as const;

const ENSURE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS aria_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`.trim();

export interface StorageMigrationClient {
  executeMultiple(sql: string): Promise<void>;
  execute(
    sql: string,
    args?: unknown[],
  ): Promise<{ rows: ReadonlyArray<unknown> }>;
}

async function hasMigrationRecord(
  client: StorageMigrationClient,
  migrationId: string,
): Promise<boolean> {
  const result = await client.execute(
    `SELECT id FROM aria_schema_migrations WHERE id = ? LIMIT 1`,
    [migrationId],
  );
  return result.rows.length > 0;
}

async function recordMigration(
  client: StorageMigrationClient,
  migrationId: string,
): Promise<void> {
  await client.execute(
    `INSERT OR IGNORE INTO aria_schema_migrations (id, applied_at) VALUES (?, ?)`,
    [migrationId, new Date().toISOString()],
  );
}

async function hasLegacyBaselineSchema(
  client: StorageMigrationClient,
): Promise<boolean> {
  for (const tableName of LEGACY_BASELINE_TABLES) {
    const result = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      [tableName],
    );
    if (result.rows.length > 0) {
      return true;
    }
  }
  return false;
}

async function readMigrationFiles(
  baseDir = process.cwd(),
): Promise<Array<{ id: string; sql: string }>> {
  const migrationsDir = path.resolve(baseDir, "aria/migrations");
  const ids = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    ids.map(async (id) => ({
      id,
      sql: await fs.readFile(path.join(migrationsDir, id), "utf-8"),
    })),
  );
}

/**
 * Applies the baseline schema once per database. A database that
 * predates migration tracking must be reset/reprovisioned; recording a changed.
 */
export async function runPendingStorageMigrations(
  client: StorageMigrationClient,
  options: { baseDir?: string } = {},
): Promise<boolean> {
  await client.executeMultiple(ENSURE_MIGRATIONS_TABLE_SQL);
  const migrations = await readMigrationFiles(options.baseDir);
  let appliedAny = false;

  if (
    !(await hasMigrationRecord(client, BASELINE_MIGRATION_ID)) &&
    (await hasLegacyBaselineSchema(client))
  ) {
    throw new Error(
      "Phase 34 baseline schema is stale. Reset/reprovision this pre-release database from 0001_baseline_schema.sql; runtime repair is intentionally unavailable.",
    );
  }

  for (const migration of migrations) {
    if (await hasMigrationRecord(client, migration.id)) continue;
    await client.executeMultiple(migration.sql);
    await recordMigration(client, migration.id);
    appliedAny = true;
  }

  const verification = await verifyLocalizationSchema({
    async execute(sql, args = []) {
      const result = await client.execute(sql, [...args]);
      return { rows: result.rows as ReadonlyArray<Record<string, unknown>> };
    },
  });
  if (!verification.ok) {
    throw new Error(formatLocalizationSchemaVerificationFailure(verification));
  }

  return appliedAny;
}
