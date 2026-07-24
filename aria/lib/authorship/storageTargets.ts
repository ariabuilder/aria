/**
 * Canonical authorship storage targets per asset family.
 */

/** Actor snapshot columns added to every immutable version row. */
export const VERSION_AUTHORSHIP_COLUMNS = [
  "created_by_id",
  "created_by_username",
  "created_by_email",
  "created_by_avatar_url",
] as const;

export type VersionAuthorshipColumn =
  (typeof VERSION_AUTHORSHIP_COLUMNS)[number];

/** Versioned resources — meta holds pointers only; no actor columns on meta. */
export const VERSIONED_ASSET_META = {
  page: {
    table: "aria_page_meta",
    versionTable: "aria_page_versions",
    pointers: [
      "current_version",
      "draft_version",
      "published_version",
    ] as const,
  },
  layout: {
    table: "aria_layout_meta",
    versionTable: "aria_layout_versions",
    pointers: ["current_version"] as const,
  },
  component: {
    table: "aria_component_meta",
    versionTable: "aria_component_versions",
    pointers: ["current_version"] as const,
  },
} as const;

export type VersionedAssetKind = keyof typeof VERSIONED_ASSET_META;

/**
 * Singleton and asset-row families — actor columns on the row itself.
 * No immutable version chain to derive from in the first rollout.
 */
export const SINGLETON_AUTHORSHIP_TABLES = [
  "aria_styles",
  "aria_site_settings",
  "aria_page_metadata",
  "aria_media_assets",
] as const;

export type SingletonAuthorshipTable =
  (typeof SINGLETON_AUTHORSHIP_TABLES)[number];

/** Suggested actor columns for singleton / asset rows (create + update; media adds delete). */
export const ASSET_ROW_AUTHORSHIP_COLUMNS = [
  "created_by_id",
  "created_by_username",
  "created_by_email",
  "updated_by_id",
  "updated_by_username",
  "updated_by_email",
] as const;

export const MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS = [
  "deleted_by_id",
  "deleted_by_username",
  "deleted_by_email",
] as const;

/**
 * Operational tables — job/sync history only, not canonical asset authorship.
 */
export const NON_CANONICAL_AUTHORSHIP_TABLES = [
  "aria_media_sync_jobs",
  "aria_media_sync_items",
  "aria_content_site_state",
] as const;

/**
 * Explicit non-goal for asset authorship in the first cut.
 * Sync location rows may gain attribution later if product requires it.
 */
export const MEDIA_LOCATIONS_AUTHORSHIP_NOTE =
  "aria_media_locations has no endpoint-level actor fields in the first cut." as const;

export const AUTHORSHIP_STORAGE_TARGETS = {
  versionColumns: VERSION_AUTHORSHIP_COLUMNS,
  versionedAssets: VERSIONED_ASSET_META,
  singletonTables: SINGLETON_AUTHORSHIP_TABLES,
  assetRowColumns: ASSET_ROW_AUTHORSHIP_COLUMNS,
  mediaDeleteColumns: MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
  nonCanonicalTables: NON_CANONICAL_AUTHORSHIP_TABLES,
  mediaLocationsNote: MEDIA_LOCATIONS_AUTHORSHIP_NOTE,
} as const;
