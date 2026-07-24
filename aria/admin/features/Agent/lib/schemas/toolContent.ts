import { z } from "zod";
import {
ArchiveEntryRequestSchema,
ClearCollectionTemplateRequestSchema,
DeleteCollectionRequestSchema,
DeleteEntryRequestSchema,
DuplicateEntryRequestSchema,
GetCollectionRequestSchema,
GetEntryRequestSchema,
GetRevisionRequestSchema,
ListCollectionsRequestSchema,
ListEntriesResponseSchema,
ListRevisionsRequestSchema,
ListRevisionsResponseSchema,
PublishEntryRequestSchema,
RestoreRevisionRequestSchema,
SetCollectionTemplateRequestSchema,
UnpublishEntryRequestSchema,
} from "../../../../../lib/cms/actionSchemas";
import {
AriaCollectionSchema,
AriaEntryRecordSchema,
AriaEntryRevisionSchema,
CreateCollectionRequestSchema,
CreateEntryRequestSchema,
EntryListRequestSchema,
EntryQueryRequestSchema,
UpdateCollectionRequestSchema,
UpdateEntryRequestSchema,
} from "../../../../../lib/cms/schemas";
import { NodeMotionSchema } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import {
GlobalStylesConfigSchema,
UniversalBreakpointItemSchema,
} from "../../../../../lib/styles/universalDesignSystem";

import { AgentShellContextSchema } from "./chat";

export const AriaGetCmsInventoryInputSchema = z
  .object({
    includeEntries: z.boolean().default(false),
    entryLimitPerCollection: z.int().min(1).max(50).default(10),
  })
  .strict();

export const AriaGetCmsInventoryOutputSchema = z
  .object({
    collections: z.array(
      z.object({
        collection: AriaCollectionSchema,
        entryCount: z.int().nonnegative(),
        fields: z.array(z.record(z.string(), z.unknown())),
        relationFields: z.array(z.record(z.string(), z.unknown())),
        routing: z.record(z.string(), z.unknown()),
        entries: z.array(AriaEntryRecordSchema).optional(),
      }),
    ),
    fieldGraph: z.array(z.record(z.string(), z.unknown())),
    relationGraph: z.array(z.record(z.string(), z.unknown())),
    pageUsages: z.record(
      z.string(),
      z.array(z.record(z.string(), z.unknown())),
    ),
  })
  .strict();

export const AriaListCollectionsInputSchema = ListCollectionsRequestSchema;
export const AriaGetCollectionInputSchema = GetCollectionRequestSchema;
export const AriaListEntriesInputSchema = EntryListRequestSchema;
export const AriaGetEntryInputSchema = GetEntryRequestSchema;
export const AriaQueryEntriesInputSchema = EntryQueryRequestSchema;
export const AriaListEntryRevisionsInputSchema = ListRevisionsRequestSchema;
export const AriaGetEntryRevisionInputSchema = GetRevisionRequestSchema;

export const AriaCreateCollectionInputSchema = CreateCollectionRequestSchema;
export const AriaUpdateCollectionInputSchema = UpdateCollectionRequestSchema;
export const AriaSetCollectionTemplateInputSchema =
  SetCollectionTemplateRequestSchema;
export const AriaClearCollectionTemplateInputSchema =
  ClearCollectionTemplateRequestSchema;
export const AriaDeleteCollectionInputSchema = DeleteCollectionRequestSchema;

export const AriaCreateEntryInputSchema = CreateEntryRequestSchema;
export const AriaUpdateEntryInputSchema = UpdateEntryRequestSchema;
export const AriaDuplicateEntryInputSchema = DuplicateEntryRequestSchema;
export const AriaDeleteEntryInputSchema = DeleteEntryRequestSchema;
export const AriaPublishEntryInputSchema = PublishEntryRequestSchema;
export const AriaUnpublishEntryInputSchema = UnpublishEntryRequestSchema;
export const AriaArchiveEntryInputSchema = ArchiveEntryRequestSchema;
export const AriaRestoreEntryRevisionInputSchema = RestoreRevisionRequestSchema;

export const AriaBindNodeFieldInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    propName: z.string().min(1),
    fieldPath: z.string().min(1),
    cmsCollection: z.string().min(1).optional(),
    entrySlug: z.string().min(1).optional(),
  })
  .strict();

export const AriaSetContainerLoopInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    cmsCollection: z.string().min(1),
    limit: z.int().min(1).max(200).optional(),
    sort: z.string().optional(),
    offset: z.int().nonnegative().optional(),
    status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
    locale: z.string().min(1).optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const AriaCmsBindingOutputSchema = z
  .object({
    success: z.literal(true),
    nodeId: z.string(),
    dataSource: z.record(z.string(), z.unknown()),
  })
  .strict();

export const AriaSetupBlogInputSchema = z
  .object({
    postsName: z.string().min(1).default("posts"),
    topicsName: z.string().min(1).default("topics"),
    seedSampleEntry: z.boolean().default(true),
  })
  .strict();

export const AriaSetupTagArchiveInputSchema = z
  .object({
    tagsName: z.string().min(1).default("topics"),
    contentName: z.string().min(1).default("posts"),
  })
  .strict();

export const AriaSetupNavCollectionInputSchema = z
  .object({
    name: z.string().min(1).default("main-nav"),
    seedHomeLink: z.boolean().default(true),
  })
  .strict();

export const AriaSetupConfigCollectionInputSchema = z
  .object({
    name: z.string().min(1).default("homepage"),
    label: z.string().min(1).default("Homepage"),
  })
  .strict();

export const AriaCmsSetupOutputSchema = z
  .object({
    created: z.array(z.string()),
    reused: z.array(z.string()),
    updated: z.array(z.string()),
    entries: z.array(z.string()),
  })
  .strict();

export const AriaListCollectionsOutputSchema = z
  .object({
    collections: z.array(AriaCollectionSchema),
    entryCounts: z.record(z.string(), z.int().nonnegative()).default({}),
  })
  .strict();

export const AriaListEntriesOutputSchema = ListEntriesResponseSchema;
export const AriaListEntryRevisionsOutputSchema = ListRevisionsResponseSchema;
export const AriaCollectionOutputSchema = AriaCollectionSchema;
export const AriaEntryOutputSchema = AriaEntryRecordSchema;
export const AriaEntryRevisionOutputSchema = AriaEntryRevisionSchema;

export const AriaSaveDesignSystemColorsInputSchema = z
  .object({
    colors: z
      .object({
        templateId: z.string().optional(),
        palettes: z.union([
          z.array(
            z
              .object({
                name: z.string().min(1),
                label: z.string().optional(),
                shades: z.record(z.string(), z.string()),
              })
              .strict(),
          ),
          z.record(z.string(), z.record(z.string(), z.string())),
        ]),
        paletteAliases: z.record(z.string(), z.string()).optional(),
        semantic: z
          .object({
            success: z.string(),
            warning: z.string(),
            error: z.string(),
            info: z.string(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const AriaSetDesignSystemPrimaryColorInputSchema = z
  .object({
    color: z.string().min(1),
  })
  .strict();

export const AriaSaveDesignSystemTypographyInputSchema = z
  .object({
    typography: z
      .object({
        families: z
          .object({
            body: z.string().min(1).describe("Default body font family."),
            heading: z.string().min(1).describe("Default heading font family."),
            mono: z.string().min(1).describe("Default monospace font family."),
          })
          .strict()
          .describe("Default font-family assignments."),
        scale: z
          .array(
            z
              .object({
                id: z
                  .string()
                  .min(1)
                  .describe("Scale token ID, such as base, xl, or 5xl."),
                label: z.string().min(1),
                size: z
                  .number()
                  .positive()
                  .describe("Font size in pixels, for example 16 (not 1rem)."),
                lineHeight: z
                  .number()
                  .positive()
                  .describe("Line height in pixels, for example 24 (not 1.5)."),
                letterSpacing: z
                  .number()
                  .describe(
                    "Letter spacing as an em number, for example -0.02.",
                  ),
              })
              .strict(),
          )
          .min(1)
          .describe(
            "Complete type scale. Preserve existing steps from aria_get_design_system(detail:full) unless the user asks to replace them.",
          ),
        headingOverrides: z
          .record(z.string(), z.string().min(1))
          .optional()
          .describe(
            "Optional font-family strings keyed by heading scale token ID (5xl, 4xl, 3xl, 2xl, xl, lg). Values are strings only, never style objects.",
          ),
        bodyOverrides: z
          .record(z.string(), z.string().min(1))
          .optional()
          .describe(
            "Optional font-family strings keyed by body scale token ID (base or sm). Values are strings only, never style objects.",
          ),
      })
      .strict()
      .describe(
        "Save-ready typography object returned by aria_get_design_system(detail:full). Typography overrides only assign font families; use aria_save_design_system_global_styles for weight, transform, colors, and other CSS defaults.",
      ),
  })
  .strict();

export const AriaSaveDesignSystemGlobalStylesInputSchema = z
  .object({
    globalStyles: GlobalStylesConfigSchema,
  })
  .strict();

export const AriaSaveDesignSystemBreakpointsInputSchema = z
  .object({
    breakpoints: z.array(UniversalBreakpointItemSchema).min(1),
  })
  .strict();

export const AriaApplyDesignSystemTemplateInputSchema = z
  .object({
    templateId: z.string().min(1),
  })
  .strict();

export const AriaDesignSystemPatchSchema = z
  .object({
    colors: z.unknown().optional(),
    typography: z.unknown().optional(),
    globalStyles: z.unknown().optional(),
    breakpoints: z.unknown().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one design system section patch is required",
  });

export const AriaPreviewDesignSystemPatchInputSchema = z
  .object({
    expectedRevision: z.string().min(1).optional(),
    patch: AriaDesignSystemPatchSchema,
  })
  .strict();

export const AriaApplyDesignSystemPatchInputSchema = z
  .object({
    expectedRevision: z.string().min(1),
    idempotencyKey: z.string().min(8).max(200),
    patch: AriaDesignSystemPatchSchema,
  })
  .strict();

export const DesignSystemWriteResultSchema = z.record(z.string(), z.unknown());

export const ClientToolInsertNodesInputSchema = z
  .object({
    // Use z.unknown() instead of BuilderNodeSchema — the recursive
    // z.lazy() self-reference generates JSON Schema $ref values that
    // strict providers (Kimi / Moonshot) reject. The AI model learns
    // node structure from aria_list_element_types and
    // aria_get_node_capabilities instead.
    nodes: z.array(z.unknown()).min(1),
    parentId: z.string().nullable().optional(),
    insertPosition: z.int().nonnegative().optional(),
  })
  .strict();

export const ClientToolInsertDesignedSectionInputSchema = z
  .object({
    node: z.unknown(),
    parentId: z.string().nullable().optional(),
    insertPosition: z.int().nonnegative().optional(),
  })
  .strict();
export type ClientToolInsertDesignedSectionInput = z.infer<
  typeof ClientToolInsertDesignedSectionInputSchema
>;

export const ClientToolSelectBlockInputSchema = z
  .object({
    blockId: z.string().min(1),
  })
  .strict();

export const ClientToolUpdateNodeMotionInputSchema = z
  .object({
    blockId: z.string().min(1).optional(),
    motion: NodeMotionSchema,
  })
  .strict();

export const ClientToolOpenInComposerInputSchema = z
  .object({
    itemType: z.enum(["page", "layout", "component"]),
    slug: z.string().min(1),
    destination: z.enum(["composer", "studio"]).default("composer"),
  })
  .strict();

export const AriaUpdatePageMetaInputSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1).optional(),
    newSlug: z.string().min(1).optional(),
    layout: z.string().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
  })
  .strict();

export const AriaUpdatePageMetaOutputSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    previousSlug: z.string().optional(),
    redirectNote: z.string().optional(),
  })
  .strict();

export const AriaUpdatePageSeoInputSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().max(60).optional(),
    description: z.string().max(160).optional(),
    ogTitle: z.string().max(60).optional(),
    ogDescription: z.string().max(160).optional(),
    ogImage: z.string().max(512).optional(),
    canonical: z.string().max(512).optional(),
    noindex: z.boolean().optional(),
    nofollow: z.boolean().optional(),
    structuredData: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional(),
  })
  .strict();

export type AriaUpdatePageSeoInput = z.infer<
  typeof AriaUpdatePageSeoInputSchema
>;

export const AriaUpdatePageSeoOutputSchema = z
  .object({
    slug: z.string(),
  })
  .strict();

export type AriaUpdatePageSeoOutput = z.infer<
  typeof AriaUpdatePageSeoOutputSchema
>;

export const AriaPublishPageInputSchema = z
  .object({
    slug: z.string().min(1),
    skipCSSRegeneration: z.boolean().optional(),
    scheduledFor: z.iso.datetime().optional(),
  })
  .strict();

export type AriaPublishPageInput = z.infer<typeof AriaPublishPageInputSchema>;

export const AriaPublishPageOutputSchema = z
  .object({
    slug: z.string(),
    published: z.literal(true),
    timestamp: z.iso.datetime(),
  })
  .strict();

export type AriaPublishPageOutput = z.infer<typeof AriaPublishPageOutputSchema>;

export const AriaCreatePageInputSchema = z
  .object({
    title: z.string().min(1),
    slug: z.string().min(1).optional(),
    layout: z.string().optional(),
  })
  .strict();

export const AriaCreatePageOutputSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
  })
  .strict();

export const AriaSaveDocumentInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodes: z.array(z.unknown()).optional(),
    title: z.string().optional(),
  })
  .strict();

export const AriaDeleteDocumentInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
  })
  .strict();

export const AriaInsertNodesInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    parentId: z.string().nullable().optional(),
    nodes: z.array(z.unknown()).min(1),
    position: z.int().nonnegative().optional(),
  })
  .strict();

export const AriaInsertNodesOutputSchema = z
  .object({
    nodeIds: z.array(z.string()),
    version: z.string(),
  })
  .strict();

export const AriaMutateNodeInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    breakpoint: z.string().min(1).optional(),
    updates: z
      .object({
        styles: z.record(z.string(), z.unknown()).optional(),
        props: z.record(z.string(), z.unknown()).optional(),
        motion: NodeMotionSchema.optional(),
        dataSource: z.unknown().optional(),
        a11y: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .strict();

export const AriaUpdateNodeMotionInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    motion: NodeMotionSchema,
  })
  .strict();

export const AriaMoveNodeInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    newParentId: z.string(),
    index: z.int().nonnegative().optional(),
  })
  .strict();

export const AriaDeleteNodeInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
  })
  .strict();

export const AriaListMediaInputSchema = z
  .object({
    search: z.string().optional(),
    limit: z.int().min(1).max(100).optional(),
    offset: z.int().nonnegative().optional(),
  })
  .strict();

export const AriaListMediaOutputSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        url: z.string(),
        size: z.number().optional(),
        mimeType: z.string().optional(),
      }),
    ),
    total: z.number(),
  })
  .strict();

export const AriaAttachMediaInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    mediaUrl: z.string().min(1),
    prop: z.enum(["src", "poster"]).default("src"),
  })
  .strict();

/** Shared success result for writes */
export const WriteSuccessSchema = z
  .object({
    success: z.literal(true),
    slug: z.string().optional(),
    title: z.string().optional(),
  })
  .strict();

export const AgentShellContextPatchSchema =
  AgentShellContextSchema.partial().strict();

const CLASS_NAME_REGEX = /^[a-z][a-z0-9_-]*$/;
const CLASS_NAME_MAX = 64; // matches CustomClassSchema max in classEditor.ts

export const AriaCreateClassInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(CLASS_NAME_MAX)
      .regex(
        CLASS_NAME_REGEX,
        "Class name must start with a letter and contain only lowercase letters, digits, hyphens, and underscores",
      ),
    description: z.string().max(256).optional(),
    /** Flat array of CSS rules. Each rule has property, value, and optional important flag. */
    initialRules: z
      .array(
        z.object({
          property: z.string().min(1),
          value: z.string(),
          important: z.boolean().default(false),
        }),
      )
      .optional(),
  })
  .strict();
export type AriaCreateClassInput = z.infer<typeof AriaCreateClassInputSchema>;

export const AriaUpdateClassRuleInputSchema = z
  .object({
    className: z.string().min(1).max(CLASS_NAME_MAX),
    breakpoint: z.string().min(1).max(32).default("base"),
    property: z.string().min(1),
    value: z.string(),
    important: z.boolean().default(false),
  })
  .strict();
export type AriaUpdateClassRuleInput = z.infer<
  typeof AriaUpdateClassRuleInputSchema
>;

export const AriaRemoveClassRuleInputSchema = z
  .object({
    className: z.string().min(1).max(CLASS_NAME_MAX),
    breakpoint: z.string().min(1).max(32).default("base"),
    property: z.string().min(1),
  })
  .strict();
export type AriaRemoveClassRuleInput = z.infer<
  typeof AriaRemoveClassRuleInputSchema
>;

export const AriaDeleteClassInputSchema = z
  .object({
    name: z.string().min(1).max(CLASS_NAME_MAX),
  })
  .strict();
export type AriaDeleteClassInput = z.infer<typeof AriaDeleteClassInputSchema>;

export const AriaRenameClassInputSchema = z
  .object({
    oldName: z.string().min(1).max(CLASS_NAME_MAX),
    newName: z
      .string()
      .min(1)
      .max(CLASS_NAME_MAX)
      .regex(
        CLASS_NAME_REGEX,
        "New class name must start with a letter and contain only lowercase letters, digits, hyphens, and underscores",
      ),
  })
  .strict()
  .refine((d) => d.oldName !== d.newName, "New name must differ from old name");
export type AriaRenameClassInput = z.infer<typeof AriaRenameClassInputSchema>;

export const AriaDuplicateClassInputSchema = z
  .object({
    sourceName: z.string().min(1).max(CLASS_NAME_MAX),
    newName: z
      .string()
      .min(1)
      .max(CLASS_NAME_MAX)
      .regex(
        CLASS_NAME_REGEX,
        "New class name must start with a letter and contain only lowercase letters, digits, hyphens, and underscores",
      ),
  })
  .strict();
export type AriaDuplicateClassInput = z.infer<
  typeof AriaDuplicateClassInputSchema
>;

export const AriaApplyClassToNodesInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    className: z.string().min(1).max(CLASS_NAME_MAX),
    nodeIds: z
      .array(z.string().min(1))
      .min(1, "At least one nodeId is required"),
  })
  .strict();
export type AriaApplyClassToNodesInput = z.infer<
  typeof AriaApplyClassToNodesInputSchema
>;

export const AriaApplyClassToNodesOutputSchema = z
  .object({
    applied: z.int().nonnegative(),
    skipped: z.int().nonnegative(),
    notFound: z.array(z.string()),
  })
  .strict();
export type AriaApplyClassToNodesOutput = z.infer<
  typeof AriaApplyClassToNodesOutputSchema
>;

// CSS custom property keys stored WITHOUT the leading -- prefix
// in globalStyles.variables.custom. Use CssCustomPropertyKeySchema from
// aria/lib/styles/universalDesignSystem for canonical key validation.

export const CssVariableEntrySchema = z
  .object({
    name: z.string().min(1).max(128),
    value: z.string().min(1).max(512),
    category: z.string().max(64).optional(),
  })
  .strict();
export type CssVariableEntry = z.infer<typeof CssVariableEntrySchema>;

/**
 * Set or remove CSS custom properties in global styles.
 * At least one of `variables` or `remove` must be provided.
 */
export const AriaManageCssVariablesInputSchema = z
  .object({
    /** CSS variable names WITHOUT the -- prefix (key format used in globalStyles.variables.custom) */
    variables: z.record(z.string().min(1), z.string().max(512)).optional(),
    /** CSS variable names to remove (WITHOUT the -- prefix) */
    remove: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine(
    (d) => d.variables != null || d.remove != null,
    "Must provide at least one of: variables, remove",
  );
export type AriaManageCssVariablesInput = z.infer<
  typeof AriaManageCssVariablesInputSchema
>;

export const AriaRegenerateGlobalCssInputSchema = z
  .object({
    /**
     * /** Optional optimistic lock. If provided and the current site
     * styleRevision doesn't match, the handler returns CONFLICT before regenerating.
     */
    styleRevision: z.string().optional(),
  })
  .strict();
export type AriaRegenerateGlobalCssInput = z.infer<
  typeof AriaRegenerateGlobalCssInputSchema
>;

export const AriaRegenerateGlobalCssOutputSchema = z
  .object({
    success: z.literal(true),
    globalCSSHash: z.string().min(1),
    cssSize: z.int().positive(),
    classCount: z.int().nonnegative(),
    lastCompiled: z.string().min(1),
    framework: z.enum(["unocss", "custom"]),
    styleRevision: z.string().min(1),
    invalidatedPageCount: z.int().nonnegative(),
  })
  .strict();
export type AriaRegenerateGlobalCssOutput = z.infer<
  typeof AriaRegenerateGlobalCssOutputSchema
>;

export const AriaListFontsInputSchema = z
  .object({
    search: z.string().max(128).optional(),
    category: z
      .enum(["serif", "sans-serif", "display", "handwriting", "monospace"])
      .optional(),
    limit: z.int().min(1).max(100).optional(),
  })
  .strict();
export type AriaListFontsInput = z.infer<typeof AriaListFontsInputSchema>;

export const AriaGetFontConfigInputSchema = z.object({}).strict();

export const AriaEnableGoogleFontInputSchema = z
  .object({
    family: z.string().min(1).max(128),
    variants: z.array(z.string().min(1).max(32)).optional(),
  })
  .strict();
export type AriaEnableGoogleFontInput = z.infer<
  typeof AriaEnableGoogleFontInputSchema
>;

export const AriaDisableFontInputSchema = z
  .object({
    fontId: z.string().min(1),
  })
  .strict();
export type AriaDisableFontInput = z.infer<typeof AriaDisableFontInputSchema>;

// NOTE: aria_upload_custom_font is a CLIENT tool (browser-side File → FormData upload).
// Its schema is defined client-side via clientToolSchemas.ts. It is NOT a server tool.

export const AriaListClassesInputSchema = z.object({}).strict();
export const AriaGetSiteContextInputSchema = z.object({}).strict();
