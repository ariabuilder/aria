import { z } from "zod";

export const DashboardLiveStatusSchema = z.enum(["live", "offline"]);
export type DashboardLiveStatus = z.infer<typeof DashboardLiveStatusSchema>;

export const DashboardPublicationStatusSchema = z.enum([
  "draft",
  "published",
  "scheduled",
  "archived",
]);
export type DashboardPublicationStatus = z.infer<
  typeof DashboardPublicationStatusSchema
>;

export const VisitSiteUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid site URL");

export type VisitSiteUrl = z.infer<typeof VisitSiteUrlSchema>;

export const AdapterMetricsLayoutSchema = z.enum(["stack", "split"]);
export type AdapterMetricsLayout = z.infer<typeof AdapterMetricsLayoutSchema>;

export const VISIT_SITE_FALLBACK_URL = "/" as const;

export function resolveDashboardSiteTitle(input: {
  siteName: string;
  isReady: boolean;
  ssrSiteName?: string;
}): string {
  if (!input.isReady && input.ssrSiteName) return input.ssrSiteName;
  const name = input.siteName.trim();
  return name || "Aria Builder";
}

export function parseVisitSiteUrl(
  rawUrl: string | undefined,
): VisitSiteUrl | typeof VISIT_SITE_FALLBACK_URL {
  const trimmed = rawUrl?.trim() ?? "";
  if (!trimmed) {
    return VISIT_SITE_FALLBACK_URL;
  }

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  const parsed = VisitSiteUrlSchema.safeParse(withProtocol);
  return parsed.success ? parsed.data : VISIT_SITE_FALLBACK_URL;
}

export const SiteUniverseNodeRoleSchema = z.enum(["home", "page", "system"]);
export type SiteUniverseNodeRole = z.infer<typeof SiteUniverseNodeRoleSchema>;

export const SiteUniverseAttentionSchema = z.enum(["none", "warning", "error"]);
export type SiteUniverseAttention = z.infer<typeof SiteUniverseAttentionSchema>;

export const SiteUniverseNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: DashboardPublicationStatusSchema,
  role: SiteUniverseNodeRoleSchema,
  depth: z.int().nonnegative(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  size: z.number().positive(),
  attention: SiteUniverseAttentionSchema,
  lastEditedAt: z.iso.datetime().nullable(),
  isRecent: z.boolean(),
});
export type SiteUniverseNode = z.infer<typeof SiteUniverseNodeSchema>;

export const SiteUniverseEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  path: z.string().min(1),
  durationMs: z.int().positive(),
  delayMs: z.int().nonnegative(),
  opacity: z.number().min(0).max(1),
  motion: z.enum(["still", "drift", "pulse"]).default("still"),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  hasPacket: z.boolean().default(false),
});
export type SiteUniverseEdge = z.infer<typeof SiteUniverseEdgeSchema>;

export const SiteUniverseSatelliteSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  title: z.string().min(1),
  source: z.enum(["custom", "aria"]),
  band: z.enum(["near", "far"]),
  orbitCenterX: z.number().min(0).max(100),
  orbitCenterY: z.number().min(0).max(100),
  orbitRadiusPx: z.number().min(60).max(180),
  orbitAngleDeg: z.number().min(0).max(359),
  durationMs: z.int().min(24_000).max(72_000),
  phaseMs: z.int().nonnegative(),
  size: z.number().positive(),
});
export type SiteUniverseSatellite = z.infer<typeof SiteUniverseSatelliteSchema>;

export const SiteUniverseCmsEntrySchema = z.object({
  id: z.string().min(1),
  collectionId: z.string().min(1),
  collectionName: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  locale: z.string().min(1),
  status: DashboardPublicationStatusSchema,
  updatedAt: z.string().min(1),
  orbitAngleDeg: z.number().min(0).max(359),
  orbitRadiusPx: z.number().min(28).max(84),
  durationMs: z.int().min(18_000).max(32_000),
  phaseMs: z.int().nonnegative(),
  size: z.number().positive(),
});
export type SiteUniverseCmsEntry = z.infer<typeof SiteUniverseCmsEntrySchema>;

export const SiteUniverseCmsSystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  label: z.string().min(1),
  kind: z.string().min(1),
  itemCount: z.int().nonnegative(),
  orbitStartPercent: z.number().min(0).max(100),
  durationMs: z.int().min(70_000).max(110_000),
  phaseMs: z.int().nonnegative(),
  entries: z.array(SiteUniverseCmsEntrySchema).max(6),
});
export type SiteUniverseCmsSystem = z.infer<typeof SiteUniverseCmsSystemSchema>;

export const SiteUniverseFocusSourceSchema = z.enum(["node", "stream"]);
export type SiteUniverseFocusSource = z.infer<
  typeof SiteUniverseFocusSourceSchema
>;

export const SiteUniverseFocusSchema = z.object({
  source: SiteUniverseFocusSourceSchema,
  slug: z.string().trim().min(1),
});

export const SiteUniverseSchema = z.object({
  nodes: z.array(SiteUniverseNodeSchema),
  edges: z.array(SiteUniverseEdgeSchema),
  satellites: z.array(SiteUniverseSatelliteSchema).default([]),
  cmsSystems: z.array(SiteUniverseCmsSystemSchema).max(8).default([]),
});
export type SiteUniverse = z.infer<typeof SiteUniverseSchema>;

export const ContinueWorkingItemSchema = z.object({
  pageId: z.string().min(1),
  pageTitle: z.string().min(1),
  pageSlug: z.string().min(1),
  pageStatus: DashboardPublicationStatusSchema,
  thumbnailUrl: z.string().optional(),
  snapshotUrl: z.string().optional(),
  lastEditedAt: z.iso.datetime().nullable(),
});
export type ContinueWorkingItem = z.infer<typeof ContinueWorkingItemSchema>;
