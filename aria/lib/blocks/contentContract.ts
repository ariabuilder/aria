import {
  getTypographyTypeKey,
  normalizeTypographyNodeType,
} from "./typographyTypes";
import type { NodeDataSource } from "../types/nodes";

type NodeProps = Record<string, unknown>;

export interface ContentNodeLike {
  type?: string;
  props?: NodeProps;
  children?: ContentNodeLike[];
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const CONTENT_NODE_TYPES = new Set([
  "text",
  "paragraph",
  "heading",
  "button",
  "link",
  "span",
]);

const MULTILINE_NODE_TYPES = new Set(["text", "paragraph"]);

const CONTENT_PROP_CONTRACT: Record<
  string,
  { canonical: string; aliases: readonly string[] }
> = {
  text: { canonical: "content", aliases: ["text", "label", "title"] },
  paragraph: { canonical: "content", aliases: ["text", "label", "title"] },
  span: { canonical: "content", aliases: ["text", "label", "title"] },
  heading: { canonical: "text", aliases: ["content", "label", "title"] },
  button: { canonical: "text", aliases: ["label"] },
  link: { canonical: "text", aliases: ["content", "label"] },
};

export const DEFAULT_HEADING_LEVEL: HeadingLevel = 2;

function normalizedPropName(value: string): string {
  return value.trim().toLowerCase();
}

export function getCanonicalContentPropName(type: unknown): string | null {
  const contract = CONTENT_PROP_CONTRACT[normalizeContentNodeType(type)];
  return contract?.canonical ?? null;
}

export function getContentPropAliases(type: unknown): readonly string[] {
  const contract = CONTENT_PROP_CONTRACT[normalizeContentNodeType(type)];
  return contract?.aliases ?? [];
}

export function isContentPropAlias(type: unknown, propName: string): boolean {
  const normalized = normalizedPropName(propName);
  return getContentPropAliases(type).some(
    (alias) => normalizedPropName(alias) === normalized,
  );
}

export function hasContentPropAliases(
  node: ContentNodeLike | null | undefined,
): boolean {
  const props = node?.props ?? {};
  return getContentPropAliases(node?.type).some((alias) =>
    Object.prototype.hasOwnProperty.call(props, alias),
  );
}

export function shouldAddSyntheticCanonicalContentProp(input: {
  nodeType: unknown;
  props: Record<string, unknown>;
}): boolean {
  const canonical = getCanonicalContentPropName(input.nodeType);
  if (!canonical) {
    return false;
  }

  if (normalizeContentNodeType(input.nodeType) === "heading") {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(input.props, canonical)) {
    return false;
  }

  return getContentPropAliases(input.nodeType).some((alias) =>
    Object.prototype.hasOwnProperty.call(input.props, alias),
  );
}

export interface ContentNodeWithDataSource extends ContentNodeLike {
  dataSource?: NodeDataSource;
}

export function buildNormalizeContentPropsUpdates(
  node: ContentNodeWithDataSource,
): Record<string, unknown> | null {
  const canonical = getCanonicalContentPropName(node.type);
  if (!canonical) {
    return null;
  }

  const props = node.props ?? {};
  const aliases = getContentPropAliases(node.type);
  const hasAliasProps = aliases.some((alias) =>
    Object.prototype.hasOwnProperty.call(props, alias),
  );
  const canonicalValue = getContentValue(node);
  const currentCanonical = props[canonical];
  const canonicalNeedsUpdate =
    !Object.prototype.hasOwnProperty.call(props, canonical) ||
    currentCanonical !== canonicalValue;

  const bindings = node.dataSource?.bindings ?? {};
  const aliasBindings = aliases.filter((alias) => alias in bindings);
  const canonicalBinding = bindings[canonical];
  const migratedBinding =
    !canonicalBinding &&
    aliasBindings.length > 0 &&
    bindings[aliasBindings[0]!];

  if (!hasAliasProps && !canonicalNeedsUpdate && aliasBindings.length === 0) {
    return null;
  }

  const updates: Record<string, unknown> = {};

  if (canonicalNeedsUpdate || hasAliasProps) {
    updates[`props.${canonical}`] = canonicalValue;
  }

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(props, alias)) {
      updates[`props.${alias}`] = undefined;
    }
  }

  if (aliasBindings.length > 0 || migratedBinding) {
    const nextBindings = { ...bindings };
    if (migratedBinding) {
      nextBindings[canonical] = migratedBinding;
    }
    for (const alias of aliasBindings) {
      delete nextBindings[alias];
    }
    updates.dataSource = {
      ...(node.dataSource ?? {}),
      bindings: nextBindings,
    };
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

export function normalizeContentNodeType(type: unknown): string {
  const raw = String(type ?? "").trim();
  const typography = normalizeTypographyNodeType(raw);
  if (typography) {
    return typography;
  }
  return raw.toLowerCase();
}

export function isContentEditableType(type: unknown): boolean {
  return CONTENT_NODE_TYPES.has(normalizeContentNodeType(type));
}

export function isContentMultilineType(type: unknown): boolean {
  return MULTILINE_NODE_TYPES.has(normalizeContentNodeType(type));
}

export function getContentValue(
  node: ContentNodeLike | null | undefined,
): string {
  const props = node?.props ?? {};
  const propValues = [props.content, props.text, props.label, props.title];

  for (const value of propValues) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  const childText =
    node?.children
      ?.map((child) => getContentValue(child))
      .find((value) => value.trim().length > 0) ?? "";
  if (childText) return childText;

  for (const value of propValues) {
    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

export function normalizeHeadingLevel(
  level: unknown,
  fallback: HeadingLevel = DEFAULT_HEADING_LEVEL,
): HeadingLevel {
  const resolved = Number(level);
  if (Number.isInteger(resolved) && resolved >= 1 && resolved <= 6) {
    return resolved as HeadingLevel;
  }
  return fallback;
}

export function parseHeadingLevelFromTagName(
  tagName: string | null | undefined,
): HeadingLevel | null {
  if (!tagName) {
    return null;
  }

  const match = /^h([1-6])$/i.exec(tagName.trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) as HeadingLevel;
}

export function getContentHeadingLevel(
  node: ContentNodeLike | null | undefined,
): HeadingLevel {
  const props = node?.props ?? {};
  const rawLevel = Number(props.level);

  if (Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6) {
    return rawLevel as HeadingLevel;
  }

  const element =
    typeof props.element === "string" ? props.element.trim() : null;
  const fromElement = parseHeadingLevelFromTagName(element);
  return fromElement ?? DEFAULT_HEADING_LEVEL;
}

export function buildContentUpdates(
  node: ContentNodeLike,
  value: string,
): Record<string, unknown> {
  const canonical = getCanonicalContentPropName(node.type);
  if (canonical) {
    return { [canonical]: value };
  }

  return {
    text: value,
  };
}

export interface TextValue {
  text?: string;
  content?: string;
  label?: string;
  level?: HeadingLevel;
}

export function buildContentValidationCandidate(
  node: ContentNodeLike | null | undefined,
  updates: Record<string, unknown>,
): TextValue {
  return {
    ...(typeof node?.props?.text === "string" ? { text: node.props.text } : {}),
    ...(typeof node?.props?.content === "string"
      ? { content: node.props.content }
      : {}),
    ...(typeof node?.props?.label === "string"
      ? { label: node.props.label }
      : {}),
    ...(typeof node?.props?.title === "string"
      ? { title: node.props.title }
      : {}),
    ...(typeof node?.props?.level === "number"
      ? { level: node.props.level as HeadingLevel }
      : {}),
    ...updates,
  };
}

export { getTypographyTypeKey };
