/**
 * System. Runtime type safety and data validation.
 */

import { z } from "zod";
import {
  ComposerNodeMediaReferencesSchema,
  ComposerResponsiveImageSchema,
} from "../media/composerReference";
import { CmsDateFormatIdSchema } from "../cms/dateBindingFormats";
import { NODE_ID_ALLOWED_PATTERN } from "../ids/nodeId";
import { NodeClassNamesSchema } from "./classEditor";
import { NodeMotionSchema } from "../motion/schemas/nodeMotion.schema";
import { JsonObjectSchema, JsonValueSchema } from "./json";
import type {
  BuilderNode,
  ComponentDSL,
  JsonObject,
  LayoutDSL,
  NodeReference,
  PageDSL,
} from "../types/nodes";

export { JsonObjectSchema, JsonValueSchema } from "./json";

export function toStorableJsonObject(value: unknown): JsonObject {
  return JsonObjectSchema.parse(JSON.parse(JSON.stringify(value)));
}

export const NodeIdSchema = z
  .string()
  .trim()
  .min(1, "Node ID is required")
  .regex(
    NODE_ID_ALLOWED_PATTERN,
    "Node ID may only contain letters, numbers, underscores, and hyphens",
  );

export const BreakpointDefinitionSchema = z.object({
  name: z.string(),
  minWidth: z.string(),
  label: z.string().optional(),
});

export const LayoutRegionsSchema = z
  .object({
    headerComponent: z.string().optional(),
    footerComponent: z.string().optional(),
  })
  .strict()
  .optional();

export const LayoutMetadataSchema = z
  .object({
    layoutType: z.string().optional(),
    description: z.string().optional(),
    regions: LayoutRegionsSchema,
    systemLayout: z.boolean().optional(),
    readonly: z.boolean().optional(),
  })
  .strict()
  .optional();

/**
 * CSS Framework schema - UnoCSS or Custom only
 */
export const CSSFrameworkSchema = z.enum(["unocss", "custom"]);

/**
 * Helper to create a responsive value schema (supports dynamic breakpoints)
 */
export function ResponsiveSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.record(z.string(), valueSchema).optional();
}

/**
 * Style map schema
 * Validates CSS properties with responsive support
 */
export const StyleMapSchema = z
  .object({
    display: ResponsiveSchema(z.string()),
    position: ResponsiveSchema(z.string()),
    overflow: ResponsiveSchema(z.string()),

    flexDirection: ResponsiveSchema(z.string()),
    flexWrap: ResponsiveSchema(z.string()),
    justifyContent: ResponsiveSchema(z.string()),
    alignItems: ResponsiveSchema(z.string()),
    alignContent: ResponsiveSchema(z.string()),
    justifyItems: ResponsiveSchema(z.string()),
    gap: ResponsiveSchema(z.string()),
    gridTemplateColumns: ResponsiveSchema(z.string()),
    gridTemplateRows: ResponsiveSchema(z.string()),
    listStyleType: ResponsiveSchema(z.string()),
    listStylePosition: ResponsiveSchema(z.string()),

    padding: ResponsiveSchema(z.string()),
    paddingTop: ResponsiveSchema(z.string()),
    paddingRight: ResponsiveSchema(z.string()),
    paddingBottom: ResponsiveSchema(z.string()),
    paddingLeft: ResponsiveSchema(z.string()),
    margin: ResponsiveSchema(z.string()),
    marginTop: ResponsiveSchema(z.string()),
    marginRight: ResponsiveSchema(z.string()),
    marginBottom: ResponsiveSchema(z.string()),
    marginLeft: ResponsiveSchema(z.string()),

    width: ResponsiveSchema(z.string()),
    height: ResponsiveSchema(z.string()),
    widthSizing: ResponsiveSchema(z.enum(["hug", "fill", "exact"])),
    heightSizing: ResponsiveSchema(z.enum(["hug", "fill", "exact"])),
    minWidth: ResponsiveSchema(z.string()),
    minHeight: ResponsiveSchema(z.string()),
    maxWidth: ResponsiveSchema(z.string()),
    maxHeight: ResponsiveSchema(z.string()),
    flexGrow: ResponsiveSchema(z.string()),
    flexShrink: ResponsiveSchema(z.string()),
    flexBasis: ResponsiveSchema(z.string()),
    alignSelf: ResponsiveSchema(z.string()),
    justifySelf: ResponsiveSchema(z.string()),

    fontSize: ResponsiveSchema(z.string()),
    fontWeight: ResponsiveSchema(z.string()),
    fontFamily: ResponsiveSchema(z.string()),
    lineHeight: ResponsiveSchema(z.string()),
    letterSpacing: ResponsiveSchema(z.string()),
    textAlign: ResponsiveSchema(z.string()),
    textTransform: ResponsiveSchema(z.string()),
    textDecoration: ResponsiveSchema(z.string()),

    color: ResponsiveSchema(z.string()),
    backgroundColor: ResponsiveSchema(z.string()),
    backgroundImage: ResponsiveSchema(z.string()),
    backgroundSize: ResponsiveSchema(z.string()),
    backgroundPosition: ResponsiveSchema(z.string()),
    backgroundRepeat: ResponsiveSchema(z.string()),
    backgroundAttachment: ResponsiveSchema(z.string()),
    backgroundBlendMode: ResponsiveSchema(z.string()),

    border: ResponsiveSchema(z.string()),
    borderWidth: ResponsiveSchema(z.string()),
    borderStyle: ResponsiveSchema(z.string()),
    borderColor: ResponsiveSchema(z.string()),
    borderRadius: ResponsiveSchema(z.string()),

    opacity: ResponsiveSchema(z.string()),
    boxShadow: ResponsiveSchema(z.string()),
    transform: ResponsiveSchema(z.string()),
    transformOrigin: ResponsiveSchema(z.string()),
    transition: ResponsiveSchema(z.string()),

    zIndex: ResponsiveSchema(z.string()),
  })
  .catchall(ResponsiveSchema(z.string()))
  .optional();

export const HydrationModeSchema = z.enum([
  "static",
  "load",
  "idle",
  "visible",
  "media",
  "only",
]);

export const HydrationDirectiveSchema = z
  .object({
    mode: HydrationModeSchema,
    media: z.string().optional(),
    framework: z.string().optional(),
  })
  .strict();

export const ContentEditorFieldSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    label: z.string().optional(),
    order: z.number().optional(),
  })
  .strict();

export const NodeContentEditorSettingsSchema =
  ContentEditorFieldSettingsSchema.extend({
    fields: z.record(z.string(), ContentEditorFieldSettingsSchema).optional(),
  }).strict();

export const NodeMetadataSchema = z
  .object({
    label: z.string().optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    version: z.number().optional(),
    migrationLog: z.array(z.string()).optional(),
    order: z.number().optional(),
    isPublished: z.boolean().optional(),
    publishedAt: z.string().optional(),
    contentEditor: NodeContentEditorSettingsSchema.optional(),
    mediaReferences: ComposerNodeMediaReferencesSchema.optional(),
    responsiveImage: ComposerResponsiveImageSchema.optional(),
  })
  .catchall(z.unknown())
  .optional();

export const AnimationConfigSchema = z.object({
  trigger: z.enum(["click", "hover", "scroll", "load", "viewport"]),
  animation: z.string(),
  duration: z.string().optional(),
  delay: z.string().optional(),
  easing: z.string().optional(),
});

export const NodeInteractionsSchema = z
  .object({
    onClick: z.string().optional(),
    onHover: z.string().optional(),
    onScroll: z.string().optional(),
    animations: z.array(AnimationConfigSchema).optional(),
  })
  .strict()
  .optional();

export const NodeVariantsSchema = z
  .object({
    default: z.string().optional(),
    hover: z.string().optional(),
    active: z.string().optional(),
    focus: z.string().optional(),
    disabled: z.string().optional(),
  })
  .strict()
  .optional();

export const NodeAccessibilitySchema = z
  .object({
    role: z.string().optional(),
    ariaLabel: z.string().optional(),
    ariaDescribedBy: z.string().optional(),
    ariaLabelledBy: z.string().optional(),
    ariaHidden: z.boolean().optional(),
    ariaExpanded: z.boolean().optional(),
    ariaControls: z.string().optional(),
    tabIndex: z.number().optional(),
  })
  .catchall(JsonValueSchema)
  .optional();

export const DataSourceCacheSchema = z
  .object({
    ttl: z.number().optional(),
    strategy: z
      .enum(["swr", "stale-while-revalidate", "cache-first"])
      .optional(),
  })
  .strict();

export const NodeDataSourceSchema = z
  .object({
    type: z.enum(["static", "cms", "collection", "api", "pagination"]),
    collection: z.string().optional(),
    endpoint: z.string().optional(),
    targetNodeId: z.string().trim().min(1).optional(),
    source: z.enum(["collection", "field"]).optional(),
    field: z.string().trim().min(1).optional(),
    entryScope: z.enum(["context"]).optional(),

    mode: z.enum(["single", "list"]).optional(),
    filter: JsonObjectSchema.optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    locale: z.string().trim().min(1).optional(),

    include: z.array(z.string()).optional(),

    status: z.enum(["published", "draft", "scheduled", "archived"]).optional(),
    includeScheduled: z.boolean().optional(),
    scheduledBefore: z.string().optional(),

    cache: DataSourceCacheSchema.optional(),
    live: z.boolean().optional(),

    transform: z.string().optional(),
    itemTemplate: z.string().optional(),
    bindings: z.record(z.string(), z.string()).optional(),
    bindingFormats: z.record(z.string(), CmsDateFormatIdSchema).optional(),
    fallback: JsonValueSchema.optional(),
    onError: z.enum(["hide", "show-fallback", "show-error"]).optional(),
  })
  .strict()
  .optional();

/**
 * Component reference schema
 */
export const NodeReferenceSchema: z.ZodType<NodeReference | undefined> = z
  .object({
    type: z.enum(["instance", "master", "component"]),
    masterId: z.string().optional(),
    id: z.string().optional(), // Component ID for type: "component"
    overrides: JsonObjectSchema.optional(),
  })
  .strict()
  .optional();

/**
 * Builder node schema (recursive) Note: We use z. lazy()
 * for recursive children validation Class system: - classNames: Breakpoint-keyed.
 */
export const BuilderNodeSchema: z.ZodType<BuilderNode> = z.lazy(() =>
  z
    .object({
      id: NodeIdSchema,
      type: z.string().min(1, "Node type is required"),
      props: JsonObjectSchema.default({}),

      classNames: NodeClassNamesSchema.optional(),
      customClasses: z.array(z.string()).default([]),

      styles: StyleMapSchema.default({}),
      children: z.array(BuilderNodeSchema).default([]),
      slot: z.string().optional(),
      componentRef: z.string().optional(),
      hydration: HydrationDirectiveSchema.optional(),
      interactions: NodeInteractionsSchema,
      motion: NodeMotionSchema.optional(),
      variants: NodeVariantsSchema,
      a11y: NodeAccessibilitySchema,
      dataSource: NodeDataSourceSchema,
      reference: NodeReferenceSchema,
      metadata: NodeMetadataSchema,
    })
    .strict()
    .superRefine((node, ctx) => {
      if (node.props && typeof node.props === "object") {
        const p = node.props as Record<string, unknown>;
        if ("class" in p) {
          ctx.addIssue({
            code: "custom",
            message: "props.class is deprecated — use classNames instead",
            path: ["props", "class"],
          });
        }
        if ("className" in p) {
          ctx.addIssue({
            code: "custom",
            message: "props.className is deprecated — use classNames instead",
            path: ["props", "className"],
          });
        }
      }
    }),
);

/**
 * SEO metadata schema
 */
export const SEOMetadataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    canonical: z.string().optional(),
    noindex: z.boolean().optional(),
    nofollow: z.boolean().optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().optional(),
    ogType: z.string().optional(),
    twitterCard: z
      .enum(["summary", "summary_large_image", "app", "player"])
      .optional(),
    twitterSite: z.string().optional(),
    twitterCreator: z.string().optional(),
    structuredData: JsonObjectSchema.optional(), // Schema.org JSON-LD
  })
  .strict()
  .optional();

export const HeadConfigSchema = z
  .object({
    links: z
      .array(
        z
          .object({
            rel: z.string(),
            href: z.string(),
          })
          .catchall(z.string()),
      )
      .optional(),
    scripts: z
      .array(
        z
          .object({
            src: z.string().optional(),
            content: z.string().optional(),
          })
          .catchall(z.string()),
      )
      .optional(),
    meta: z
      .array(
        z.object({
          name: z.string().optional(),
          property: z.string().optional(),
          content: z.string(),
        }),
      )
      .optional(),
  })
  .strict()
  .optional();

export const PageSettingsSchema = z
  .looseObject({
    seo: SEOMetadataSchema,
    head: HeadConfigSchema,
    cssVariables: z.record(z.string(), z.string()).optional(),
    breakpoints: z.array(BreakpointDefinitionSchema).optional(),
    viewTransitions: z
      .object({
        enabled: z.boolean().optional(),
        fallback: z.enum(["animate", "swap", "none"]).optional(),
      })
      .strict()
      .optional(),
    prerender: z.boolean().optional(),
    imageDefaults: z
      .object({
        format: z.enum(["avif", "webp", "jpeg", "png"]).optional(),
        quality: z.number().min(0).max(100).optional(),
        loading: z.enum(["lazy", "eager"]).optional(),
        decoding: z.enum(["async", "sync", "auto"]).optional(),
        widths: z.array(z.number()).optional(),
        sizes: z.string().optional(),
      })
      .strict()
      .optional(),
    serverIslands: z
      .object({
        enabled: z.boolean().optional(),
        fallbackStrategy: z
          .enum(["placeholder", "spinner", "skeleton"])
          .optional(),
      })
      .strict()
      .optional(),
    csp: z
      .object({
        enabled: z.boolean().optional(),
        directives: z.record(z.string(), z.array(z.string())).optional(),
      })
      .strict()
      .optional(),
    prefetchStrategy: z.enum(["tap", "hover", "viewport", "load"]).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .optional();

/**
 * Page DSL schema
 */
export const PageDSLSchema: z.ZodType<PageDSL> = z
  .object({
    id: z.string().min(1, "Page ID is required"),
    title: z.string().min(1, "Page title is required"),
    slug: z
      .string()
      .min(1, "Page slug is required")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase alphanumeric with hyphens",
      ),
    description: z.string().optional(),
    frontmatter: JsonObjectSchema.optional(),
    layout: z.string().optional(),
    nodes: z.array(BuilderNodeSchema).default([]),
    settings: PageSettingsSchema.optional(),
    parent: z.string().optional(),
    order: z.number().optional(),

    // Scheduling & Publishing
    scheduledPublishAt: z.string().optional(), // ISO 8601
    expiresAt: z.string().optional(), // ISO 8601
    autoArchive: z.boolean().optional(),

    // Organization & Discovery
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    featured: z.boolean().optional(),
    visibility: z.enum(["public", "private", "unlisted", "draft"]).optional(),
    searchable: z.boolean().optional(),

    featuredImage: z
      .object({
        src: z.string(),
        alt: z.string().optional(),
        caption: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .strict()
      .optional(),
    thumbnail: z
      .object({
        src: z.string(),
        alt: z.string().optional(),
      })
      .strict()
      .optional(),

    // Collaboration (compatibility projections — canonical authorship from version rows)
    author: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        email: z.email().optional(),
      })
      .strict()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    contributors: z
      .array(
        z
          .object({
            id: z.string(),
            role: z.string().optional(),
          })
          .strict(),
      )
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    reviewStatus: z
      .enum(["pending", "approved", "rejected"])
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    assignedTo: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),

    // Analytics (Cloudflare Analytics)
    analytics: z
      .object({
        enabled: z.boolean().optional(),
        trackingId: z.string().optional(), // Cloudflare Web Analytics site token
        customEvents: z.array(z.string()).optional(),
        goals: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),

    // Version control & History
    version: z.string().optional(),
    previousVersionId: z.string().optional(),
    changeLog: z.string().optional(),
    createdAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    updatedAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    publishedAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
    systemRole: z
      .enum(["standard", "not-found", "cms-collection", "cms-entry"])
      .optional(),
    accessMode: z
      .enum(["public", "password", "private", "unlisted"])
      .optional(),
    hasPassword: z.boolean().optional(),

    // Derived: true when draft_version !== published_version
    isModifiedSincePublish: z.boolean().optional(),
    _publicationDependencies: z
      .object({
        layout: z
          .object({
            id: z.string().trim().min(1),
            version: z.string().trim().min(1),
          })
          .strict()
          .optional(),
        components: z.record(
          z.string().trim().min(1),
          z.string().trim().min(1),
        ),
      })
      .strict()
      .optional(),

    // Computed page analytics cached at save-time
    _computedMetrics: z
      .object({
        sectionCount: z.number(),
        componentCount: z.number(),
        mediaCount: z.number(),
        dynamicCount: z.number(),
        customCodeCount: z.number(),
        computedAt: z.string(),
        contentHash: z.string(),
      })
      .strict()
      .optional(),
  })
  .strip();

export const SlotDefinitionSchema = z
  .object({
    name: z.string().min(1, "Slot name is required"),
    defaultContent: z.array(BuilderNodeSchema).optional(),
    required: z.boolean().optional(),
    label: z.string().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const LayoutSettingsSchema = z
  .looseObject({
    cssVariables: z.record(z.string(), z.string()).optional(),
    breakpoints: z.array(BreakpointDefinitionSchema).optional(),
  })
  .optional();

/**
 * Layout DSL schema
 */
export const LayoutDSLSchema: z.ZodType<LayoutDSL> = z
  .object({
    id: z.string().min(1, "Layout ID is required"),
    name: z.string().min(1, "Layout name is required"),
    slug: z.string().optional(), // URL-friendly identifier
    title: z.string().optional(), // Display title (defaults to name)
    description: z.string().optional(),
    order: z.number().optional(), // Sort order in UI lists
    nodes: z.array(BuilderNodeSchema).default([]),
    slots: z.array(SlotDefinitionSchema).default([]),
    metadata: LayoutMetadataSchema,
    layoutMetadata: LayoutMetadataSchema,
    regions: LayoutRegionsSchema.optional(), // Layout region assignments
    settings: LayoutSettingsSchema,
    layoutInfo: z
      .object({
        category: z.string().optional(),
        bestFor: z.array(z.string()).optional(),
      })
      .optional(),

    // Organization & Discovery
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    layoutType: z.string().optional(), // "single-column", "sidebar", "grid", etc.

    // Collaboration (compatibility projections)
    author: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        email: z.email().optional(),
      })
      .strict()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    contributors: z
      .array(
        z
          .object({
            id: z.string(),
            role: z.string().optional(),
          })
          .strict(),
      )
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),

    usage: z
      .object({
        activePages: z.number().optional(),
        lastUsed: z.string().optional(), // ISO timestamp
        popularity: z.number().optional(),
      })
      .strict()
      .optional(),

    version: z.string().optional(),
    createdAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    updatedAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
  })
  .strict();

/**
 * Component prop schema definition
 */
export const PropSchemaOptionSchema = z
  .object({
    value: z.string().min(1, "Option value is required"),
    label: z.string().min(1, "Option label is required"),
    description: z.string().optional(),
  })
  .strict();

export const PropSchemaConditionSchema = z
  .object({
    field: z.string().min(1, "Condition field is required"),
    operator: z.enum(["equals", "notEquals", "exists", "notEmpty"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  })
  .strict();

export const PropSchemaDefinitionSchema = z
  .object({
    name: z.string().min(1, "Prop name is required"),
    type: z.enum([
      "string",
      "number",
      "boolean",
      "array",
      "object",
      "text",
      "textarea",
      "select",
      "icon",
      "color",
      "url",
    ]),
    default: z.unknown().optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
    label: z.string().optional(),
    section: z
      .enum(["Appearance", "Content", "Behavior", "Accessibility"])
      .optional(),
    placeholder: z.string().optional(),
    options: z.array(PropSchemaOptionSchema).optional(),
    editable: z.boolean().optional(),
    hidden: z.boolean().optional(),
    visual: z.boolean().optional(),
    iconSet: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    maxLength: z.int().positive().optional(),
    pattern: z.string().optional(),
    condition: PropSchemaConditionSchema.optional(),
    contentEditor: ContentEditorFieldSettingsSchema.optional(),
  })
  .strict();

export const ComponentCmsPreviewSettingsSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    entrySlug: z.string().trim().min(1).optional(),
  })
  .strict();

export const ComponentSettingsSchema = z
  .looseObject({
    canHaveChildren: z.boolean().optional(),
    allowedParents: z.array(z.string()).optional(),
    cssVariables: z.record(z.string(), z.string()).optional(),
    breakpoints: z.array(BreakpointDefinitionSchema).optional(),
    copiedFromAriaComponentId: z.string().optional(),
    cmsPreview: ComponentCmsPreviewSettingsSchema.optional(),
  })
  .optional();

/**
 * Component source schema
 * - custom: User-created component (editable, deletable)
 * - aria: Official Aria library component (locked, read-only)
 */
export const ComponentSourceSchema = z.enum(["custom", "aria"]);

/**
 * Component tier schema for gating features
 * - free: Available to all users
 * - pro: Requires Pro subscription
 */
export const ComponentTierSchema = z.enum(["free", "pro"]);

/**
 * Component DSL schema
 */
export const ComponentDSLSchema: z.ZodType<ComponentDSL> = z
  .object({
    id: z.string().min(1, "Component ID is required"),
    name: z.string().min(1, "Component name is required"),
    title: z.string().optional(), // Display title (defaults to name)
    description: z.string().optional(),
    category: z.string().optional(),
    order: z.number().optional(), // Sort order in UI lists

    source: ComponentSourceSchema.optional(), // Defaults to 'custom' for existing components
    packId: z.string().optional(), // Pack identifier for aria-sourced components
    packVersion: z.string().optional(), // Installed pack version, not storage revision
    tier: ComponentTierSchema.optional(), // Defaults to 'free'
    isLocked: z.boolean().optional(), // If true, component structure cannot be edited

    nodes: z.array(BuilderNodeSchema).default([]),
    propSchema: z.array(PropSchemaDefinitionSchema).optional(),
    slots: z.array(SlotDefinitionSchema).optional(),
    settings: ComponentSettingsSchema,
    hydration: HydrationDirectiveSchema.optional(),

    // Organization & Discovery
    tags: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
    visibility: z.enum(["private", "team"]).optional(),

    // Collaboration (compatibility projection)
    author: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        email: z.email().optional(),
      })
      .strict()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),

    usage: z
      .object({
        activeInstances: z.number().optional(),
        lastUsed: z.string().optional(),
        popularity: z.number().optional(),
      })
      .strict()
      .optional(),

    version: z.string().optional(),
    schemaVersion: z.string().optional(),
    createdAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
    updatedAt: z
      .string()
      .optional()
      .describe(
        "Compatibility projection; canonical authorship derived from version rows",
      ),
  })
  .strict();

export const PackSignatureAlgorithmSchema = z.enum(["ECDSA_P256_SHA256"]);

/**
 * Pack manifest schema - describes a downloadable pack of components
 */
export const PackManifestSchema = z
  .object({
    id: z.string().min(1, "Pack ID is required"),
    name: z.string().min(1, "Pack name is required"),
    description: z.string().optional(),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Version must be semver format"),
    minAppVersion: z.string().optional(),
    tier: ComponentTierSchema,
    componentIds: z
      .array(z.string())
      .min(1, "Pack must contain at least one component"),
    thumbnail: z.url().optional(),
    tags: z.array(z.string()).optional(),
    publishedAt: z.iso.datetime(),
    checksum: z.string().optional(),
    signerKeyId: z.string().min(1).optional(),
    signatureAlgorithm: PackSignatureAlgorithmSchema.optional(),
    signature: z.string().min(1).optional(),
  })
  .strict();

/**
 * Registry manifest schema - describes available packs in the registry
 */
export const RegistryManifestSchema = z
  .object({
    schemaVersion: z.string(),
    updatedAt: z.iso.datetime(),
    packs: z.array(PackManifestSchema),
  })
  .strict();

export const InstalledPackMetadataSchema = z
  .object({
    packId: z.string().min(1),
    version: z.string(),
    installedAt: z.iso.datetime(),
    lastCheckedAt: z.iso.datetime().optional(),
    registryUrl: z.url().optional(),
  })
  .strict();

export const PackPayloadSchema = z
  .object({
    manifest: PackManifestSchema,
    components: z.array(ComponentDSLSchema),
  })
  .strict();

export const FlatNodeSchema = z
  .object({
    id: NodeIdSchema,
    type: z.string().min(1),
    props: JsonObjectSchema.default({}),
    styles: StyleMapSchema.default({}),
    slot: z.string().optional(),
    hydration: HydrationDirectiveSchema.optional(),
    metadata: NodeMetadataSchema,
    parentId: NodeIdSchema.nullable(),
    index: z.int().nonnegative(),
  })
  .strict();

export const NodeUpdateOperationSchema = z
  .object({
    type: z.literal("update"),
    nodeId: NodeIdSchema,
    updates: z
      .object({
        type: z.string().optional(),
        props: JsonObjectSchema.optional(),
        styles: StyleMapSchema,
        slot: z.string().optional(),
        hydration: HydrationDirectiveSchema.optional(),
        metadata: NodeMetadataSchema,
      })
      .strict(),
  })
  .strict();

export const NodeInsertOperationSchema = z
  .object({
    type: z.literal("insert"),
    parentId: NodeIdSchema,
    node: BuilderNodeSchema,
    index: z.int().nonnegative().optional(),
  })
  .strict();

export const NodeDeleteOperationSchema = z
  .object({
    type: z.literal("delete"),
    nodeId: NodeIdSchema,
  })
  .strict();

export const NodeMoveOperationSchema = z
  .object({
    type: z.literal("move"),
    nodeId: NodeIdSchema,
    newParentId: NodeIdSchema,
    index: z.int().nonnegative().optional(),
  })
  .strict();

export const NodeReorderOperationSchema = z
  .object({
    type: z.literal("reorder"),
    parentId: NodeIdSchema,
    oldIndex: z.int().nonnegative(),
    newIndex: z.int().nonnegative(),
  })
  .strict();

export const NodeOperationSchema = z.discriminatedUnion("type", [
  NodeUpdateOperationSchema,
  NodeInsertOperationSchema,
  NodeDeleteOperationSchema,
  NodeMoveOperationSchema,
  NodeReorderOperationSchema,
]);

export const ValidationResultSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(
      z.object({
        nodeId: NodeIdSchema,
        message: z.string(),
        path: z.array(z.string()),
      }),
    ),
  })
  .strict();

/**
 * Helper function to validate and parse data
 */
export function validatePageDSL(data: unknown) {
  return PageDSLSchema.safeParse(data);
}

export function validateLayoutDSL(data: unknown) {
  return LayoutDSLSchema.safeParse(data);
}

export function validateComponentDSL(data: unknown) {
  return ComponentDSLSchema.safeParse(data);
}

export function validateBuilderNode(data: unknown) {
  return BuilderNodeSchema.safeParse(data);
}

export function validateNodeOperation(data: unknown) {
  return NodeOperationSchema.safeParse(data);
}

export function validatePackManifest(data: unknown) {
  return PackManifestSchema.safeParse(data);
}

export function validateRegistryManifest(data: unknown) {
  return RegistryManifestSchema.safeParse(data);
}

export function validatePackPayload(data: unknown) {
  return PackPayloadSchema.safeParse(data);
}

export function validateInstalledPackMetadata(data: unknown) {
  return InstalledPackMetadataSchema.safeParse(data);
}

/**
 * Migration helper: Ensure component has source field
 * Defaults to 'custom' for existing components without a source
 */
export function migrateComponentSource<
  T extends { source?: "custom" | "aria" },
>(component: T): T & { source: "custom" | "aria" } {
  return {
    ...component,
    source: component.source ?? "custom",
  };
}

/**
 * Migration helper: Batch migrate components to have source field
 */
export function migrateComponentsSource<
  T extends { source?: "custom" | "aria" },
>(components: T[]): Array<T & { source: "custom" | "aria" }> {
  return components.map(migrateComponentSource);
}

export function isAriaComponent(component: {
  source?: "custom" | "aria";
}): boolean {
  return component.source === "aria";
}

export function isCustomComponent(component: {
  source?: "custom" | "aria";
}): boolean {
  return component.source === "custom" || component.source === undefined;
}

export function isLockedComponent(component: {
  isLocked?: boolean;
  source?: "custom" | "aria";
}): boolean {
  // Explicitly locked or aria-sourced components with isLocked not set to false
  if (component.isLocked === true) return true;
  if (component.source === "aria" && component.isLocked !== false) return true;
  return false;
}

export function isProComponent(component: { tier?: "free" | "pro" }): boolean {
  return component.tier === "pro";
}
