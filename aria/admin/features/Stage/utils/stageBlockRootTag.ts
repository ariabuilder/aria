import {
  getNativeTagForRenderableNodeInContext,
  type RenderableNodeTagContext,
} from "../../../../lib/blocks/renderSemantics";
import {
  isRenderableContainerNodeType,
  normalizeContainerNodeType,
} from "../../../../lib/blocks/containerTypes";
import type { BuilderNode } from "../../../../lib/types/nodes";

export function resolveStageBlockRootTag(
  block: BuilderNode,
  context: RenderableNodeTagContext = {},
): string {
  const normalizedType = normalizeContainerNodeType(
    block.type ?? "",
  ).toLowerCase();
  const nativeTag = getNativeTagForRenderableNodeInContext(
    block,
    block.props ?? {},
    context,
  );

  if (normalizedType === "button") {
    return nativeTag ?? "div";
  }

  if (["list", "listitem"].includes(normalizedType)) {
    return nativeTag ?? "div";
  }

  if (isRenderableContainerNodeType(block.type ?? "")) {
    return nativeTag ?? "div";
  }

  return nativeTag ?? "div";
}

export function shouldDeferLinkBlockContent(block: BuilderNode): boolean {
  return (
    normalizeContainerNodeType(block.type ?? "").toLowerCase() === "link" &&
    (block.children?.length ?? 0) > 0
  );
}

const TYPOGRAPHY_TYPES_WITH_CHILD_CONTENT = new Set([
  "heading",
  "paragraph",
  "span",
  "text",
]);

export function shouldDeferTypographyBlockContent(block: BuilderNode): boolean {
  const normalizedType = normalizeContainerNodeType(
    block.type ?? "",
  ).toLowerCase();

  return (
    TYPOGRAPHY_TYPES_WITH_CHILD_CONTENT.has(normalizedType) &&
    (block.children?.length ?? 0) > 0
  );
}
