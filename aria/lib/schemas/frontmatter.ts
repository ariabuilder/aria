/**
 * Page frontmatter metadata rendered into Astro templates or used by blocks.
 */
import { z } from "zod";
import type { BuilderNode } from "../types/nodes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type FrontmatterFieldType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "date";

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue | undefined };

type FrontmatterOptionValue = Exclude<FrontmatterValue, undefined>;

const FrontmatterValueSchema: z.ZodType<FrontmatterValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(FrontmatterValueSchema),
    z.record(z.string(), FrontmatterValueSchema),
  ]),
);

export interface FieldSchema {
  type: FrontmatterFieldType;
  label: string;
  description?: string;
  required?: boolean;
  default?: FrontmatterOptionValue;
  validation?: z.ZodType<unknown>;
  options?: Array<{ label: string; value: FrontmatterOptionValue }>;
  placeholder?: string;
  help?: string;
}

/**
 * Frontmatter field definitions
 */
export interface FrontmatterSchema {
  [fieldName: string]: FieldSchema;
}

export type PageFrontmatter = {
  title?: string;
  description?: string;
  author?: string;
  published_at?: string;
} & Record<string, FrontmatterValue | undefined>;

/**
 * Default frontmatter schema
 * Can be extended per page type
 */
export const DEFAULT_FRONTMATTER_SCHEMA: FrontmatterSchema = {
  title: {
    type: "string",
    label: "Page Title",
    description: "The title of the page",
    required: true,
    placeholder: "Enter page title",
  },
  description: {
    type: "string",
    label: "Meta Description",
    description: "Short description for SEO",
    required: false,
    placeholder: "Enter meta description (160 chars)",
  },
  author: {
    type: "string",
    label: "Author",
    description: "Who created this page",
    required: false,
  },
  published_at: {
    type: "date",
    label: "Published Date",
    description: "When was this published",
    required: false,
  },
};

/**
 * Example custom schema with additional fields
 */
export const BLOG_POST_SCHEMA: FrontmatterSchema = {
  ...DEFAULT_FRONTMATTER_SCHEMA,
  tags: {
    type: "array",
    label: "Tags",
    description: "Categorize your post",
    required: false,
  },
  category: {
    type: "string",
    label: "Category",
    description: "Post category",
    required: false,
    options: [
      { label: "Engineering", value: "engineering" },
      { label: "Design", value: "design" },
      { label: "Product", value: "product" },
    ],
  },
  featured_image: {
    type: "string",
    label: "Featured Image",
    description: "Cover image for the post",
    required: true,
  },
};

/**
 * Example custom schema with icon
 */
export const LANDING_PAGE_SCHEMA: FrontmatterSchema = {
  ...DEFAULT_FRONTMATTER_SCHEMA,
  icon: {
    type: "string",
    label: "Page Icon",
    description: "Icon emoji or URL",
    required: false,
    placeholder: "🚀 or /icon.svg",
  },
  theme_color: {
    type: "string",
    label: "Theme Color",
    description: "Primary color for this page",
    required: false,
    placeholder: "#0066cc",
  },
  cta_text: {
    type: "string",
    label: "CTA Button Text",
    description: "Call-to-action button text",
    required: false,
  },
};

/**
 * Helper to validate frontmatter against schema (manual validation)
 */
export function validateFrontmatter(
  data: unknown,
  schema: FrontmatterSchema,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values = isRecord(data) ? data : {};

  for (const [key, fieldDef] of Object.entries(schema)) {
    const value = values[key];

    if (fieldDef.required && !value) {
      errors[key] = `${fieldDef.label} is required`;
      continue;
    }

    // Skip if not required and empty
    if (!fieldDef.required && (value === null || value === undefined)) {
      continue;
    }

    if (!validateFieldType(value, fieldDef.type)) {
      errors[key] = `${fieldDef.label} must be of type ${fieldDef.type}`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Converts a field-driven FrontmatterSchema to a Zod schema.
 * Supports types: string, number, boolean, array, object, date.
 */
export function frontmatterSchemaToZod(
  schema: FrontmatterSchema,
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(schema)) {
    let validator: z.ZodType<unknown>;
    const label = field.label || key;
    switch (field.type) {
      case "string":
        if (field.required) {
          validator = z
            .string({
              error: (issue) =>
                issue.input === undefined
                  ? `${label} is required`
                  : `${label} must be a string`,
            })
            .min(1, `${label} is required`);
        } else {
          validator = z
            .string({
              error: `${label} must be a string`,
            })
            .optional();
        }
        break;
      case "number":
        if (field.required) {
          validator = z.number({
            error: (issue) =>
              issue.input === undefined
                ? `${label} is required`
                : `${label} must be a number`,
          });
        } else {
          validator = z
            .number({
              error: `${label} must be a number`,
            })
            .optional();
        }
        break;
      case "boolean":
        if (field.required) {
          validator = z.boolean({
            error: (issue) =>
              issue.input === undefined
                ? `${label} is required`
                : `${label} must be a boolean`,
          });
        } else {
          validator = z
            .boolean({
              error: `${label} must be a boolean`,
            })
            .optional();
        }
        break;
      case "array":
        if (field.required) {
          // require at least one element for required arrays
          validator = z
            .array(FrontmatterValueSchema)
            .min(1, `${label} is required`);
        } else {
          validator = z.array(FrontmatterValueSchema).optional();
        }
        break;
      case "object":
        if (field.required) {
          validator = z.record(z.string(), FrontmatterValueSchema);
        } else {
          validator = z.record(z.string(), FrontmatterValueSchema).optional();
        }
        break;
      case "date":
        if (field.required) {
          validator = z.string({
            error: (issue) =>
              issue.input === undefined
                ? `${label} is required`
                : `${label} must be a date string`,
          });
        } else {
          validator = z
            .string({
              error: `${label} must be a date string`,
            })
            .optional();
        }
        break;
      default:
        validator = z.unknown();
    }

    if (field.validation) {
      validator = field.required
        ? field.validation
        : field.validation.optional();
    }

    shape[key] = validator;
  }
  return z.object(shape as Record<string, z.ZodTypeAny>);
}

/**
 * Validates frontmatter data using Zod, based on your field-driven schema.
 * Returns Zod's SafeParseReturnType.
 */
export function validateFrontmatterWithZod(
  schema: FrontmatterSchema,
  data: unknown,
) {
  const zodSchema = frontmatterSchemaToZod(schema);
  return zodSchema.safeParse(data);
}

/**
 * Example usage: import { LANDING_PAGE_SCHEMA } from ".
 * /schemas/frontmatter"; import { validateFrontmatterWithZod } from ".
 */

function validateFieldType(
  value: unknown,
  type: FrontmatterFieldType,
): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" || value instanceof Date;
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Helper to build frontmatter from block metadata
 * Extracts icon/color/etc from blocks into page frontmatter
 */
export function extractFrontmatterFromBlocks(
  blocks: ReadonlyArray<Pick<BuilderNode, "type" | "props">>,
): Partial<PageFrontmatter> {
  const frontmatter: Partial<PageFrontmatter> = {};

  // Look for icon in first block (hero block often has this)
  const heroBlock = blocks.find((b) => b.type === "hero");
  if (typeof heroBlock?.props?.icon === "string") {
    frontmatter.icon = heroBlock.props.icon;
  }

  // Could add more extraction logic here
  // e.g., extract title from first text block, description from meta block, etc.

  return frontmatter;
}

/**
 * Helper to merge custom schema with defaults
 */
export function mergeSchemas(
  baseSchema: FrontmatterSchema,
  customSchema: FrontmatterSchema,
): FrontmatterSchema {
  return {
    ...baseSchema,
    ...customSchema,
  };
}

export const PRODUCT_PAGE_SCHEMA: FrontmatterSchema = {
  ...DEFAULT_FRONTMATTER_SCHEMA,
  product_sku: {
    type: "string",
    label: "SKU",
    description: "Stock Keeping Unit",
    required: true,
    placeholder: "PROD-001",
  },
  price_usd: {
    type: "number",
    label: "Price (USD)",
    description: "Product price in USD",
    required: true,
  },
  price_original: {
    type: "number",
    label: "Original Price (for sale display)",
    description: "Strike-through price if on sale",
    required: false,
  },
  in_stock: {
    type: "boolean",
    label: "In Stock",
    description: "Is this product available?",
    required: false,
  },
  product_image: {
    type: "string",
    label: "Product Image",
    description: "Primary product photo",
    required: true,
    placeholder: "/uploads/product.jpg",
  },
  product_category: {
    type: "string",
    label: "Category",
    options: [
      { label: "Electronics", value: "electronics" },
      { label: "Apparel", value: "apparel" },
      { label: "Books", value: "books" },
    ],
    required: false,
  },
  rating: {
    type: "number",
    label: "Rating (0-5)",
    description: "Average customer rating",
    required: false,
  },
};

/**
 * Example: Documentation Page frontmatter schema
 */
export const DOCS_PAGE_SCHEMA: FrontmatterSchema = {
  ...DEFAULT_FRONTMATTER_SCHEMA,
  doc_version: {
    type: "string",
    label: "Documentation Version",
    description: "Which version of the product does this apply to?",
    required: true,
    placeholder: "v1.0.0",
  },
  status: {
    type: "string",
    label: "Page Status",
    description: "Is this page complete, draft, or outdated?",
    required: false,
    options: [
      { label: "Published", value: "published" },
      { label: "Draft", value: "draft" },
      { label: "Outdated", value: "outdated" },
      { label: "Deprecated", value: "deprecated" },
    ],
  },
  table_of_contents: {
    type: "boolean",
    label: "Show Table of Contents",
    description: "Generate TOC from headings?",
    required: false,
  },
  difficulty: {
    type: "string",
    label: "Difficulty Level",
    options: [
      { label: "Beginner", value: "beginner" },
      { label: "Intermediate", value: "intermediate" },
      { label: "Advanced", value: "advanced" },
    ],
    required: false,
  },
};

/**
 * Utility: Get schema for a given page type
 */
export type PageType = "landing" | "blog" | "product" | "docs" | "default";

export function getSchemaForPageType(type: PageType): FrontmatterSchema {
  switch (type) {
    case "landing":
      return LANDING_PAGE_SCHEMA;
    case "blog":
      return BLOG_POST_SCHEMA;
    case "product":
      return PRODUCT_PAGE_SCHEMA;
    case "docs":
      return DOCS_PAGE_SCHEMA;
    default:
      return DEFAULT_FRONTMATTER_SCHEMA;
  }
}

export {
  ariaPageSchema,
  ariaLayoutSchema,
  ariaComponentSchema,
  ariaStyleSchema,
  ariaSettingsSchema,
} from "./aria-content";

export type {
  BlockMeta,
  ComponentData,
  LayoutData,
  StyleTokens,
  SiteSettings,
} from "../storage/adapter";
