import { normalizeContainerNodeType } from "./containerTypes";
import { normalizeBuilderNodeClassFields } from "./normalizeBuilderNodeClasses";
import type { BuilderNode, JsonObject, JsonValue } from "../types/nodes";
import { regenerateNodeTreeIds } from "../ids/nodeId";
import { isLikelyUtilityClassName } from "../styles/utilityClassDetection";

const RESERVED_PROP_KEYS = new Set([
  "href",
  "src",
  "alt",
  "target",
  "rel",
  "title",
  "download",
  "type",
  "placeholder",
  "name",
  "value",
  "level",
  "text",
  "content",
  "label",
  "ordered",
  "items",
  "element",
  "icon",
  "iconPosition",
  "iconGap",
  "iconSpaceBetween",
  "variant",
  "size",
  "disabled",
  "action",
  "method",
  "enctype",
  "autoplay",
  "loop",
  "muted",
  "controls",
  "playsinline",
  "preload",
  "poster",
  "aspectRatio",
  "objectFit",
  "objectPosition",
  "language",
  "code",
  "renderMode",
  "width",
  "height",
  "loading",
  "id",
  "for",
  "rows",
  "cols",
  "multiple",
  "required",
  "readonly",
  "checked",
  "min",
  "max",
  "step",
  "pattern",
  "autocomplete",
  "form",
  "role",
]);

const IMPORT_TYPE_PROP_ALLOWLIST: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  Link: new Set([
    "href",
    "target",
    "rel",
    "title",
    "download",
    "text",
    "content",
    "label",
  ]),
  Image: new Set([
    "src",
    "alt",
    "width",
    "height",
    "loading",
    "objectFit",
    "objectPosition",
  ]),
  Button: new Set([
    "text",
    "label",
    "content",
    "type",
    "variant",
    "size",
    "disabled",
    "href",
    "icon",
    "iconPosition",
  ]),
  Input: new Set([
    "type",
    "name",
    "placeholder",
    "value",
    "required",
    "readonly",
    "checked",
    "min",
    "max",
    "step",
    "pattern",
    "autocomplete",
  ]),
  Form: new Set(["action", "method", "enctype"]),
  Svg: new Set([
    "content",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-opacity",
    "fill-opacity",
    "opacity",
    // Geometry & viewport
    "viewBox",
    "preserveAspectRatio",
    "width",
    "height",
    "xmlns",
    "xmlns:xlink",
    "aria-hidden",
  ]),
  Icon: new Set(["icon", "className"]),
};

function isVendorImportedPropKey(key: string): boolean {
  if (key.startsWith("data-") || key.startsWith("aria-")) {
    return false;
  }

  if (key.includes("-")) {
    return true;
  }

  if (/^[A-Z]/.test(key)) {
    return true;
  }

  return false;
}

function isAllowedImportedPropKey(type: string, key: string): boolean {
  if (RESERVED_PROP_KEYS.has(key)) {
    return true;
  }

  const normalizedType = normalizeContainerNodeType(type);
  const allowlist = IMPORT_TYPE_PROP_ALLOWLIST[normalizedType];
  if (allowlist?.has(key)) {
    return true;
  }

  return !isVendorImportedPropKey(key);
}

function sanitizeJsonValue(value: JsonValue): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const next = value
      .map((entry) => sanitizeJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
    return next;
  }

  if (value !== null && typeof value === "object") {
    return sanitizeJsonObject(value as JsonObject);
  }

  return value;
}

function sanitizeJsonObject(props: JsonObject): JsonObject {
  const sanitized: JsonObject = {};

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      continue;
    }

    const nextValue = sanitizeJsonValue(value);
    if (nextValue === undefined) {
      continue;
    }

    sanitized[key] = nextValue;
  }

  return sanitized;
}

function sanitizeImportedProps(node: BuilderNode): JsonObject {
  const props = sanitizeJsonObject(node.props ?? {});
  const normalizedType = normalizeContainerNodeType(node.type ?? "");
  const nextProps: JsonObject = {};

  for (const [key, value] of Object.entries(props)) {
    if (!isAllowedImportedPropKey(normalizedType, key)) {
      continue;
    }

    nextProps[key] = value;
  }

  if (normalizedType === "Link") {
    if (
      typeof nextProps.target !== "string" ||
      nextProps.target.trim() === ""
    ) {
      delete nextProps.target;
    }

    if (typeof nextProps.rel !== "string" || nextProps.rel.trim() === "") {
      delete nextProps.rel;
    }

    if (typeof nextProps.href !== "string") {
      nextProps.href = "";
    }
  }

  if (normalizedType === "Input") {
    if (
      typeof nextProps.placeholder !== "string" ||
      nextProps.placeholder.trim() === ""
    ) {
      delete nextProps.placeholder;
    }

    if (typeof nextProps.name !== "string" || nextProps.name.trim() === "") {
      nextProps.name =
        typeof nextProps.type === "string" && nextProps.type.trim()
          ? nextProps.type.trim()
          : "field";
    }
  }

  if (normalizedType === "Form") {
    if (typeof nextProps.action !== "string") {
      nextProps.action = "#";
    }
  }

  return nextProps;
}

function isSingleTextChild(node: BuilderNode): boolean {
  if (!node.children || node.children.length !== 1) {
    return false;
  }

  const [child] = node.children;
  const childType = normalizeContainerNodeType(child?.type ?? "").toLowerCase();

  if (!child || !["text", "span"].includes(childType)) {
    return false;
  }

  const text =
    typeof child.props?.text === "string"
      ? child.props.text
      : typeof child.props?.content === "string"
        ? child.props.content
        : "";

  return text.trim().length > 0;
}

function hoistButtonLabelFromChild(node: BuilderNode): BuilderNode {
  const normalizedType = normalizeContainerNodeType(node.type ?? "");
  if (normalizedType !== "Button" || !isSingleTextChild(node)) {
    return node;
  }

  const props = node.props ?? {};
  const hasLabel =
    (typeof props.text === "string" && props.text.trim().length > 0) ||
    (typeof props.label === "string" && props.label.trim().length > 0);

  if (hasLabel) {
    return node;
  }

  const [child] = node.children ?? [];
  const label =
    typeof child?.props?.text === "string"
      ? child.props.text.trim()
      : typeof child?.props?.content === "string"
        ? child.props.content.trim()
        : "";

  if (!label) {
    return node;
  }

  return {
    ...node,
    props: {
      ...props,
      text: label,
    },
    children: [],
  };
}

function reclassifyMisplacedUtilityClasses(node: BuilderNode): BuilderNode {
  const customRefs = node.customClasses ?? [];
  if (customRefs.length === 0) {
    return node;
  }

  const utilitiesToMove: string[] = [];
  const remainingCustom: string[] = [];

  for (const className of customRefs) {
    if (isLikelyUtilityClassName(className)) {
      utilitiesToMove.push(className);
      continue;
    }

    remainingCustom.push(className);
  }

  if (utilitiesToMove.length === 0) {
    return node;
  }

  const mergedBase = [...(node.classNames?.base ?? [])];
  for (const token of utilitiesToMove) {
    if (!mergedBase.includes(token)) {
      mergedBase.push(token);
    }
  }

  return {
    ...node,
    classNames: {
      ...(node.classNames ?? {}),
      base: mergedBase,
    },
    ...(remainingCustom.length > 0
      ? { customClasses: remainingCustom }
      : { customClasses: undefined }),
  };
}

function sanitizeImportedNode(node: BuilderNode): BuilderNode {
  const children =
    node.children?.map((child) => sanitizeImportedNode(child)) ?? [];

  return reclassifyMisplacedUtilityClasses(
    hoistButtonLabelFromChild({
      ...node,
      props: sanitizeImportedProps({ ...node, children }),
      children,
      ...(node.a11y ? { a11y: { ...node.a11y } } : {}),
    }),
  );
}

/**
 * Remove undefined prop values and vendor-specific imported attributes.
 */
function sanitizeBuilderNodeRec(node: BuilderNode): BuilderNode {
  return normalizeBuilderNodeClassFields(
    reclassifyMisplacedUtilityClasses({
      ...node,
      props: sanitizeJsonObject(node.props ?? {}),
      children: node.children?.map(sanitizeBuilderNodeRec) ?? [],
    }),
  ).node;
}

/**
 * Remove undefined prop values recursively.
 */
export function sanitizeBuilderNodeTree(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map(sanitizeBuilderNodeRec);
}

/**
 * Post-import normalization: schema-safe props, import defaults, button label hoist.
 */
export function normalizeImportedNodeTree(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map((node) => regenerateNodeTreeIds(sanitizeImportedNode(node)));
}

export function collectUndefinedPropPaths(
  nodes: BuilderNode[],
  prefix = "",
): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    const nodePath = prefix ? `${prefix}.${node.id}` : node.id;

    for (const [key, value] of Object.entries(node.props ?? {})) {
      if (value === undefined) {
        paths.push(`${nodePath}.props.${key}`);
      }
    }

    if (node.children?.length) {
      paths.push(...collectUndefinedPropPaths(node.children, nodePath));
    }
  }

  return paths;
}
