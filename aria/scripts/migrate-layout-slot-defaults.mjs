#!/usr/bin/env node
/**
 * One-off: add header/footer defaultContent to legacy layout DSL in aria.db.
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../storage/aria.db");

if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(0);
}

function sqlite(query) {
  return execSync(`sqlite3 ${JSON.stringify(dbPath)} ${JSON.stringify(query)}`, {
    encoding: "utf8",
  }).trim();
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

const layoutRows = sqlite(
  "SELECT id || '|' || current_version FROM aria_layout_meta;",
)
  .split("\n")
  .filter(Boolean);

let updated = 0;

for (const row of layoutRows) {
  const [id, version] = row.split("|");
  const dslJson = sqlite(
    `SELECT dsl_json FROM aria_layout_versions WHERE id='${id}' AND version='${version}';`,
  );
  if (!dslJson) continue;

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

  const escaped = JSON.stringify(nextDsl).replace(/'/g, "''");
  const name = (nextDsl.name ?? id).replace(/'/g, "''");

  sqlite(
    `INSERT INTO aria_layout_versions (id, version, name, status, dsl_json, content_hash, created_at) VALUES ('${id}', '${nextVersion}', '${name}', 'published', '${escaped}', NULL, '${nextDsl.updatedAt}');`,
  );
  sqlite(
    `UPDATE aria_layout_meta SET current_version='${nextVersion}', updated_at='${nextDsl.updatedAt}' WHERE id='${id}';`,
  );

  const dslFile = join(__dirname, `../storage/dsl/layouts/${id}.json`);
  if (existsSync(dslFile)) {
    writeFileSync(dslFile, `${JSON.stringify(nextDsl, null, 2)}\n`);
  }

  console.log(`Updated layout ${id} → ${nextVersion}`);
  updated += 1;
}

console.log(`Done. ${updated} layout(s) updated.`);
