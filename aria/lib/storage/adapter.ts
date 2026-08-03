/**
 * Cloudflare backends. Implementations: SQLiteStorageAdapter, CloudflareStorageAdapter.
 */

import { z } from "zod";
import {
  ActorRefSchema,
  type ActorRef,
  type AssetAuthorship,
} from "../auth/types";
import type { DiscoverySettings } from "../crawl/schemas";
import type {
  CreateRedirectInput,
  RedirectRule,
  UpdateRedirectInput,
} from "../redirects/schemas";
import type { AdapterInfo, AdapterMetrics } from "./adapterMetricsSchemas";
import {
  PageVersionAuthorshipEntrySchema,
  type PageInventoryAuthorship,
  type PageVersionAuthorshipEntry,
} from "../authorship/schemas";
import type { VersionSaveOptions } from "./versioning";
import type {
  VersionHistoryPruneRequest,
  VersionHistoryPruneResult,
} from "./versioning";
import type { UniversalDesignSystem } from "../styles/universalDesignSystem";
import type { PageFrontmatter } from "../schemas/frontmatter";
import { AppearanceStorageSchema } from "../schemas/appearance";
import {
  normalizeContentLocalization,
  type ContentLocalizationSettings,
} from "../localization/contentLocale";
import type {
  AriaCompilerMetadata,
  AriaProjectSystemMetadata,
} from "../system/metadata";
import type {
  PageDSL,
  LayoutDSL,
  ComponentDSL,
  JsonObject,
  PagePublicationDependencies,
} from "../types/nodes";
import type {
  AriaCollection,
  AriaCollectionPolicy,
  AriaEntryRecord,
  AriaEntryRevision,
  CmsAuditEvent,
  CmsSearchDocument,
  CmsSearchResult,
  PublicComment,
  PublicCommentModerationEvent,
  CmsEntryAutosave,
  CmsEntryPresenceLease,
  CmsEntryEditLock,
  CmsEntryWorkflow,
  CmsReviewAnnotation,
} from "../cms/schemas";
import type {
  WordPressImportBatch,
  WordPressImportEvent,
  WordPressImportFile,
  WordPressImportItem,
  WordPressImportMapping,
  WordPressImportMedia,
} from "../wordpress-import/schemas";
import type {
  AriaCollectionPermission,
  CollectionKind,
  EntryListParams,
  EntryListResult,
} from "../cms/constants";
import {
  CacheInvalidationJobSchema,
  type CacheInvalidationJob,
  type LayoutLocaleMeta,
  type LayoutLocaleRecord,
  type LayoutLocaleVersion,
  type LocalizedRoute,
  type PageLocaleMeta,
  type PageLocaleRecord,
  type PageLocaleVersion,
  type RouteLease,
} from "../localization/siteTranslationSchemas";
import type { ApiEntryMutationCommit } from "../api/mutationContext";
import type {
  MediaAssetProfile,
  MediaSourceVersion,
  MediaTransformState,
  MediaTransformVariant,
  PromoteMediaSourceVersionInput,
  RelocateMediaSourceVersionInput,
  SaveMediaAssetProfileInput,
  SaveMediaTransformVariantInput,
} from "../media/transforms/schemas";
import type {
  MarkDeletedMediaInput,
  MediaAssetCatalogListRow,
  MediaAssetAuthorshipContext,
  MoveMediaInput,
  UpsertUploadedMediaInput,
} from "../media/catalog/repository";
import {
  StudioPresenceAttachmentSchema,
  type StudioPresenceAttachment,
} from "../realtime/studioLive";

export type { StylesData } from "../types/classes";
export type { UniversalDesignSystem } from "../styles/universalDesignSystem";

export interface PageData {
  slug: string;
  title: string;
  type: "page";
  blocks?: BlockMeta[];
  frontmatter?: PageFrontmatter; // Page-level metadata (SEO, icons, custom fields)
  layout?: string; // Assigned layout slug (source of truth for layout assignment UX)
  draft: boolean;
  parent?: string; // Parent page slug for nested pages
  order?: number; // Display order within parent (or at root level)
  updated_at: number;
}

export type ConsumeRateLimitInput = {
  /** Stable namespace for an independently limited operation. */
  scope: string;
  /** IP address or actor id; adapters hash it before persistence. */
  subject: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: number;
};

export interface LayoutRegions {
  headerComponent?: string;
  footerComponent?: string;
}

export interface LayoutData {
  slug: string;
  title: string;
  type: "layout";
  blocks?: BlockMeta[];
  frontmatter?: JsonObject;
  regions?: LayoutRegions;
  draft?: boolean;
  updated_at: number;
  [key: string]: unknown;
}

export interface ComponentData {
  slug: string;
  title: string;
  type: "component";
  source?: string;
  blocks?: BlockMeta[];
  draft?: boolean;
  updated_at: number;
  [key: string]: unknown;
}

export type OrderKind = "pages" | "layouts" | "components";

/**
 * Prop migration function - transforms old props to new props
 */
export interface PropMigration {
  from: number;
  to: number;
  migrate: (oldProps: JsonObject) => JsonObject;
  description: string;
}

export interface BlockMeta {
  type: string;
  label: string;
  framework: "astro" | "react" | "vue" | "svelte" | "solid";
  componentPath: string;
  editorComponentPath?: string;
  schema?: unknown; // Zod schema for validation
  props: JsonObject;

  version?: number;

  /** Migration functions for prop changes across versions */
  migrations?: Record<number, PropMigration>;
}

export interface PageVersion {
  id: string; // ULID/UUID
  timestamp: number;
  message: string;
  snapshot: string; // Path or KV key to snapshot
}

export interface StyleTokens {
  colors: Record<string, string>; // e.g. primary, secondary, accent, etc.
  gradients: Record<string, string>; // e.g. heroGradient: "linear-gradient(...)"
  spacing: Record<string, string>; // e.g. sm, md, lg, xl
  fonts: Record<string, string>; // e.g. heading, body, monospace
  fontSizes: Record<string, string>; // e.g. xs, sm, md, lg, xl
  fontWeights: Record<string, string>; // e.g. regular, medium, bold
  lineHeights: Record<string, string>; // e.g. normal, relaxed, tight
  letterSpacing: Record<string, string>; // e.g. normal, wide, tighter
  borderWidths: Record<string, string>; // e.g. thin, medium, thick
  borderColors: Record<string, string>; // e.g. borderPrimary, borderSecondary
  borderRadius: Record<string, string>; // e.g. sm, md, lg, pill, circle
  boxShadows: Record<string, string>; // e.g. sm, md, lg, xl
  opacity: Record<string, string>; // e.g. low, medium, high
  zIndex: Record<string, number>; // e.g. modal, dropdown, tooltip
  transitions: Record<string, string>; // e.g. fast, slow, bounce
  breakpoints: Record<string, string>; // e.g. sm, md, lg, xl
}

export interface StyleClasses {
  [className: string]: {
    background?: string;
    backgroundGradient?: string;
    color?: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
    letterSpacing?: string;
    padding?: string;
    margin?: string;
    border?: string;
    borderColor?: string;
    borderWidth?: string;
    borderRadius?: string;
    boxShadow?: string;
    opacity?: string;
    zIndex?: number | string;
    transition?: string;
    width?: string;
    height?: string;
    minWidth?: string;
    minHeight?: string;
    maxWidth?: string;
    maxHeight?: string;
    display?: string;
    position?: string;
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    overflow?: string;
    cursor?: string;
    textAlign?: string;
    flex?: string;
    flexDirection?: string;
    justifyContent?: string;
    alignItems?: string;
    gap?: string;
    // Responsive overrides may be provided via string keys in the custom properties below.
    // (Removed the computed template literal index signature to avoid TS index signature conflicts.)
    [customProp: string]: string | number | undefined;
  };
}

// StylesData is now imported from types/classes.ts (see line 11)

export const ANALYTICS_PROVIDER_IDS = [
  "plausible",
  "fathom",
  "simple-analytics",
  "matomo",
  "umami",
  "tiktok-pixel",
  "linkedin-insight-tag",
  "meta-pixel",
  "google-analytics",
  "google-tag-manager",
] as const;

export type AnalyticsProviderId = (typeof ANALYTICS_PROVIDER_IDS)[number];

export interface AnalyticsSettings {
  version: 1;
  activeProviders: AnalyticsProviderId[];
  providers: Partial<Record<AnalyticsProviderId, Record<string, string>>>;
  /** Admin UI traffic metrics — separate from visitor script providers */
  studioDisplay?: {
    cloudflareTraffic?: boolean;
  };
}

export type UtilityEngine = "unocss" | "custom";

export interface SiteSettings {
  siteName?: string;
  /** IANA timezone used for site-wide calendar dates and reporting. */
  timeZone?: string;
  /** Site-scoped first-run state; teammates never repeat setup. */
  onboarding?: {
    version: 1;
    status: "unstarted" | "named" | "installing" | "complete";
    foundation?: "blank" | "starter-content";
    completedSteps?: string[];
    completedAt?: string;
  };
  siteDescription?: string;
  siteUrl?: string;
  favicon?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  ogImage?: string;
  twitterCard?: string;
  customDomain?: string;
  sslEnabled?: boolean;
  forceHttps?: boolean;
  analytics?: AnalyticsSettings;
  customHeadCode?: string;
  customBodyCode?: string;
  customFooterCode?: string;
  /** Utility engine selection: UnoCSS utilities or semantic-only CSS output. */
  utilityEngine?: UtilityEngine;
  unocssConfig?: {
    theme?: {
      colors?: Record<string, unknown>;
      fontFamily?: Record<string, string[]>;
      fontSize?: Record<string, string>;
      spacing?: Record<string, string>;
      borderRadius?: Record<string, string>;
    };
    shortcuts?: Record<string, string>;
    rules?: Array<[string, Record<string, unknown>]>;
    safelist?: string[];
    presets?: string[];
    blocklist?: string[];
  };
  customFrameworkURL?: string;
  darkMode?: "media" | "class" | "disabled";
  /** @deprecated Legacy site appearance — read-only for migration via resolveAppearance */
  appearance?: z.infer<typeof AppearanceStorageSchema>;
  /**
   * Shared Studio site configuration (site-wide, not per-user).
   */
  studio?: {
    /**
     * Component panel grouping: custom folders and component assignments.
     * Curated via `settings.updateComponentGrouping` (`editSiteSettings`).
     */
    componentGrouping?: {
      groups: Array<{
        id: string;
        name: string;
      }>;
      assignments: Record<string, string>;
    };
    /**
     * Media library grouping: custom folders and asset assignments.
     * Curated via `settings.updateMediaGrouping` (`editSiteSettings`).
     */
    mediaGrouping?: {
      groups: Array<{
        id: string;
        name: string;
      }>;
      assignments: Record<string, string>;
    };
  };
  icons?: {
    enabledPacks?: {
      lucide?: boolean;
      "coreui-brands"?: boolean;
    };
    defaultPack?: "lucide" | "coreui-brands";
  };
  /** Site-wide render style revision used for snapshot/thumbnail freshness. */
  styleRevision?: string;
  /** Discovery / SEO artifact settings (robots, sitemap, llms.txt). */
  discovery?: DiscoverySettings;
  /** Aria Composer agent settings (inference mode, toggles — no API keys in JSON). */
  agent?: import("../agent/settings").AgentSettings;
  /** Site-owned content locale policy. Studio language remains per-user. */
  localization?: {
    content: ContentLocalizationSettings;
  };
  /** Immutable project creation/runtime metadata shown in Settings > System. */
  system?: AriaProjectSystemMetadata;
  updated_at?: number;
}

type LegacySiteSettingsShape = SiteSettings & {
  framework?: UtilityEngine;
};

export function createSiteStyleRevision(
  timestamp: number = Date.now(),
): string {
  return String(Math.max(0, Math.trunc(timestamp)));
}

export function getSiteStyleRevision(
  siteSettings?: {
    styleRevision?: string;
    updated_at?: number;
  } | null,
): string | undefined {
  if (
    typeof siteSettings?.styleRevision === "string" &&
    siteSettings.styleRevision.trim().length > 0
  ) {
    return siteSettings.styleRevision.trim();
  }

  if (
    typeof siteSettings?.updated_at === "number" &&
    Number.isFinite(siteSettings.updated_at) &&
    siteSettings.updated_at > 0
  ) {
    return createSiteStyleRevision(siteSettings.updated_at);
  }

  return undefined;
}

export function resolveSiteStyleRevision(
  siteSettings?: {
    styleRevision?: string;
    updated_at?: number;
  } | null,
): string {
  return getSiteStyleRevision(siteSettings) ?? "0";
}

export function getSiteSettingsUtilityEngine(
  siteSettings?: {
    utilityEngine?: UtilityEngine;
    framework?: UtilityEngine;
  } | null,
): UtilityEngine {
  return siteSettings?.utilityEngine ?? siteSettings?.framework ?? "custom";
}

export function normalizeSiteSettings(
  siteSettings?: LegacySiteSettingsShape | null,
): SiteSettings | null {
  if (!siteSettings) {
    return null;
  }

  const normalized: LegacySiteSettingsShape = {
    ...siteSettings,
    utilityEngine: getSiteSettingsUtilityEngine(siteSettings),
    ...(siteSettings.localization
      ? {
          localization: {
            content: normalizeContentLocalization(
              siteSettings.localization.content,
            ),
          },
        }
      : {}),
  };

  delete normalized.framework;

  return normalized;
}

export function serializeSiteSettingsForStorage(
  siteSettings: SiteSettings,
): SiteSettings {
  const normalized = normalizeSiteSettings(siteSettings) ?? {};
  const {
    breakpoints: _breakpoints,
    viewports: _viewports,
    viewportBreakpointMap: _viewportBreakpointMap,
    ...sanitized
  } = normalized as SiteSettings & {
    breakpoints?: unknown;
    viewports?: unknown;
    viewportBreakpointMap?: unknown;
  };

  return sanitized;
}

export type {
  AdapterPlatform,
  AdapterCapabilities,
  AdapterInfo,
  AdapterNetworkMetrics,
  AdapterStorageMetrics,
  AdapterDeploymentMetrics,
  AdapterMetrics,
} from "./adapterMetricsSchemas";

export {
  AdapterPlatformSchema,
  AdapterCapabilitiesSchema,
  AdapterInfoSchema,
  AdapterNetworkMetricsSchema,
  AdapterStorageMetricsSchema,
  AdapterDeploymentMetricsSchema,
  AdapterMetricsSchema,
} from "./adapterMetricsSchemas";

export const ContentMutationKindSchema = z.enum([
  "save-page",
  "delete-page",
  "save-layout",
  "delete-layout",
  "save-component",
  "delete-component",
  "save-styles",
  "save-site-settings",
  "save-order",
  "save-snapshot",
  "delete-snapshot",
  "save-page-metadata",
  "push",
  "pull",
  "seed",
  "migrate-json",
  "redirect-create",
  "redirect-update",
  "redirect-delete",
  "redirect-flatten",
  "redirect-import-csv",
  "cms-collection-create",
  "cms-collection-update",
  "cms-collection-delete",
  "cms-entry-create",
  "cms-entry-update",
  "cms-entry-delete",
  "cms-entry-publish",
  "cms-entry-unpublish",
  "cms-entry-archive",
  "cms-revision-restore",
  "cms-release-launch",
  "media-replace",
]);

export type ContentMutationKind = z.infer<typeof ContentMutationKindSchema>;

/**
 * Actor context passed into storage saves. Optional at
 * the storage boundary (nullable columns when omitted).
 */
export const AuthorshipSaveContextSchema = z
  .object({
    actor: ActorRefSchema,
    mutationKind: ContentMutationKindSchema.optional(),
  })
  .strict();

export type AuthorshipSaveContext = z.infer<typeof AuthorshipSaveContextSchema>;

/** Options for publishPageDSL. */
export const PagePublicationDependenciesSchema: z.ZodType<PagePublicationDependencies> =
  z
    .object({
      layout: z
        .object({
          id: z.string().trim().min(1),
          version: z.string().trim().min(1),
        })
        .strict()
        .optional(),
      components: z.record(z.string().trim().min(1), z.string().trim().min(1)),
    })
    .strict();

export const PublishPageOptionsSchema = z
  .object({
    expectedVersion: z.string().trim().min(1).optional(),
    scheduleLeaseToken: z.string().trim().min(1).optional(),
    versionHint: z.string().trim().min(1).optional(),
    activityMetadata: z.string().optional(),
    compilerMetadata: z.custom<AriaCompilerMetadata>().optional(),
    dependencies: PagePublicationDependenciesSchema.optional(),
    invalidationJob: CacheInvalidationJobSchema.optional(),
  })
  .strict();

export type PublishPageOptions = z.infer<typeof PublishPageOptionsSchema>;

export const UnpublishPageOptionsSchema = z
  .object({ invalidationJob: CacheInvalidationJobSchema.optional() })
  .strict();
export type UnpublishPageOptions = z.infer<typeof UnpublishPageOptionsSchema>;

export type LinkedLayoutDraftSave = {
  id: string;
  dsl: LayoutDSL;
  expectedVersion: string;
};

export type PageSaveOptions = VersionSaveOptions & {
  linkedLayoutDraft?: LinkedLayoutDraftSave;
};

export const SchedulePageOptionsSchema = z
  .object({
    expectedVersion: z.string().trim().min(1).optional(),
    versionHint: z.string().trim().min(1).optional(),
    activityMetadata: z.string().optional(),
    compilerMetadata: z.custom<AriaCompilerMetadata>().optional(),
  })
  .strict();

export type SchedulePageOptions = z.infer<typeof SchedulePageOptionsSchema>;

export const ContentSiteStateSchema = z.object({
  scope: z.string().min(1).default("default"),
  currentRevisionId: z.string().min(1),
  revisionSeq: z.int().nonnegative(),
  contentDigest: z.string().optional(),
  updatedAt: z.string().min(1),
  updatedBy: z.string().optional(),
  lastMutationKind: ContentMutationKindSchema,
  lastMutationTarget: z.string().optional(),
  schemaVersion: z.string().optional(),
});

export type ContentSiteState = z.infer<typeof ContentSiteStateSchema>;

export const PageActivityPageRequestSchema = z
  .object({
    pageId: z.string().trim().min(1),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
  })
  .strict();

export type PageActivityPageRequest = z.infer<
  typeof PageActivityPageRequestSchema
>;

export const PageActivityPageSchema = z
  .object({
    items: z.array(PageVersionAuthorshipEntrySchema),
    total: z.number().int().nonnegative(),
  })
  .strict();

export type PageActivityPage = z.infer<typeof PageActivityPageSchema>;

export const StoredStudioPresenceSessionSchema =
  StudioPresenceAttachmentSchema.extend({
    expiresAt: z.number().int().nonnegative(),
  }).strict();

export type StoredStudioPresenceSession = z.infer<
  typeof StoredStudioPresenceSessionSchema
>;

export interface TouchContentRevisionInput {
  scope?: string;
  updatedBy?: string;
  mutationKind: ContentMutationKind;
  mutationTarget?: string;
  timestamp?: string;
  contentDigest?: string;
  schemaVersion?: string;
}

export interface StoredThumbnailAsset {
  buffer: Buffer;
  contentType: string;
}

export const StoredMediaUsageKindSchema = z.enum([
  "page",
  "layout",
  "component",
  "cms-entry",
  "page-locale",
  "layout-locale",
  "site-settings",
  "design-system",
]);

export type StoredMediaUsageKind = z.infer<typeof StoredMediaUsageKindSchema>;

export const StoredMediaUsageSchema = z.object({
  kind: StoredMediaUsageKindSchema,
  refId: z.string().min(1),
  refPath: z.string().nullable(),
});

export type StoredMediaUsage = z.infer<typeof StoredMediaUsageSchema>;

export const StoredPageSystemRoleSchema = z.enum([
  "standard",
  "not-found",
  "cms-collection",
  "cms-entry",
]);

export type StoredPageSystemRole = z.infer<typeof StoredPageSystemRoleSchema>;

export const StoredPageAccessModeSchema = z.enum([
  "public",
  "password",
  "private",
  "unlisted",
]);

export type StoredPageAccessMode = z.infer<typeof StoredPageAccessModeSchema>;

export const StoredPagePolicySchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    systemRole: StoredPageSystemRoleSchema,
    accessMode: StoredPageAccessModeSchema,
    accessPasswordHash: z.string().trim().min(1).nullable(),
    accessPromptTitle: z.string().trim().min(1).nullable(),
    accessPromptDescription: z.string().trim().min(1).nullable(),
    accessRememberForDays: z.int().min(1).max(30).nullable(),
    accessPolicyVersion: z.int().positive(),
    publishedVersion: z.string().trim().min(1).nullable(),
    updatedAt: z.string().trim().min(1),
  })
  .strict();

export type StoredPagePolicy = z.infer<typeof StoredPagePolicySchema>;

export const StoredPagePolicySummarySchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    systemRole: StoredPageSystemRoleSchema,
    accessMode: StoredPageAccessModeSchema,
    hasPassword: z.boolean(),
  })
  .strict();

export type StoredPagePolicySummary = z.infer<
  typeof StoredPagePolicySummarySchema
>;

export const StoredPagePolicyUpdateSchema = z
  .object({
    idOrSlug: z.string().trim().min(1),
    systemRole: StoredPageSystemRoleSchema,
    accessMode: StoredPageAccessModeSchema,
    accessPasswordHash: z.string().trim().min(1).nullable(),
    accessPromptTitle: z.string().trim().min(1).nullable(),
    accessPromptDescription: z.string().trim().min(1).nullable(),
    accessRememberForDays: z.int().min(1).max(30).nullable(),
    accessPolicyVersion: z.int().positive(),
    updatedAt: z.string().trim().min(1).optional(),
  })
  .strict();

export type StoredPagePolicyUpdate = z.infer<
  typeof StoredPagePolicyUpdateSchema
>;

export const StoredPageAccessSessionSchema = z
  .object({
    tokenHash: z.string().trim().min(1),
    pageId: z.string().trim().min(1),
    policyVersion: z.int().positive(),
    expiresAt: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    lastUsedAt: z.string().trim().min(1),
  })
  .strict();

export type StoredPageAccessSession = z.infer<
  typeof StoredPageAccessSessionSchema
>;

export const CreateStoredPageAccessSessionInputSchema = z
  .object({
    tokenHash: z.string().trim().min(1),
    pageId: z.string().trim().min(1),
    policyVersion: z.int().positive(),
    expiresAt: z.string().trim().min(1),
    createdAt: z.string().trim().min(1).optional(),
    lastUsedAt: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateStoredPageAccessSessionInput = z.infer<
  typeof CreateStoredPageAccessSessionInputSchema
>;

export type PageInventoryItem = {
  id: string;
  slug: string | null;
  title: string;
  status: "draft" | "published" | "scheduled" | "archived";
  isModifiedSincePublish: boolean;
  parent?: string | null;
  layout?: string | null;
  systemRole: StoredPageSystemRole;
  accessMode: "public" | "password" | "private" | "unlisted";
  hasPassword: boolean;
  featuredImage?: { src: string; alt?: string; caption?: string } | null;
  description?: string | null;
  updatedAt?: string;
  scheduledFor?: string | null;
  authorship?: PageInventoryAuthorship;
};

export type CmsEntryMutationCommitInput = {
  record: AriaEntryRecord;
  expectedVersion?: string;
  relations?: AriaEntryRecord["relations"];
  replaceLocales?: boolean;
  revision: AriaEntryRevision;
  auditEvent: CmsAuditEvent;
  api?: ApiEntryMutationCommit;
  integrationEvent?: import("../integrations/events").IntegrationEventCommit;
};

export interface StorageAdapter {
  // Pages (New DSL Format)
  getPageDSL(id: string, version?: string): Promise<PageDSL | null>;
  getPublishedPageDSL(id: string, version?: string): Promise<PageDSL | null>;
  /** Canonical current-state authorship derived from version rows. */
  getPageAuthorship(idOrSlug: string): Promise<AssetAuthorship | null>;
  /**
   * Optional authorship stamps version-row actors on INSERT.
   * Required from Astro actions.
   */
  savePageDSL(
    id: string,
    dsl: PageDSL,
    options?: PageSaveOptions,
    authorship?: AuthorshipSaveContext,
  ): Promise<string>; // Returns version string
  publishPageDSL(
    id: string,
    authorship?: AuthorshipSaveContext,
    options?: PublishPageOptions,
  ): Promise<string | null>;
  schedulePageDSL(
    id: string,
    scheduledFor: string,
    authorship?: AuthorshipSaveContext,
    options?: SchedulePageOptions,
  ): Promise<string | null>;
  unpublishPageDSL(id: string, options?: UnpublishPageOptions): Promise<void>;
  archivePageDSL(id: string): Promise<void>;
  unarchivePageDSL(id: string): Promise<void>;
  listPagesDSL(opts?: {
    limit?: number;
    offset?: number;
    status?: "draft" | "published" | "scheduled" | "archived";
  }): Promise<PageInventoryItem[]>;
  getPagePolicy(idOrSlug: string): Promise<StoredPagePolicy | null>;
  getPagePolicyBySystemRole(
    systemRole: StoredPageSystemRole,
  ): Promise<StoredPagePolicy | null>;
  savePagePolicy(
    input: StoredPagePolicyUpdate,
  ): Promise<StoredPagePolicy | null>;
  listPagePolicySummaries(): Promise<StoredPagePolicySummary[]>;
  createPageAccessSession(
    input: CreateStoredPageAccessSessionInput,
  ): Promise<StoredPageAccessSession>;
  getPageAccessSession(
    pageId: string,
    tokenHash: string,
  ): Promise<StoredPageAccessSession | null>;
  touchPageAccessSession(tokenHash: string, lastUsedAt?: string): Promise<void>;
  deletePageAccessSession(tokenHash: string): Promise<void>;
  deletePageAccessSessionsForPage(pageId: string): Promise<void>;
  getPageVersions(id: string): Promise<PageVersionAuthorshipEntry[]>;
  getPageActivityPage(
    request: PageActivityPageRequest,
  ): Promise<PageActivityPage>;
  getPageVersionPins(idOrSlug: string): Promise<{
    draftVersion: string | null;
    publishedVersion: string | null;
    currentVersion: string;
  } | null>;
  deletePageVersion(pageIdOrSlug: string, version: string): Promise<void>;

  // Site localization (Phase 34). Locale records are deliberately separate
  // from the canonical page/layout state so draft and published translations
  // can evolve independently while their source version remains pinned.
  getPageLocaleMeta(
    pageId: string,
    locale: string,
  ): Promise<PageLocaleMeta | null>;
  getPageLocaleVersion(
    pageId: string,
    locale: string,
    version: string,
  ): Promise<PageLocaleVersion | null>;
  getPageLocaleRoute(
    pageId: string,
    locale: string,
  ): Promise<LocalizedRoute | null>;
  savePageLocaleDraft(input: {
    version: PageLocaleVersion;
    expectedCurrentVersion?: string | null;
    updatedAt: string;
    route?: Pick<LocalizedRoute, "pathname" | "pathnameKey"> | null;
    /** Draft-only descendant moves that must commit with the parent draft. */
    draftRouteMoves?: ReadonlyArray<{
      pageId: string;
      route: Pick<LocalizedRoute, "pathname" | "pathnameKey">;
    }>;
  }): Promise<PageLocaleMeta>;
  publishPageLocaleDraft(input: {
    pageId: string;
    locale: string;
    expectedCurrentVersion: string;
    publishedAt: string;
    requiresRoute?: boolean;
    /** Published descendant claims promoted with a parent route publication. */
    publishedRouteMoves?: ReadonlyArray<{
      pageId: string;
      pathnameKey: string;
    }>;
    invalidationJob?: CacheInvalidationJob;
  }): Promise<PageLocaleMeta>;
  unpublishPageLocale(input: {
    pageId: string;
    locale: string;
    updatedAt: string;
    invalidationJob?: CacheInvalidationJob;
  }): Promise<PageLocaleMeta | null>;
  deletePageLocale(input: {
    pageId: string;
    locale: string;
    expectedCurrentVersion: string;
  }): Promise<void>;
  resolvePublishedPageLocale(
    locale: string,
    pathnameKey: string,
  ): Promise<{
    meta: PageLocaleMeta;
    version: PageLocaleVersion;
    route: LocalizedRoute;
  } | null>;
  listPublishedPageLocaleRoutes(pageId: string): Promise<LocalizedRoute[]>;
  /** Deterministic, complete records for export/import and endpoint sync. */
  listPageLocaleRecords(options?: {
    limit?: number;
    offset?: number;
  }): Promise<PageLocaleRecord[]>;
  /** Replaces one locale owner atomically after validating all version pointers. */
  replacePageLocaleRecord(record: PageLocaleRecord): Promise<void>;
  /** True once any page/layout translation exists; protects default-locale identity. */
  hasSiteLocalizationRecords(): Promise<boolean>;
  getLayoutLocaleMeta(
    layoutId: string,
    locale: string,
  ): Promise<LayoutLocaleMeta | null>;
  getLayoutLocaleVersion(
    layoutId: string,
    locale: string,
    version: string,
  ): Promise<LayoutLocaleVersion | null>;
  /** Deterministic, complete records for export/import and endpoint sync. */
  listLayoutLocaleRecords(options?: {
    limit?: number;
    offset?: number;
  }): Promise<LayoutLocaleRecord[]>;
  /** Replaces one locale owner atomically after validating all version pointers. */
  replaceLayoutLocaleRecord(record: LayoutLocaleRecord): Promise<void>;
  saveLayoutLocaleDraft(input: {
    version: LayoutLocaleVersion;
    expectedCurrentVersion?: string | null;
    updatedAt: string;
  }): Promise<LayoutLocaleMeta>;
  publishLayoutLocaleDraft(input: {
    layoutId: string;
    locale: string;
    expectedCurrentVersion: string;
    publishedAt: string;
    invalidationJob?: CacheInvalidationJob;
  }): Promise<LayoutLocaleMeta>;
  unpublishLayoutLocale(input: {
    layoutId: string;
    locale: string;
    updatedAt: string;
    invalidationJob?: CacheInvalidationJob;
  }): Promise<LayoutLocaleMeta | null>;
  deleteLayoutLocale(input: {
    layoutId: string;
    locale: string;
    expectedCurrentVersion: string;
  }): Promise<void>;
  acquireLocaleRouteLease(input: {
    locale: string;
    leaseToken: string;
    now: string;
    expiresAt: string;
    updatedAt: string;
  }): Promise<RouteLease | null>;
  releaseLocaleRouteLease(input: {
    locale: string;
    leaseToken: string;
  }): Promise<void>;
  enqueueCacheInvalidationJob(
    job: CacheInvalidationJob,
  ): Promise<CacheInvalidationJob>;
  getCacheInvalidationJob(id: string): Promise<CacheInvalidationJob | null>;
  claimDueCacheInvalidationJobs(input: {
    now: string;
    leaseToken: string;
    leaseExpiresAt: string;
    updatedAt: string;
    limit: number;
    jobId?: string;
    force?: boolean;
  }): Promise<CacheInvalidationJob[]>;
  completeCacheInvalidationJob(input: {
    id: string;
    leaseToken: string;
    completedAt: string;
  }): Promise<void>;
  failCacheInvalidationJob(input: {
    id: string;
    leaseToken: string;
    nextAttemptAt: string;
    updatedAt: string;
    lastError: string;
  }): Promise<void>;

  // Layouts (New DSL Format)
  getLayoutDSL(id: string, version?: string): Promise<LayoutDSL | null>;
  /** Optional authorship on version INSERT. Required from actions. */
  saveLayoutDSL(
    id: string,
    dsl: LayoutDSL,
    options?: VersionSaveOptions,
    authorship?: AuthorshipSaveContext,
  ): Promise<string>; // Returns version string
  listLayoutsDSL(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<LayoutDSL[]>;
  listLayoutVersions(
    id: string,
  ): Promise<Array<{ version: string; createdAt: string }>>;
  getLayoutVersionPins(id: string): Promise<{ currentVersion: string } | null>;

  // Components (New DSL Format)
  getComponentDSL(id: string, version?: string): Promise<ComponentDSL | null>;
  /** Optional authorship on version INSERT. Required from actions. */
  saveComponentDSL(
    id: string,
    dsl: ComponentDSL,
    options?: VersionSaveOptions,
    authorship?: AuthorshipSaveContext,
  ): Promise<string>; // Returns version string
  listComponentsDSL(opts?: {
    limit?: number;
    offset?: number;
    category?: string;
  }): Promise<ComponentDSL[]>;
  listComponentVersions(
    id: string,
  ): Promise<
    Array<{ version: string; createdAt: string; createdBy?: ActorRef }>
  >;
  pruneVersionHistory?(
    input: VersionHistoryPruneRequest,
  ): Promise<VersionHistoryPruneResult>;

  deletePageDSL(id: string): Promise<void>;
  deleteLayoutDSL(id: string): Promise<void>;
  deleteComponentDSL(id: string): Promise<void>;

  getOrder(kind: OrderKind): Promise<string[]>;
  saveOrder(kind: OrderKind, order: string[]): Promise<void>;

  // Snapshots (cached rendered HTML)
  getSnapshot(
    slug: string,
    stage?: "draft" | "published",
  ): Promise<string | null>;
  saveSnapshot(
    slug: string,
    html: string,
    stage?: "draft" | "published",
  ): Promise<void>;
  deleteSnapshot(slug: string, stage?: "draft" | "published"): Promise<void>;

  uploadMedia(file: File): Promise<string>; // Returns URL/path (deprecated, use saveMedia)
  saveMedia(
    path: string,
    buffer: Buffer,
    metadata?: {
      contentType?: string;
      alt?: string;
      [key: string]: unknown;
    },
  ): Promise<string>; // Returns URL
  getMedia(path: string): Promise<Buffer | null>;
  listMedia(folder?: string): Promise<
    Array<{
      path: string;
      url: string;
      size: number;
      contentType?: string;
      createdAt: string;
    }>
  >;
  upsertMediaCatalogAsset(
    input: UpsertUploadedMediaInput,
    authorship?: MediaAssetAuthorshipContext,
  ): Promise<{ mediaId: string; locationId: string; logicalPath: string }>;
  markMediaCatalogAssetDeleted(
    input: MarkDeletedMediaInput,
    authorship?: MediaAssetAuthorshipContext,
  ): Promise<{ found: boolean }>;
  moveMediaCatalogAsset(
    input: MoveMediaInput,
    authorship?: MediaAssetAuthorshipContext,
  ): Promise<{ moved: boolean; logicalPath: string }>;
  listMediaCatalogAssetsByIds(
    mediaIds: readonly string[],
  ): Promise<MediaAssetCatalogListRow[]>;
  listMediaCatalogAssetsByLogicalPaths(
    logicalPaths: readonly string[],
  ): Promise<MediaAssetCatalogListRow[]>;
  syncMediaUsage(input: {
    kind: StoredMediaUsageKind;
    refId: string;
    resource: unknown;
    updatedAt: string;
  }): Promise<{ scanned: number; inserted: number; unresolved: number }>;
  listMediaUsageByLogicalPath(logicalPath: string): Promise<StoredMediaUsage[]>;
  pruneOrphanedMediaUsage(): Promise<void>;
  listMediaTransformVariantCounts(): Promise<Record<string, number>>;
  getMediaTransformState(assetPath: string): Promise<MediaTransformState>;
  getMediaTransformVariant(id: string): Promise<MediaTransformVariant | null>;
  registerMediaSourceVersion(
    input: MediaSourceVersion,
  ): Promise<MediaSourceVersion>;
  relocateMediaSourceVersionObject(
    input: RelocateMediaSourceVersionInput,
  ): Promise<MediaSourceVersion>;
  promoteMediaSourceVersion(
    input: PromoteMediaSourceVersionInput,
  ): Promise<MediaAssetProfile>;
  saveMediaAssetProfile(
    input: SaveMediaAssetProfileInput,
  ): Promise<MediaAssetProfile>;
  saveMediaTransformVariant(
    input: SaveMediaTransformVariantInput,
  ): Promise<MediaTransformVariant>;
  deleteMediaTransformVariant(assetPath: string, id: string): Promise<void>;
  moveMediaTransformState(
    oldAssetPath: string,
    newAssetPath: string,
  ): Promise<void>;
  deleteMediaTransformState(assetPath: string): Promise<void>;
  deleteMedia(path: string): Promise<void>;

  getPageMetadata(slug: string): Promise<JsonObject | null>;
  /** Optional authorship on singleton row. Required from actions. */
  savePageMetadata(
    slug: string,
    meta: JsonObject,
    authorship?: AuthorshipSaveContext,
  ): Promise<void>;

  // Styles & Tokens
  getDesignSystem(): Promise<UniversalDesignSystem | null>;
  getDesignSystemSegments(
    segmentKeys: readonly string[],
  ): Promise<UniversalDesignSystem | null>;
  /** Optional authorship on singleton row. Required from actions. */
  saveDesignSystem(
    data: UniversalDesignSystem,
    authorship?: AuthorshipSaveContext,
  ): Promise<void>;

  getSiteSettings(): Promise<SiteSettings | null>;
  /** Optional authorship on singleton row. Required from actions. */
  saveSiteSettings(
    data: SiteSettings,
    authorship?: AuthorshipSaveContext,
  ): Promise<void>;
  /** Atomically persists policy settings and durable public-cache intent. */
  saveSiteSettingsWithInvalidationJobs(
    data: SiteSettings,
    jobs: readonly CacheInvalidationJob[],
    authorship?: AuthorshipSaveContext,
  ): Promise<void>;

  touchResource(resourceName: string, timestamp?: string): Promise<void>;
  getResourceTouch(resourceName: string): Promise<string | null>;

  getContentSiteState(scope?: string): Promise<ContentSiteState | null>;
  touchContentRevision(
    input: TouchContentRevisionInput,
  ): Promise<ContentSiteState>;
  upsertStudioPresenceSession(
    session: StoredStudioPresenceSession,
  ): Promise<StudioPresenceAttachment | null>;
  listStudioPresenceSessions(now: number): Promise<StudioPresenceAttachment[]>;
  deleteStudioPresenceSession(sessionId: string, userId: string): Promise<void>;

  // Atomic, database-backed rate limiting (shared across Worker instances).
  consumeRateLimit(input: ConsumeRateLimitInput): Promise<RateLimitResult>;

  getThumbnail(
    type: "component" | "layout",
    slug: string,
  ): Promise<string | null>; // Returns URL or null
  readThumbnail(
    type: "component" | "layout",
    slug: string,
  ): Promise<StoredThumbnailAsset | null>;
  saveThumbnail(
    type: "component" | "layout",
    slug: string,
    blob: Blob,
  ): Promise<string>; // Returns URL
  deleteThumbnail(type: "component" | "layout", slug: string): Promise<void>;
  getPageThumbnail(
    pageId: string,
    stage?: "draft" | "published",
  ): Promise<string | null>;
  readPageThumbnail(
    pageId: string,
    stage?: "draft" | "published",
  ): Promise<StoredThumbnailAsset | null>;
  savePageThumbnail(
    pageId: string,
    blob: Blob,
    stage?: "draft" | "published",
  ): Promise<string>;
  deletePageThumbnail(
    pageId: string,
    stage?: "draft" | "published",
  ): Promise<void>;
  /** Component ids with stored default thumbnails. */
  listStoredComponentThumbnailKeys(): Promise<ReadonlySet<string>>;
  /** `${pageId}:${stage}` keys for stored page thumbnails. */
  listStoredPageThumbnailKeys(): Promise<ReadonlySet<string>>;

  // Collections (CMS)
  listCollections(options?: {
    kind?: CollectionKind;
  }): Promise<AriaCollection[]>;
  countEntriesByCollection(
    collectionIds?: readonly string[],
  ): Promise<Record<string, number>>;
  getCollection(idOrName: string): Promise<AriaCollection | null>;
  saveCollection(collection: AriaCollection): Promise<AriaCollection>;
  deleteCollection(id: string): Promise<void>;
  listEntries(params: EntryListParams): Promise<EntryListResult>;
  getEntry(options: {
    collectionId: string;
    idOrSlug: string;
    locale?: string;
    localeFallbacks?: string[];
    /** Return the canonical record with every locale row. */
    includeAllLocales?: boolean;
    includeRelations?: boolean;
  }): Promise<AriaEntryRecord | null>;
  saveEntry(
    record: AriaEntryRecord,
    options?: {
      expectedVersion?: string;
      relations?: AriaEntryRecord["relations"];
      replaceLocales?: boolean;
    },
  ): Promise<AriaEntryRecord>;
  commitCmsEntryMutation(
    input: CmsEntryMutationCommitInput,
  ): Promise<AriaEntryRecord>;
  deleteEntry(collectionId: string, entryId: string): Promise<void>;
  listEntryRevisions(
    entryId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<AriaEntryRevision[]>;
  getEntryRevision(revisionId: string): Promise<AriaEntryRevision | null>;
  saveEntryRevision(revision: AriaEntryRevision): Promise<AriaEntryRevision>;
  listCollectionPermissions(
    collectionId: string,
  ): Promise<AriaCollectionPermission[]>;
  replaceCollectionPermissions(
    collectionId: string,
    permissions: ReadonlyArray<
      Pick<AriaCollectionPermission, "principalId" | "action">
    >,
  ): Promise<void>;
  getCollectionPolicy(collectionId: string): Promise<AriaCollectionPolicy>;
  saveCollectionPolicy(
    policy: AriaCollectionPolicy,
  ): Promise<AriaCollectionPolicy>;
  createPublicComment(comment: PublicComment): Promise<PublicComment>;
  getPublicComment(id: string): Promise<PublicComment | null>;
  getPublicCommentByIdempotency(input: {
    authorId: string;
    entryId: string;
    locale: string;
    idempotencyKey: string;
  }): Promise<PublicComment | null>;
  getPublicCommentSubmissionStats(input: {
    entryId: string;
    locale: string;
    authorId: string;
    body: string;
    after: string;
  }): Promise<{
    authorCount: number;
    entryCount: number;
    hasRecentDuplicateBody: boolean;
  }>;
  reservePublicCommentRateSlot(input: {
    id: string;
    authorId: string;
    entryId: string;
    locale: string;
    idempotencyKey: string;
    createdAt: string;
    windowStart: string;
    authorLimit: number;
    entryLimit: number;
  }): Promise<boolean>;
  anonymizePublicCommentsForDeletedAuthor(authorId: string): Promise<void>;
  prunePublicCommentRateReservations(before: string): Promise<void>;
  getPublicCommentModerationMetrics(input?: {
    collectionId?: string;
  }): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    spam: number;
    deleted: number;
    oldestPendingAt: string | null;
  }>;
  listPublicComments(options: {
    entryId?: string;
    collectionId?: string;
    locale?: string;
    status?: PublicComment["status"];
    limit?: number;
    offset?: number;
  }): Promise<PublicComment[]>;
  moderatePublicComment(input: {
    commentId: string;
    expectedStatus: PublicComment["status"];
    nextStatus: PublicComment["status"];
    actorId: string;
    reasonCode?: string | null;
    event: PublicCommentModerationEvent;
  }): Promise<PublicComment | null>;
  saveCmsEntryAutosave(
    autosave: CmsEntryAutosave,
  ): Promise<CmsEntryAutosave | null>;
  getLatestCmsEntryAutosave(input: {
    entryId: string;
    locale: string;
    actorId: string;
    now: string;
  }): Promise<CmsEntryAutosave | null>;
  pruneCmsEntryAutosaves(now: string): Promise<void>;
  upsertCmsEntryPresenceLease(lease: CmsEntryPresenceLease): Promise<void>;
  listCmsEntryPresenceLeases(input: {
    entryId: string;
    locale: string;
    now: string;
  }): Promise<CmsEntryPresenceLease[]>;
  acquireCmsEntryEditLock(
    input: CmsEntryEditLock & { now: string },
  ): Promise<CmsEntryEditLock | null>;
  releaseCmsEntryEditLock(input: {
    entryId: string;
    locale: string;
    leaseToken: string;
  }): Promise<void>;
  getCmsEntryWorkflow(input: {
    entryId: string;
    locale: string;
  }): Promise<CmsEntryWorkflow | null>;
  saveCmsEntryWorkflow(
    input: CmsEntryWorkflow & {
      expectedState?: CmsEntryWorkflow["state"] | null;
    },
  ): Promise<CmsEntryWorkflow | null>;
  listCmsReviewAnnotations(input: {
    resourceType: CmsReviewAnnotation["resourceType"];
    resourceId: string;
    locale?: string;
    status?: CmsReviewAnnotation["status"];
  }): Promise<CmsReviewAnnotation[]>;
  createCmsReviewAnnotation(
    annotation: CmsReviewAnnotation,
  ): Promise<CmsReviewAnnotation>;
  resolveCmsReviewAnnotation(input: {
    id: string;
    resourceType: CmsReviewAnnotation["resourceType"];
    resourceId: string;
    actorId: string;
    updatedAt: string;
  }): Promise<CmsReviewAnnotation | null>;
  reopenCmsReviewAnnotation(input: {
    id: string;
    resourceType: CmsReviewAnnotation["resourceType"];
    resourceId: string;
    actorId: string;
    updatedAt: string;
  }): Promise<CmsReviewAnnotation | null>;
  appendCmsAuditEvent(event: CmsAuditEvent): Promise<void>;
  listCmsAuditEvents(options?: {
    collectionId?: string;
    entryId?: string;
    limit?: number;
  }): Promise<CmsAuditEvent[]>;
  replaceCmsSearchDocuments(
    documents: ReadonlyArray<CmsSearchDocument>,
  ): Promise<void>;
  deleteCmsSearchDocuments(options: {
    entityType?: CmsSearchDocument["entityType"];
    entityId?: string;
    collectionId?: string;
    locale?: string;
  }): Promise<void>;
  searchCmsSearchDocuments(options: {
    query: string;
    locales: readonly string[];
    limit: number;
  }): Promise<CmsSearchResult[]>;
  getCmsSearchDocumentStats(): Promise<{
    documents: number;
    collections: number;
    entries: number;
    expectedDocuments: number;
    expectedCollections: number;
    expectedEntries: number;
    missingDocuments: number;
    orphanedDocuments: number;
    staleDocuments: number;
    countsByScope: Array<{
      entityType: CmsSearchDocument["entityType"];
      collectionId: string;
      locale: string;
      documents: number;
    }>;
  }>;
  beginCmsSearchScopeRebuild(options: {
    collectionId: string;
    generation: string;
  }): Promise<boolean>;
  writeCmsSearchScopeGeneration(options: {
    collectionId: string;
    generation: string;
    documents: ReadonlyArray<CmsSearchDocument>;
  }): Promise<void>;
  commitCmsSearchScopeRebuild(options: {
    collectionId: string;
    generation: string;
  }): Promise<boolean>;
  abortCmsSearchScopeRebuild(options: {
    collectionId: string;
    generation: string;
  }): Promise<void>;
  cleanupInactiveCmsSearchDocuments(collectionId: string): Promise<void>;

  listWordPressImportBatches(options?: {
    limit?: number;
  }): Promise<WordPressImportBatch[]>;
  getWordPressImportBatch(id: string): Promise<WordPressImportBatch | null>;
  saveWordPressImportBatch(
    batch: WordPressImportBatch,
  ): Promise<WordPressImportBatch>;
  deleteWordPressImportBatch(id: string): Promise<void>;
  saveWordPressImportFile(
    file: WordPressImportFile,
  ): Promise<WordPressImportFile>;
  listWordPressImportFiles(batchId: string): Promise<WordPressImportFile[]>;
  listExpiredWordPressImportFiles(
    nowIso: string,
  ): Promise<WordPressImportFile[]>;
  deleteWordPressImportFile(id: string): Promise<void>;
  saveWordPressImportItem(
    item: WordPressImportItem,
  ): Promise<WordPressImportItem>;
  listWordPressImportItems(batchId: string): Promise<WordPressImportItem[]>;
  saveWordPressImportMapping(
    mapping: WordPressImportMapping,
  ): Promise<WordPressImportMapping>;
  getWordPressImportMapping(options: {
    sourceSiteHash: string;
    sourceKind: string;
    sourceId: string;
  }): Promise<WordPressImportMapping | null>;
  listWordPressImportMappings(
    batchId: string,
  ): Promise<WordPressImportMapping[]>;
  saveWordPressImportMedia(
    media: WordPressImportMedia,
  ): Promise<WordPressImportMedia>;
  listWordPressImportMedia(batchId: string): Promise<WordPressImportMedia[]>;
  appendWordPressImportEvent(
    event: WordPressImportEvent,
  ): Promise<WordPressImportEvent>;
  listWordPressImportEvents(batchId: string): Promise<WordPressImportEvent[]>;

  // Platform identity & metrics (optional — implement per adapter)
  /** Return stable platform identity and capabilities descriptor. */
  getAdapterInfo?(): Promise<AdapterInfo>;
  /** Return live infrastructure metrics. Return null when unsupported. */
  getAdapterMetrics?(): Promise<AdapterMetrics | null>;

  listRedirects(options?: {
    includeDisabled?: boolean;
  }): Promise<RedirectRule[]>;
  getRedirectById(id: string): Promise<RedirectRule | null>;
  createRedirect(
    input: CreateRedirectInput,
    actorId?: string,
  ): Promise<RedirectRule>;
  updateRedirect(input: UpdateRedirectInput): Promise<RedirectRule>;
  deleteRedirect(id: string): Promise<void>;
  appendSettingsAuditEntry(entry: {
    category: "discovery" | "redirects" | "agent" | "security";
    action: string;
    actorId: string;
    actorUsername?: string;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
}
