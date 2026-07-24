import { z } from "zod";

export const PropFieldSchema = z
  .object({
    type: z.enum(["string", "number", "boolean", "json"]),
    description: z.string(),
    required: z.boolean().default(false),
    default: z.unknown().optional(),
    enum: z.array(z.string()).optional(),
    constraints: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),
  })
  .strict();

export type PropField = z.infer<typeof PropFieldSchema>;

export const ElementCapabilitiesSchema = z
  .object({
    motion: z.boolean(),
    motionText: z.boolean(),
    motionStagger: z.boolean(),
    motionParallax: z.boolean(),
    children: z.boolean(),
  })
  .strict();

export type ElementCapabilities = z.infer<typeof ElementCapabilitiesSchema>;

/**
 * Compute capability flags from type + category.
 * Mirrors the Inspector's runtime rules for determining what each element supports.
 */
function computeCapabilities(
  type: string,
  category: "container" | "primitive",
): ElementCapabilities {
  const t = type.toLowerCase();
  const isText = ["heading", "text", "link"].includes(t);
  const isContainerLike =
    category === "container" ||
    ["list", "icon-list", "navigation", "nav-items"].includes(t);
  const supportsMotion = t !== "code";

  return {
    motion: supportsMotion,
    motionText: supportsMotion && isText,
    motionStagger: supportsMotion && isContainerLike,
    motionParallax: supportsMotion,
    children: isContainerLike,
  };
}

export const BlockCatalogEntrySchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    category: z.enum(["container", "primitive"]),
    label: z.string().min(1),
    description: z.string().optional(),
    props: z.record(z.string(), PropFieldSchema).optional(),
    capabilities: ElementCapabilitiesSchema.optional(),
  })
  .strict();

export type BlockCatalogEntry = z.infer<typeof BlockCatalogEntrySchema>;

export const BlockCatalogSchema = z.array(BlockCatalogEntrySchema);

/** Static catalog aligned with BlockLibrary.vue element registry. */
export const BLOCK_CATALOG: BlockCatalogEntry[] = BlockCatalogSchema.parse([
  {
    id: "section",
    type: "section",
    category: "container",
    label: "Section",
    props: {},
    capabilities: computeCapabilities("section", "container"),
  },
  {
    id: "container",
    type: "container",
    category: "container",
    label: "Container",
    props: {},
    capabilities: computeCapabilities("container", "container"),
  },
  {
    id: "component",
    type: "component",
    category: "container",
    label: "Component",
    props: {},
    capabilities: computeCapabilities("component", "container"),
  },

  {
    id: "heading",
    type: "heading",
    category: "primitive",
    label: "Heading",
    props: {
      text: {
        type: "string",
        description: "Heading text. Also accepts 'content' as alias.",
        required: true,
      },
      level: {
        type: "number",
        description: "Heading level 1–6. Determines default HTML tag.",
        constraints: { min: 1, max: 6 },
        default: 2,
      },
      element: {
        type: "string",
        description: "Override rendered tag. Must match level if h1–h6.",
        enum: ["h1", "h2", "h3", "h4", "h5", "h6", "div", "p", "span"],
      },
    },
    capabilities: computeCapabilities("heading", "primitive"),
  },

  {
    id: "text",
    type: "text",
    category: "primitive",
    label: "Text",
    props: {
      content: {
        type: "string",
        description: "Paragraph text. Also accepts 'text' as alias.",
        required: true,
      },
      element: {
        type: "string",
        description: "Override rendered tag.",
        enum: ["p", "div", "span", "figcaption", "address"],
      },
    },
    capabilities: computeCapabilities("text", "primitive"),
  },

  {
    id: "button",
    type: "button",
    category: "primitive",
    label: "Button",
    props: {
      text: {
        type: "string",
        description: "Button label text.",
        required: true,
      },
      href: {
        type: "string",
        description: "Link URL (makes button an <a> tag).",
      },
      variant: {
        type: "string",
        description: "Visual style variant.",
        enum: ["primary", "secondary", "outline", "ghost", "link"],
      },
      size: {
        type: "string",
        description: "Button size.",
        enum: ["sm", "md", "lg"],
      },
      icon: {
        type: "json",
        description:
          'Leading icon: { id: "lucide:star", pack: "lucide", name: "star", source: "iconify" }',
      },
      iconPosition: {
        type: "string",
        description: "Icon placement.",
        enum: ["left", "right"],
        default: "left",
      },
      iconGap: {
        type: "string",
        description: "Space between icon and text.",
      },
      iconSize: {
        type: "string",
        description: "Icon size (CSS length, e.g. 1.25em, 20px).",
        default: "1em",
      },
      iconColor: {
        type: "string",
        description: "Icon color (any CSS color value).",
        default: "currentColor",
      },
    },
    capabilities: computeCapabilities("button", "primitive"),
  },

  {
    id: "image",
    type: "image",
    category: "primitive",
    label: "Image",
    props: {
      src: {
        type: "string",
        description: "Image URL (unsplash, uploaded, or external).",
        required: true,
      },
      alt: {
        type: "string",
        description: "Alt text for accessibility.",
      },
      width: {
        type: "string",
        description: "Image width (px, %, or CSS value).",
      },
      height: {
        type: "string",
        description: "Image height (px, %, or CSS value).",
      },
    },
    capabilities: computeCapabilities("image", "primitive"),
  },

  {
    id: "video",
    type: "video",
    category: "primitive",
    label: "Video",
    props: {
      src: {
        type: "string",
        description: "Video URL.",
        required: true,
      },
      poster: {
        type: "string",
        description: "Poster image URL shown before playback.",
      },
      controls: {
        type: "boolean",
        description: "Show play/pause/seek controls.",
        default: true,
      },
      muted: {
        type: "boolean",
        description: "Start muted.",
        default: false,
      },
      loop: {
        type: "boolean",
        description: "Loop playback.",
        default: false,
      },
      autoplay: {
        type: "boolean",
        description: "Start playing automatically.",
        default: false,
      },
      playsinline: {
        type: "boolean",
        description: "Play inline on mobile (no fullscreen).",
        default: false,
      },
      preload: {
        type: "string",
        description: "Preload strategy.",
        enum: ["none", "metadata", "auto"],
        default: "metadata",
      },
    },
    capabilities: computeCapabilities("video", "primitive"),
  },

  {
    id: "icon",
    type: "icon",
    category: "primitive",
    label: "Icon",
    props: {
      icon: {
        type: "json",
        description:
          'Icon reference: { id: string, pack: string, name: string, source: "iconify" }',
        required: true,
      },
      ariaLabel: {
        type: "string",
        description: "Accessible label for screen readers.",
      },
    },
    capabilities: computeCapabilities("icon", "primitive"),
  },

  {
    id: "link",
    type: "link",
    category: "primitive",
    label: "Link",
    props: {
      href: {
        type: "string",
        description: "URL the link points to.",
        required: true,
      },
      text: {
        type: "string",
        description: "Link display text.",
        required: true,
      },
      target: {
        type: "string",
        description: "Link target.",
        enum: ["_self", "_blank", "_parent", "_top"],
      },
      rel: {
        type: "string",
        description:
          "Link relationship attribute (e.g. 'noopener noreferrer').",
      },
    },
    capabilities: computeCapabilities("link", "primitive"),
  },

  {
    id: "pagination",
    type: "pagination",
    category: "primitive",
    label: "Pagination",
    description:
      "Pagination controls for a container with a paginated data source.",
    props: {
      style: {
        type: "string",
        description: "Pagination control style.",
        enum: ["numbers", "simple"],
        default: "numbers",
      },
      maxPageButtons: {
        type: "number",
        description: "Maximum numbered page buttons.",
        constraints: { min: 1, max: 20 },
        default: 5,
      },
      pageParam: {
        type: "string",
        description: "URL query parameter used for the current page.",
        default: "page",
      },
      labels: {
        type: "json",
        description: 'Button labels, e.g. { "prev": "Previous", "next": "Next" }.',
      },
    },
    capabilities: computeCapabilities("pagination", "primitive"),
  },

  {
    id: "navigation",
    type: "navigation",
    category: "primitive",
    label: "Navigation",
    description:
      "Styled semantic site navigation using editable Class Manager classes. Supports static, CMS, and mixed manual/CMS items. Children: nav-items and optional nav-toggle for mobile.",
    props: {
      ariaLabel: {
        type: "string",
        description: "Accessible label for the <nav> landmark.",
        default: "Main navigation",
      },
      sourceMode: {
        type: "string",
        description:
          "static = manual items, cms = bind to a collection, mixed = manual items plus a CMS item group.",
        enum: ["static", "cms", "mixed"],
        default: "static",
      },
      submenuTrigger: {
        type: "string",
        description: "How nested submenus open.",
        enum: ["hover", "click", "both"],
        default: "hover",
      },
      mobileEnabled: {
        type: "boolean",
        description: "Enable responsive mobile menu.",
        default: true,
      },
      activeMatch: {
        type: "string",
        description: "How current page links are highlighted.",
        enum: ["exact", "prefix", "none"],
        default: "prefix",
      },
    },
    capabilities: computeCapabilities("navigation", "primitive"),
  },

  {
    id: "list",
    type: "list",
    category: "primitive",
    label: "List",
    description:
      "Ordered or unordered list. Children are auto-generated from props.items — do NOT add children manually.",
    props: {
      items: {
        type: "json",
        description:
          "Array of strings that expand into child <li> elements. Do NOT add children manually.",
        required: true,
      },
      ordered: {
        type: "boolean",
        description: "true = <ol>, false = <ul>.",
        default: false,
      },
    },
    capabilities: computeCapabilities("list", "primitive"),
  },

  {
    id: "icon-list",
    type: "list",
    category: "primitive",
    label: "Icon list",
    description:
      "List with icon markers. Rendered as the same component as list; the renderer uses props.icon to enable icon markers.",
    props: {
      items: {
        type: "json",
        description:
          "Array of strings that expand into child <li> elements with leading icons.",
        required: true,
      },
      icon: {
        type: "json",
        description:
          'Optional icon override: { id: string, pack: string, name: string, source: "iconify" }',
      },
    },
    capabilities: computeCapabilities("icon-list", "primitive"),
  },

  {
    id: "svg",
    type: "svg",
    category: "primitive",
    label: "SVG",
    props: {
      content: {
        type: "string",
        description: "Inline SVG markup as a string.",
        required: true,
      },
      viewBox: {
        type: "string",
        description: "SVG viewBox attribute, e.g. '0 0 24 24'.",
      },
      width: {
        type: "string",
        description: "Display width, e.g. '48'.",
      },
      height: {
        type: "string",
        description: "Display height, e.g. '48'.",
      },
      fill: {
        type: "string",
        description: "Fill color, e.g. 'none' or 'currentColor'.",
      },
      stroke: {
        type: "string",
        description: "Stroke color, e.g. 'currentColor'.",
      },
      strokeWidth: {
        type: "string",
        description: "Stroke width, e.g. '1.8'.",
      },
    },
    capabilities: computeCapabilities("svg", "primitive"),
  },

  {
    id: "code",
    type: "code",
    category: "primitive",
    label: "Code",
    description: "Code block with syntax highlighting",
    props: {
      content: {
        type: "string",
        description:
          "The code content. Also accepts 'code' or 'text' as legacy aliases.",
        required: true,
      },
      language: {
        type: "string",
        description:
          "Language hint for syntax highlighting and auto-detection.",
        enum: [
          "javascript",
          "html",
          "css",
          "json",
          "typescript",
          "python",
          "bash",
          "sql",
          "xml",
          "markdown",
          "yaml",
        ],
      },
      renderMode: {
        type: "string",
        description:
          "'display' shows formatted code. 'render' wraps JS in <script> and CSS in <style> (use only for trusted code).",
        enum: ["display", "render"],
        default: "display",
      },
    },
    capabilities: computeCapabilities("code", "primitive"),
  },
]);

/**
 * Build a human-readable summary of available block types for the system prompt.
 */
export function getBlockCatalogSummary(): string {
  const containers = BLOCK_CATALOG.filter((e) => e.category === "container");
  const primitives = BLOCK_CATALOG.filter((e) => e.category === "primitive");
  return [
    "Containers: " + containers.map((e) => e.label).join(", "),
    "Primitives: " + primitives.map((e) => e.label).join(", "),
  ].join("\n");
}

/**
 * Return all catalog entries as a flat array (for the aria_list_element_types tool).
 */
export function listElementTypes(): BlockCatalogEntry[] {
  return [...BLOCK_CATALOG];
}
