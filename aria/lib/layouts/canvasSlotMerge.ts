/**
 * Merge page roots with layout slot defaultContent for canvas
 * preview and HTML publish. Does not mutate stored page.
 */

import type { BuilderNode } from "../types/nodes";
import {
  resolvePublishSlotContent,
  type LayoutWithSlotsLike,
} from "./slotEditing";
import {
  getLayoutDefaultSlotName,
  resolveNodeSlotForLayout,
  sortRootBlocksByLayoutSlot,
} from "./resolveNodeSlot";
import { resolveCanonicalLayoutSlotContent } from "../rendering/canonical/resolveLayoutSlots";

export type ResolveLayoutSlotContentFn = (
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
) => BuilderNode[];

function cloneNodeForMerge(node: BuilderNode): BuilderNode {
  return {
    ...node,
    children: node.children?.map(cloneNodeForMerge),
  };
}

/** Canvas/layers display: page override first, then layout slot defaultContent. */
export function resolveSlotRootsForDisplay(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
): BuilderNode[] {
  const pageRoots = pageNodes.filter(
    (node) => !node.metadata?.layoutDefaultInjected,
  );
  if (!layout) return [];
  return resolveCanonicalLayoutSlotContent(pageRoots, layout, slotName).map(
    (node) => ({ ...node, slot: node.slot || slotName }),
  );
}

/**
 * Build the root block list for a page + layout (canvas, SSR HTML, publish validation).
 */
/** @deprecated Use {@link resolveSlotRootsForDisplay} */
export const resolveCanvasSlotContent = resolveSlotRootsForDisplay;

export function mergePageBlocksWithLayoutSlots(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
  resolveSlotContent: ResolveLayoutSlotContentFn = resolveSlotRootsForDisplay,
): BuilderNode[] {
  if (!layout?.slots?.length) {
    return [...pageNodes];
  }

  const pageRoots = pageNodes.filter(
    (node) => !node.metadata?.layoutDefaultInjected,
  );
  const merged: BuilderNode[] = [];
  const consumedIds = new Set<string>();

  for (const slotDef of layout.slots) {
    const slotName = slotDef.name;
    const slotNodes = resolveSlotContent(pageRoots, layout, slotName);

    for (const node of slotNodes) {
      consumedIds.add(node.id);
      merged.push(node);
    }
  }

  for (const node of pageRoots) {
    if (consumedIds.has(node.id)) {
      continue;
    }

    const defaultSlot = getLayoutDefaultSlotName(layout);
    if (resolveNodeSlotForLayout(node, layout) !== defaultSlot) {
      continue;
    }

    merged.push(cloneNodeForMerge(node));
  }

  return sortRootBlocksByLayoutSlot(merged, layout);
}

/** @deprecated Use {@link mergePageBlocksWithLayoutSlots} — kept for existing imports. */
export function mergePageBlocksWithLayoutSlotsForCanvas(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
): BuilderNode[] {
  return mergePageBlocksWithLayoutSlots(
    pageNodes,
    layout,
    resolveSlotRootsForDisplay,
  );
}

export function mergePageBlocksWithLayoutSlotsForPublish(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
): BuilderNode[] {
  return mergePageBlocksWithLayoutSlots(
    pageNodes,
    layout,
    resolvePublishSlotContent,
  );
}
