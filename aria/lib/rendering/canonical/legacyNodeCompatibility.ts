import type {
  BuilderNode,
  JsonObject,
  Responsive,
  StyleMap,
} from "../../types/nodes";

const LEGACY_STYLE_PROP_NAMES = [
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const;

const IMAGE_RENDER_STYLE_PROP_NAMES = [
  "objectFit",
  "objectPosition",
  "aspectRatio",
] as const;

/**
 * Moves legacy render props into canonical responsive styles without mutating
 * the authored node. Existing canonical style values always win.
 */
export function normalizeLegacyNodeCompatibility(
  node: BuilderNode,
): BuilderNode {
  const props = { ...(node.props ?? {}) } as JsonObject;
  const styles = { ...(node.styles ?? {}) } as StyleMap;
  const styleMap = styles as Record<string, Responsive<string> | undefined>;

  for (const propertyName of LEGACY_STYLE_PROP_NAMES) {
    const value = props[propertyName];
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }
    if (!styleMap[propertyName]) {
      styleMap[propertyName] = { base: String(value) };
    }
    delete props[propertyName];
  }

  const nodeType = (node.type ?? "").toLowerCase();
  if (nodeType === "image" || nodeType === "video") {
    for (const propertyName of IMAGE_RENDER_STYLE_PROP_NAMES) {
      const value = props[propertyName];
      if (typeof value !== "string" || value.trim().length === 0) {
        continue;
      }
      if (!styleMap[propertyName]) {
        styleMap[propertyName] = { base: value };
      }
      delete props[propertyName];
    }
  }

  return {
    ...node,
    props,
    styles,
  };
}
