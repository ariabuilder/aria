import { classNamesToString } from "../schemas/classEditor";
import type { BreakpointDefinition, BuilderNode } from "../types/nodes";

const CLASS_FIELD_PATTERN =
  /^(?:class|className|classes|classNames|utilityClass|utilityClasses|responsiveClasses|variantClasses)$/i;

/**
 * Split a class attribute without breaking arbitrary values that contain
 * whitespace inside brackets, parentheses, or quotes.
 */
export function splitUtilityClassString(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let squareDepth = 0;
  let parenDepth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const flush = (): void => {
    const token = current.trim();
    if (token) tokens.push(token);
    current = "";
  };

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }

    if (character === "'" || character === '"') {
      current += character;
      quote = character;
      continue;
    }

    if (character === "[") squareDepth += 1;
    if (character === "]") squareDepth = Math.max(0, squareDepth - 1);
    if (character === "(") parenDepth += 1;
    if (character === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (/\s/.test(character) && squareDepth === 0 && parenDepth === 0) {
      flush();
      continue;
    }

    current += character;
  }

  flush();
  return tokens;
}

function addClassString(target: Set<string>, value: string): void {
  for (const token of splitUtilityClassString(value)) {
    target.add(token);
  }
}

function collectClassContainer(
  target: Set<string>,
  value: unknown,
  prefix = "",
): void {
  if (typeof value === "string") {
    for (const token of splitUtilityClassString(value)) {
      target.add(
        prefix && !token.startsWith(`${prefix}:`)
          ? `${prefix}:${token}`
          : token,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectClassContainer(target, entry, prefix);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const nestedPrefix =
      key === "base" || key === "default"
        ? prefix
        : [prefix, key].filter(Boolean).join(":");
    collectClassContainer(target, nested, nestedPrefix);
  }
}

function collectNestedClassFields(
  target: Set<string>,
  value: unknown,
  visited: WeakSet<object>,
): void {
  if (!value || typeof value !== "object") return;

  const objectValue = value as object;
  if (visited.has(objectValue)) return;
  visited.add(objectValue);

  if (Array.isArray(value)) {
    for (const entry of value) collectNestedClassFields(target, entry, visited);
    return;
  }

  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (CLASS_FIELD_PATTERN.test(key)) {
      collectClassContainer(target, nested);
    }
    collectNestedClassFields(target, nested, visited);
  }
}

/**
 * Collect every utility token represented by BuilderNode data, including
 * canonical responsive classes and class containers nested in.
 */
export function collectUtilityClassesFromNodes(
  nodes: readonly BuilderNode[],
  breakpoints?: readonly BreakpointDefinition[],
): string[] {
  const classes = new Set<string>();
  const visited = new WeakSet<object>();

  const visitNode = (node: BuilderNode): void => {
    if (node.classNames) {
      addClassString(classes, classNamesToString(node.classNames, breakpoints));
    }

    collectClassContainer(classes, node.customClasses);

    // Legacy and extension-provided class fields may exist on loose database
    // records even though new authored nodes use canonical `classNames`.
    for (const [key, value] of Object.entries(node)) {
      if (
        key !== "classNames" &&
        key !== "customClasses" &&
        CLASS_FIELD_PATTERN.test(key)
      ) {
        collectClassContainer(classes, value);
      }
    }

    collectNestedClassFields(classes, node.props, visited);
    collectNestedClassFields(classes, node.styles, visited);
    collectNestedClassFields(classes, node.reference?.overrides, visited);

    for (const child of node.children ?? []) visitNode(child);
  };

  for (const node of nodes) visitNode(node);
  return Array.from(classes).sort();
}
