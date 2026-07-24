/**
 * Layout slot resolution for pages with assigned layouts. Aligns legacy slot names (`default`,
 * `content`, unslotted) with the layout's default slot so canvas sort, layers grouping.
 */

export interface LayoutSlotRef {
  name: string;
  isDefault?: boolean;
}

export interface LayoutSlotContext {
  slots?: LayoutSlotRef[];
}

/** Legacy aliases that map to the layout default slot (e.g. full-width `main`). */
const LEGACY_DEFAULT_SLOT_ALIASES = new Set(["default", "content"]);

export function getLayoutDefaultSlotName(
  layout?: LayoutSlotContext | null,
): string {
  return layout?.slots?.find((slot) => slot.isDefault)?.name ?? "default";
}

export function getLayoutSlotOrder(layout?: LayoutSlotContext | null): string[] {
  const fromLayout = layout?.slots?.map((slot) => slot.name);
  if (fromLayout?.length) {
    return fromLayout;
  }
  return ["header", "default", "content", "footer"];
}

/**
 * Resolve a root node's effective slot for a given layout.
 * Unslotted nodes and legacy `default` / `content` map to the layout default slot.
 */
export function resolveNodeSlotForLayout(
  node: { slot?: string },
  layout?: LayoutSlotContext | null,
): string {
  const defaultSlot = getLayoutDefaultSlotName(layout);
  const raw = node.slot?.trim();
  if (!raw || LEGACY_DEFAULT_SLOT_ALIASES.has(raw)) {
    return defaultSlot;
  }
  return raw;
}

/** Whether a root node belongs in the layout's default slot group. */
export function isNodeInLayoutDefaultSlot(
  node: { slot?: string },
  layout?: LayoutSlotContext | null,
): boolean {
  const defaultSlot = getLayoutDefaultSlotName(layout);
  const resolved = resolveNodeSlotForLayout(node, layout);
  return resolved === defaultSlot;
}

export function compareRootBlocksByLayoutSlot(
  a: { slot?: string },
  b: { slot?: string },
  layout?: LayoutSlotContext | null,
): number {
  const slotOrder = getLayoutSlotOrder(layout);
  const slotA = resolveNodeSlotForLayout(a, layout);
  const slotB = resolveNodeSlotForLayout(b, layout);
  const indexA = slotOrder.indexOf(slotA);
  const indexB = slotOrder.indexOf(slotB);
  const orderA = indexA === -1 ? slotOrder.length : indexA;
  const orderB = indexB === -1 ? slotOrder.length : indexB;
  return orderA - orderB;
}

export function sortRootBlocksByLayoutSlot<T extends { slot?: string }>(
  blocks: readonly T[],
  layout?: LayoutSlotContext | null,
): T[] {
  return [...blocks].sort((a, b) =>
    compareRootBlocksByLayoutSlot(a, b, layout),
  );
}

/**
 * Normalize root-level slot fields when a page is assigned a layout with slots.
 */
export function migratePageRootNodeSlots(
  nodes: readonly { slot?: string }[],
  layout?: LayoutSlotContext | null,
): { slot?: string }[] {
  if (!layout?.slots?.length) {
    return [...nodes];
  }

  const defaultSlot = getLayoutDefaultSlotName(layout);

  return nodes.map((node) => {
    const raw = node.slot?.trim();
    if (!raw || LEGACY_DEFAULT_SLOT_ALIASES.has(raw)) {
      return { ...node, slot: defaultSlot };
    }
    return node;
  });
}
