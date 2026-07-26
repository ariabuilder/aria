#!/usr/bin/env node
/**
 * One-off: add header/footer defaultContent to legacy layout DSL in aria.db.
 */

import { createClient } from "@libsql/client";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../storage/aria.db");

if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(0);
}

const HEADER_CONTENT = [
  {
    id: "header-08a9c2a4",
    type: "Component",
    props: { componentId: "header-01" },
    customClasses: [],
    styles: {},
    children: [],
    slot: "header",
    reference: { type: "instance", masterId: "header-01" },
  },
];

const FOOTER_CONTENT = [
  {
    id: "footer-bp48lslf",
    type: "Component",
    props: { componentId: "footer" },
    customClasses: [],
    styles: {},
    children: [],
    slot: "footer",
    reference: { type: "instance", masterId: "footer" },
  },
];

function withSlotDefaults(slots) {
  return slots.map((slot) => {
    if (slot.name === "header" && !slot.defaultContent?.length) {
      return { ...slot, defaultContent: HEADER_CONTENT };
    }
    if (slot.name === "footer" && !slot.defaultContent?.length) {
      return { ...slot, defaultContent: FOOTER_CONTENT };
    }
    return slot;
  });
}

const database = createClient({ url: `file:${dbPath}` });
let updated = 0;

try {
  const layoutRows = await database.execute(
    "SELECT id, current_version FROM aria_layout_meta",
  );
  for (const row of layoutRows.rows) {
    const id = typeof row.id === "string" ? row.id : "";
    const version =
      typeof row.current_version === "string" ? row.current_version : "";
    if (!id || !version) continue;
    const versionRows = await database.execute({
      sql: "SELECT dsl_json FROM aria_layout_versions WHERE id = ? AND version = ?",
      args: [id, version],
    });
    const dslJson = versionRows.rows[0]?.dsl_json;
    if (typeof dslJson !== "string" || !dslJson) continue;

    const dsl = JSON.parse(dslJson);
    if (!Array.isArray(dsl.slots)) continue;

    const nextSlots = withSlotDefaults(dsl.slots);
    if (JSON.stringify(nextSlots) === JSON.stringify(dsl.slots)) {
      console.log(`Skip ${id} (already has slot defaultContent)`);
      continue;
    }

    const nextVersion = String(Date.now());
    const nextDsl = {
      ...dsl,
      slots: nextSlots,
      regions: {
        ...(dsl.regions ?? {}),
        headerComponent: "header-01",
        footerComponent: "footer",
      },
      metadata: {
        ...(dsl.metadata ?? {}),
        regions: {
          headerComponent: "header-01",
          footerComponent: "footer",
        },
      },
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    await database.batch([
      {
        sql: "INSERT INTO aria_layout_versions (id, version, name, status, dsl_json, content_hash, created_at) VALUES (?, ?, ?, 'published', ?, NULL, ?)",
        args: [
          id,
          nextVersion,
          String(nextDsl.name ?? id),
          JSON.stringify(nextDsl),
          nextDsl.updatedAt,
        ],
      },
      {
        sql: "UPDATE aria_layout_meta SET current_version = ?, updated_at = ? WHERE id = ?",
        args: [nextVersion, nextDsl.updatedAt, id],
      },
    ]);

    const dslFile = join(__dirname, `../storage/dsl/layouts/${id}.json`);
    if (existsSync(dslFile)) {
      writeFileSync(dslFile, `${JSON.stringify(nextDsl, null, 2)}\n`);
    }

    console.log(`Updated layout ${id} → ${nextVersion}`);
    updated += 1;
  }
} finally {
  database.close();
}

console.log(`Done. ${updated} layout(s) updated.`);
