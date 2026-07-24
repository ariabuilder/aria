import fs from "fs/promises";
import path from "path";

import {
  BASELINE_MIGRATION_ID,
  type StorageMigrationClient,
} from "../storage/runStorageMigrations";

const EMAIL_SECTION_START = "-- EMAIL";
const EMAIL_SECTION_END = "-- CMS:";

async function readEmailSchemaSql(baseDir = process.cwd()): Promise<string> {
  const migrationPath = path.resolve(
    baseDir,
    "aria/migrations",
    BASELINE_MIGRATION_ID,
  );
  const full = await fs.readFile(migrationPath, "utf-8");
  const start = full.indexOf(EMAIL_SECTION_START);
  const end = full.indexOf(EMAIL_SECTION_END, start);
  if (start === -1 || end === -1) {
    throw new Error("EMAIL section not found in baseline migration");
  }
  return full.slice(start, end).trim();
}

async function hasEmailSchema(client: StorageMigrationClient): Promise<boolean> {
  const result = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aria_email_connections' LIMIT 1`,
  );
  return result.rows.length > 0;
}

/**
 * Applies the EMAIL DDL block from the baseline migration when legacy databases
 * recorded the baseline without creating email tables.
 */
export async function ensureEmailSchema(
  client: StorageMigrationClient,
  options: { baseDir?: string } = {},
): Promise<boolean> {
  if (await hasEmailSchema(client)) {
    return false;
  }

  const sql = await readEmailSchemaSql(options.baseDir);
  await client.executeMultiple(sql);
  return true;
}

export function d1MigrationClient(database: D1Database): StorageMigrationClient {
  return {
    async executeMultiple(sql) {
      const statements = sql
        .split(/;\s*\n/)
        .map((statement) => statement.trim())
        .filter(
          (statement) =>
            statement.length > 0 &&
            !statement.split("\n").every((line) => line.trim().startsWith("--")),
        );

      for (const statement of statements) {
        await database.prepare(statement).run();
      }
    },
    async execute(sql, args = []) {
      const result = await database.prepare(sql).bind(...args).all();
      return { rows: result.results ?? [] };
    },
  };
}
