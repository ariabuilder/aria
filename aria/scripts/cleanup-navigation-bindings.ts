#!/usr/bin/env node
/**
 * One-off: remove orphaned CMS bindings from navigation nodes in aria.db.
 *
 * Usage: node --import tsx aria/scripts/cleanup-navigation-bindings.ts
 */

import { createClient } from "@libsql/client";
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

const database = createClient({ url: `file:${dbPath}` });
let updated = 0;

try {
  const pageRows = await database.execute(
    "SELECT id, current_version FROM aria_page_meta",
  );
  for (const row of pageRows.rows) {
    const id = typeof row.id === "string" ? row.id : "";
    const version =
      typeof row.current_version === "string" ? row.current_version : "";
    if (!id || !version) continue;

    const versionRows = await database.execute({
      sql: "SELECT dsl_json FROM aria_page_versions WHERE id = ? AND version = ?",
      args: [id, version],
    });
    const storedDsl = versionRows.rows[0]?.dsl_json;
    if (typeof storedDsl !== "string" || !storedDsl) continue;

    const dsl = JSON.parse(storedDsl);
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
    await database.batch([
      {
        sql: "INSERT INTO aria_page_versions (id, version, title, status, dsl_json, content_hash, created_at) VALUES (?, ?, ?, 'draft', ?, NULL, ?)",
        args: [
          id,
          nextVersion,
          String(nextDsl.title ?? id),
          JSON.stringify(nextDsl),
          nextDsl.updatedAt,
        ],
      },
      {
        sql: "UPDATE aria_page_meta SET current_version = ?, updated_at = ? WHERE id = ?",
        args: [nextVersion, nextDsl.updatedAt, id],
      },
    ]);

    const dslFile = join(__dirname, `../storage/dsl/pages/${id}.json`);
    if (existsSync(dslFile)) {
      writeFileSync(dslFile, `${JSON.stringify(nextDsl, null, 2)}\n`);
    }

    console.log(
      `Updated page ${nextDsl.slug ?? id} (cleaned ${result.cleanedNavigationNodeCount} navigation node(s))`,
    );
    updated += 1;
  }
} finally {
  database.close();
}

console.log(`Done. ${updated} page(s) updated.`);
