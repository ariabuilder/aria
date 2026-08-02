import { z } from "zod";
import type { BuilderNode } from "../types/nodes";
import { JsonObjectSchema } from "./json";

/**
 * Node schema
 * Represents a block/component in the page tree.
 */
export const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  props: JsonObjectSchema,
  children: z.array(z.lazy(() => NodeSchema)),
}) as unknown as z.ZodType<BuilderNode>;

/**
 * Page schema
 * Represents a full page document.
 */
export const PageSchema = z.object({
  slug: z.string(),
  title: z.string().optional(),
  blocks: z.array(NodeSchema).optional(),
  draft: z.boolean().optional(),
  frontmatter: JsonObjectSchema.optional(),
  layout: z.string().optional(),
  parent: z.string().nullable().optional(), // Parent page slug for nested pages
  order: z.number().optional().default(0), // Display order
  updated_at: z.number().optional(),
  type: z.string().optional(),
  // Legacy fields (for backwards compatibility)
  id: z.string().optional(),
  name: z.string().optional(),
  updatedAt: z.number().optional(),
  root: NodeSchema.optional(),
  seo: z
    .object({
      title: z.string(),
      description: z.string(),
    })
    .optional(),
});

export const StylesSchema = z.object({
  tokens: z
    .object({
      colors: z.record(z.string(), z.string()),
      gradients: z.record(z.string(), z.string()),
      spacing: z.record(z.string(), z.string()),
      fonts: z.record(z.string(), z.string()),
      fontSizes: z.record(z.string(), z.string()),
      fontWeights: z.record(z.string(), z.string()),
      lineHeights: z.record(z.string(), z.string()),
      letterSpacing: z.record(z.string(), z.string()),
      borderWidths: z.record(z.string(), z.string()),
      borderColors: z.record(z.string(), z.string()),
      borderRadius: z.record(z.string(), z.string()),
      boxShadows: z.record(z.string(), z.string()),
      opacity: z.record(z.string(), z.string()),
      zIndex: z.record(z.string(), z.number()),
      transitions: z.record(z.string(), z.string()),
      breakpoints: z.record(z.string(), z.string()),
    })
    .optional(),
  // Tailwind CSS compilation fields (optional for backward compatibility)
  compiledTailwindCSS: z.string().optional(),
  baseCSS: z.string().optional(),
  baseCSSHash: z.string().optional(),
  utilityCSS: z.string().optional(),
  utilityCSSHash: z.string().optional(),
  customClassesCSS: z.string().optional(),
  customFontsCSS: z.string().optional(),
  customFonts: z
    .object({
      fonts: z.record(
        z.string(),
        z.object({
          id: z.string(),
          name: z.string(),
          family: z.string(),
          formats: z.array(
            z.object({
              format: z.string(),
              url: z.string(),
            }),
          ),
          weight: z.string().optional(),
          style: z.string().optional(),
        }),
      ),
      googleFonts: z.record(
        z.string(),
        z.object({
          id: z.string(),
          family: z.string(),
          variants: z.array(z.string()),
          googleFontsURL: z.string(),
        }),
      ),
    })
    .optional(),
  globalCSS: z.string().optional(),
  globalCSSHash: z.string().optional(),
  tailwindClasses: z.array(z.string()).optional(),
  lastCompiled: z.string().optional(),
});

// Export inferred types for type safety
export type StylesDataSchema = z.infer<typeof StylesSchema>;

/**
 * PageVersion schema
 * Represents a single version entry for a page.
 */
export const PageVersionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  message: z.string(),
  snapshot: z.string(),
});

/**
 * VersionsFile schema
 * Represents the file containing all versions for a page.
 */
export const VersionsFileSchema = z.object({
  versions: z.array(PageVersionSchema),
});
