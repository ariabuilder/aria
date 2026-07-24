import { z } from "zod";
import { SEOMetadataSchema } from "../schemas/nodes";
import {
  StoredPageAccessModeSchema,
  StoredPageSystemRoleSchema,
} from "../storage/adapter";

export const DISCOVERY_SITEMAP_CUSTOM_MAX_BYTES = 1_048_576;
export const DISCOVERY_ROBOTS_CUSTOM_MAX_BYTES = 65_536;
export const DISCOVERY_LLMS_CUSTOM_MAX_BYTES = 65_536;

export const DiscoverySitemapModeSchema = z.enum(["auto", "custom", "off"]);
export type DiscoverySitemapMode = z.infer<typeof DiscoverySitemapModeSchema>;

export const DiscoveryRobotsModeSchema = z.enum(["auto", "custom"]);
export type DiscoveryRobotsMode = z.infer<typeof DiscoveryRobotsModeSchema>;

export const DiscoveryLlmsModeSchema = z.enum(["auto", "custom", "off"]);
export type DiscoveryLlmsMode = z.infer<typeof DiscoveryLlmsModeSchema>;

export const TrailingSlashPolicySchema = z.enum(["strip", "add", "none"]);
export type TrailingSlashPolicy = z.infer<typeof TrailingSlashPolicySchema>;

export const PageSeoForDiscoverySchema = SEOMetadataSchema;

export const PageForDiscoverySchema = z
  .object({
    id: z.string().min(1),
    slug: z.string(),
    parent: z.string().nullable().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["draft", "published", "archived"]),
    systemRole: StoredPageSystemRoleSchema,
    accessMode: StoredPageAccessModeSchema,
    updatedAt: z.string().optional(),
    publishedAt: z.string().nullable().optional(),
    settings: z
      .looseObject({
        seo: PageSeoForDiscoverySchema.optional(),
      })
      .optional(),
  })
  .strict();

export type PageForDiscovery = z.infer<typeof PageForDiscoverySchema>;

/** A published non-default page route backed by one immutable locale version. */
export const LocalizedPageForDiscoverySchema = z
  .object({
    pageId: z.string().min(1),
    locale: z.string().min(2),
    pathname: z.string().startsWith("/"),
    publishedAt: z.string(),
    noindex: z.boolean(),
  })
  .strict();
export type LocalizedPageForDiscovery = z.infer<
  typeof LocalizedPageForDiscoverySchema
>;

export const DiscoverableCmsEntrySchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    /** Explicit public locale variant; absent only for legacy callers. */
    locale: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1),
    pathname: z.string().trim().min(1),
    updatedAt: z.string().optional(),
    publishedAt: z.string().nullable().optional(),
  })
  .strict();

export type DiscoverableCmsEntry = z.infer<typeof DiscoverableCmsEntrySchema>;

export const LocalizedCollectionFeedItemSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    link: z.url(),
    description: z.string().max(16_000).optional(),
    publishedAt: z.string().min(1).nullable(),
    updatedAt: z.string().min(1),
  })
  .strict();
export type LocalizedCollectionFeedItem = z.infer<
  typeof LocalizedCollectionFeedItemSchema
>;

export const LocalizedCollectionFeedSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().max(2_000).optional(),
    link: z.url(),
    updatedAt: z.string().min(1),
    items: z.array(LocalizedCollectionFeedItemSchema).max(100),
  })
  .strict();
export type LocalizedCollectionFeed = z.infer<typeof LocalizedCollectionFeedSchema>;

export function parseDiscoverableCmsEntry(input: unknown): DiscoverableCmsEntry {
  return DiscoverableCmsEntrySchema.parse(input);
}

export function parsePageForDiscovery(input: unknown): PageForDiscovery {
  return PageForDiscoverySchema.parse(input);
}

export const ExclusionReasonSchema = z.enum([
  "included",
  "draft",
  "archived",
  "not-found",
  "cms-entry",
  "password",
  "private",
  "unlisted",
  "noindex",
]);

export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

export const DiscoverySettingsSchema = z
  .object({
    sitemapMode: DiscoverySitemapModeSchema.default("auto"),
    sitemapCustom: z.string().max(DISCOVERY_SITEMAP_CUSTOM_MAX_BYTES).optional(),
    robotsMode: DiscoveryRobotsModeSchema.default("auto"),
    robotsCustom: z.string().max(DISCOVERY_ROBOTS_CUSTOM_MAX_BYTES).optional(),
    includeSitemapInRobots: z.boolean().default(true),
    llmsMode: DiscoveryLlmsModeSchema.default("auto"),
    llmsCustom: z.string().max(DISCOVERY_LLMS_CUSTOM_MAX_BYTES).optional(),
    discourageSearchEngines: z.boolean().default(false),
    googleSiteVerification: z.string().max(256).optional(),
    bingSiteVerification: z.string().max(256).optional(),
    trailingSlashPolicy: TrailingSlashPolicySchema.default("strip"),
    sitemapPingOnPublish: z.boolean().default(false),
    llmsAiPolicy: z.string().max(4096).optional(),
    aiBotPolicy: z.enum(["allow-all", "block-training", "custom"]).optional(),
  })
  .strict();

export type DiscoverySettings = z.infer<typeof DiscoverySettingsSchema>;

export function parseDiscoverySettings(input: unknown): DiscoverySettings {
  return DiscoverySettingsSchema.parse(input);
}

export function mergeDiscoverySettings(
  current: DiscoverySettings | undefined,
  patch: Partial<DiscoverySettings>,
): DiscoverySettings {
  const base = DiscoverySettingsSchema.parse(current ?? {});
  return DiscoverySettingsSchema.parse({ ...base, ...patch });
}

export const DiscoveryArtifactsSchema = z
  .object({
    robots: z.string(),
    sitemap: z.string().nullable(),
    llms: z.string().nullable(),
    generatedAt: z.string(),
  })
  .strict();

export type DiscoveryArtifacts = z.infer<typeof DiscoveryArtifactsSchema>;

export const DiscoveryGeneratedBaselineSchema = z
  .object({
    artifact: z.enum(["robots", "sitemap", "llms"]),
    content: z.string().nullable(),
    generatedAt: z.string(),
  })
  .strict();

export type DiscoveryGeneratedBaseline = z.infer<
  typeof DiscoveryGeneratedBaselineSchema
>;

export const DiscoveryReportRowSchema = z
  .object({
    pageId: z.string().min(1),
    slug: z.string(),
    title: z.string(),
    publicPath: z.string(),
    absoluteUrl: z.string().optional(),
    inSitemap: z.boolean(),
    inLlms: z.boolean(),
    canonicalOk: z.boolean(),
    exclusionReason: ExclusionReasonSchema,
    hasActiveRedirect: z.boolean().optional(),
  })
  .strict();

export type DiscoveryReportRow = z.infer<typeof DiscoveryReportRowSchema>;

export const SiteSeoAuditSchema = z
  .object({
    id: z.string().min(1),
    severity: z.enum(["warning", "error"]),
    message: z.string().min(1),
    pageIds: z.array(z.string()).optional(),
  })
  .strict();

export type SiteSeoAudit = z.infer<typeof SiteSeoAuditSchema>;

export const SiteHealthCheckSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(["pass", "warning", "error"]),
    message: z.string().optional(),
  })
  .strict();

export type SiteHealthCheck = z.infer<typeof SiteHealthCheckSchema>;

export const SiteHealthSummarySchema = z
  .object({
    score: z.int().min(0).max(100),
    checks: z.array(SiteHealthCheckSchema),
  })
  .strict();

export type SiteHealthSummary = z.infer<typeof SiteHealthSummarySchema>;

export const DiscoveryReportSchema = z
  .object({
    generatedAt: z.string(),
    siteUrl: z.string().optional(),
    /** Authoritative discovery settings used to build this report (same DB read as health). */
    discoverySettings: DiscoverySettingsSchema,
    rows: z.array(DiscoveryReportRowSchema),
    audits: z.array(SiteSeoAuditSchema),
    health: SiteHealthSummarySchema,
  })
  .strict();

export type DiscoveryReport = z.infer<typeof DiscoveryReportSchema>;

export function parseDiscoveryReport(input: unknown): DiscoveryReport {
  return DiscoveryReportSchema.parse(input);
}
