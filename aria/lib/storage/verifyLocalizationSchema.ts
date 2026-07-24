/**
 * Read-only verification for the pre-release single-baseline schema. This intentionally detects a
 * stale already-recorded 0001 rather than attempting runtime DDL or schema healing.
 */

export type SchemaVerificationClient = {
  execute(
    sql: string,
    args?: readonly unknown[],
  ): Promise<{ rows: ReadonlyArray<Record<string, unknown>> }>;
};

type RequiredTable = {
  name: string;
  columns: readonly string[];
  indexes: readonly string[];
  foreignKeyTargets?: readonly string[];
};

const REQUIRED_TABLES: readonly RequiredTable[] = [
  {
    name: "aria_page_locale_versions",
    columns: [
      "page_id",
      "locale",
      "version",
      "source_version",
      "seo_json",
      "dsl_json",
      "translated_paths_json",
      "source_manifest_hash",
      "source_structure_hash",
      "fallback_layout_version",
    ],
    indexes: [
      "idx_aria_page_locale_versions_history",
      "idx_aria_page_locale_versions_source",
    ],
    foreignKeyTargets: [
      "aria_page_meta",
      "aria_page_versions",
      "aria_layout_versions",
    ],
  },
  {
    name: "aria_page_locale_meta",
    columns: [
      "page_id",
      "locale",
      "draft_version",
      "published_version",
      "current_version",
    ],
    indexes: ["idx_aria_page_locale_meta_page_updated"],
    foreignKeyTargets: ["aria_page_meta", "aria_page_locale_versions"],
  },
  {
    name: "aria_page_locale_routes",
    columns: [
      "locale",
      "pathname_key",
      "pathname",
      "page_id",
      "draft_claim",
      "published_claim",
    ],
    indexes: [
      "idx_aria_page_locale_routes_draft_owner",
      "idx_aria_page_locale_routes_published_owner",
    ],
    foreignKeyTargets: ["aria_page_locale_meta"],
  },
  {
    name: "aria_locale_route_leases",
    columns: ["locale", "lease_token", "expires_at", "updated_at"],
    indexes: ["idx_aria_locale_route_leases_expires"],
  },
  {
    name: "aria_layout_locale_versions",
    columns: [
      "layout_id",
      "locale",
      "version",
      "source_version",
      "dsl_json",
      "translated_paths_json",
      "source_manifest_hash",
      "source_structure_hash",
    ],
    indexes: [
      "idx_aria_layout_locale_versions_history",
      "idx_aria_layout_locale_versions_source",
    ],
    foreignKeyTargets: ["aria_layout_meta", "aria_layout_versions"],
  },
  {
    name: "aria_layout_locale_meta",
    columns: [
      "layout_id",
      "locale",
      "draft_version",
      "published_version",
      "current_version",
    ],
    indexes: ["idx_aria_layout_locale_meta_layout_updated"],
    foreignKeyTargets: ["aria_layout_meta", "aria_layout_locale_versions"],
  },
  {
    name: "aria_cache_invalidation_jobs",
    columns: [
      "id",
      "idempotency_key",
      "scope",
      "payload_json",
      "status",
      "next_attempt_at",
    ],
    indexes: ["idx_aria_cache_invalidation_jobs_due"],
  },
  {
    name: "aria_media_profiles",
    columns: [
      "asset_path",
      "current_source_version",
      "alt_text",
      "focal_point_json",
      "created_at",
      "updated_at",
    ],
    indexes: [],
  },
  {
    name: "aria_media_source_versions",
    columns: [
      "asset_path",
      "version",
      "object_key",
      "checksum_sha256",
      "mime_type",
      "size_bytes",
      "width",
      "height",
      "created_at",
    ],
    indexes: ["idx_aria_media_source_versions_asset"],
  },
  {
    name: "aria_media_transform_variants",
    columns: [
      "id",
      "asset_path",
      "name",
      "source_version",
      "crop_json",
      "focal_point_json",
      "aspect_ratio_json",
      "output_json",
      "created_at",
      "updated_at",
    ],
    indexes: ["idx_aria_media_transform_variants_asset"],
  },
];

export type LocalizationSchemaVerification = {
  ok: boolean;
  missingTables: string[];
  missingColumns: string[];
  missingIndexes: string[];
  missingForeignKeys: string[];
};

function sqliteIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
    throw new Error(`Unsafe schema identifier: ${name}`);
  }
  return name;
}

/** Runs read-only sqlite_master/PRAGMA checks against SQLite or D1. */
export async function verifyLocalizationSchema(
  client: SchemaVerificationClient,
): Promise<LocalizationSchemaVerification> {
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingIndexes: string[] = [];
  const missingForeignKeys: string[] = [];

  for (const table of REQUIRED_TABLES) {
    const tableName = sqliteIdentifier(table.name);
    const existing = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      [tableName],
    );
    if (existing.rows.length === 0) {
      missingTables.push(tableName);
      continue;
    }

    const columns = await client.execute(`PRAGMA table_info(${tableName})`);
    const presentColumns = new Set(
      columns.rows.map((row) => String(row.name ?? "")),
    );
    for (const column of table.columns) {
      if (!presentColumns.has(column)) {
        missingColumns.push(`${tableName}.${column}`);
      }
    }

    const indexes = await client.execute(`PRAGMA index_list(${tableName})`);
    const presentIndexes = new Set(
      indexes.rows.map((row) => String(row.name ?? "")),
    );
    for (const index of table.indexes) {
      if (!presentIndexes.has(index)) {
        missingIndexes.push(`${tableName}.${index}`);
      }
    }

    if (table.foreignKeyTargets && table.foreignKeyTargets.length > 0) {
      const foreignKeys = await client.execute(
        `PRAGMA foreign_key_list(${tableName})`,
      );
      const presentTargets = new Set(
        foreignKeys.rows.map((row) => String(row.table ?? "")),
      );
      for (const target of table.foreignKeyTargets) {
        if (!presentTargets.has(target)) {
          missingForeignKeys.push(`${tableName}->${target}`);
        }
      }
    }
  }

  return {
    ok:
      missingTables.length === 0 &&
      missingColumns.length === 0 &&
      missingIndexes.length === 0 &&
      missingForeignKeys.length === 0,
    missingTables,
    missingColumns,
    missingIndexes,
    missingForeignKeys,
  };
}

export function formatLocalizationSchemaVerificationFailure(
  result: LocalizationSchemaVerification,
): string {
  const details = [
    ...result.missingTables.map((value) => `table ${value}`),
    ...result.missingColumns.map((value) => `column ${value}`),
    ...result.missingIndexes.map((value) => `index ${value}`),
    ...result.missingForeignKeys.map((value) => `foreign key ${value}`),
  ];
  return [
    "Pre-release baseline schema is stale.",
    details.length > 0 ? `Missing: ${details.join(", ")}.` : "",
    "Reset/reprovision this pre-release database from 0001_baseline_schema.sql; runtime repair is intentionally unavailable.",
  ]
    .filter(Boolean)
    .join(" ");
}
