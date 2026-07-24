#!/usr/bin/env -S npx tsx
/**
 * Incremental starter CMS entry seed for an existing remote D1 database.
 * Safe on installs that already have blog/authors/tags collections from bootstrap.
 */

import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

import { buildStarterCmsEntriesOnlySql } from "./bootstrap-remote-storage";
import { resolveWranglerConfigPath } from "../lib/storage/wrangler-config";

const GENERATED_SQL_DIR = resolve(process.cwd(), "aria/storage/generated");
const OUTPUT_SQL = resolve(GENERATED_SQL_DIR, "seed-starter-cms-entries.sql");

async function main(): Promise<void> {
  const databaseBinding = process.env.ARIA_D1_BINDING || "aria_db";
  mkdirSync(GENERATED_SQL_DIR, { recursive: true });
  const sql = await buildStarterCmsEntriesOnlySql();
  writeFileSync(OUTPUT_SQL, sql, "utf-8");

  console.log(`📝 Written to: ${OUTPUT_SQL}`);
  const configPath = resolveWranglerConfigPath();
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      databaseBinding,
      "--remote",
      `--file=${OUTPUT_SQL}`,
      ...(configPath ? ["--config", configPath] : []),
    ],
    { stdio: "inherit" },
  );
  console.log("✅ Starter CMS entries applied to remote D1");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
