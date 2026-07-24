import type { AgentToolResult } from "../schemas";
import type { AgentToolActionContext, ToolContext } from "./types";
import {
  ariaApplyDesignSystemPatch,
  ariaPreviewDesignSystemPatch,
} from "./content/designSystemPatchTools";
import {
  ariaGetDesignSystem,
  ariaGetNodeCapabilities,
  ariaListComponents,
  ariaListElementTypes,
  ariaListLayouts,
  ariaListPages,
  ariaReadComponent,
  ariaReadLayout,
  ariaReadPage,
} from "./content/readTools";
import { ariaGetSiteContext } from "./content/siteContext";
import {
  ariaGetPageVersion,
  ariaListPageVersions,
} from "./content/pageHistoryTools";
import {
  ariaCheckLibraryUpdates,
  ariaInstallLibraryComponent,
  ariaInstallLibraryPack,
  ariaListInstalledLibraryPacks,
  ariaSearchLibrary,
  ariaUninstallLibraryPack,
} from "./operations/libraryTools";
import {
  ariaCreateSiteExport,
  ariaDeleteSiteExport,
  ariaGetLatestSiteExport,
  ariaListSiteExports,
} from "./operations/siteExportTools";
import {
  ariaApplyContentSync,
  ariaGetContentSyncStatus,
  ariaListContentSyncHistory,
  ariaPlanContentSync,
} from "./operations/contentSyncTools";
import {
  ariaApplyMediaSync,
  ariaDeleteMediaTransformVariant,
  ariaGetMediaTransformState,
  ariaListMediaSyncHistory,
  ariaPlanMediaSync,
  ariaRebuildMediaUsageIndex,
  ariaSaveMediaProfile,
  ariaSaveMediaTransformVariant,
} from "./operations/mediaOperationsTools";
import {
  ariaGetCacheObservability,
  ariaGetCacheStats,
  ariaGetSystemStatus,
  ariaGetEmailOutboxOverview,
  ariaListEmailConnections,
  ariaListEmailDeliveries,
  ariaListEmailRoutes,
  ariaGetAuthMethodsConfig,
  ariaGetPlatformInfo,
  ariaGetPlatformMetrics,
  ariaGetTwoFactorPolicy,
  ariaListUsers,
} from "./administration/adminReadTools";
import {
  ariaGetDiscoveryArtifacts,
  ariaGetDiscoveryBaseline,
  ariaGetDiscoveryReport,
} from "./content/discoveryReadTools";
import {
  ariaGetAnalyticsAvailability,
  ariaGetTrafficSummary,
  ariaGetPageTraffic,
  ariaGetPagesTraffic,
  ariaGetSiteTraffic,
} from "./content/analyticsReadTools";
import {
  ariaApplyDesignSystemTemplate,
  ariaSaveDesignSystemBreakpoints,
  ariaSaveDesignSystemColors,
  ariaSaveDesignSystemGlobalStyles,
  ariaSaveDesignSystemTypography,
  ariaSetDesignSystemPrimaryColor,
} from "./content/designSystemWriteTools";
import {
  ariaCreatePage,
  ariaCreateLayout,
  ariaCreateComponent,
  ariaDuplicateDocument,
  ariaSaveDocument,
  ariaDeleteDocument,
  ariaUpdatePageMeta,
} from "./content/writeTools";
import { ariaUpdatePageSeo } from "./content/seoTools";
import {
  ariaPublishPage,
  ariaUnpublishPage,
  ariaArchivePage,
  ariaUnarchivePage,
} from "./content/publishTool";
import { ariaUpdateLayoutSlots } from "./content/layoutTools";
import {
  ariaInsertNodes,
  ariaMutateNode,
  ariaUpdateNodeMotion,
  ariaUpdateNodeClasses,
  ariaReplaceNode,
  ariaMoveNode,
  ariaDeleteNode,
} from "./content/nodeWriteTools";
import {
  ariaArchiveEntry,
  ariaBindNodeField,
  ariaClearCollectionTemplate,
  ariaCreateCollection,
  ariaCreateEntry,
  ariaDeleteCollection,
  ariaDeleteEntry,
  ariaDuplicateEntry,
  ariaGetCmsInventory,
  ariaGetCollection,
  ariaGetEntry,
  ariaGetEntryTranslationContext,
  ariaGetEntryRevision,
  ariaListCollections,
  ariaListEntries,
  ariaListEntryRevisions,
  ariaPublishEntry,
  ariaQueryEntries,
  ariaRestoreEntryRevision,
  ariaSetCollectionTemplate,
  ariaSetContainerLoop,
  ariaSetupBlog,
  ariaSetupConfigCollection,
  ariaSetupNavCollection,
  ariaSetupTagArchive,
  ariaUnpublishEntry,
  ariaUpdateCollection,
  ariaUpdateEntry,
  ariaSaveEntryTranslation,
} from "./cms/cmsTools";
import {
  ariaCompareEntryRevisions,
  ariaCreateReviewAnnotation,
  ariaGetEntryReview,
  ariaListReviewAnnotations,
  ariaReopenReviewAnnotation,
  ariaResolveReviewAnnotation,
  ariaUpdateEntryReview,
} from "./cms/workflowTools";
import {
  ariaListMedia,
  ariaAttachMediaToNode,
  ariaGetMediaUsages,
  ariaDeleteMedia,
  ariaRenameMedia,
  ariaDuplicateMedia,
  ariaImportMediaFromUrl,
  ariaSetPageCover,
} from "./content/mediaTools";
import { ariaListClasses } from "./content/listClasses";
import { ariaRegenerateGlobalCss } from "./design/regenerateCss";
import {
  ariaListFonts,
  ariaGetFontConfig,
  ariaEnableGoogleFont,
  ariaDisableFont,
  ariaDeleteCustomFont,
  ariaRenameCustomFont,
  ariaUpdateGoogleFontVariants,
} from "./design/fontTools";
import {
  ariaCreateClass,
  ariaUpdateClassRule,
  ariaRemoveClassRule,
  ariaDeleteClass,
  ariaRenameClass,
  ariaDuplicateClass,
  ariaUpdateClassPseudoRule,
} from "./classes/writeTools";
import { ariaApplyClassToNodes } from "./classes/applyClass";
import { ariaManageCssVariables } from "./variables/writeTools";
import {
  ariaGetSiteSettings,
  ariaGetLocalizationSettings,
  ariaUpdateLocalizationSettings,
  ariaUpdateSiteSettings,
  ariaUpdateDiscoverySettings,
  ariaUpdateAppearance,
  ariaUpdateIconPacks,
} from "./settings/settingsTools";
import {
  ariaListRedirects,
  ariaCreateRedirect,
  ariaUpdateRedirect,
  ariaDeleteRedirect,
} from "./redirects/redirectTools";
import { formatToolErrorForModel } from "./toolErrors";
import { logAgentActivity } from "./activityLog";
import {
  getConfirmationCategory,
  getConfirmationCategoryLabel,
} from "./confirmationRegistry";
import {
  captureMutationBeforeExecution,
  commitMutationAfterExecution,
} from "../undo/mutationAudit";
import { getTokenDb } from "../mcp/tokenDb";
import { checkRateLimit, DEFAULT_RATE_LIMIT_RPM } from "./rateLimit";
import {
  isCmsWriteToolName,
  isContentWriteToolName,
  isDesignExtendedToolName,
  isPublishToolName,
  isReadToolName,
  isServerToolName,
  type ServerToolName,
} from "./constants";

export {
  SERVER_CMS_READ_TOOL_NAMES,
  SERVER_CMS_WRITE_TOOL_NAMES,
  SERVER_READ_TOOL_NAMES,
  SERVER_DESIGN_WRITE_TOOL_NAMES,
  SERVER_CONTENT_WRITE_TOOL_NAMES,
  SERVER_CLASS_TOOL_NAMES,
  SERVER_VARIABLE_TOOL_NAMES,
  SERVER_FONT_MUTATION_TOOL_NAMES,
  SERVER_SETTINGS_WRITE_TOOL_NAMES,
  SERVER_PUBLISH_TOOL_NAMES,
  SERVER_ADMIN_TOOL_NAMES,
  SERVER_TOOL_NAMES,
  isCmsReadToolName,
  isCmsWriteToolName,
  isReadToolName,
  isDesignWriteToolName,
  isContentWriteToolName,
  isClassToolName,
  isVariableToolName,
  isFontMutationToolName,
  isSettingsWriteToolName,
  isPublishToolName,
  isAdminToolName,
  isDesignExtendedToolName,
  isServerToolName,
  listMcpToolsForScopes,
} from "./constants";
export type {
  ServerCmsReadToolName,
  ServerCmsWriteToolName,
  ServerReadToolName,
  ServerDesignWriteToolName,
  ServerContentWriteToolName,
  ServerClassToolName,
  ServerVariableToolName,
  ServerFontMutationToolName,
  ServerSettingsWriteToolName,
  ServerPublishToolName,
  ServerAdminToolName,
  ServerToolName,
} from "./constants";

type ToolHandler = (
  context: AgentToolActionContext,
  input: unknown,
) => Promise<AgentToolResult<unknown>>;

const HANDLERS: Record<ServerToolName, ToolHandler> = {
  aria_get_site_context: ariaGetSiteContext,
  aria_get_discovery_report: ariaGetDiscoveryReport,
  aria_get_discovery_artifacts: ariaGetDiscoveryArtifacts,
  aria_get_discovery_baseline: ariaGetDiscoveryBaseline,
  aria_get_analytics_availability: ariaGetAnalyticsAvailability,
  aria_get_traffic_summary: ariaGetTrafficSummary,
  aria_get_site_traffic: ariaGetSiteTraffic,
  aria_get_pages_traffic: ariaGetPagesTraffic,
  aria_get_page_traffic: ariaGetPageTraffic,
  aria_get_site_settings: ariaGetSiteSettings,
  aria_get_localization_settings: ariaGetLocalizationSettings,
  aria_list_redirects: ariaListRedirects,
  aria_get_media_usages: ariaGetMediaUsages,
  aria_get_media_transform_state: ariaGetMediaTransformState,
  aria_list_media_sync_history: ariaListMediaSyncHistory,
  aria_list_pages: ariaListPages,
  aria_read_page: ariaReadPage,
  aria_list_page_versions: ariaListPageVersions,
  aria_get_page_version: ariaGetPageVersion,
  aria_search_library: ariaSearchLibrary,
  aria_list_installed_library_packs: ariaListInstalledLibraryPacks,
  aria_check_library_updates: ariaCheckLibraryUpdates,
  aria_list_site_exports: ariaListSiteExports,
  aria_get_latest_site_export: ariaGetLatestSiteExport,
  aria_get_content_sync_status: ariaGetContentSyncStatus,
  aria_list_content_sync_history: ariaListContentSyncHistory,
  aria_list_components: ariaListComponents,
  aria_read_component: ariaReadComponent,
  aria_list_layouts: ariaListLayouts,
  aria_read_layout: ariaReadLayout,
  aria_get_design_system: ariaGetDesignSystem,
  aria_preview_design_system_patch: ariaPreviewDesignSystemPatch,
  aria_list_element_types: ariaListElementTypes,
  aria_get_node_capabilities: ariaGetNodeCapabilities,
  aria_get_cms_inventory: ariaGetCmsInventory,
  aria_list_collections: ariaListCollections,
  aria_get_collection: ariaGetCollection,
  aria_list_entries: ariaListEntries,
  aria_get_entry: ariaGetEntry,
  aria_get_entry_translation_context: ariaGetEntryTranslationContext,
  aria_query_entries: ariaQueryEntries,
  aria_list_entry_revisions: ariaListEntryRevisions,
  aria_get_entry_revision: ariaGetEntryRevision,
  aria_compare_entry_revisions: ariaCompareEntryRevisions,
  aria_get_entry_review: ariaGetEntryReview,
  aria_list_review_annotations: ariaListReviewAnnotations,
  aria_apply_design_system_patch: ariaApplyDesignSystemPatch,
  aria_save_design_system_colors: ariaSaveDesignSystemColors,
  aria_set_design_system_primary_color: ariaSetDesignSystemPrimaryColor,
  aria_save_design_system_typography: ariaSaveDesignSystemTypography,
  aria_save_design_system_global_styles: ariaSaveDesignSystemGlobalStyles,
  aria_save_design_system_breakpoints: ariaSaveDesignSystemBreakpoints,
  aria_apply_design_system_template: ariaApplyDesignSystemTemplate,
  aria_update_site_settings: ariaUpdateSiteSettings,
  aria_update_localization_settings: ariaUpdateLocalizationSettings,
  aria_update_discovery_settings: ariaUpdateDiscoverySettings,
  aria_update_appearance: ariaUpdateAppearance,
  aria_update_icon_packs: ariaUpdateIconPacks,
  aria_create_page: ariaCreatePage,
  aria_install_library_pack: ariaInstallLibraryPack,
  aria_install_library_component: ariaInstallLibraryComponent,
  aria_uninstall_library_pack: ariaUninstallLibraryPack,
  aria_create_site_export: ariaCreateSiteExport,
  aria_delete_site_export: ariaDeleteSiteExport,
  aria_plan_content_sync: ariaPlanContentSync,
  aria_apply_content_sync: ariaApplyContentSync,
  aria_create_layout: ariaCreateLayout,
  aria_create_component: ariaCreateComponent,
  aria_duplicate_document: ariaDuplicateDocument,
  aria_save_document: ariaSaveDocument,
  aria_delete_document: ariaDeleteDocument,
  aria_update_page_meta: ariaUpdatePageMeta,
  aria_update_page_seo: ariaUpdatePageSeo,
  aria_insert_nodes: ariaInsertNodes,
  aria_mutate_node: ariaMutateNode,
  aria_update_node_motion: ariaUpdateNodeMotion,
  aria_update_node_classes: ariaUpdateNodeClasses,
  aria_replace_node: ariaReplaceNode,
  aria_move_node: ariaMoveNode,
  aria_delete_node: ariaDeleteNode,
  aria_update_layout_slots: ariaUpdateLayoutSlots,
  aria_list_media: ariaListMedia,
  aria_attach_media_to_node: ariaAttachMediaToNode,
  aria_delete_media: ariaDeleteMedia,
  aria_rename_media: ariaRenameMedia,
  aria_duplicate_media: ariaDuplicateMedia,
  aria_import_media_from_url: ariaImportMediaFromUrl,
  aria_set_page_cover: ariaSetPageCover,
  aria_save_media_profile: ariaSaveMediaProfile,
  aria_save_media_transform_variant: ariaSaveMediaTransformVariant,
  aria_delete_media_transform_variant: ariaDeleteMediaTransformVariant,
  aria_rebuild_media_usage_index: ariaRebuildMediaUsageIndex,
  aria_plan_media_sync: ariaPlanMediaSync,
  aria_apply_media_sync: ariaApplyMediaSync,
  aria_create_redirect: ariaCreateRedirect,
  aria_update_redirect: ariaUpdateRedirect,
  aria_delete_redirect: ariaDeleteRedirect,
  aria_list_fonts: ariaListFonts,
  aria_get_font_config: ariaGetFontConfig,
  aria_list_classes: ariaListClasses,
  aria_create_class: ariaCreateClass,
  aria_update_class_rule: ariaUpdateClassRule,
  aria_remove_class_rule: ariaRemoveClassRule,
  aria_delete_class: ariaDeleteClass,
  aria_rename_class: ariaRenameClass,
  aria_duplicate_class: ariaDuplicateClass,
  aria_apply_class_to_nodes: ariaApplyClassToNodes,
  aria_update_class_pseudo_rule: ariaUpdateClassPseudoRule,
  aria_manage_css_variables: ariaManageCssVariables,
  aria_regenerate_global_css: ariaRegenerateGlobalCss,
  aria_enable_google_font: ariaEnableGoogleFont,
  aria_disable_font: ariaDisableFont,
  aria_delete_custom_font: ariaDeleteCustomFont,
  aria_rename_custom_font: ariaRenameCustomFont,
  aria_update_google_font_variants: ariaUpdateGoogleFontVariants,
  aria_publish_page: ariaPublishPage,
  aria_unpublish_page: ariaUnpublishPage,
  aria_archive_page: ariaArchivePage,
  aria_unarchive_page: ariaUnarchivePage,
  aria_create_collection: ariaCreateCollection,
  aria_update_entry_review: ariaUpdateEntryReview,
  aria_create_review_annotation: ariaCreateReviewAnnotation,
  aria_resolve_review_annotation: ariaResolveReviewAnnotation,
  aria_reopen_review_annotation: ariaReopenReviewAnnotation,
  aria_update_collection: ariaUpdateCollection,
  aria_set_collection_template: ariaSetCollectionTemplate,
  aria_clear_collection_template: ariaClearCollectionTemplate,
  aria_delete_collection: ariaDeleteCollection,
  aria_create_entry: ariaCreateEntry,
  aria_update_entry: ariaUpdateEntry,
  aria_save_entry_translation: ariaSaveEntryTranslation,
  aria_duplicate_entry: ariaDuplicateEntry,
  aria_delete_entry: ariaDeleteEntry,
  aria_restore_entry_revision: ariaRestoreEntryRevision,
  aria_bind_node_field: ariaBindNodeField,
  aria_set_container_loop: ariaSetContainerLoop,
  aria_setup_blog: ariaSetupBlog,
  aria_setup_tag_archive: ariaSetupTagArchive,
  aria_setup_nav_collection: ariaSetupNavCollection,
  aria_setup_config_collection: ariaSetupConfigCollection,
  aria_publish_entry: ariaPublishEntry,
  aria_unpublish_entry: ariaUnpublishEntry,
  aria_archive_entry: ariaArchiveEntry,
  aria_get_system_status: ariaGetSystemStatus,
  aria_get_cache_stats: ariaGetCacheStats,
  aria_get_cache_observability: ariaGetCacheObservability,
  aria_list_users: ariaListUsers,
  aria_list_email_connections: ariaListEmailConnections,
  aria_list_email_routes: ariaListEmailRoutes,
  aria_get_email_outbox_overview: ariaGetEmailOutboxOverview,
  aria_list_email_deliveries: ariaListEmailDeliveries,
  aria_get_auth_methods_config: ariaGetAuthMethodsConfig,
  aria_get_two_factor_policy: ariaGetTwoFactorPolicy,
  aria_get_platform_info: ariaGetPlatformInfo,
  aria_get_platform_metrics: ariaGetPlatformMetrics,
};

function assertMcpToolScope(toolContext: ToolContext, toolName: string): void {
  if (toolContext.transport !== "mcp") {
    return;
  }

  if (isReadToolName(toolName)) {
    if (!toolContext.scopes.includes("mcp:read")) {
      throw new Error("Token missing mcp:read scope");
    }
    return;
  }

  if (isDesignExtendedToolName(toolName)) {
    if (!toolContext.scopes.includes("mcp:design")) {
      throw new Error("Token missing mcp:design scope");
    }
    return;
  }

  if (isContentWriteToolName(toolName) || isCmsWriteToolName(toolName)) {
    if (!toolContext.scopes.includes("mcp:write")) {
      throw new Error("Token missing mcp:write scope");
    }
    return;
  }

  if (isPublishToolName(toolName)) {
    if (!toolContext.scopes.includes("mcp:publish")) {
      throw new Error("Token missing mcp:publish scope");
    }
    return;
  }

  throw new Error(`Tool ${toolName} is not allowed via MCP`);
}

interface PendingConfirmation {
  id: string;
  userId: string;
  toolName: string;
  args: string;
  category: string;
  transport: string;
  createdAt: string;
  expiresAt: string;
}

async function ensureConfirmationTables(locals: App.Locals): Promise<void> {
  const tokenDb = await getTokenDb(locals);
  await tokenDb.execute(
    `CREATE TABLE IF NOT EXISTS agent_confirmation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      category TEXT NOT NULL,
      transport TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
  );
}

async function storePendingConfirmation(
  locals: App.Locals,
  userId: string,
  toolName: string,
  args: unknown,
  category: string,
  transport: string,
): Promise<string> {
  await ensureConfirmationTables(locals);
  const tokenDb = await getTokenDb(locals);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  await tokenDb.execute(
    `INSERT INTO agent_confirmation_tokens
     (id, user_id, tool_name, args, category, transport, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      toolName,
      JSON.stringify(args),
      category,
      transport,
      createdAt,
      expiresAt,
    ],
  );

  return id;
}

async function consumePendingConfirmation(
  locals: App.Locals,
  tokenId: string,
): Promise<PendingConfirmation | null> {
  const tokenDb = await getTokenDb(locals);

  const row = await tokenDb.queryFirst(
    `SELECT id, user_id, tool_name, args, category, transport, created_at, expires_at
     FROM agent_confirmation_tokens
     WHERE id = ? AND expires_at > datetime('now')`,
    [tokenId],
  );

  if (!row) return null;

  // Single-use: delete immediately
  await tokenDb.execute(`DELETE FROM agent_confirmation_tokens WHERE id = ?`, [
    tokenId,
  ]);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    toolName: String(row.tool_name),
    args: String(row.args),
    category: String(row.category),
    transport: String(row.transport),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  };
}

async function executeResolvedServerTool(input: {
  toolContext: ToolContext;
  actionContext: AgentToolActionContext;
  toolName: ServerToolName;
  args: unknown;
}): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const { toolContext, actionContext, toolName, args } = input;
  const operationId = crypto.randomUUID();
  const startedAt = Date.now();
  const handler = HANDLERS[toolName];
  const pendingMutation = await captureMutationBeforeExecution({
    toolContext,
    actionContext,
    toolName,
    args,
  });
  const result = await handler(actionContext, args);
  if (result.ok) {
    await commitMutationAfterExecution({
      locals: actionContext.locals,
      actionContext,
      pending: pendingMutation,
    });
  }

  const resource =
    args && typeof args === "object" && "slug" in args
      ? String((args as { slug: unknown }).slug)
      : null;
  await logAgentActivity({
    locals: actionContext.locals,
    actor: toolContext.actorLabel,
    transport: toolContext.transport,
    toolName,
    resource,
    status: result.ok ? "success" : "error",
    message: result.ok
      ? `operation=${operationId} durationMs=${Date.now() - startedAt}`
      : `operation=${operationId} durationMs=${Date.now() - startedAt} ${formatToolErrorForModel(result.error)}`,
  });

  if (!result.ok) {
    return { ok: false, error: formatToolErrorForModel(result.error) };
  }
  return {
    ok: true,
    data:
      result.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data)
        ? { operationId, ...result.data }
        : result.data,
  };
}

export async function executeTool(input: {
  toolContext: ToolContext;
  actionContext: AgentToolActionContext;
  toolName: string;
  args: unknown;
  confirmationToken?: string;
}): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
  | {
      ok: false;
      error: string;
      requiresConfirmation: true;
      confirmationToken: string;
      confirmationCategory: string;
    }
> {
  const {
    toolContext,
    actionContext,
    toolName,
    args,
    confirmationToken,
  } = input;

  try {
    assertMcpToolScope(toolContext, toolName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP scope denied";
    await logAgentActivity({
      locals: actionContext.locals,
      actor: toolContext.actorLabel,
      transport: toolContext.transport,
      toolName,
      status: "error",
      message,
    });
    return { ok: false, error: message };
  }

  if (!isServerToolName(toolName)) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  const bucketKey: string | null =
    toolContext.transport === "mcp" && toolContext.userId
      ? `${toolContext.siteId}:${toolContext.userId}` // personal MCP — shares per-user bucket
      : toolContext.transport === "mcp" &&
          !toolContext.userId &&
          toolContext.tokenId
        ? `service:${toolContext.tokenId}` // service MCP — per-token bucket
        : toolContext.transport === "studio_ws" && toolContext.userId
          ? `${toolContext.siteId}:${toolContext.userId}` // Studio WS — same per-user bucket
          : null; // non-rate-limited (shouldn't happen)

  if (bucketKey) {
    const rateResult = await checkRateLimit(
      actionContext.locals,
      bucketKey,
      DEFAULT_RATE_LIMIT_RPM,
    );
    if (!rateResult.allowed) {
      await logAgentActivity({
        locals: actionContext.locals,
        actor: toolContext.actorLabel,
        transport: toolContext.transport,
        toolName,
        status: "error",
        message: "RATE_LIMITED",
      });
      return {
        ok: false,
        error:
          "Tool call rate limit exceeded. Please wait before sending more commands.",
      };
    }
  }

  const confirmationCategory = getConfirmationCategory(toolName);
  if (confirmationCategory) {
    // If retrying with a confirmation token, validate and execute
    if (confirmationToken) {
      const pending = await consumePendingConfirmation(
        actionContext.locals,
        confirmationToken,
      );
      if (!pending) {
        return {
          ok: false,
          error:
            "Confirmation token is invalid or expired. Please request a new confirmation.",
        };
      }

      const expectedUserId = toolContext.userId ?? toolContext.actorLabel;
      if (
        pending.userId !== expectedUserId ||
        pending.toolName !== toolName ||
        pending.category !== confirmationCategory ||
        pending.transport !== toolContext.transport
      ) {
        return {
          ok: false,
          error:
            "Confirmation token does not match this action. Please request a new confirmation.",
        };
      }

      // Approval confirms the exact stored action; caller-provided retry args
      // are ignored so the approved operation cannot be swapped after review.
      const resolvedArgs = JSON.parse(pending.args);

      // Proceed through the same execution kernel used by unconfirmed calls.
      return executeResolvedServerTool({
        toolContext,
        actionContext,
        toolName,
        args: resolvedArgs,
      });
    } else {
      const token = await storePendingConfirmation(
        actionContext.locals,
        toolContext.userId ?? toolContext.actorLabel,
        toolName,
        args,
        confirmationCategory,
        toolContext.transport,
      );

      await logAgentActivity({
        locals: actionContext.locals,
        actor: toolContext.actorLabel,
        transport: toolContext.transport,
        toolName,
        status: "error",
        message: `CONFIRMATION_REQUIRED: ${confirmationCategory}`,
      });

      return {
        ok: false,
        error: `[CONFIRMATION_REQUIRED] ${getConfirmationCategoryLabel(confirmationCategory)}`,
        requiresConfirmation: true as const,
        confirmationToken: token,
        confirmationCategory,
      };
    }
  }

  return executeResolvedServerTool({
    toolContext,
    actionContext,
    toolName,
    args,
  });
}

export function toolResultToModelContent(
  result: { ok: true; data: unknown } | { ok: false; error: string },
): string {
  if (result.ok) {
    return JSON.stringify(result.data, null, 2);
  }
  return result.error;
}
