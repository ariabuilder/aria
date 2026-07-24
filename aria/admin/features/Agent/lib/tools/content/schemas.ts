import { z } from "zod";
import {
  StoredPageAccessModeSchema,
  StoredPageSystemRoleSchema,
} from "../../../../../lib/storage/adapter";

export const PageInventoryItemSchema = z.looseObject({
  id: z.string(),
  slug: z.string().optional(),
  title: z.string().optional(),
  systemRole: StoredPageSystemRoleSchema.optional(),
  accessMode: StoredPageAccessModeSchema.optional(),
});

export const ListPagesOutputSchema = z
  .object({
    pages: z.array(PageInventoryItemSchema),
  })
  .strict();

export const SiteContextOutputSchema = z
  .object({
    site: z
      .object({
        name: z.string().optional(),
        url: z.string().optional(),
        description: z.string().optional(),
        timeZone: z.string(),
      })
      .strict(),
    styling: z
      .object({
        utilityEngine: z.enum(["unocss", "custom"]),
        utilityClassesAllowed: z.boolean(),
      })
      .strict(),
    counts: z
      .object({
        pages: z.int().nonnegative(),
        layouts: z.int().nonnegative(),
        components: z.int().nonnegative(),
        media: z.int().nonnegative().optional(),
        redirects: z.int().nonnegative().optional(),
        cmsCollections: z.int().nonnegative(),
      })
      .strict(),
    discovery: z.record(z.string(), z.unknown()),
    analytics: z.record(z.string(), z.unknown()),
    cms: z
      .object({
        collections: z.array(z.record(z.string(), z.unknown())),
      })
      .strict(),
    media: z
      .object({
        recent: z.array(z.record(z.string(), z.unknown())),
      })
      .strict(),
    redirects: z
      .object({
        enabledCount: z.int().nonnegative(),
        recent: z.array(z.record(z.string(), z.unknown())),
      })
      .strict(),
    capabilities: z.record(z.string(), z.boolean()),
    completeness: z.record(z.string(), z.boolean()),
    warnings: z.array(
      z
        .object({
          section: z.string().min(1),
          message: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const LayoutListItemSchema = z.looseObject({
  id: z.string(),
  slug: z.string().optional(),
  title: z.string().optional(),
});

export const ListLayoutsOutputSchema = z
  .object({
    layouts: z.array(LayoutListItemSchema),
  })
  .strict();

export const ComponentListItemSchema = z.looseObject({
  id: z.string(),
  slug: z.string().optional(),
  title: z.string().optional(),
});

export const ListComponentsOutputSchema = z
  .object({
    components: z.array(ComponentListItemSchema),
  })
  .strict();

export const DesignSystemSummarySchema = z
  .object({
    revision: z.string().min(1).optional(),
    colors: z.unknown().optional(),
    typography: z.unknown().optional(),
    globalStyles: z.unknown().optional(),
    breakpoints: z.unknown().optional(),
    paletteTemplates: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const ElementTypesOutputSchema = z
  .object({
    elements: z.array(
      z.looseObject({
        id: z.string(),
        type: z.string(),
        category: z.enum(["container", "primitive"]),
        label: z.string(),
      }),
    ),
  })
  .strict();

export const NodeCapabilitiesOutputSchema = z
  .object({
    motion: z.object({
      description: z.string(),
      fields: z.array(
        z.object({
          key: z.string(),
          type: z.string(),
          required: z.boolean().optional(),
          enum: z.array(z.string()).optional(),
          default: z.unknown().optional(),
          description: z.string(),
        }),
      ),
      presets: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
          effects: z.array(z.string()),
          trigger: z.string(),
          speed: z.string().optional(),
          easing: z.string().optional(),
          distance: z.string().optional(),
        }),
      ),
      example: z.unknown(),
    }),
    styles: z.object({
      description: z.string(),
      fields: z.array(
        z.object({
          key: z.string(),
          type: z.string(),
          description: z.string(),
        }),
      ),
      responsiveNote: z.string(),
      example: z.unknown(),
    }),
  })
  .strict();

export const ReadResourceOutputSchema = z.record(z.string(), z.unknown());
