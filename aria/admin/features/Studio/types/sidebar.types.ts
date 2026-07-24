/**
 * Type definitions for the contextual right sidebar in Studio mode.
 * Each Studio section can display different panels with relevant information.
 */

import { z } from "zod";
import type { FunctionalComponent } from "vue";
import type { StudioSection } from "./index";

/**
 * Deployment status values
 */
export const DeploymentStatusSchema = z.enum([
  "ready",
  "building",
  "queued",
  "failed",
  "canceled",
]);

/**
 * Single deployment entry
 */
export const DeploymentSchema = z.object({
  id: z.string(),
  message: z.string(),
  project: z.string(),
  branch: z.string(),
  status: DeploymentStatusSchema,
  timestamp: z.iso.datetime(),
  duration: z.number().optional(), // Build duration in seconds
  url: z.url().optional(), // Preview URL
  commit: z.string().optional(), // Git commit hash (short)
});

/**
 * Deployments list response
 */
export const DeploymentsResponseSchema = z.object({
  deployments: z.array(DeploymentSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

/**
 * Documentation link
 */
export const DocLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  href: z.string(),
  icon: z.string().optional(), // Lucide icon name
});

/**
 * Getting started step
 */
export const OnboardingStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  completed: z.boolean(),
  href: z.string().optional(),
});

/**
 * What's new / changelog entry
 */
export const ChangelogEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  date: z.string(), // ISO date string
  type: z.enum(["feature", "improvement", "fix"]).optional(),
});

export const ResourcesPanelDataSchema = z.object({
  onboarding: z.object({
    steps: z.array(OnboardingStepSchema),
    progress: z.number().min(0).max(100),
  }),
  docs: z.array(DocLinkSchema),
  changelog: z.array(ChangelogEntrySchema),
});

/**
 * Page status values
 */
export const PageStatusSchema = z.enum(["published", "draft", "archived"]);

/**
 * SEO metadata
 */
export const SeoMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  ogImage: z.string().optional(),
  noIndex: z.boolean().optional(),
  noFollow: z.boolean().optional(),
  canonical: z.string().optional(),
});

export const PageLayoutInfoSchema = z.object({
  slug: z.string().nullable(),
  name: z.string().nullable(),
  hasHeader: z.boolean(),
  hasFooter: z.boolean(),
});

export const FrontmatterFieldSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  type: z.enum(["string", "number", "boolean", "array", "object", "date"]),
});

/**
 * Page metadata for the sidebar panel
 */
export const PageMetaDataSchema = z.object({
  slug: z.string(),
  title: z.string(),
  path: z.string(),
  status: PageStatusSchema,
  layout: PageLayoutInfoSchema,
  seo: SeoMetaSchema,
  frontmatter: z.array(FrontmatterFieldSchema),
  updatedAt: z.string().optional(),
  createdAt: z.string().optional(),
  wordCount: z.number().optional(),
  blockCount: z.number().optional(),
});

export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;
export type Deployment = z.infer<typeof DeploymentSchema>;
export type DeploymentsResponse = z.infer<typeof DeploymentsResponseSchema>;
export type DocLink = z.infer<typeof DocLinkSchema>;
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;
export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;
export type ResourcesPanelData = z.infer<typeof ResourcesPanelDataSchema>;

export type PageStatus = z.infer<typeof PageStatusSchema>;
export type SeoMeta = z.infer<typeof SeoMetaSchema>;
export type PageLayoutInfo = z.infer<typeof PageLayoutInfoSchema>;
export type FrontmatterField = z.infer<typeof FrontmatterFieldSchema>;
export type PageMetaData = z.infer<typeof PageMetaDataSchema>;

export type LucideIcon = FunctionalComponent<Record<string, unknown>>;

export type StudioSidebarPanel =
  | "resources" // Getting started, docs, changelog
  | "deployments" // Recent deployments
  | "page-meta" // Page metadata (SEO, settings)
  | "layout-config" // Layout configuration
  | "component-info" // Component props/usage
  | "media-details"; // Media file details

/**
 * Panel configuration
 */
export interface StudioSidebarPanelConfig {
  id: StudioSidebarPanel;
  title: string;
  icon?: LucideIcon;
  /** Which studio sections show this panel */
  sections: StudioSection[];
}

export interface StudioRightSidebarProps {
  currentSection: StudioSection;
  isOpen?: boolean;
}

export interface StudioRightSidebarEmits {
  (e: "navigate-to", section: StudioSection): void;
  (e: "open-link", href: string): void;
}

export interface ResourcesPanelProps {
  /** Initial data (optional, will fetch if not provided) */
  initialData?: ResourcesPanelData;
}

export interface RecentDeploymentsPanelProps {
  /** Max deployments to show */
  limit?: number;
  /** Initial data (optional, will fetch if not provided) */
  initialData?: Deployment[];
}

/**
 * Map studio sections to their sidebar panels
 *
 * Pages get the dedicated page-meta panel.
 * Default: resources + deployments for sections without dedicated panels yet.
 */
export const SECTION_PANELS: Record<StudioSection, StudioSidebarPanel[]> = {
  // Dashboard - resources + deployments
  dashboard: ["resources", "deployments"],

  // Pages - dedicated page meta panel
  pages: ["page-meta"],

  // Other main views - resources + deployments (default)
  layouts: ["resources", "deployments"],
  components: ["resources", "deployments"],
  media: ["resources", "deployments"],
  collections: ["resources", "deployments"],

  design: ["resources", "deployments"],

  // Settings & config
  settings: ["resources", "deployments"],
};
