/**
 * Layout slot editing — scope, publish resolution, and layout DSL helpers.
 */

import type { BuilderNode } from "../types/nodes";
import type { LayoutSlotScope } from "../schemas/slotEditing";
import {
  getLayoutDefaultSlotName,
  migratePageRootNodeSlots,
  type LayoutSlotContext,
  type LayoutSlotRef,
  resolveNodeSlotForLayout,
  sortRootBlocksByLayoutSlot,
} from "./resolveNodeSlot";

export interface LayoutSlotDefinitionLike extends LayoutSlotRef {
  label?: string;
  defaultContent?: BuilderNode[];
}

export interface LayoutWithSlotsLike extends LayoutSlotContext {
  id?: string;
  name?: string;
  slots?: LayoutSlotDefinitionLike[];
}

export function getSlotScope(
  slotName: string,
  layout?: LayoutWithSlotsLike | null,
): LayoutSlotScope {
  return getEditorSlotScope("page", slotName, layout);
}

export function getEditorSlotScope(
  itemType: "page" | "layout" | "component" | undefined,
  slotName: string,
  layout?: LayoutWithSlotsLike | null,
): LayoutSlotScope {
  const trimmed = slotName.trim();
  const slotExists = Boolean(
    layout?.slots?.some((slot) => slot.name === trimmed),
  );
  if (!slotExists) {
    return "page";
  }

  if (itemType === "layout" || itemType === "component") {
    return itemType === "layout" ? "layout" : "page";
  }

  const defaultSlot = getLayoutDefaultSlotName(layout);
  if (trimmed !== defaultSlot) {
    return "layout";
  }

  return "page";
}

/**
 * Remove page root nodes assigned to shared (non-default) layout slots.
 * Header/footer content lives in layout.slots[].defaultContent only.
 */
export function stripOrphanPageSlotRoots(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
): BuilderNode[] {
  if (!layout?.slots?.length) {
    return [...pageNodes];
  }

  const defaultSlot = getLayoutDefaultSlotName(layout);
  return pageNodes.filter(
    (node) => resolveNodeSlotForLayout(node, layout) === defaultSlot,
  );
}

export function createDefaultActiveSlot(
  layout?: LayoutWithSlotsLike | null,
): { name: string; scope: LayoutSlotScope } {
  const name = getLayoutDefaultSlotName(layout);
  return { name, scope: "page" };
}

export function inferActiveSlotFromRootNode(
  node: { slot?: string },
  layout?: LayoutWithSlotsLike | null,
): { name: string; scope: LayoutSlotScope } {
  const name = resolveNodeSlotForLayout(node, layout);
  return {
    name,
    scope: getSlotScope(name, layout),
  };
}

export function getSlotDefaultContent(
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
): BuilderNode[] {
  const slot = layout?.slots?.find((entry) => entry.name === slotName);
  if (!slot?.defaultContent?.length) {
    return [];
  }
  return [...slot.defaultContent];
}

export function setSlotDefaultContent(
  layout: LayoutWithSlotsLike,
  slotName: string,
  nodes: readonly BuilderNode[],
): LayoutWithSlotsLike {
  const slots = (layout.slots ?? []).map((slot) => {
    if (slot.name !== slotName) {
      return slot;
    }
    return {
      ...slot,
      defaultContent: nodes.length > 0 ? [...nodes] : undefined,
    };
  });

  return {
    ...layout,
    slots,
  };
}

/**
 * Root page nodes that resolve to a given slot name (for publish merge).
 */
export function filterPageNodesForLayoutSlot(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
): BuilderNode[] {
  return pageNodes.filter(
    (node) => resolveNodeSlotForLayout(node, layout) === slotName,
  );
}

/** Root page nodes to emit in a page `.astro` file. */
export function filterPageScopedExportNodes(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
): BuilderNode[] {
  if (!layout?.slots?.length) {
    return [...pageNodes];
  }

  const pageRoots = pageNodes.filter(
    (node) => !node.metadata?.layoutDefaultInjected,
  );
  const migrated = migratePageRootNodeSlots(
    pageRoots,
    layout,
  ) as BuilderNode[];

  return migrated.map((node) => {
    const defaultSlot = getLayoutDefaultSlotName(layout);
    const resolved = resolveNodeSlotForLayout(node, layout);
    if (resolved === defaultSlot) {
      return {
        ...node,
        slot: defaultSlot,
      };
    }
    return node;
  });
}

/**
 * Publish precedence for a layout slot (see plan §8k).
 */
export function resolvePublishSlotContent(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
  layoutNodeChildren?: readonly BuilderNode[],
): BuilderNode[] {
  const defaultSlot = getLayoutDefaultSlotName(layout);
  const isSharedSlot = slotName !== defaultSlot;

  if (!isSharedSlot) {
    const fromPage = filterPageNodesForLayoutSlot(pageNodes, layout, slotName);
    if (fromPage.length > 0) {
      return fromPage;
    }
  }

  const fromDefault = getSlotDefaultContent(layout, slotName);
  if (fromDefault.length > 0) {
    return fromDefault;
  }

  if (layoutNodeChildren?.length) {
    return [...layoutNodeChildren];
  }

  return [];
}

export function snapshotLayoutSlots(
  layout?: LayoutWithSlotsLike | null,
): string {
  if (!layout?.slots?.length) {
    return "[]";
  }

  const minimal = layout.slots.map((slot) => ({
    name: slot.name,
    defaultContent: slot.defaultContent ?? [],
  }));

  return JSON.stringify(minimal);
}

function parseLayoutSlotSnapshot(
  snapshot: string,
): Array<{ name: string; defaultContent?: BuilderNode[] }> | null {
  try {
    const raw = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(raw)) {
      return null;
    }

    const entries: Array<{ name: string; defaultContent?: BuilderNode[] }> = [];
    for (const item of raw) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { name?: unknown }).name !== "string"
      ) {
        return null;
      }
      const record = item as {
        name: string;
        defaultContent?: BuilderNode[];
      };
      entries.push({
        name: record.name,
        defaultContent: Array.isArray(record.defaultContent)
          ? record.defaultContent
          : [],
      });
    }
    return entries;
  } catch {
    return null;
  }
}

export function restoreLayoutSlotsFromSnapshot<T extends LayoutWithSlotsLike>(
  layout: T,
  snapshot: string,
): T {
  if (!layout.slots?.length || snapshot === "[]") {
    return layout;
  }

  const parsed = parseLayoutSlotSnapshot(snapshot);
  if (!parsed) {
    return layout;
  }

  const slots = layout.slots.map((slot) => {
    const entry = parsed.find((item) => item.name === slot.name);
    if (!entry) {
      return slot;
    }

    const defaultContent = entry.defaultContent ?? [];
    return {
      ...slot,
      defaultContent: defaultContent.length > 0 ? [...defaultContent] : undefined,
    };
  });

  return {
    ...layout,
    slots,
  };
}

export function regionIdForSlotName(slotName: string): "header" | "footer" | null {
  if (slotName === "header") {
    return "header";
  }
  if (slotName === "footer") {
    return "footer";
  }
  return null;
}

export function layoutSlotHasPublishableContent(
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
): boolean {
  return getSlotDefaultContent(layout, slotName).length > 0;
}

/**
 * Replace root-level page nodes for one layout slot while preserving other slots.
 */
export function replaceRootNodesForSlot(
  pageNodes: readonly BuilderNode[],
  layout: LayoutWithSlotsLike | null | undefined,
  slotName: string,
  slotNodes: readonly BuilderNode[],
): BuilderNode[] {
  const defaultSlot = getLayoutDefaultSlotName(layout);
  const preserved = pageNodes.filter(
    (node) => resolveNodeSlotForLayout(node, layout) !== slotName,
  );

  const normalizedSlotNodes = slotNodes.map((node) => {
    if (slotName === defaultSlot) {
      const { slot: _slot, ...rest } = node;
      return rest as BuilderNode;
    }
    return {
      ...node,
      slot: slotName,
    };
  });

  return sortRootBlocksByLayoutSlot(
    [...preserved, ...normalizedSlotNodes],
    layout,
  );
}

/**
 * Assign root-level `slot` when a block moves between layout slots (page vs layout scope).
 */
export function normalizeRootNodeForSlot(
  node: BuilderNode,
  targetSlotName: string,
  layout?: LayoutWithSlotsLike | null,
): BuilderNode {
  const defaultSlot = getLayoutDefaultSlotName(layout);
  if (targetSlotName === defaultSlot) {
    const { slot: _slot, ...rest } = node;
    return rest as BuilderNode;
  }
  return {
    ...node,
    slot: targetSlotName,
  };
}
