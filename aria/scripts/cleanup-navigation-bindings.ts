#!/usr/bin/env node
/**
 * One-off: remove orphaned CMS bindings from navigation nodes in aria.db.
 *
 * Usage: npx tsx aria/scripts/cleanup-navigation-bindings.ts
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cleanupOrphanedNavigationBindingsInPage } from "../lib/cms/navigationBindingCleanup";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../storage/aria.db");

if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(0);
}

function sqlite(query: string): string {
  return execSync(`sqlite3 ${JSON.stringify(dbPath)} ${JSON.stringify(query)}`, {
    encoding: "utf8",
  }).trim();
}

const pageRows = sqlite(
  "SELECT id || '|' || current_version FROM aria_page_meta;",
)
  .split("\n")
  .filter(Boolean);

let updated = 0;

for (const row of pageRows) {
  const [id, version] = row.split("|");
  if (!id || !version) continue;

  const dslJson = sqlite(
    `SELECT dsl_json FROM aria_page_versions WHERE id='${id}' AND version='${version}';`,
  );
  if (!dslJson) continue;

  const dsl = JSON.parse(dslJson);
  const result = cleanupOrphanedNavigationBindingsInPage(dsl);
  if (result.cleanedNavigationNodeCount === 0) {
    continue;
  }

  const nextVersion = String(Date.now());
  const nextDsl = {
    ...result.page,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };

  const escaped = JSON.stringify(nextDsl).replace(/'/g, "''");
  const title = String(nextDsl.title ?? id).replace(/'/g, "''");

  sqlite(
    `INSERT INTO aria_page_versions (id, version, title, status, dsl_json, content_hash, created_at) VALUES ('${id}', '${nextVersion}', '${title}', 'draft', '${escaped}', NULL, '${nextDsl.updatedAt}');`,
  );
  sqlite(
    `UPDATE aria_page_meta SET current_version='${nextVersion}', updated_at='${nextDsl.updatedAt}' WHERE id='${id}';`,
  );

  const dslFile = join(__dirname, `../storage/dsl/pages/${id}.json`);
  if (existsSync(dslFile)) {
    writeFileSync(dslFile, `${JSON.stringify(nextDsl, null, 2)}\n`);
  }

  console.log(
    `Updated page ${nextDsl.slug ?? id} (cleaned ${result.cleanedNavigationNodeCount} navigation node(s))`,
  );
  updated += 1;
}

console.log(`Done. ${updated} page(s) updated.`);
