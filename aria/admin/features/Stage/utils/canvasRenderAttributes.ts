import { normalizeContainerNodeType } from "../../../../lib/blocks/containerTypes";
import { stripNonManagedImageProps } from "../../../../lib/blocks/renderSemantics";
import { toStorableJsonObject } from "../../../../lib/schemas/json";
import type { BuilderNode } from "../../../../lib/types/nodes";

export const CANVAS_DISABLED_ATTRIBUTE = "data-aria-canvas-disabled";

export function normalizeCanvasAttributeProps(
  block: Pick<BuilderNode, "type">,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const nextProps = { ...props };
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

  if (normalizedType !== "button") {
    return nextProps;
  }

  if (!Object.prototype.hasOwnProperty.call(nextProps, "disabled")) {
    return nextProps;
  }

  const isDisabled =
    nextProps.disabled === true || nextProps.disabled === "true";

  delete nextProps.disabled;
  nextProps[CANVAS_DISABLED_ATTRIBUTE] = isDisabled ? "true" : undefined;

  return nextProps;
}
