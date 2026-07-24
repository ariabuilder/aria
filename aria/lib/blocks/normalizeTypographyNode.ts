import type { BuilderNode, JsonObject } from "../types/nodes";
import {
  getContentHeadingLevel,
  getContentValue,
  parseHeadingLevelFromTagName,
} from "./contentContract";
import {
  HEADING_TAG_OVERRIDES,
  TEXT_TAG_OVERRIDES,
} from "./renderSemantics";
import {
  type CanonicalTypographyType,
  normalizeTypographyNodeType,
} from "./typographyTypes";

const TEXT_TAG_OVERRIDE_SET = new Set<string>(TEXT_TAG_OVERRIDES);
const HEADING_TAG_OVERRIDE_SET = new Set<string>(HEADING_TAG_OVERRIDES);

const TYPOGRAPHY_LINK_PROP_NAMES = [
  "href",
  "target",
  "rel",
  "title",
  "download",
] as const;

function hadPropKey(props: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, key);
}

function sanitizeElementForTypographyType(
  canonicalType: CanonicalTypographyType,
  props: JsonObject,
  level: number,
): void {
  const element = props.element;
  if (typeof element !== "string") {
    return;
  }

  const trimmed = element.trim().toLowerCase();
  if (!trimmed) {
    delete props.element;
    return;
  }

  const tagLevel = parseHeadingLevelFromTagName(trimmed);

  if (canonicalType === "heading") {
    if (!HEADING_TAG_OVERRIDE_SET.has(trimmed)) {
      delete props.element;
      return;
    }

    if (tagLevel !== null && tagLevel !== level) {
      delete props.element;
    }
    return;
  }

  if (!TEXT_TAG_OVERRIDE_SET.has(trimmed)) {
    delete props.element;
    return;
  }

  if (tagLevel !== null) {
    delete props.element;
  }
}

function normalizeTypographyProps(
  canonicalType: CanonicalTypographyType,
  sourceProps: JsonObject,
): JsonObject {
  const props: JsonObject = { ...sourceProps };
  const contentValue = getContentValue({ props });

  if (canonicalType === "heading") {
    const level = getContentHeadingLevel({ props });
    props.level = level;
    props.text = contentValue;
    if (hadPropKey(sourceProps, "content")) {
      props.content = contentValue;
    } else {
      delete props.content;
    }
    sanitizeElementForTypographyType("heading", props, level);
    return props;
  }

  props.content = contentValue;
  if (hadPropKey(sourceProps, "text")) {
    props.text = contentValue;
  } else {
    delete props.text;
  }

  const dormantLevel = sourceProps.level;
  if (
    typeof dormantLevel === "number" &&
    Number.isInteger(dormantLevel) &&
    dormantLevel >= 1 &&
    dormantLevel <= 6
  ) {
    props.level = dormantLevel;
  } else {
    delete props.level;
  }

  sanitizeElementForTypographyType("text", props, 0);
  return props;
}

/**
 * Canonicalize typography node type and content props for persistence.
 * Does not flatten or reorder children.
 */
export function normalizeTypographyNode(node: BuilderNode): BuilderNode {
  const canonicalType = normalizeTypographyNodeType(node.type ?? "");
  if (!canonicalType) {
    if (!node.children?.length) {
      return node;
    }

    return {
      ...node,
      children: node.children.map((child) => normalizeTypographyNode(child)),
    };
  }

  const normalizedChildren = node.children?.map((child) =>
    normalizeTypographyNode(child),
  );

  return {
    ...node,
    type: canonicalType,
    props: normalizeTypographyProps(canonicalType, node.props ?? {}),
    ...(normalizedChildren ? { children: normalizedChildren } : {}),
  };
}

export function normalizeTypographyNodeTree(
  nodes: readonly BuilderNode[],
): BuilderNode[] {
  return nodes.map((node) => normalizeTypographyNode(node));
}

export function isTypographyLinkProps(props: JsonObject): boolean {
  return TYPOGRAPHY_LINK_PROP_NAMES.some(
    (key) => typeof props[key] === "string" || props[key] === true,
  );
}
