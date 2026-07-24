/**
 * Core types for the hierarchical node-based builder
 * system. Replaces the flat block-based architecture.
 */

import type { CmsDateFormatId } from "../cms/dateBindingFormats";
import type { NodeClassNames } from "../schemas/classEditor";
import type { NodeMotion } from "../motion/schemas/nodeMotion.schema";
import type {
  ComposerNodeMediaReferences,
  ComposerResponsiveImage,
} from "../media/composerReference";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type NodeProps = JsonObject;

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  return isJsonObject(value);
}

export function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => entry === undefined || isJsonValue(entry),
  );
}

/**
 * CSS Framework selection for the builder
 * - unocss: Use UnoCSS JIT utility framework
 * - custom: Use handwritten CSS via StyleMap
 */
export type CSSFramework = "unocss" | "custom";

export interface BreakpointDefinition {
  name: string;
  minWidth: string;
  canvasWidth?: number | null;
  label?: string;
  order?: number;
}

/**
 * Header/footer region assignments for layouts/pages
 */
export interface LayoutRegions {
  headerComponent?: string;
  footerComponent?: string;
}

/**
 * Layout metadata used in the editor for regions, layout hints, etc.
 */
export interface LayoutMetadata {
  regions?: LayoutRegions;
  layoutType?: string;
  description?: string;
}

/**
 * Canonical fallback breakpoints used when a caller does not pass the
 * universal design system breakpoint list explicitly.
 */
export const DEFAULT_BREAKPOINTS: BreakpointDefinition[] = [
  { name: "base", minWidth: "1280px", label: "Desktop" },
  { name: "tablet", minWidth: "768px", label: "Tablet" },
  { name: "mobile", minWidth: "0px", label: "Mobile" },
];

/**
 * Responsive utility type for values that can vary across breakpoints
 * Uses Record to support dynamic breakpoint names
 *
 * @example
 * ```typescript
 * const padding: Responsive<string> = {
 *   base: '1rem',
 *   md: '2rem',
 *   lg: '3rem'
 * };
 * ```
 */
export type Responsive<T> = Record<string, T | undefined>;

/**
 * Style map for CSS properties with responsive support
 * Uses CSS custom property naming conventions
 */
export type StyleMap = {
  display?: Responsive<string>;
  position?: Responsive<string>;
  overflow?: Responsive<string>;

  flexDirection?: Responsive<string>;
  flexWrap?: Responsive<string>;
  justifyContent?: Responsive<string>;
  alignItems?: Responsive<string>;
  alignContent?: Responsive<string>;
  justifyItems?: Responsive<string>;
  gap?: Responsive<string>;
  flowTolerance?: Responsive<string>;
  gridColumn?: Responsive<string>;
  gridTemplateColumns?: Responsive<string>;
  gridTemplateRows?: Responsive<string>;
  listStyleType?: Responsive<string>;
  listStylePosition?: Responsive<string>;

  padding?: Responsive<string>;
  paddingTop?: Responsive<string>;
  paddingRight?: Responsive<string>;
  paddingBottom?: Responsive<string>;
  paddingLeft?: Responsive<string>;
  margin?: Responsive<string>;
  marginTop?: Responsive<string>;
  marginRight?: Responsive<string>;
  marginBottom?: Responsive<string>;
  marginLeft?: Responsive<string>;

  width?: Responsive<string>;
  height?: Responsive<string>;
  widthSizing?: Responsive<"hug" | "fill" | "exact">;
  heightSizing?: Responsive<"hug" | "fill" | "exact">;
  minWidth?: Responsive<string>;
  minHeight?: Responsive<string>;
  maxWidth?: Responsive<string>;
  maxHeight?: Responsive<string>;
  flexGrow?: Responsive<string>;
  flexShrink?: Responsive<string>;
  flexBasis?: Responsive<string>;
  alignSelf?: Responsive<string>;
  justifySelf?: Responsive<string>;

  fontSize?: Responsive<string>;
  fontWeight?: Responsive<string>;
  fontFamily?: Responsive<string>;
  lineHeight?: Responsive<string>;
  letterSpacing?: Responsive<string>;
  textAlign?: Responsive<string>;
  textTransform?: Responsive<string>;
  textDecoration?: Responsive<string>;

  color?: Responsive<string>;
  backgroundColor?: Responsive<string>;
  backgroundImage?: Responsive<string>;
  backgroundSize?: Responsive<string>;
  backgroundPosition?: Responsive<string>;
  backgroundRepeat?: Responsive<string>;
  backgroundAttachment?: Responsive<string>;
  backgroundBlendMode?: Responsive<string>;

  border?: Responsive<string>;
  borderWidth?: Responsive<string>;
  borderStyle?: Responsive<string>;
  borderColor?: Responsive<string>;
  borderRadius?: Responsive<string>;

  opacity?: Responsive<string>;
  boxShadow?: Responsive<string>;
  transform?: Responsive<string>;
  transformOrigin?: Responsive<string>;
  transition?: Responsive<string>;

  zIndex?: Responsive<string>;

  [key: string]: Responsive<string> | undefined;
};

/**
 * Hydration mode for Astro components - `static`: No client-side hydration
 * (default) - `load`: Hydrate immediately on page load (client:load).
 */
export type HydrationMode =
  | "static"
  | "load"
  | "idle"
  | "visible"
  | "media"
  | "only";

export interface HydrationDirective {
  mode: HydrationMode;
  media?: string;
  /** Framework for client:only (e.g., 'vue', 'react') */
  framework?: string;
}

export interface AnimationConfig {
  trigger: "click" | "hover" | "scroll" | "load" | "viewport";
  animation: string; // CSS animation name or preset
  duration?: string;
  delay?: string;
  easing?: string;
}

/**
 * Interaction handlers for node events
 */
export interface NodeInteractions {
  onClick?: string; // Action ID or JS expression
  onHover?: string;
  onScroll?: string;
  animations?: AnimationConfig[];
}

/**
 * Style variants for component states
 */
export interface NodeVariants {
  default?: string; // "primary", "secondary", etc.
  hover?: string;
  active?: string;
  focus?: string;
  disabled?: string;
}

/**
 * Accessibility configuration
 */
export interface NodeAccessibility {
  role?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
  ariaHidden?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  tabIndex?: number;
  [key: string]: JsonValue | undefined;
}

export interface DataSourceCache {
  ttl?: number; // Time to live in seconds
  strategy?: "swr" | "stale-while-revalidate" | "cache-first";
}

/**
 * Data source configuration for dynamic content
 */
export interface NodeDataSource {
  type: "static" | "cms" | "collection" | "api" | "pagination";
  collection?: string; // Collection name for CMS
  endpoint?: string; // API endpoint
  targetNodeId?: string; // List container id for pagination blocks
  source?: "collection" | "field"; // Collection query or field-scoped loop
  field?: string; // Field path for field-scoped loops
  entryScope?: "context"; // Use current entry/item context

  mode?: "single" | "list"; // Fetch one entry or multiple
  filter?: JsonObject; // Query filters
  sort?: string; // Sort field: 'date' | '-date' | 'title'
  limit?: number; // Pagination limit
  offset?: number; // Pagination offset
  locale?: string; // Locale override for CMS content

  include?: string[]; // Related collections to populate: ['author', 'tags']

  status?: "published" | "draft" | "scheduled" | "archived"; // Filter by status
  includeScheduled?: boolean; // Include scheduled content
  scheduledBefore?: string; // ISO date string for scheduled content cutoff

  cache?: DataSourceCache; // Caching configuration
  live?: boolean; // Enable live updates via SSE/WebSocket

  transform?: string; // JS function to transform data
  itemTemplate?: string; // Template for repeaters/loops
  bindings?: Record<string, string>; // Property bindings: { text: "post.title" }
  bindingFormats?: Record<string, CmsDateFormatId>;
  fallback?: JsonValue; // Default/loading state data
  onError?: "hide" | "show-fallback" | "show-error"; // Error handling strategy
}

/**
 * Component reference for library instances
 */
export interface NodeReference {
  type: "instance" | "master" | "component";
  id?: string; // Reference ID (for querying specific instances)
  masterId?: string; // ID of master component
  overrides?: JsonObject; // Local overrides to master
}

/**
 * Core builder node interface
 * Represents a single node in the hierarchical component tree
 */
export interface BuilderNode {
  id: string;

  /** Component type (e.g., 'Container', 'Button', 'custom:MyComponent') */
  type: string;

  /** Component properties */
  props: NodeProps;

  /** Utility classes per breakpoint (mobile-first) */
  classNames?: NodeClassNames;

  customClasses?: string[];

  /** Inline styles for this node (StyleMap for custom mode) */
  styles: StyleMap;

  /** Child nodes (hierarchical structure) */
  children: BuilderNode[];

  /** Slot assignment (for nodes within layouts/components with slots) */
  slot?: string;

  /** Reference to source component (if this is a component instance) */
  componentRef?: string;

  hydration?: HydrationDirective;

  /** Interaction handlers and animations */
  interactions?: NodeInteractions;

  /** Aria Motion entrance and interaction configuration */
  motion?: NodeMotion;

  variants?: NodeVariants;

  /** Accessibility configuration */
  a11y?: NodeAccessibility;

  /** Dynamic data source binding (for CMS/API content) */
  dataSource?: NodeDataSource;

  reference?: NodeReference;

  metadata?: {
    /** Display name in the editor */
    label?: string;
    locked?: boolean;
    hidden?: boolean;
    notes?: string;
    tags?: string[];
    version?: number;
    migrationLog?: string[];
    /** Section ordering in page content */
    order?: number;
    /** Per-section publish state */
    isPublished?: boolean;
    /** ISO timestamp of section publish */
    publishedAt?: string;
    /** Contributor-facing content editor exposure settings */
    contentEditor?: NodeContentEditorSettings;
    /** Stable media ownership for composer-authored image surfaces. */
    mediaReferences?: ComposerNodeMediaReferences;
    /** Renderer-owned responsive image delivery configuration. */
    responsiveImage?: ComposerResponsiveImage;
    [key: string]: unknown;
  };

  [key: string]: unknown;
}

/**
 * Page DSL (Domain Specific Language)
 * Represents a complete page structure
 */
export interface PageDSL {
  /** Page metadata */
  id: string;
  title: string;
  slug: string;
  description?: string;

  /** Hierarchy */
  parent?: string;
  order?: number;

  layout?: string;

  nodes: BuilderNode[];

  /** Arbitrary frontmatter data (for user-defined metadata) */
  frontmatter?: JsonObject;

  settings?: {
    seo?: {
      title?: string;
      description?: string;
      keywords?: string[];
      canonical?: string;
      noindex?: boolean;
      nofollow?: boolean;
      ogTitle?: string;
      ogDescription?: string;
      ogImage?: string;
      ogType?: string;
      twitterCard?: "summary" | "summary_large_image" | "app" | "player";
      twitterSite?: string;
      twitterCreator?: string;
      structuredData?: JsonObject; // Schema.org JSON-LD
    };

    head?: {
      links?: Array<{ rel: string; href: string; [key: string]: string }>;
      scripts?: Array<{
        src?: string;
        content?: string;
        [key: string]: string | undefined;
      }>;
      meta?: Array<{ name?: string; property?: string; content: string }>;
    };

    /** Raw HTML injected into document head */
    headHTML?: string;

    cssVariables?: Record<string, string>;

    /** Responsive breakpoint definitions */
    breakpoints?: BreakpointDefinition[];

    viewTransitions?: {
      enabled?: boolean;
      fallback?: "animate" | "swap" | "none";
    };

    prerender?: boolean;

    imageDefaults?: {
      format?: "avif" | "webp" | "jpeg" | "png";
      quality?: number;
      loading?: "lazy" | "eager";
      decoding?: "async" | "sync" | "auto";
      widths?: number[];
      sizes?: string;
    };

    serverIslands?: {
      enabled?: boolean;
      fallbackStrategy?: "placeholder" | "spinner" | "skeleton";
    };

    /** Astro v5: Content Security Policy */
    csp?: {
      enabled?: boolean;
      directives?: Record<string, string[]>;
    };

    prefetchStrategy?: "tap" | "hover" | "viewport" | "load";

    headers?: Record<string, string>;
  };

  /** Scheduling & Publishing */
  scheduledPublishAt?: string; // ISO 8601 timestamp
  expiresAt?: string; // ISO 8601 timestamp
  autoArchive?: boolean;

  /** Organization & Discovery */
  tags?: string[];
  categories?: string[];
  featured?: boolean;
  visibility?: "public" | "private" | "unlisted" | "draft";
  searchable?: boolean;

  /** Media */
  featuredImage?: {
    src: string;
    alt?: string;
    caption?: string;
    width?: number;
    height?: number;
  };
  thumbnail?: {
    src: string;
    alt?: string;
  };

  /**
   * /** Legacy collaboration projections inside dsl_json — NOT durable source of
   * truth. Canonical authorship is derived from version rows via meta pointers.
   */
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
  /** @see author — compatibility projection */
  contributors?: Array<{
    id: string;
    role?: string;
  }>;
  /** @see author — compatibility projection */
  reviewStatus?: "pending" | "approved" | "rejected";
  /** @see author — compatibility projection (id only; optional meta.assigned_to) */
  assignedTo?: string;

  analytics?: {
    enabled?: boolean;
    trackingId?: string; // Cloudflare Web Analytics site token
    customEvents?: string[];
    goals?: string[];
  };

  version?: string;
  previousVersionId?: string;
  changeLog?: string;
  /** @see author — compatibility projection; version row created_at is canonical */
  createdAt?: string;
  /** @see author — compatibility projection; draft/current version actor is canonical */
  updatedAt?: string;
  /** @see author — compatibility projection; published_version row is canonical */
  publishedAt?: string;

  status?: "draft" | "published" | "scheduled" | "archived";

  /**
   * /** Access policy summary surfaced from listing queries (NOT part
   * of the authored DSL stored in `aria_page_versions`). Populated by.
   */
  systemRole?: "standard" | "not-found" | "cms-collection" | "cms-entry";
  accessMode?: "public" | "password" | "private" | "unlisted";
  hasPassword?: boolean;

  /** Derived: true when draft_version !== published_version */
  isModifiedSincePublish?: boolean;

  /** Computed page analytics cached at save-time */
  _computedMetrics?: {
    sectionCount: number;
    componentCount: number;
    mediaCount: number;
    dynamicCount: number;
    customCodeCount: number;
    computedAt: string; // ISO timestamp
    contentHash: string; // SHA-256 hex digest for cache validation
  };
}

/**
 * Layout DSL
 * Represents a reusable layout with slots
 */
export interface LayoutDSL {
  /** Layout metadata */
  id: string;
  name: string;
  slug?: string; // URL-friendly identifier for layouts
  title?: string; // Display title (defaults to name)
  description?: string;
  order?: number; // Sort order in UI lists

  /** Layout structure with slot definitions */
  nodes: BuilderNode[];

  /** Slot definitions */
  slots: {
    /** Slot identifier */
    name: string;
    defaultContent?: BuilderNode[];
    required?: boolean;
    label?: string;
    isDefault?: boolean;
  }[];

  metadata?: LayoutMetadata;
  layoutMetadata?: LayoutMetadata;

  /** Layout region assignments (header/footer components) */
  regions?: LayoutRegions;

  settings?: {
    cssVariables?: Record<string, string>;
    /** Responsive breakpoint definitions */
    breakpoints?: BreakpointDefinition[];
  };

  /** Organization & Discovery */
  tags?: string[];
  categories?: string[];
  layoutType?: string; // "single-column", "sidebar", "grid", etc.

  /**
   * Legacy collaboration projections — NOT durable source of truth.
   * @see PageDSL.author
   */
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
  /** @see PageDSL.author */
  contributors?: Array<{
    id: string;
    role?: string;
  }>;

  usage?: {
    activePages?: number; // How many pages currently use this layout
    lastUsed?: string; // ISO timestamp
    popularity?: number; // Usage metric/score
  };

  version?: string;
  /** @see PageDSL.author */
  createdAt?: string;
  /** @see PageDSL.author */
  updatedAt?: string;
}

/**
 * Component source identifier
 * - custom: User-created component (editable, deletable)
 * - aria: Official Aria library component (locked, read-only)
 */
export type ComponentSource = "custom" | "aria";

/**
 * Component tier for gating features
 * - free: Available to all users
 * - pro: Requires Pro subscription
 */
export type ComponentTier = "free" | "pro";

/**
 * Prop schema field type for component configuration UIs
 *
 * Legacy types are retained for backward compatibility.
 */
export type ComponentPropFieldType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "text"
  | "textarea"
  | "select"
  | "icon"
  | "color"
  | "url";

/**
 * Option definition for select-style prop controls
 */
export interface ComponentPropOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Conditional display rule for prop controls
 */
export interface ComponentPropCondition {
  field: string;
  operator: "equals" | "notEquals" | "exists" | "notEmpty";
  value?: string | number | boolean | null;
}

export interface ContentEditorFieldSettings {
  enabled?: boolean;
  locked?: boolean;
  hidden?: boolean;
  label?: string;
  order?: number;
}

export interface NodeContentEditorSettings extends ContentEditorFieldSettings {
  fields?: Record<string, ContentEditorFieldSettings>;
}

export interface ComponentCmsPreviewSettings {
  collectionId: string;
  entryId: string;
  entrySlug?: string;
}

/**
 * Manual prop schema definition used by Studio property editors
 */
export interface ComponentPropSchemaDefinition {
  name: string;
  type: ComponentPropFieldType;
  default?: unknown;
  required?: boolean;
  description?: string;
  label?: string;
  section?: "Appearance" | "Content" | "Behavior" | "Accessibility";
  placeholder?: string;
  options?: ComponentPropOption[];
  editable?: boolean;
  hidden?: boolean;
  visual?: boolean;
  iconSet?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  pattern?: string;
  condition?: ComponentPropCondition;
  contentEditor?: ContentEditorFieldSettings;
}

/**
 * Component DSL
 * Represents a reusable component
 */
export interface ComponentDSL {
  /** Component metadata */
  id: string;
  name: string;
  title?: string; // Display title (defaults to name)
  description?: string;
  category?: string;
  order?: number; // Sort order in UI lists

  source?: ComponentSource; // Defaults to 'custom' for existing components
  packId?: string; // Pack identifier for aria-sourced components
  tier?: ComponentTier; // Defaults to 'free'
  isLocked?: boolean; // If true, component structure cannot be edited

  /** Component structure */
  nodes: BuilderNode[];

  /** Component prop definitions (for type safety and UI generation) */
  propSchema?: ComponentPropSchemaDefinition[];

  slots?: {
    name: string;
    defaultContent?: BuilderNode[];
    required?: boolean;
    label?: string;
    isDefault?: boolean;
  }[];

  settings?: {
    canHaveChildren?: boolean;
    /** Allowed parent types */
    allowedParents?: string[];
    cssVariables?: Record<string, string>;
    /** Responsive breakpoint definitions */
    breakpoints?: BreakpointDefinition[];
    /** Source Aria component ID when this custom component was copied from Aria Library */
    copiedFromAriaComponentId?: string;
    /** Editor-only CMS preview selection for component detail. */
    cmsPreview?: ComponentCmsPreviewSettings;
  };

  /** Astro island hydration directive for interactive components */
  hydration?: HydrationDirective;

  /** Organization & Discovery */
  tags?: string[];
  thumbnail?: string; // Auto-generated preview image URL
  visibility?: "private" | "team"; // Private or shared to team

  /**
   * Legacy author projection — NOT durable source of truth.
   * @see PageDSL.author
   */
  author?: {
    id: string;
    name?: string;
    email?: string;
  };

  usage?: {
    activeInstances?: number; // Total instances across all pages/layouts
    lastUsed?: string; // ISO timestamp - last time used/modified
    popularity?: number; // Calculated usage score
  };

  version?: string;
  schemaVersion?: string; // For tracking breaking changes in prop schema
  /** @see PageDSL.author */
  createdAt?: string;
  /** @see PageDSL.author */
  updatedAt?: string;
}

/**
 * Component pack manifest - describes a downloadable pack of components
 */
export interface PackManifest {
  /** Unique pack identifier (e.g., 'aria-core', 'aria-ecommerce') */
  id: string;
  name: string;
  description?: string;
  /** Semantic version (e.g., '1.0.0') */
  version: string;
  minAppVersion?: string;
  tier: ComponentTier;
  componentIds: string[];
  thumbnail?: string;
  tags?: string[];
  /** ISO timestamp of pack publication */
  publishedAt: string;
  /** Checksum of pack payload for integrity verification */
  checksum?: string;
  /** Signer key identifier used to verify the detached signature */
  signerKeyId?: string;
  signatureAlgorithm?: SignatureAlgorithm;
  signature?: string;
}

export type SignatureAlgorithm = "ECDSA_P256_SHA256";

/**
 * Registry manifest - describes available packs in the registry
 */
export interface RegistryManifest {
  schemaVersion: string;
  /** Last update timestamp */
  updatedAt: string;
  packs: PackManifest[];
}

export interface InstalledPackMetadata {
  packId: string;
  version: string;
  /** Installation timestamp */
  installedAt: string;
  /** Last update check timestamp */
  lastCheckedAt?: string;
  registryUrl?: string;
}

export interface PackPayload {
  manifest: PackManifest;
  components: ComponentDSL[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    nodeId: string;
    message: string;
    path: string[];
  }>;
}

export type NodeOperation =
  | { type: "update"; nodeId: string; updates: Partial<BuilderNode> }
  | { type: "insert"; parentId: string; node: BuilderNode; index?: number }
  | { type: "delete"; nodeId: string }
  | { type: "move"; nodeId: string; newParentId: string; index?: number }
  | { type: "reorder"; parentId: string; oldIndex: number; newIndex: number };

/**
 * Flat node representation (for serialization/storage optimization)
 */
export interface FlatNode extends Omit<BuilderNode, "children"> {
  /** Parent node ID (null for root nodes) */
  parentId: string | null;
  index: number;
}
