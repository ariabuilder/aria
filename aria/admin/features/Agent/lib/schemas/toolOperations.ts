import { z } from "zod";
import { ContentLocalizationSettingsSchema } from "../../../../../lib/localization/contentLocale";

export const ToolProfileIdSchema = z.enum([
  "studio",
  "composer",
  "design",
  "mcp",
]);
export type ToolProfileId = z.infer<typeof ToolProfileIdSchema>;

export const AriaCreateLayoutInputSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .strict();

export const AriaCreateComponentInputSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
  })
  .strict();

export const AriaDuplicateDocumentInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    sourceSlug: z.string().min(1),
    newSlug: z.string().min(1),
  })
  .strict();

export const AriaDuplicateDocumentOutputSchema = z
  .object({
    slug: z.string(),
  })
  .strict();

export const AriaPageSlugInputSchema = z
  .object({
    slug: z.string().min(1),
  })
  .strict();

export const AriaUpdateLayoutSlotsInputSchema = z
  .object({
    layoutSlug: z.string().min(1),
    slots: z.array(z.unknown()).optional(),
    slotName: z.string().min(1).optional(),
    slotNodes: z.array(z.unknown()).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.slots !== undefined ||
      (value.slotName !== undefined && value.slotNodes !== undefined),
    {
      message: "Provide slots array or slotName + slotNodes",
    },
  );

export const AriaUpdateNodeClassesInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    classNames: z.record(z.string(), z.string()).optional(),
    addUtilityClass: z
      .object({
        breakpoint: z.string().min(1),
        className: z.string().min(1),
      })
      .optional(),
    removeUtilityClass: z
      .object({
        breakpoint: z.string().min(1),
        className: z.string().min(1),
      })
      .optional(),
    customClasses: z.array(z.string()).optional(),
  })
  .strict();

export const AriaReplaceNodeInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    slug: z.string().min(1),
    nodeId: z.string().min(1),
    node: z.unknown(),
  })
  .strict();

export const AriaGetSiteSettingsInputSchema = z.object({}).strict();

export const AriaGetLocalizationSettingsInputSchema = z.object({}).strict();

export const AriaUpdateLocalizationSettingsInputSchema =
  ContentLocalizationSettingsSchema;

export const AriaGetEntryTranslationContextInputSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    targetLocale: z.string().trim().min(1).optional(),
  })
  .strict();

export const AriaSaveEntryTranslationInputSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    expectedEntryVersion: z.string().trim().min(1),
    sourceLocale: z.string().trim().min(1),
    targetLocale: z.string().trim().min(1),
    mode: z.enum(["create_missing", "update_existing"]),
    translation: z
      .object({
        title: z.string().trim().min(1),
        slug: z
          .string()
          .trim()
          .min(1)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        frontmatter: z.record(z.string(), z.unknown()),
        body: z.unknown().nullable().optional(),
      })
      .strict(),
    translatedFieldPaths: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceLocale === value.targetLocale) {
      context.addIssue({
        code: "custom",
        path: ["targetLocale"],
        message: "Target locale must differ from source locale",
      });
    }
  });

export const AriaUpdateSiteSettingsInputSchema = z
  .object({
    siteName: z.string().optional(),
    timeZone: z.string().optional(),
    siteUrl: z.string().optional(),
    siteDescription: z.string().optional(),
    favicon: z.string().optional(),
    customCode: z
      .object({
        head: z.string().optional(),
        body: z.string().optional(),
      })
      .optional(),
    seo: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const AriaUpdateDiscoverySettingsInputSchema = z
  .object({
    discourageSearchEngines: z.boolean().optional(),
    robotsMode: z.string().optional(),
    sitemapMode: z.string().optional(),
    llmsMode: z.string().optional(),
    aiBotPolicy: z.string().optional(),
    includeSitemapInRobots: z.boolean().optional(),
  })
  .strict();

export const AriaUpdateAppearanceInputSchema = z
  .object({
    utilityEngine: z.string().optional(),
    darkMode: z.boolean().optional(),
    unoTheme: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const AriaUpdateIconPacksInputSchema = z
  .object({
    enabledPacks: z.array(z.string()).optional(),
  })
  .strict();

export const AriaListRedirectsInputSchema = z
  .object({
    includeDisabled: z.boolean().optional(),
  })
  .strict();

export const AriaCreateRedirectInputSchema = z
  .object({
    fromPath: z.string().min(1),
    toPath: z.string().min(1),
    statusCode: z.union([z.literal(301), z.literal(302)]).optional(),
    enabled: z.boolean().optional(),
    note: z.string().max(512).optional(),
  })
  .strict();

export const AriaUpdateRedirectInputSchema = z
  .object({
    id: z.string().min(1),
    fromPath: z.string().min(1).optional(),
    toPath: z.string().min(1).optional(),
    statusCode: z.union([z.literal(301), z.literal(302)]).optional(),
    enabled: z.boolean().optional(),
    note: z.string().max(512).nullable().optional(),
  })
  .strict();

export const AriaDeleteRedirectInputSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const AriaDeleteMediaInputSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const AriaRenameMediaInputSchema = z
  .object({
    oldPath: z.string().min(1),
    newName: z.string().min(1),
  })
  .strict();

export const AriaDuplicateMediaInputSchema = z
  .object({
    path: z.string().min(1),
    newName: z.string().optional(),
  })
  .strict();

export const AriaGetMediaUsagesInputSchema = z
  .object({
    logicalPath: z.string().min(1),
  })
  .strict();

export const AriaSetPageCoverInputSchema = z
  .object({
    pageSlug: z.string().min(1),
    src: z.string().min(1).optional(),
    alt: z.string().optional(),
    caption: z.string().optional(),
    autoSetOgImage: z.boolean().optional(),
    remove: z.boolean().optional(),
  })
  .strict();

export const AriaImportMediaFromUrlInputSchema = z
  .object({
    url: z.url(),
    filename: z.string().min(1).optional(),
  })
  .strict();

export const AriaUpdateClassPseudoRuleInputSchema = z
  .object({
    className: z.string().min(1),
    state: z.string().min(1),
    breakpoint: z.string().min(1).optional(),
    property: z.string().min(1),
    value: z.string(),
    important: z.boolean().optional(),
    remove: z.boolean().optional(),
  })
  .strict();

export const AriaDeleteCustomFontInputSchema = z
  .object({
    fontId: z.string().min(1),
  })
  .strict();

export const AriaRenameCustomFontInputSchema = z
  .object({
    fontId: z.string().min(1),
    newName: z.string().min(1),
  })
  .strict();

export const AriaUpdateGoogleFontVariantsInputSchema = z
  .object({
    fontId: z.string().min(1),
    variants: z.array(z.string()).min(1),
  })
  .strict();

export const ClientToolUploadCustomFontInputSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    weight: z.string().optional(),
    style: z.enum(["normal", "italic"]).optional(),
  })
  .strict();

export const ToolProfileConfigSchema = z
  .object({
    id: ToolProfileIdSchema,
    description: z.string(),
    serverCategories: z.array(
      z.enum([
        "read",
        "design_write",
        "content_write",
        "cms_write",
        "seo_write",
        "class_write",
        "variable_write",
        "font",
        "publish",
        "settings_write",
      ]),
    ),
    clientCategories: z.array(z.enum(["navigate", "canvas", "file_upload"])),
  })
  .strict();
export type ToolProfileConfig = z.infer<typeof ToolProfileConfigSchema>;

/**
 * Typed result for all design system write operations. Uses
 * discriminated union on `success` to narrow the type.
 */
export const DesignSystemWriteResultSchemaV2 = z.discriminatedUnion("success", [
  z.looseObject({
    success: z.literal(true),
    styleRevision: z.string().optional(),
  }),
  z
    .object({
      success: z.literal(false),
      error: z.looseObject({
        code: z.string(),
        message: z.string(),
      }),
    })
    .strict(),
]);
export type DesignSystemWriteResultV2 = z.infer<
  typeof DesignSystemWriteResultSchemaV2
>;
