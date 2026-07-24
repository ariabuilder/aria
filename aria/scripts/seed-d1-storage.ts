/**
 * Emit a canonical D1 seed SQL snapshot from local aria/storage/aria. db.
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

import {
  selectRetainedVersions,
} from "../lib/storage/versioning";
import { STARTER_LAYOUT_IDS } from "../lib/storage/starterLayoutIds";
import { loadStarterLayouts } from "../lib/storage/starterLayouts";
import { serializeDslForStorage } from "../lib/storage/helpers";

const DB_PATH = resolve(process.cwd(), "aria/storage/aria.db");
const MIGRATIONS_DIR = resolve(process.cwd(), "aria/migrations");
import { BASELINE_MIGRATION_ID } from "../lib/storage/runStorageMigrations";
const SeedExportConfigSchema = z
  .object({
    keepLatestVersions: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(1),
  })
  .strict();
const CLEAR_TABLES = [
  "aria_content_sync_items",
  "aria_content_sync_jobs",
  "aria_content_site_state",
  "aria_media_usage",
  "aria_media_sync_items",
  "aria_media_sync_jobs",
  "aria_media_locations",
  "aria_media_assets",
  "aria_component_versions",
  "aria_component_meta",
  "aria_layout_versions",
  "aria_layout_meta",
  "aria_page_versions",
  "aria_page_meta",
  "aria_styles",
  "aria_site_settings",
  "aria_order",
  "aria_snapshots",
  "aria_page_metadata",
  "aria_resource_touches",
] as const;
const TABLES = [
  {
    name: "aria_page_versions",
    columns: [
      "id",
      "version",
      "slug",
      "title",
      "status",
      "dsl_json",
      "content_hash",
      "created_at",
    ],
  },
  {
    name: "aria_page_meta",
    columns: [
      "id",
      "slug",
      "title",
      "status",
      "parent",
      "draft_version",
      "published_version",
      "layout",
      "current_version",
      "updated_at",
    ],
  },
  {
    name: "aria_layout_versions",
    columns: [
      "id",
      "version",
      "name",
      "status",
      "dsl_json",
      "content_hash",
      "created_at",
    ],
  },
  {
    name: "aria_layout_meta",
    columns: [
      "id",
      "name",
      "description",
      "status",
      "current_version",
      "updated_at",
    ],
  },
  {
    name: "aria_component_versions",
    columns: [
      "id",
      "version",
      "name",
      "category",
      "dsl_json",
      "content_hash",
      "created_at",
    ],
  },
  {
    name: "aria_component_meta",
    columns: [
      "id",
      "name",
      "description",
      "category",
      "source",
      "tier",
      "is_locked",
      "pack_id",
      "current_version",
      "updated_at",
    ],
  },
  {
    name: "aria_styles",
    columns: ["id", "styles_json", "updated_at"],
  },
  {
    name: "aria_site_settings",
    columns: ["id", "settings_json", "updated_at"],
  },
  {
    name: "aria_order",
    columns: ["kind", "order_json", "updated_at"],
  },
  {
    name: "aria_snapshots",
    columns: ["slug", "stage", "html", "updated_at"],
  },
  {
    name: "aria_page_metadata",
    columns: ["slug", "metadata_json", "updated_at"],
  },
  {
    name: "aria_resource_touches",
    columns: ["resource_name", "touched_at"],
  },
  {
    name: "aria_content_site_state",
    columns: [
      "scope",
      "current_revision_id",
      "revision_seq",
      "content_digest",
      "updated_at",
      "updated_by",
      "last_mutation_kind",
      "last_mutation_target",
      "schema_version",
    ],
  },
  {
    name: "aria_content_sync_jobs",
    columns: [
      "id",
      "direction",
      "mode",
      "status",
      "source_endpoint_id",
      "target_endpoint_id",
      "conflict_policy",
      "local_revision_id",
      "remote_revision_id",
      "result_local_revision_id",
      "result_remote_revision_id",
      "summary_json",
      "created_by",
      "created_at",
      "started_at",
      "finished_at",
      "plan_job_id",
      "idempotency_key",
      "notes",
    ],
  },
  {
    name: "aria_content_sync_items",
    columns: [
      "id",
      "job_id",
      "resource_type",
      "resource_id",
      "resource_label",
      "action",
      "local_version",
      "remote_version",
      "local_checksum",
      "remote_checksum",
      "result_status",
      "conflict_reason",
      "error_message",
      "created_at",
    ],
  },
  {
    name: "aria_media_assets",
    columns: [
      "id",
      "logical_path",
      "filename",
      "extension",
      "mime_type",
      "size_bytes",
      "width",
      "height",
      "checksum_sha256",
      "status",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    name: "aria_media_locations",
    columns: [
      "id",
      "media_id",
      "endpoint_id",
      "object_key",
      "public_url",
      "etag",
      "version_id",
      "size_bytes",
      "checksum_sha256",
      "exists_remote",
      "last_verified_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "aria_media_sync_jobs",
    columns: [
      "id",
      "direction",
      "source_endpoint_id",
      "target_endpoint_id",
      "mode",
      "conflict_policy",
      "status",
      "summary_json",
      "started_at",
      "finished_at",
      "created_by",
      "created_at",
      "plan_job_id",
      "idempotency_key",
    ],
  },
  {
    name: "aria_media_sync_items",
    columns: [
      "id",
      "job_id",
      "media_id",
      "logical_path",
      "action",
      "reason",
      "source_checksum",
      "target_checksum",
      "source_etag",
      "target_etag",
      "result_status",
      "error_message",
      "created_at",
    ],
  },
  {
    name: "aria_media_usage",
    columns: [
      "id",
      "media_id",
      "logical_path",
      "kind",
      "ref_id",
      "ref_path",
      "updated_at",
    ],
  },
] as const;

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function getSnapshotNormalizedKey(row: Record<string, unknown>): {
  slug: string;
  stage: "draft" | "published";
} {
  const rawSlug = String(row.slug ?? "").trim();
  if (rawSlug.startsWith("draft:")) {
    return { slug: rawSlug.slice("draft:".length), stage: "draft" };
  }

  if (rawSlug.startsWith("published:")) {
    return { slug: rawSlug.slice("published:".length), stage: "published" };
  }

  return {
    slug: rawSlug,
    stage: row.stage === "draft" ? "draft" : "published",
  };
}

function getSnapshotTimestamp(value: unknown): number {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeSnapshotRows(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const normalizedRows = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const normalizedKey = getSnapshotNormalizedKey(row);
    const key = `${normalizedKey.slug}\u0000${normalizedKey.stage}`;
    const normalizedRow: Record<string, unknown> = {
      slug: normalizedKey.slug,
      stage: normalizedKey.stage,
      html: row.html,
      updated_at: row.updated_at,
    };
    const existing = normalizedRows.get(key);

    if (
      !existing ||
      getSnapshotTimestamp(normalizedRow.updated_at) >=
        getSnapshotTimestamp(existing.updated_at)
    ) {
      normalizedRows.set(key, normalizedRow);
    }
  }

  return [...normalizedRows.values()];
}

async function applyMigrations(client: ReturnType<typeof createClient>) {
  const sql = readFileSync(resolve(MIGRATIONS_DIR, BASELINE_MIGRATION_ID), "utf-8");
  await client.executeMultiple(sql);
}

async function hasColumn(
  client: ReturnType<typeof createClient>,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${tableName})`);
  return result.rows.some((row) => String(row.name) === columnName);
}

async function ensurePageMetaRevisionPointers(
  client: ReturnType<typeof createClient>,
) {
  if (!(await hasColumn(client, "aria_page_meta", "draft_version"))) {
    await client.execute(
      `ALTER TABLE aria_page_meta ADD COLUMN draft_version TEXT`,
    );
  }

  if (!(await hasColumn(client, "aria_page_meta", "published_version"))) {
    await client.execute(
      `ALTER TABLE aria_page_meta ADD COLUMN published_version TEXT`,
    );
  }

  if (!(await hasColumn(client, "aria_page_meta", "parent"))) {
    await client.execute(`ALTER TABLE aria_page_meta ADD COLUMN parent TEXT`);
  }

  await client.execute(`
    UPDATE aria_page_meta
    SET draft_version = COALESCE(draft_version, current_version)
    WHERE draft_version IS NULL OR TRIM(draft_version) = ''
  `);

  await client.execute(`
    UPDATE aria_page_meta
    SET published_version = CASE
      WHEN status = 'published' THEN COALESCE(published_version, current_version)
      ELSE published_version
    END
    WHERE published_version IS NULL OR TRIM(published_version) = ''
  `);
}

async function ensureVersionHashColumns(
  client: ReturnType<typeof createClient>,
) {
  const versionTables = [
    "aria_page_versions",
    "aria_layout_versions",
    "aria_component_versions",
  ] as const;

  for (const tableName of versionTables) {
    if (!(await hasColumn(client, tableName, "content_hash"))) {
      await client.execute(
        `ALTER TABLE ${tableName} ADD COLUMN content_hash TEXT`,
      );
    }

    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_id_content_hash
      ON ${tableName}(id, content_hash)
    `);
  }
}

function createVersionRowKey(id: unknown, version: unknown): string {
  return `${String(id)}\u0000${String(version)}`;
}

function filterVersionRows(input: {
  rows: Array<Record<string, unknown>>;
  keepLatestVersions: number;
  pinnedVersionsById: Map<string, string[]>;
}): Array<Record<string, unknown>> {
  const rowsById = new Map<string, Array<Record<string, unknown>>>();

  for (const row of input.rows) {
    const id = String(row.id ?? "");
    const existing = rowsById.get(id);
    if (existing) {
      existing.push(row);
      continue;
    }

    rowsById.set(id, [row]);
  }

  const retainedRowKeys = new Set<string>();

  for (const [id, rows] of rowsById) {
    const selection = selectRetainedVersions({
      versions: rows.map((row) => ({
        version: String(row.version ?? ""),
        createdAt: String(row.created_at ?? ""),
      })),
      policy: {
        keepLatest: input.keepLatestVersions,
        pinnedVersions: input.pinnedVersionsById.get(id) ?? [],
      },
    });

    for (const version of selection.keepVersions) {
      retainedRowKeys.add(createVersionRowKey(id, version));
    }
  }

  return input.rows.filter((row) =>
    retainedRowKeys.has(createVersionRowKey(row.id, row.version)),
  );
}

async function ensureStarterLayouts(client: ReturnType<typeof createClient>) {
  const placeholders = STARTER_LAYOUT_IDS.map(() => "?").join(", ");
  const existing = await client.execute({
    sql: `SELECT id FROM aria_layout_meta WHERE id IN (${placeholders})`,
    args: [...STARTER_LAYOUT_IDS],
  });
  const existingIds = new Set(existing.rows.map((row) => String(row.id)));

  const starterLayouts = await loadStarterLayouts();

  for (const layout of starterLayouts) {
    if (existingIds.has(layout.id)) {
      continue;
    }

    await client.execute({
      sql: `INSERT OR IGNORE INTO aria_layout_versions (id, version, name, status, dsl_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        layout.id,
        layout.version,
        layout.name,
        "published",
        serializeDslForStorage(layout.dsl),
        layout.updatedAt,
      ],
    });

    await client.execute({
      sql: `INSERT OR IGNORE INTO aria_layout_meta (id, name, description, status, current_version, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        layout.id,
        layout.name,
        layout.description,
        "published",
        layout.version,
        layout.updatedAt,
      ],
    });
  }
}

async function buildSeedSql(): Promise<string> {
  const client = createClient({ url: `file:${DB_PATH}` });

  try {
    const config = SeedExportConfigSchema.parse({
      keepLatestVersions: process.env.ARIA_STORAGE_KEEP_LATEST_VERSIONS,
    });
    await applyMigrations(client);
    await ensurePageMetaRevisionPointers(client);
    await ensureVersionHashColumns(client);
    await ensureStarterLayouts(client);

    const [pageMetaRows, layoutMetaRows, componentMetaRows] = await Promise.all(
      [
        client.execute(
          `SELECT id, draft_version, published_version, current_version FROM aria_page_meta`,
        ),
        client.execute(`SELECT id, current_version FROM aria_layout_meta`),
        client.execute(`SELECT id, current_version FROM aria_component_meta`),
      ],
    );
    const pagePinnedVersionsById = new Map<string, string[]>();
    const layoutPinnedVersionsById = new Map<string, string[]>();
    const componentPinnedVersionsById = new Map<string, string[]>();

    for (const row of pageMetaRows.rows as Array<Record<string, unknown>>) {
      const pinned = [
        row.draft_version,
        row.published_version,
        row.current_version,
      ]
        .filter((value): value is unknown => value != null)
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
      pagePinnedVersionsById.set(String(row.id), pinned);
    }

    for (const row of layoutMetaRows.rows as Array<Record<string, unknown>>) {
      const currentVersion = String(row.current_version ?? "").trim();
      layoutPinnedVersionsById.set(
        String(row.id),
        currentVersion ? [currentVersion] : [],
      );
    }

    for (const row of componentMetaRows.rows as Array<
      Record<string, unknown>
    >) {
      const currentVersion = String(row.current_version ?? "").trim();
      componentPinnedVersionsById.set(
        String(row.id),
        currentVersion ? [currentVersion] : [],
      );
    }

    let sql = `-- Canonical Aria storage seed\n-- Generated: ${new Date().toISOString()}\n-- Source: ${DB_PATH}\n\nPRAGMA foreign_keys = OFF;\n\n`;

    for (const tableName of CLEAR_TABLES) {
      sql += `DELETE FROM ${tableName};\n`;
    }

    sql += "\n";

    for (const table of TABLES) {
      const result = await client.execute(
        `SELECT ${table.columns.join(", ")} FROM ${table.name}`,
      );
      let rows =
        table.name === "aria_snapshots"
          ? normalizeSnapshotRows(result.rows as Array<Record<string, unknown>>)
          : result.rows;

      if (table.name === "aria_page_versions") {
        rows = filterVersionRows({
          rows: rows as Array<Record<string, unknown>>,
          keepLatestVersions: config.keepLatestVersions,
          pinnedVersionsById: pagePinnedVersionsById,
        });
      }

      if (table.name === "aria_layout_versions") {
        rows = filterVersionRows({
          rows: rows as Array<Record<string, unknown>>,
          keepLatestVersions: config.keepLatestVersions,
          pinnedVersionsById: layoutPinnedVersionsById,
        });
      }

      if (table.name === "aria_component_versions") {
        rows = filterVersionRows({
          rows: rows as Array<Record<string, unknown>>,
          keepLatestVersions: config.keepLatestVersions,
          pinnedVersionsById: componentPinnedVersionsById,
        });
      }

      for (const row of rows) {
        const values = table.columns.map((column) => sqlLiteral(row[column]));
        sql += `INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES (${values.join(", ")});\n`;
      }

      sql += "\n";
    }

    sql += "PRAGMA foreign_keys = ON;\n";
    return sql;
  } finally {
    client.close();
  }
}

const sql = await buildSeedSql();
console.log(sql);
