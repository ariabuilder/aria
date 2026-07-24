import type { BuilderNode } from "../types/nodes";

/** Metadata about a single section (top-level node) extracted from the tree. */
export interface SectionInfo {
  id: string;
  name: string;
  type: string;
  variant?: string;
  isVisible: boolean;
  order: number;
  status: "published" | "draft";
  lastModified?: string;
}

/**
 * Extract section info from the top-level nodes of a page tree.
 *
 * Each top-level node is treated as a section.  The function maps over the
 * array and derives presentation metadata from the node's `metadata` object
 * (and the node's own `id` / `type`).
 *
 * @param nodes – The page-level node array.
 * @returns An ordered list of section descriptors.
 */
export function extractSections(nodes: BuilderNode[]): SectionInfo[] {
  return nodes.map((node, index) => {
    const meta = node.metadata;

    // Safely read potentially unknown metadata keys
    const isPublished =
      meta != null &&
      typeof (meta as Record<string, unknown>).isPublished === "boolean"
        ? ((meta as Record<string, unknown>).isPublished as boolean)
        : true;

    const metaRecord = meta != null ? (meta as Record<string, unknown>) : null;

    return {
      id: node.id,
      name: meta?.label ?? node.type,
      type: node.type,
      variant:
        metaRecord != null && typeof metaRecord.variant === "string"
          ? metaRecord.variant
          : undefined,
      isVisible: meta?.hidden !== true,
      order:
        metaRecord != null && typeof metaRecord.order === "number"
          ? (metaRecord.order as number)
          : index,
      status: isPublished === false ? "draft" : "published",
      lastModified:
        metaRecord != null && typeof metaRecord.lastModified === "string"
          ? metaRecord.lastModified
          : undefined,
    };
  });
}

/**
 * Count total top-level sections in the node tree.
 *
 * This is simply the length of the top-level array, since each entry
 * represents one section.
 *
 * @param nodes – The page-level node array.
 * @returns The number of sections.
 */
export function countSections(nodes: BuilderNode[]): number {
  return nodes.length;
}

/**
 * Count all component nodes in the tree.
 *
 * A node is considered a component when its `type` equals `"Component"` or
 * when it carries a `reference` object (i.e. it is an instance of a library
 * component).
 *
 * @param nodes – The node array to search (searched recursively).
 * @returns The total number of matching nodes.
 */
export function countComponents(nodes: BuilderNode[]): number {
  let count = 0;

  function walk(list: BuilderNode[]): void {
    for (const node of list) {
      if (node.type === "Component" || node.reference != null) {
        count++;
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return count;
}

/**
 * Count all media nodes in the tree.
 *
 * A node is considered media when its `type` is `"Image"` or `"Video"`, or
 * when its `props.src` property exists and is a string.
 *
 * @param nodes – The node array to search (searched recursively).
 * @returns The total number of matching nodes.
 */
export function countMedia(nodes: BuilderNode[]): number {
  let count = 0;

  function walk(list: BuilderNode[]): void {
    for (const node of list) {
      if (
        node.type === "Image" ||
        node.type === "Video" ||
        (node.props != null && typeof node.props.src === "string")
      ) {
        count++;
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return count;
}

/**
 * Count all dynamically-bound nodes in the tree.
 *
 * A node is considered dynamic when it has a `dataSource` property defined.
 *
 * @param nodes – The node array to search (searched recursively).
 * @returns The total number of matching nodes.
 */
export function countDynamic(nodes: BuilderNode[]): number {
  let count = 0;

  function walk(list: BuilderNode[]): void {
    for (const node of list) {
      if (node.dataSource != null) {
        count++;
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return count;
}

/**
 * Count all custom-code / embed / script nodes in the tree.
 *
 * Matching types are: `"CustomCode"`, `"Embed"`, `"Script"`,
 * `"custom:code"`, `"custom:embed"`, `"custom:script"`.
 *
 * @param nodes – The node array to search (searched recursively).
 * @returns The total number of matching nodes.
 */
export function countCustomCode(nodes: BuilderNode[]): number {
  const CUSTOM_CODE_TYPES = new Set([
    "CustomCode",
    "Embed",
    "Script",
    "custom:code",
    "custom:embed",
    "custom:script",
  ]);

  let count = 0;

  function walk(list: BuilderNode[]): void {
    for (const node of list) {
      if (CUSTOM_CODE_TYPES.has(node.type)) {
        count++;
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return count;
}

/** Aggregated page analytics derived from a `BuilderNode` tree. */
export interface PageAnalytics {
  sectionCount: number;
  componentCount: number;
  mediaCount: number;
  dynamicCount: number;
  customCodeCount: number;
}

/**
 * Compute all page-level analytics from a `BuilderNode` tree in a single pass.
 *
 * @param nodes – The page-level node array.
 * @returns A {@link PageAnalytics} object with all pre-computed counts.
 */
export function computePageAnalytics(nodes: BuilderNode[]): PageAnalytics {
  return {
    sectionCount: countSections(nodes),
    componentCount: countComponents(nodes),
    mediaCount: countMedia(nodes),
    dynamicCount: countDynamic(nodes),
    customCodeCount: countCustomCode(nodes),
  };
}
