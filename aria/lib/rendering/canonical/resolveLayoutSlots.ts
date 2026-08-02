import {
  getSlotDefaultContent,
  type LayoutWithSlotsLike,
} from "../../layouts/slotEditing";
import { resolveNodeSlotForLayout } from "../../layouts/resolveNodeSlot";
import type { BuilderNode, LayoutDSL } from "../../types/nodes";

function cloneNode(node: BuilderNode): BuilderNode {
  return {
    ...node,
    children: node.children.map(cloneNode),
  };
}

export function resolveCanonicalLayoutSlotContent(
  pageRoots: readonly BuilderNode[],
  layout: LayoutWithSlotsLike,
  slotName: string,
  legacyChildren: readonly BuilderNode[] = [],
): BuilderNode[] {
  const override = pageRoots.filter(
    (node) => resolveNodeSlotForLayout(node, layout) === slotName,
  );
  if (override.length > 0) return override.map(cloneNode);
  const defaults = getSlotDefaultContent(layout, slotName);
  if (defaults.length > 0) return defaults.map(cloneNode);
  return legacyChildren.map(cloneNode);
}

function resolveLayoutNode(
  node: BuilderNode,
  pageRoots: readonly BuilderNode[],
  layout: LayoutDSL,
): BuilderNode {
  if (node.type === "Slot" && typeof node.props.name === "string") {
    return {
      ...node,
      children: resolveCanonicalLayoutSlotContent(
        pageRoots,
        layout,
        node.props.name,
        node.children,
      ),
    };
  }

  return {
    ...node,
    children: node.children.map((child) =>
      resolveLayoutNode(child, pageRoots, layout),
    ),
  };
}

/** Resolves layout slot precedence once for every render target. */
export function resolveLayoutSurfaceRoots(
  pageRoots: readonly BuilderNode[],
  layout: LayoutDSL,
): BuilderNode[] {
  if (layout.nodes.length === 0) {
    const merged = layout.slots.flatMap((slot) =>
      resolveCanonicalLayoutSlotContent(pageRoots, layout, slot.name),
    );
    const consumed = new Set(merged.map((node) => node.id));
    return [
      ...merged,
      ...pageRoots.filter((node) => !consumed.has(node.id)).map(cloneNode),
    ];
  }

  return layout.nodes.map((node) => resolveLayoutNode(node, pageRoots, layout));
}
