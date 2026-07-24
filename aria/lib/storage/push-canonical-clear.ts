/**
 * Canonical content tables cleared during an explicit --replace
 * push. Content-sync job/history tables are intentionally excluded.
 */

export const PUSH_REPLACE_CLEAR_TABLES = [
  "aria_cache_invalidation_jobs",
  "aria_locale_route_leases",
  "aria_media_usage",
  "aria_media_sync_items",
  "aria_media_sync_jobs",
  "aria_media_locations",
  "aria_media_assets",
  "aria_collection_permissions",
  "aria_collection_policies",
  "aria_cms_audit_events",
  "aria_entry_revisions",
  "aria_entry_relations",
  "aria_entry_locales",
  "aria_entries",
  "aria_collections",
  "aria_layout_locale_meta",
  "aria_layout_locale_versions",
  "aria_page_locale_routes",
  "aria_page_locale_meta",
  "aria_page_locale_versions",
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

export type PushReplaceClearTarget = {
  sql: string;
};

export function buildReplaceClearStatements(): PushReplaceClearTarget[] {
  return PUSH_REPLACE_CLEAR_TABLES.map((tableName) => ({
    sql: `DELETE FROM ${tableName}`,
  }));
}
