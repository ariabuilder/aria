import type { IconRenderResources } from "../../icons/iconRenderResources";
import type {
  BreakpointDefinition,
  BuilderNode,
  JsonObject,
} from "../../types/nodes";
import { DEFAULT_BREAKPOINTS } from "../../types/nodes";
import type { CanonicalClassOrigin, CanonicalClassToken } from "./classTokens";
import type {
  CanonicalAttribute,
  CanonicalRenderChild,
  CanonicalRenderNode,
} from "./contract";
import { normalizeLegacyNodeCompatibility } from "./legacyNodeCompatibility";
import {
  compileCanonicalNodeHtml,
  compileCanonicalTag,
  type HtmlRenderStyleMode,
} from "./renderDocumentHtml";

export { compileCanonicalNodeHtml, compileCanonicalTag };

export interface CompileCanonicalNodeOptions {
  breakpoints?: BreakpointDefinition[];
  styleMode?: HtmlRenderStyleMode;
  iconResources?: IconRenderResources;
}

function parseOpeningElement(html: string): {
  tagName: string;
  attributes: CanonicalAttribute[];
} | null {
  const match = html.trimStart().match(/^<([A-Za-z][\w:-]*)([^>]*)>/u);
  if (!match?.[1]) return null;
  const attributes: CanonicalAttribute[] = [];
  const source = match[2] ?? "";
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const attribute of source.matchAll(attributePattern)) {
    const name = attribute[1];
    if (!name) continue;
    attributes.push({
      name,
      value: attribute[2] ?? attribute[3] ?? attribute[4] ?? null,
    });
  }
  return { tagName: match[1].toLowerCase(), attributes };
}

function classOrigin(
  name: string,
  customClasses: ReadonlySet<string>,
): CanonicalClassOrigin {
  if (customClasses.has(name)) return "custom";
  if (name.startsWith("aria-node-")) return "style-scope";
  if (name.startsWith("aria-managed-")) return "renderer";
  if (name.startsWith("aria-motion") || name.startsWith("aria-parallax")) {
    return "runtime";
  }
  return "utility";
}

function classTokens(
  attributes: readonly CanonicalAttribute[],
  node: BuilderNode,
): CanonicalClassToken[] {
  const value = attributes.find(
    (attribute) => attribute.name === "class",
  )?.value;
  if (!value) return [];
  const customClasses = new Set(node.customClasses ?? []);
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((name) => ({ name, origin: classOrigin(name, customClasses) }));
}

function scalarText(props: JsonObject): string | null {
  for (const key of ["content", "text", "label"] as const) {
    const value = props[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return null;
}

function nodeChildren(
  node: BuilderNode,
  options: CompileCanonicalNodeOptions,
): CanonicalRenderChild[] {
  const normalized = normalizeLegacyNodeCompatibility(node);
  const normalizedType = node.type.toLowerCase();
  const content = scalarText(normalized.props);
  const children = compileCanonicalNodes(node.children, options);
  if (children.length > 0) return children;
  if (content === null) return [];
  if (normalizedType === "svg") {
    return [{ type: "trusted-svg", value: content }];
  }
  return [{ type: "text", value: content }];
}

export function compileCanonicalNode(
  node: BuilderNode,
  options: CompileCanonicalNodeOptions = {},
): CanonicalRenderNode | null {
  const breakpoints = options.breakpoints ?? DEFAULT_BREAKPOINTS;
  const styleMode = options.styleMode ?? "inline";
  const html = compileCanonicalNodeHtml(
    node,
    0,
    breakpoints,
    styleMode,
    null,
    {},
    options.iconResources,
  );
  const opening = parseOpeningElement(html);
  if (!opening) return null;
  const normalizedType = node.type.toLowerCase();
  const runtimeId =
    "runtimeId" in node && typeof node.runtimeId === "string"
      ? node.runtimeId
      : node.id;
  const sourceNodeId =
    "sourceNodeId" in node && typeof node.sourceNodeId === "string"
      ? node.sourceNodeId
      : node.id;

  return {
    runtimeId,
    sourceNodeId,
    type: "element",
    namespace: opening.tagName === "svg" ? "svg" : "html",
    tagName: opening.tagName,
    attributes: opening.attributes,
    classTokens: classTokens(opening.attributes, node),
    children: nodeChildren(node, options),
    voidElement: [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "source",
      "track",
      "wbr",
    ].includes(opening.tagName),
    capabilities: {
      interactive:
        ["a", "button", "input", "select", "textarea"].includes(
          opening.tagName,
        ) || Boolean(node.interactions),
      managedImage:
        opening.tagName === "picture" ||
        opening.attributes.some(
          (attribute) =>
            attribute.name === "class" &&
            attribute.value?.split(/\s+/u).includes("aria-managed-image"),
        ),
      motion: Boolean(node.motion?.enabled || node.motion?.parallax?.enabled),
      navigation:
        normalizedType === "navigation" || normalizedType === "nav-toggle",
    },
  };
}

export function compileCanonicalNodes(
  nodes: readonly BuilderNode[],
  options: CompileCanonicalNodeOptions = {},
): CanonicalRenderNode[] {
  const output: CanonicalRenderNode[] = [];
  for (const node of nodes) {
    if (node.type === "Fragment") {
      output.push(...compileCanonicalNodes(node.children, options));
      continue;
    }
    const compiled = compileCanonicalNode(node, options);
    if (compiled) output.push(compiled);
  }
  return output;
}
