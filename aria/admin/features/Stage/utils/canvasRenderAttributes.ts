import { normalizeContainerNodeType } from "../../../../lib/blocks/containerTypes";
import { stripNonManagedImageProps } from "../../../../lib/blocks/renderSemantics";
import { toStorableJsonObject } from "../../../../lib/schemas/json";
import type { BuilderNode } from "../../../../lib/types/nodes";

export function normalizeCanvasAttributeProps(
  block: Pick<BuilderNode, "type">,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const nextProps = { ...props };
  delete nextProps.element;
  const normalizedType = normalizeContainerNodeType(
    block.type ?? "",
  ).toLowerCase();

  if (normalizedType === "list") {
    delete nextProps.ordered;
    delete nextProps.items;
    return nextProps;
  }

  if (normalizedType === "image") {
    return stripNonManagedImageProps(toStorableJsonObject(nextProps));
  }

  return nextProps;
}
