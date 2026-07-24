export const SERVER_READ_TOOL_NAMES = [
  "aria_get_site_context",
  "aria_get_discovery_report",
  "aria_get_discovery_artifacts",
  "aria_get_discovery_baseline",
  "aria_get_analytics_availability",
  "aria_get_traffic_summary",
  "aria_get_site_traffic",
  "aria_get_pages_traffic",
  "aria_get_page_traffic",
  "aria_get_site_settings",
  "aria_get_localization_settings",
  "aria_list_redirects",
  "aria_list_media",
  "aria_get_media_usages",
  "aria_get_media_transform_state",
  "aria_list_media_sync_history",
  "aria_list_pages",
  "aria_read_page",
  "aria_list_page_versions",
  "aria_get_page_version",
  "aria_search_library",
  "aria_list_installed_library_packs",
  "aria_check_library_updates",
  "aria_list_site_exports",
  "aria_get_latest_site_export",
  "aria_get_content_sync_status",
  "aria_list_content_sync_history",
  "aria_list_components",
  "aria_read_component",
  "aria_list_layouts",
  "aria_read_layout",
  "aria_get_design_system",
  "aria_preview_design_system_patch",
  "aria_list_element_types",
  "aria_get_node_capabilities",
  "aria_list_fonts",
  "aria_get_font_config",
  "aria_list_classes",
] as const;

export const SERVER_CMS_READ_TOOL_NAMES = [
  "aria_get_cms_inventory",
  "aria_list_collections",
  "aria_get_collection",
  "aria_list_entries",
  "aria_get_entry",
  "aria_get_entry_translation_context",
  "aria_query_entries",
  "aria_list_entry_revisions",
  "aria_get_entry_revision",
  "aria_compare_entry_revisions",
  "aria_get_entry_review",
  "aria_list_review_annotations",
] as const;

export const SERVER_DESIGN_WRITE_TOOL_NAMES = [
  "aria_apply_design_system_patch",
  "aria_set_design_system_primary_color",
  "aria_save_design_system_colors",
  "aria_save_design_system_typography",
  "aria_save_design_system_global_styles",
  "aria_save_design_system_breakpoints",
  "aria_apply_design_system_template",
] as const;

export const SERVER_SETTINGS_WRITE_TOOL_NAMES = [
  "aria_update_site_settings",
  "aria_update_localization_settings",
  "aria_update_discovery_settings",
  "aria_update_appearance",
  "aria_update_icon_packs",
] as const;

export const SERVER_CONTENT_WRITE_TOOL_NAMES = [
  "aria_install_library_pack",
  "aria_install_library_component",
  "aria_uninstall_library_pack",
  "aria_create_site_export",
  "aria_delete_site_export",
  "aria_plan_content_sync",
  "aria_apply_content_sync",
  "aria_update_page_meta",
  "aria_update_page_seo",
  "aria_create_page",
  "aria_create_layout",
  "aria_create_component",
  "aria_duplicate_document",
  "aria_save_document",
  "aria_delete_document",
  "aria_insert_nodes",
  "aria_mutate_node",
  "aria_update_node_motion",
  "aria_update_node_classes",
  "aria_replace_node",
  "aria_move_node",
  "aria_delete_node",
  "aria_update_layout_slots",
  "aria_attach_media_to_node",
  "aria_delete_media",
  "aria_rename_media",
  "aria_duplicate_media",
  "aria_import_media_from_url",
  "aria_set_page_cover",
  "aria_save_media_profile",
  "aria_save_media_transform_variant",
  "aria_delete_media_transform_variant",
  "aria_rebuild_media_usage_index",
  "aria_plan_media_sync",
  "aria_apply_media_sync",
  "aria_create_redirect",
  "aria_update_redirect",
  "aria_delete_redirect",
] as const;

export const SERVER_CMS_WRITE_TOOL_NAMES = [
  "aria_update_entry_review",
  "aria_create_review_annotation",
  "aria_resolve_review_annotation",
  "aria_reopen_review_annotation",
  "aria_create_collection",
  "aria_update_collection",
  "aria_set_collection_template",
  "aria_clear_collection_template",
  "aria_delete_collection",
  "aria_create_entry",
  "aria_update_entry",
  "aria_save_entry_translation",
  "aria_duplicate_entry",
  "aria_delete_entry",
  "aria_restore_entry_revision",
  "aria_bind_node_field",
  "aria_set_container_loop",
  "aria_setup_blog",
  "aria_setup_tag_archive",
  "aria_setup_nav_collection",
  "aria_setup_config_collection",
] as const;

export const SERVER_CLASS_TOOL_NAMES = [
  "aria_create_class",
  "aria_update_class_rule",
  "aria_remove_class_rule",
  "aria_delete_class",
  "aria_rename_class",
  "aria_duplicate_class",
  "aria_apply_class_to_nodes",
  "aria_update_class_pseudo_rule",
] as const;

export const SERVER_VARIABLE_TOOL_NAMES = [
  "aria_manage_css_variables",
  "aria_regenerate_global_css",
] as const;

export const SERVER_FONT_MUTATION_TOOL_NAMES = [
  "aria_enable_google_font",
  "aria_disable_font",
  "aria_delete_custom_font",
  "aria_rename_custom_font",
  "aria_update_google_font_variants",
] as const;

export const SERVER_PUBLISH_TOOL_NAMES = [
  "aria_publish_page",
  "aria_unpublish_page",
  "aria_archive_page",
  "aria_unarchive_page",
  "aria_publish_entry",
  "aria_unpublish_entry",
  "aria_archive_entry",
] as const;

/** Studio-only administrator capabilities. Never exposed through MCP scopes. */
export const SERVER_ADMIN_TOOL_NAMES = [
  "aria_get_system_status",
  "aria_get_cache_stats",
  "aria_get_cache_observability",
  "aria_list_users",
  "aria_list_email_connections",
  "aria_list_email_routes",
  "aria_get_email_outbox_overview",
  "aria_list_email_deliveries",
  "aria_get_auth_methods_config",
  "aria_get_two_factor_policy",
  "aria_get_platform_info",
  "aria_get_platform_metrics",
] as const;

export const SERVER_TOOL_NAMES = [
  ...SERVER_READ_TOOL_NAMES,
  ...SERVER_CMS_READ_TOOL_NAMES,
  ...SERVER_DESIGN_WRITE_TOOL_NAMES,
  ...SERVER_SETTINGS_WRITE_TOOL_NAMES,
  ...SERVER_CONTENT_WRITE_TOOL_NAMES,
  ...SERVER_CMS_WRITE_TOOL_NAMES,
  ...SERVER_CLASS_TOOL_NAMES,
  ...SERVER_VARIABLE_TOOL_NAMES,
  ...SERVER_FONT_MUTATION_TOOL_NAMES,
  ...SERVER_PUBLISH_TOOL_NAMES,
  ...SERVER_ADMIN_TOOL_NAMES,
] as const;

export type ServerReadToolName = (typeof SERVER_READ_TOOL_NAMES)[number];
export type ServerCmsReadToolName = (typeof SERVER_CMS_READ_TOOL_NAMES)[number];
export type ServerDesignWriteToolName =
  (typeof SERVER_DESIGN_WRITE_TOOL_NAMES)[number];
export type ServerSettingsWriteToolName =
  (typeof SERVER_SETTINGS_WRITE_TOOL_NAMES)[number];
export type ServerContentWriteToolName =
  (typeof SERVER_CONTENT_WRITE_TOOL_NAMES)[number];
export type ServerCmsWriteToolName =
  (typeof SERVER_CMS_WRITE_TOOL_NAMES)[number];
export type ServerClassToolName = (typeof SERVER_CLASS_TOOL_NAMES)[number];
export type ServerVariableToolName =
  (typeof SERVER_VARIABLE_TOOL_NAMES)[number];
export type ServerFontMutationToolName =
  (typeof SERVER_FONT_MUTATION_TOOL_NAMES)[number];
export type ServerPublishToolName = (typeof SERVER_PUBLISH_TOOL_NAMES)[number];
export type ServerAdminToolName = (typeof SERVER_ADMIN_TOOL_NAMES)[number];
export type ServerToolName = (typeof SERVER_TOOL_NAMES)[number];

const READ_TOOL_SET = new Set<string>(SERVER_READ_TOOL_NAMES);
const CMS_READ_TOOL_SET = new Set<string>(SERVER_CMS_READ_TOOL_NAMES);
const DESIGN_WRITE_TOOL_SET = new Set<string>(SERVER_DESIGN_WRITE_TOOL_NAMES);
const SETTINGS_WRITE_TOOL_SET = new Set<string>(
  SERVER_SETTINGS_WRITE_TOOL_NAMES,
);
const CONTENT_WRITE_TOOL_SET = new Set<string>(SERVER_CONTENT_WRITE_TOOL_NAMES);
const CMS_WRITE_TOOL_SET = new Set<string>(SERVER_CMS_WRITE_TOOL_NAMES);
const CLASS_TOOL_SET = new Set<string>(SERVER_CLASS_TOOL_NAMES);
const VARIABLE_TOOL_SET = new Set<string>(SERVER_VARIABLE_TOOL_NAMES);
const FONT_MUTATION_TOOL_SET = new Set<string>(SERVER_FONT_MUTATION_TOOL_NAMES);
const PUBLISH_TOOL_SET = new Set<string>(SERVER_PUBLISH_TOOL_NAMES);
const ADMIN_TOOL_SET = new Set<string>(SERVER_ADMIN_TOOL_NAMES);

export function isReadToolName(name: string): boolean {
  return READ_TOOL_SET.has(name) || CMS_READ_TOOL_SET.has(name);
}

export function isCmsReadToolName(name: string): boolean {
  return CMS_READ_TOOL_SET.has(name);
}

export function isDesignWriteToolName(name: string): boolean {
  return DESIGN_WRITE_TOOL_SET.has(name);
}

export function isSettingsWriteToolName(name: string): boolean {
  return SETTINGS_WRITE_TOOL_SET.has(name);
}

export function isContentWriteToolName(name: string): boolean {
  return CONTENT_WRITE_TOOL_SET.has(name);
}

export function isCmsWriteToolName(name: string): boolean {
  return CMS_WRITE_TOOL_SET.has(name);
}

export function isClassToolName(name: string): boolean {
  return CLASS_TOOL_SET.has(name);
}

export function isVariableToolName(name: string): boolean {
  return VARIABLE_TOOL_SET.has(name);
}

export function isFontMutationToolName(name: string): boolean {
  return FONT_MUTATION_TOOL_SET.has(name);
}

export function isPublishToolName(name: string): boolean {
  return PUBLISH_TOOL_SET.has(name);
}

export function isAdminToolName(name: string): boolean {
  return ADMIN_TOOL_SET.has(name);
}

/** Class, variable, font-mutation, and settings-write tools fall under mcp:design scope */
export function isDesignExtendedToolName(name: string): boolean {
  return (
    isDesignWriteToolName(name) ||
    isClassToolName(name) ||
    isVariableToolName(name) ||
    isFontMutationToolName(name) ||
    isSettingsWriteToolName(name)
  );
}

export function isServerToolName(name: string): name is ServerToolName {
  return (
    READ_TOOL_SET.has(name) ||
    CMS_READ_TOOL_SET.has(name) ||
    DESIGN_WRITE_TOOL_SET.has(name) ||
    SETTINGS_WRITE_TOOL_SET.has(name) ||
    CONTENT_WRITE_TOOL_SET.has(name) ||
    CMS_WRITE_TOOL_SET.has(name) ||
    CLASS_TOOL_SET.has(name) ||
    VARIABLE_TOOL_SET.has(name) ||
    FONT_MUTATION_TOOL_SET.has(name) ||
    PUBLISH_TOOL_SET.has(name) ||
    ADMIN_TOOL_SET.has(name)
  );
}

export function listMcpToolsForScopes(
  scopes: readonly string[],
): ServerToolName[] {
  const tools: ServerToolName[] = [];
  if (scopes.includes("mcp:read")) {
    tools.push(...SERVER_READ_TOOL_NAMES);
    tools.push(...SERVER_CMS_READ_TOOL_NAMES);
  }
  if (scopes.includes("mcp:write")) {
    tools.push(...SERVER_CONTENT_WRITE_TOOL_NAMES);
    tools.push(...SERVER_CMS_WRITE_TOOL_NAMES);
  }
  if (scopes.includes("mcp:design")) {
    tools.push(...SERVER_DESIGN_WRITE_TOOL_NAMES);
    tools.push(...SERVER_SETTINGS_WRITE_TOOL_NAMES);
    tools.push(...SERVER_CLASS_TOOL_NAMES);
    tools.push(...SERVER_VARIABLE_TOOL_NAMES);
    tools.push(...SERVER_FONT_MUTATION_TOOL_NAMES);
  }
  if (scopes.includes("mcp:publish")) {
    tools.push(...SERVER_PUBLISH_TOOL_NAMES);
  }
  return tools;
}
