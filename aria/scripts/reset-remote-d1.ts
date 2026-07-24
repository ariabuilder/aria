#!/usr/bin/env -S npx tsx
/**
 * Destructively reset the configured remote D1 database in
 * place. The database resource and binding stay unchanged.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWranglerConfigPath } from "../lib/storage/wrangler-config";

type RemoteResetOptions = {
  binding: string;
  confirm?: string;
  dryRun: boolean;
  help: boolean;
};

// Pin the active root config so a private wrangler.toml (real IDs) wins over
// the committed wrangler.jsonc (placeholder IDs).
const WRANGLER_CONFIG_ARGS = (() => {
  const configPath = resolveWranglerConfigPath();
  return configPath ? ["--config", configPath] : [];
})();

export type D1DatabaseInfo = {
  id: string;
  name: string;
};

export type D1SchemaObject = {
  name: string;
  type: "table" | "view";
};

type JsonRecord = Record<string, unknown>;

const SCHEMA_QUERY = `
  SELECT type, name
  FROM sqlite_schema
  WHERE type IN ('table', 'view')
    AND name NOT GLOB 'sqlite_*'
    AND name NOT GLOB '_cf_*'
  ORDER BY CASE type WHEN 'view' THEN 0 ELSE 1 END, name
`;

const VERIFY_QUERY = `
  SELECT COUNT(*) AS user_count FROM aria_users;
  SELECT COUNT(*) AS migration_count FROM d1_migrations;
`;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFlagValue(argument: string, flag: string): string | undefined {
  const prefix = `${flag}=`;
  return argument.startsWith(prefix)
    ? argument.slice(prefix.length).trim()
    : undefined;
}

export function parseRemoteResetArgs(
  argv: readonly string[],
  defaultBinding = "aria_db",
): RemoteResetOptions {
  let binding = defaultBinding;
  let confirm: string | undefined;
  let dryRun = false;
  let help = false;

  for (const argument of argv) {
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    const bindingValue = stringFlagValue(argument, "--binding");
    if (bindingValue !== undefined) {
      if (!bindingValue) {
        throw new Error("--binding requires a non-empty value");
      }
      binding = bindingValue;
      continue;
    }

    const confirmationValue = stringFlagValue(argument, "--confirm");
    if (confirmationValue !== undefined) {
      if (!confirmationValue) {
        throw new Error("--confirm requires the exact remote database name");
      }
      confirm = confirmationValue;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return { binding, confirm, dryRun, help };
}

export function parseD1DatabaseInfo(json: string): D1DatabaseInfo {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) {
    throw new Error("Wrangler returned invalid D1 database metadata");
  }

  const id = typeof parsed.uuid === "string" ? parsed.uuid.trim() : "";
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!id || !name) {
    throw new Error("Wrangler D1 metadata is missing the database name or id");
  }

  return { id, name };
}

export function assertRemoteResetConfirmed(
  confirmation: string | undefined,
  database: D1DatabaseInfo,
): void {
  if (confirmation === database.name) {
    return;
  }

  throw new Error(
    `Refusing to reset remote D1 "${database.name}" (${database.id}). ` +
      `Re-run with --confirm=${database.name}`,
  );
}

export function parseWranglerRows(json: string): JsonRecord[][] {
  const parsed: unknown = JSON.parse(json);
  const batches = Array.isArray(parsed) ? parsed : [parsed];

  if (batches.length === 0) {
    throw new Error("Wrangler returned no D1 result batches");
  }

  return batches.map((batch) => {
    if (
      !isRecord(batch) ||
      batch.success !== true ||
      !Array.isArray(batch.results)
    ) {
      throw new Error("Wrangler returned an unsuccessful or invalid D1 result");
    }
    if (!batch.results.every(isRecord)) {
      throw new Error("Wrangler returned invalid D1 result rows");
    }
    return batch.results as JsonRecord[];
  });
}

export function parseD1SchemaObjects(json: string): D1SchemaObject[] {
  const rows = parseWranglerRows(json).flat();
  const objects: D1SchemaObject[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name : "";
    const type = row.type;
    if (!name || (type !== "table" && type !== "view")) {
      throw new Error("D1 schema query returned an invalid object");
    }
    if (name.startsWith("sqlite_") || name.startsWith("_cf_")) {
      continue;
    }

    const key = `${type}:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      objects.push({ name, type });
    }
  }

  return objects;
}

export function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function buildRemoteD1ResetSql(
  schemaObjects: readonly D1SchemaObject[],
): string {
  const views = schemaObjects
    .filter((object) => object.type === "view")
    .sort((left, right) => left.name.localeCompare(right.name));
  const tables = schemaObjects
    .filter((object) => object.type === "table")
    .sort((left, right) => left.name.localeCompare(right.name));

  return [
    // D1 applies PRAGMA settings to the current transaction. Fully disabling
    // FK enforcement is required here: deferring checks still makes SQLite
    // resolve a child's parent schema while DROP TABLE runs, which fails if an
    // earlier statement already removed that parent.
    "PRAGMA foreign_keys = off;",
    ...views.map(
      (view) => `DROP VIEW IF EXISTS ${quoteSqlIdentifier(view.name)};`,
    ),
    ...tables.map(
      (table) => `DROP TABLE IF EXISTS ${quoteSqlIdentifier(table.name)};`,
    ),
    "PRAGMA foreign_keys = on;",
    "",
  ].join("\n");
}

export function parseResetVerification(json: string): {
  migrationCount: number;
  userCount: number;
} {
  const batches = parseWranglerRows(json);
  const userCount = Number(batches[0]?.[0]?.user_count);
  const migrationCount = Number(batches[1]?.[0]?.migration_count);

  if (!Number.isInteger(userCount) || !Number.isInteger(migrationCount)) {
    throw new Error("Remote D1 reset verification returned invalid counts");
  }
  if (userCount !== 0) {
    throw new Error(`Remote D1 reset left ${userCount} user(s) behind`);
  }
  if (migrationCount < 1) {
    throw new Error("Remote D1 reset did not reapply the canonical migration");
  }

  return { userCount, migrationCount };
}

function runWranglerJson(args: readonly string[]): string {
  return execFileSync("npx", ["wrangler", ...args, ...WRANGLER_CONFIG_ARGS], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function run(
  command: string,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): void {
  execFileSync(command, [...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv, CI: "true" },
    stdio: "inherit",
  });
}

function backupPath(databaseName: string): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const safeName = databaseName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return resolve(
    process.cwd(),
    "aria/storage/exports/d1-reset",
    `${safeName}-${timestamp}.sql`,
  );
}

function printUsage(): void {
  console.log(`Usage:
  npm run storage:reset-remote -- --dry-run
  npm run storage:reset-remote -- --confirm=<database-name>

Options:
  --binding=<binding>       D1 binding to reset (default: ARIA_D1_BINDING or aria_db)
  --confirm=<database-name> Required for reset; must exactly match Wrangler metadata
  --dry-run                 List the target and schema objects without changing data

This resets only the configured remote D1 database. KV, R2, Queues, and
Durable Object state are not modified.`);
}

async function main(): Promise<void> {
  const options = parseRemoteResetArgs(
    process.argv.slice(2),
    process.env.ARIA_D1_BINDING || "aria_db",
  );

  if (options.help) {
    printUsage();
    return;
  }

  const database = parseD1DatabaseInfo(
    runWranglerJson(["d1", "info", options.binding, "--json"]),
  );
  const schemaObjects = parseD1SchemaObjects(
    runWranglerJson([
      "d1",
      "execute",
      options.binding,
      "--remote",
      `--command=${SCHEMA_QUERY}`,
      "--json",
    ]),
  );

  console.log(`Remote D1 target: ${database.name} (${database.id})`);
  console.log(`Binding: ${options.binding}`);
  console.log(`Objects to remove: ${schemaObjects.length}`);
  for (const object of schemaObjects) {
    console.log(`  - ${object.type}: ${object.name}`);
  }

  if (options.dryRun) {
    console.log("\nDry run complete. No remote data was changed.");
    console.log(
      `Run again with --confirm=${database.name} to export, reset, and remigrate this D1 database.`,
    );
    return;
  }

  assertRemoteResetConfirmed(options.confirm, database);

  const outputPath = backupPath(database.name);
  mkdirSync(dirname(outputPath), { recursive: true });
  console.warn(`\nExporting mandatory recovery backup to ${outputPath}`);
  run("npx", [
    "wrangler",
    "d1",
    "export",
    options.binding,
    "--remote",
    `--output=${outputPath}`,
    "--skip-confirmation",
    ...WRANGLER_CONFIG_ARGS,
  ]);

  const tempDirectory = mkdtempSync(resolve(tmpdir(), "aria-d1-reset-"));
  const resetSqlPath = resolve(tempDirectory, "reset.sql");

  try {
    writeFileSync(resetSqlPath, buildRemoteD1ResetSql(schemaObjects), "utf8");
    console.warn(
      `\nResetting ${database.name}. Requests using this database may fail until migrations finish.`,
    );
    run("npx", [
      "wrangler",
      "d1",
      "execute",
      options.binding,
      "--remote",
      `--file=${resetSqlPath}`,
      "--yes",
      ...WRANGLER_CONFIG_ARGS,
    ]);

    run("npx", ["tsx", "aria/scripts/apply-d1-migrations.ts", "--remote"], {
      ARIA_D1_BINDING: options.binding,
    });
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  const verification = parseResetVerification(
    runWranglerJson([
      "d1",
      "execute",
      options.binding,
      "--remote",
      `--command=${VERIFY_QUERY}`,
      "--json",
    ]),
  );

  console.log(`\nRemote D1 reset complete: ${database.name}`);
  console.log(`Backup: ${outputPath}`);
  console.log(`Users: ${verification.userCount}`);
  console.log(`Applied migrations: ${verification.migrationCount}`);
  console.log("Open /admin/setup in a private window to test first launch.");
  console.log("KV, R2, Queues, and Durable Object state were not changed.");
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  main().catch((error) => {
    console.error("\nRemote D1 reset failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
