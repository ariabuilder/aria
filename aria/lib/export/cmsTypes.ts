import { z } from "zod";
import { COLLECTION_KINDS, ENTRY_STATUSES } from "../cms/constants";
import { CollectionSchemaInputSchema } from "../cms/schemas";
import { StructuredTextDocumentSchema } from "../cms/structuredText/schemas";

export const ExportedCollectionKindSchema = z.enum(COLLECTION_KINDS);

export const ExportedCollectionManifestSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    label: z.string().trim().min(1),
    kind: ExportedCollectionKindSchema,
    schema: CollectionSchemaInputSchema,
    urlPattern: z.string().trim().min(1).nullable(),
    templatePageSlug: z.string().trim().min(1).nullable(),
    listPageSlug: z.string().trim().min(1).nullable(),
    exportedAt: z.string().min(1),
    entryCount: z.int().nonnegative(),
  })
  .strict();

export const ExportedEntryRelationSchema = z
  .object({
    fieldKey: z.string().trim().min(1),
    targetCollection: z.string().trim().min(1),
    targetSlug: z.string().trim().min(1),
    position: z.int().nonnegative(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ExportedEntryStatusSchema = z.enum(ENTRY_STATUSES);

export const ExportedEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    status: ExportedEntryStatusSchema,
    slug: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    title: z.string(),
    frontmatter: z.record(z.string(), z.unknown()).default({}),
    body: StructuredTextDocumentSchema.nullable(),
    bodyHtml: z.string().optional(),
    relations: z.array(ExportedEntryRelationSchema).default([]),
    publishedAt: z.string().min(1).nullable(),
    updatedAt: z.string().min(1),
  })
  .strict();

export const SeedManifestSchema = z
  .object({
    version: z.literal(1),
    collections: z.array(z.string().trim().min(1)),
    applyOrder: z.array(z.string().trim().min(1)),
  })
  .strict();

export const CmsExportLocaleFilterSchema = z.union([
  z.literal("all"),
  z.literal("source"),
  z.array(z.string().trim().min(1)).min(1),
]);

export const CmsExportOptionsSchema = z
  .object({
    includeCollections: z.boolean().default(true),
    includeDrafts: z.boolean().default(false),
    locales: CmsExportLocaleFilterSchema.default("source"),
    renderBodiesToHtml: z.boolean().default(false),
    includeStructuredTextRenderer: z.boolean().default(true),
    includeMarkdown: z.boolean().default(true),
    includeMonolithicCmsJson: z.boolean().default(true),
    includeCanonicalJson: z.boolean().default(true),
    includeQueryLib: z.boolean().default(true),
    includeSeedManifest: z.boolean().default(true),
  })
  .strict();

export const SiteExportSectionSchema = z.enum([
  "pages",
  "layouts",
  "components",
  "designSystem",
  "siteSettings",
  "media",
  "cms",
  "redirects",
  "discovery",
  "contentState",
  "pageMetadata",
]);

export const SiteExportMediaModeSchema = z.enum([
  "bundle",
  "omit",
  "manifestOnly",
]);

export const SiteExportPresetSchema = z.enum([
  "full",
  "dataOnly",
  "codeOnly",
  "mediaOnly",
  "custom",
]);

export const SiteExportSectionsOverrideSchema = z
  .object({
    pages: z.boolean().optional(),
    layouts: z.boolean().optional(),
    components: z.boolean().optional(),
    designSystem: z.boolean().optional(),
    siteSettings: z.boolean().optional(),
    media: z.boolean().optional(),
    cms: z.boolean().optional(),
    redirects: z.boolean().optional(),
    discovery: z.boolean().optional(),
    contentState: z.boolean().optional(),
    pageMetadata: z.boolean().optional(),
  })
  .strict();

export const SiteExportSelectionSchema = z
  .object({
    preset: SiteExportPresetSchema.default("full"),
    sections: SiteExportSectionsOverrideSchema.optional(),
    mediaMode: SiteExportMediaModeSchema.default("bundle"),
    cms: CmsExportOptionsSchema.optional(),
  })
  .strict();

export type ExportedCollectionManifest = z.infer<
  typeof ExportedCollectionManifestSchema
>;
export type ExportedEntryRelation = z.infer<typeof ExportedEntryRelationSchema>;
export type ExportedEntry = z.infer<typeof ExportedEntrySchema>;
export type SeedManifest = z.infer<typeof SeedManifestSchema>;
export type CmsExportOptions = z.infer<typeof CmsExportOptionsSchema>;
export type CmsExportLocaleFilter = z.infer<typeof CmsExportLocaleFilterSchema>;
export type SiteExportSection = z.infer<typeof SiteExportSectionSchema>;
export type SiteExportMediaMode = z.infer<typeof SiteExportMediaModeSchema>;
export type SiteExportPreset = z.infer<typeof SiteExportPresetSchema>;
export type SiteExportSelection = z.infer<typeof SiteExportSelectionSchema>;
export type SiteExportSelectionInput = z.input<
  typeof SiteExportSelectionSchema
>;

export type ResolvedSiteExportSections = Record<SiteExportSection, boolean>;

export const SITE_EXPORT_SECTIONS = SiteExportSectionSchema.options;

export type CollectionExportBundle = {
  collectionManifests: Array<{
    path: string;
    manifest: ExportedCollectionManifest;
  }>;
  entryFiles: Array<{ path: string; entry: ExportedEntry }>;
  seedManifest: SeedManifest | null;
  libFiles: Array<{ path: string; content: string }>;
  counts: {
    collections: number;
    entries: number;
    entryJsonFiles: number;
    collectionManifests: number;
    markdownFiles: number;
  };
};

export type CmsExportPayload = {
  collections: import("../cms/schemas").AriaCollection[];
  entries: import("../cms/schemas").AriaEntryRecord[];
};
