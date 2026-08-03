/**
 * Existing HTML - Pasting content from clipboard - Converting legacy content.
 */

import DOMPurify from "isomorphic-dompurify";

import type {
  BuilderNode,
  JsonObject,
  JsonValue,
  NodeAccessibility,
  NodeDataSource,
  NodeInteractions,
  NodeVariants,
  StyleMap,
} from "../types/nodes";
import { isJsonValue } from "../types/nodes";
import { AnimationConfigSchema } from "../schemas/nodes";
import {
  CSS_CLASS_NAME_REGEX,
  parseClassNameString,
} from "../schemas/classEditor";
import { isLikelyUtilityClassName } from "../styles/utilityClassDetection";
import { generateNodeId } from "./nodeUtils";
import { detectTokenizedMarkupImport } from "./pasteImportQuality";
import { normalizeImportedNodeTree } from "./sanitizeBuilderNodeTree";
import { isNonManagedImageHtmlAttr } from "./renderSemantics";
import { getCanonicalContentPropName } from "./contentContract";

export interface HtmlImportRemovedAttribute {
  attribute: string;
  tagName: string;
}

export interface HtmlImportRemovedElement {
  tagName: string;
}

export interface HtmlToNodesImportReport {
  removedAttributes: HtmlImportRemovedAttribute[];
  removedElements: HtmlImportRemovedElement[];
  createdCustomClasses: string[];
  /** `<style>` blocks converted to Code nodes with render enabled */
  extractedStyleBlocks: number;
  /** `<style>` blocks skipped (empty, non-CSS type, or failed sanitization) */
  rejectedStyleBlocks: number;
}

export interface HtmlToNodesImportResult {
  nodes: BuilderNode[];
  report: HtmlToNodesImportReport;
}

const DISALLOWED_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "meta",
  "link",
  "noscript",
  "template",
];

const HTML_VOID_TAGS = new Set([
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
  "param",
  "source",
  "track",
  "wbr",
]);

const IMPORTABLE_BACKGROUND_IMAGE_TAGS = new Set([
  "div",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
]);

const BACKGROUND_IMAGE_UTILITY_PATTERN =
  /^(?<prefix>(?:[^:\s]+:)*)bg-\[url\((?<quote>['"]?)(?<url>.*)\k<quote>\)\]$/;

const IMPORTABLE_BACKGROUND_STYLE_PREFIXES = new Set([
  "base",
  "mobile",
  "xs",
  "sm",
  "tablet",
  "md",
  "laptop",
  "lg",
  "desktop",
  "xl",
  "2xl",
]);

const BACKGROUND_STYLE_TOKEN_MAPPERS: Array<{
  pattern: RegExp;
  property: "backgroundSize" | "backgroundPosition" | "backgroundRepeat";
  value: string;
}> = [
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-cover$/,
    property: "backgroundSize",
    value: "cover",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-contain$/,
    property: "backgroundSize",
    value: "contain",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-center$/,
    property: "backgroundPosition",
    value: "center",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-top$/,
    property: "backgroundPosition",
    value: "top",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-bottom$/,
    property: "backgroundPosition",
    value: "bottom",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-left$/,
    property: "backgroundPosition",
    value: "left",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-right$/,
    property: "backgroundPosition",
    value: "right",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-no-repeat$/,
    property: "backgroundRepeat",
    value: "no-repeat",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-repeat$/,
    property: "backgroundRepeat",
    value: "repeat",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-repeat-x$/,
    property: "backgroundRepeat",
    value: "repeat-x",
  },
  {
    pattern: /^(?<prefix>(?:[^:\s]+:)*)bg-repeat-y$/,
    property: "backgroundRepeat",
    value: "repeat-y",
  },
];

interface ClassifiedImportedClasses {
  classNames?: BuilderNode["classNames"];
  customClasses: string[];
  createdCustomClasses: string[];
}

interface ImportedBackgroundStyles {
  classTokens: string[];
  styles: StyleMap;
}

function createEmptyImportReport(): HtmlToNodesImportReport {
  return {
    removedAttributes: [],
    removedElements: [],
    createdCustomClasses: [],
    extractedStyleBlocks: 0,
    rejectedStyleBlocks: 0,
  };
}

const UNSAFE_STYLE_CSS_PATTERN =
  /expression\s*\(|javascript:|vbscript:|-moz-binding|@import\s+["']?\s*javascript:/i;

const STYLE_TAG_BREAKOUT_PATTERN = /<\s*\/\s*style/i;

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Sanitize pasted CSS before storing in a Code block (render mode).
 * Returns null when the block should be dropped.
 */
export function sanitizeImportedStyleCss(css: string): string | null {
  const normalized = css.trim();
  if (!normalized) {
    return null;
  }

  if (STYLE_TAG_BREAKOUT_PATTERN.test(normalized)) {
    return null;
  }

  if (UNSAFE_STYLE_CSS_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function isImportableStyleElement(element: HTMLStyleElement): boolean {
  const type = element.getAttribute("type")?.trim().toLowerCase();
  if (type && type !== "text/css") {
    return false;
  }

  return true;
}

function buildSafeStyleMarkup(element: HTMLStyleElement): string | null {
  if (!isImportableStyleElement(element)) {
    return null;
  }

  const sanitizedCss = sanitizeImportedStyleCss(element.textContent ?? "");
  if (!sanitizedCss) {
    return null;
  }

  const media = element.getAttribute("media")?.trim();
  const mediaAttr = media ? ` media="${escapeHtmlAttribute(media)}"` : "";

  return `<style${mediaAttr}>${sanitizedCss}</style>`;
}

/**
 * Pull `<style>` tags out of pasted HTML before DOMPurify strips them.
 * Styles are removed from the document so markup import stays unchanged.
 */
export function extractImportedStyleBlocks(html: string): {
  cleanedHtml: string;
  styleBlocks: string[];
  rejectedStyleBlocks: number;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizeImportedHtml(html), "text/html");
  const styleBlocks: string[] = [];
  let rejectedStyleBlocks = 0;

  const collectFromRoot = (root: ParentNode | null): void => {
    if (!root) {
      return;
    }

    for (const element of Array.from(root.querySelectorAll("style"))) {
      const styleElement = element as HTMLStyleElement;
      const markup = buildSafeStyleMarkup(styleElement);
      if (markup) {
        styleBlocks.push(markup);
      } else if (
        (styleElement.textContent ?? "").trim() ||
        styleElement.getAttribute("type")
      ) {
        rejectedStyleBlocks += 1;
      }
      styleElement.remove();
    }
  };

  collectFromRoot(doc.head);
  collectFromRoot(doc.body);

  return {
    cleanedHtml: doc.body.innerHTML,
    styleBlocks,
    rejectedStyleBlocks,
  };
}

export function createImportedStyleCodeNode(styleMarkup: string): BuilderNode {
  return {
    id: generateNodeId(),
    type: "code",
    props: {
      content: styleMarkup,
      renderMode: "render",
      language: "css",
    },
    styles: {},
    children: [],
  };
}

function sanitizeCssValue(value: string): string | null {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return null;
  if (lower.includes("expression(")) return null;
  if (lower.includes("javascript:")) return null;
  return normalized;
}

function sanitizeUrl(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;

  if (
    normalized.startsWith("#") ||
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../")
  ) {
    return normalized;
  }

  try {
    const url = new URL(normalized, "https://aria.local");
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return normalized;
    }
  } catch {
    return null;
  }

  return null;
}

function tokenizeImportedClasses(classAttr: string | null): string[] {
  return (classAttr ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isLikelyUtilityToken(token: string): boolean {
  return isLikelyUtilityClassName(token);
}

function resolveImportedBackgroundBreakpoint(
  prefix: string | undefined,
): string | null {
  const prefixes = (prefix ?? "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  if (prefixes.length === 0) {
    return "base";
  }

  if (prefixes.length !== 1) {
    return null;
  }

  const candidate = prefixes[0];
  return IMPORTABLE_BACKGROUND_STYLE_PREFIXES.has(candidate) ? candidate : null;
}

function setImportedResponsiveStyle(
  styles: StyleMap,
  property:
    | "backgroundImage"
    | "backgroundSize"
    | "backgroundPosition"
    | "backgroundRepeat",
  breakpoint: string,
  value: string,
): void {
  const currentValue = styles[property] ?? {};
  styles[property] = {
    ...currentValue,
    [breakpoint]: value,
  };
}

function buildImportedBackgroundImageValue(url: string): string {
  return `url("${url.replace(/"/g, '\\"')}")`;
}

function mergeImportedStyles(
  baseStyles: StyleMap,
  importedStyles?: StyleMap,
): StyleMap {
  if (!importedStyles || Object.keys(importedStyles).length === 0) {
    return baseStyles;
  }

  const mergedStyles: StyleMap = {
    ...baseStyles,
  };

  for (const [property, value] of Object.entries(importedStyles)) {
    if (!value) {
      continue;
    }

    mergedStyles[property] = {
      ...value,
      ...(mergedStyles[property] ?? {}),
    };
  }

  return mergedStyles;
}

function classifyImportedClassTokens(
  tokens: string[],
): ClassifiedImportedClasses {
  if (tokens.length === 0) {
    return {
      customClasses: [],
      createdCustomClasses: [],
    };
  }

  const utilityTokens: string[] = [];
  const customClasses = new Set<string>();

  for (const token of tokens) {
    if (isLikelyUtilityToken(token)) {
      utilityTokens.push(token);
      continue;
    }

    if (CSS_CLASS_NAME_REGEX.test(token)) {
      customClasses.add(token);
      continue;
    }

    utilityTokens.push(token);
  }

  return {
    classNames:
      utilityTokens.length > 0
        ? parseClassNameString(utilityTokens.join(" "))
        : undefined,
    customClasses: Array.from(customClasses),
    createdCustomClasses: Array.from(customClasses),
  };
}

function classifyImportedClasses(classAttr: string | null): {
  classNames?: BuilderNode["classNames"];
  customClasses: string[];
  createdCustomClasses: string[];
} {
  return classifyImportedClassTokens(tokenizeImportedClasses(classAttr));
}

function supportsImportedBackgroundImageLayer(tagName: string): boolean {
  return IMPORTABLE_BACKGROUND_IMAGE_TAGS.has(tagName);
}

function extractImportedBackgroundStyles(
  classTokens: string[],
): ImportedBackgroundStyles | null {
  let hasExtractedBackgroundStyles = false;
  const remainingClassTokens: string[] = [];
  const styles: StyleMap = {};

  for (const token of classTokens) {
    const backgroundImageMatch = token.match(BACKGROUND_IMAGE_UTILITY_PATTERN);
    if (backgroundImageMatch) {
      const breakpoint = resolveImportedBackgroundBreakpoint(
        backgroundImageMatch.groups?.prefix,
      );
      const sanitizedImageUrl = sanitizeUrl(
        backgroundImageMatch.groups?.url ?? "",
      );
      if (breakpoint && sanitizedImageUrl) {
        setImportedResponsiveStyle(
          styles,
          "backgroundImage",
          breakpoint,
          buildImportedBackgroundImageValue(sanitizedImageUrl),
        );
        hasExtractedBackgroundStyles = true;
        continue;
      }
    }

    let consumedBackgroundStyle = false;
    for (const entry of BACKGROUND_STYLE_TOKEN_MAPPERS) {
      const match = token.match(entry.pattern);
      if (!match) {
        continue;
      }

      const breakpoint = resolveImportedBackgroundBreakpoint(
        match.groups?.prefix,
      );
      if (!breakpoint) {
        break;
      }

      setImportedResponsiveStyle(
        styles,
        entry.property,
        breakpoint,
        entry.value,
      );
      hasExtractedBackgroundStyles = true;
      consumedBackgroundStyle = true;
      break;
    }

    if (consumedBackgroundStyle) {
      continue;
    }

    remainingClassTokens.push(token);
  }

  if (!hasExtractedBackgroundStyles) {
    return null;
  }

  return {
    classTokens: remainingClassTokens,
    styles,
  };
}

/**
 * Parse style attribute into StyleMap
 */
function parseInlineStyles(styleStr: string): StyleMap {
  const styles: StyleMap = {};

  if (!styleStr) return styles;

  const declarations = styleStr.split(";").filter((d) => d.trim());

  for (const declaration of declarations) {
    const [property, value] = declaration.split(":").map((s) => s.trim());
    if (!property || !value) continue;

    const sanitizedValue = sanitizeCssValue(value);
    if (!sanitizedValue) continue;

    // Convert CSS property to camelCase
    const camelProperty = property.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );

    styles[camelProperty] = { base: sanitizedValue };
  }

  return styles;
}

const IMPORTED_LIST_STYLE_UTILITY_PATTERN =
  /^(?:(?:[^:\s]+):)*(?:list-(?:none|disc|decimal))$/;
const IMPORTED_PADDING_UTILITY_PATTERN =
  /^(?:(?:[^:\s]+):)*(?:p|px|pl|pr|ps|pe)-.+$/;
const IMPORTED_WIDTH_UTILITY_PATTERN =
  /^(?:(?:[^:\s]+):)*(?:(?:w|min-w|max-w|basis)-.+|flex-(?:1|auto|initial|none|\[.+\])|grow(?:-.+)?|self-stretch)$/;

function hasImportedListStyleUtility(classTokens: readonly string[]): boolean {
  return classTokens.some((token) =>
    IMPORTED_LIST_STYLE_UTILITY_PATTERN.test(token),
  );
}

function hasImportedPadding(
  styles: StyleMap,
  classTokens: readonly string[],
): boolean {
  const hasPaddingStyle = Object.keys(styles).some(
    (property) => property === "padding" || property.startsWith("padding"),
  );

  return (
    hasPaddingStyle ||
    classTokens.some((token) => IMPORTED_PADDING_UTILITY_PATTERN.test(token))
  );
}

function hasImportedWidthSizing(
  styles: StyleMap,
  classTokens: readonly string[],
): boolean {
  const widthStyleProperties = new Set([
    "width",
    "widthSizing",
    "minWidth",
    "maxWidth",
    "flexBasis",
    "flexGrow",
    "alignSelf",
  ]);
  const hasWidthStyle = Object.keys(styles).some((property) =>
    widthStyleProperties.has(property),
  );

  return (
    hasWidthStyle ||
    classTokens.some((token) => IMPORTED_WIDTH_UTILITY_PATTERN.test(token))
  );
}

function applyImportedListWidthDefault(
  styles: StyleMap,
  classTokens: readonly string[],
): void {
  if (!hasImportedWidthSizing(styles, classTokens)) {
    styles.widthSizing = { base: "hug" };
  }
}

function applyImportedListSemantics(
  tagName: string,
  props: JsonObject,
  styles: StyleMap,
  classTokens: readonly string[],
): void {
  if (tagName === "ul" || tagName === "ol") {
    const ordered = tagName === "ol";
    props.ordered = ordered;
    const hasListStyleUtility = hasImportedListStyleUtility(classTokens);

    if (styles.listStyleType === undefined && !hasListStyleUtility) {
      styles.listStyleType = { base: ordered ? "decimal" : "none" };
    }

    const removesMarkersAtBase =
      !ordered &&
      (styles.listStyleType?.base === "none" ||
        classTokens.includes("list-none"));
    if (removesMarkersAtBase && !hasImportedPadding(styles, classTokens)) {
      styles.padding = { base: "0" };
    }
    applyImportedListWidthDefault(styles, classTokens);
    return;
  }

  if (tagName === "dl") {
    props.element = "dl";
    applyImportedListWidthDefault(styles, classTokens);
    return;
  }

  if (tagName === "dt" || tagName === "dd") {
    props.element = tagName;
  }
}

function shouldDropAttribute(name: string): boolean {
  return (
    name.startsWith("on") ||
    name.startsWith("data-") ||
    name === "srcdoc" ||
    name === "is"
  );
}

function parseImportedAttributes(
  element: Element,
  report: HtmlToNodesImportReport,
): JsonObject {
  const props: JsonObject = {};
  const tagName = element.tagName.toLowerCase();

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name;
    const value = attr.value;

    if (
      name === "style" ||
      name === "class" ||
      name === "data-node-id" ||
      name === "data-type" ||
      name === "slot" ||
      name === "role" ||
      name === "tabindex" ||
      name.startsWith("aria-")
    ) {
      continue;
    }

    if (shouldDropAttribute(name)) {
      report.removedAttributes.push({ attribute: name, tagName });
      continue;
    }

    if (tagName === "img" && isNonManagedImageHtmlAttr(name)) {
      report.removedAttributes.push({ attribute: name, tagName });
      continue;
    }

    if (name === "href" || name === "src" || name === "xlink:href") {
      const sanitizedUrl = sanitizeUrl(value);
      if (!sanitizedUrl) {
        report.removedAttributes.push({ attribute: name, tagName });
        continue;
      }
      props[name === "xlink:href" ? "href" : name] = sanitizedUrl;
      continue;
    }

    if (value === "" || value === name) {
      props[name] = true;
      continue;
    }

    props[name] = parseAttributeValue(value);
  }

  return props;
}

function createImportedTextNode(
  content: string,
  type: "Text" | "Span" = "Text",
  options: {
    preserveLeadingWhitespace?: boolean;
    preserveTrailingWhitespace?: boolean;
    allowWhitespaceOnly?: boolean;
  } = {},
): BuilderNode | null {
  const normalized = content.replace(/\s+/g, " ");
  const trimmed = normalized.trim();

  if (!trimmed && !options.allowWhitespaceOnly) {
    return null;
  }

  let text = trimmed || " ";

  if (options.preserveLeadingWhitespace && /^\s/.test(normalized)) {
    text = ` ${text}`;
  }

  if (options.preserveTrailingWhitespace && /\s$/.test(normalized)) {
    text = `${text} `;
  }

  if (!text) return null;

  return {
    id: generateNodeId(),
    type,
    props: {
      text,
    },
    styles: {},
    children: [],
  };
}

function appendTrailingSpaceToPreviousImportedChild(
  children: BuilderNode[],
): boolean {
  const previous = children[children.length - 1];
  if (!previous) {
    return false;
  }

  if (typeof previous.props?.text === "string") {
    previous.props.text = `${previous.props.text} `;
    return true;
  }

  if (typeof previous.props?.content === "string") {
    previous.props.content = `${previous.props.content} `;
    return true;
  }

  return false;
}

function normalizeImportedHtml(html: string): string {
  return html
    .replace(/\bclassName=/g, "class=")
    .replace(/\bhtmlFor=/g, "for=")
    .replace(
      /<([A-Za-z][\w:-]*)([^<>]*?)\/>/g,
      (match, rawTagName: string, rawAttributes: string) => {
        const tagName = rawTagName.toLowerCase();
        if (HTML_VOID_TAGS.has(tagName)) {
          return match;
        }

        return `<${rawTagName}${rawAttributes}></${rawTagName}>`;
      },
    );
}

function collectImportedChildren(
  element: Element,
  report: HtmlToNodesImportReport,
): BuilderNode[] {
  const children: BuilderNode[] = [];
  const hasElementChildren = element.children.length > 0;
  let pendingInlineSpace = false;

  const appendPendingSpaceToNode = (node: BuilderNode): boolean => {
    if (!pendingInlineSpace) {
      return false;
    }

    if (typeof node.props?.text === "string") {
      node.props.text = ` ${node.props.text}`;
      pendingInlineSpace = false;
      return true;
    }

    if (typeof node.props?.content === "string") {
      node.props.content = ` ${node.props.content}`;
      pendingInlineSpace = false;
      return true;
    }

    return false;
  };

  const findAdjacentElement = (
    start: ChildNode | null,
    direction: "previousSibling" | "nextSibling",
  ): Element | null => {
    let current = start;

    while (current) {
      if (current.nodeType === current.ELEMENT_NODE) {
        return current as Element;
      }

      current = current[direction] as ChildNode | null;
    }

    return null;
  };

  const isBlockLevelImportElement = (candidate: Element | null): boolean => {
    if (!candidate) return false;

    const tagName = candidate.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      return true;
    }

    return new Set([
      "address",
      "article",
      "aside",
      "blockquote",
      "details",
      "div",
      "dl",
      "fieldset",
      "figcaption",
      "figure",
      "footer",
      "form",
      "header",
      "hr",
      "li",
      "main",
      "nav",
      "ol",
      "p",
      "pre",
      "section",
      "table",
      "ul",
    ]).has(tagName);
  };

  const isInlineImportElement = (candidate: Element | null): boolean => {
    if (!candidate) return false;

    return new Set([
      "a",
      "abbr",
      "b",
      "br",
      "code",
      "em",
      "i",
      "iconify-icon",
      "img",
      "kbd",
      "label",
      "mark",
      "samp",
      "small",
      "span",
      "strong",
      "sub",
      "sup",
      "svg",
      "time",
      "u",
    ]).has(candidate.tagName.toLowerCase());
  };

  for (const childNode of Array.from(element.childNodes)) {
    if (childNode.nodeType === childNode.TEXT_NODE) {
      const rawText = childNode.textContent ?? "";
      const isWhitespaceOnly = !/\S/.test(rawText);
      const previousElement = findAdjacentElement(
        childNode.previousSibling as ChildNode | null,
        "previousSibling",
      );
      const nextElement = findAdjacentElement(
        childNode.nextSibling as ChildNode | null,
        "nextSibling",
      );

      if (isWhitespaceOnly) {
        const isInlineSeparator =
          isInlineImportElement(previousElement) &&
          isInlineImportElement(nextElement);

        if (isInlineSeparator) {
          pendingInlineSpace = true;
        }

        continue;
      }

      const betweenInlineElements =
        isInlineImportElement(previousElement) ||
        isInlineImportElement(nextElement);
      const adjacentToBlockLevel =
        isBlockLevelImportElement(previousElement) ||
        isBlockLevelImportElement(nextElement);

      const textNode =
        hasElementChildren && betweenInlineElements && !adjacentToBlockLevel
          ? createImportedTextNode(rawText, "Span", {
              preserveLeadingWhitespace:
                pendingInlineSpace || isInlineImportElement(previousElement),
              preserveTrailingWhitespace: isInlineImportElement(nextElement),
            })
          : null;
      if (textNode) {
        appendPendingSpaceToNode(textNode);
        children.push(textNode);
      }
      continue;
    }

    if (childNode.nodeType !== childNode.ELEMENT_NODE) {
      continue;
    }

    const importedChild = importElementToNode(childNode as Element, report);

    if (pendingInlineSpace) {
      if (!appendPendingSpaceToNode(importedChild)) {
        appendTrailingSpaceToPreviousImportedChild(children);
        // If the space can't be attached to either adjacent node, drop it
        // rather than creating a standalone <span> </span> node.
        // Standalone whitespace spans break grid and flex layouts where the
        // original HTML whitespace between elements carries no semantic meaning.
        pendingInlineSpace = false;
      }
    }

    children.push(importedChild);
  }

  return children;
}

function applyImportedTextFallback(
  tagName: string,
  props: JsonObject,
  children: BuilderNode[],
  textContent: string,
): void {
  if (children.length > 0 || !textContent.trim()) {
    return;
  }

  const text = textContent.trim();
  const canonicalProp = getCanonicalContentPropName(mapTagToType(tagName));
  if (canonicalProp) {
    props[canonicalProp] = text;
    return;
  }

  props.content = text;
}

function importSvgElementToNode(
  element: Element,
  report: HtmlToNodesImportReport,
): BuilderNode {
  const styleAttr = element.getAttribute("style");
  const styles = parseInlineStyles(styleAttr || "");
  const props = parseImportedAttributes(element, report);
  const { classNames, customClasses, createdCustomClasses } =
    classifyImportedClasses(element.getAttribute("class"));
  report.createdCustomClasses.push(...createdCustomClasses);

  props.content = element.innerHTML;

  return {
    id: generateNodeId(),
    type: "Svg",
    props,
    styles,
    children: [],
    ...(classNames ? { classNames } : {}),
    ...(customClasses.length > 0 ? { customClasses } : {}),
  };
}

function importElementToNode(
  element: Element,
  report: HtmlToNodesImportReport,
): BuilderNode {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "svg") {
    return importSvgElementToNode(element, report);
  }

  if (tagName === "picture") {
    const img = element.querySelector("img");
    if (img) {
      return importElementToNode(img, report);
    }
  }

  const type = mapTagToType(tagName);
  const id = generateNodeId();
  const styleAttr = element.getAttribute("style");
  const parsedInlineStyles = parseInlineStyles(styleAttr || "");
  const props = parseImportedAttributes(element, report);
  const classTokens = tokenizeImportedClasses(element.getAttribute("class"));
  const importedBackgroundStyles = supportsImportedBackgroundImageLayer(tagName)
    ? extractImportedBackgroundStyles(classTokens)
    : null;
  const styles = mergeImportedStyles(
    parsedInlineStyles,
    importedBackgroundStyles?.styles,
  );
  const { classNames, customClasses, createdCustomClasses } =
    classifyImportedClassTokens(
      importedBackgroundStyles?.classTokens ?? classTokens,
    );
  report.createdCustomClasses.push(...createdCustomClasses);

  if (tagName.startsWith("h")) {
    props.level = getHeadingLevel(tagName);
  }

  applyImportedListSemantics(tagName, props, styles, classTokens);

  if (tagName === "img") {
    props.src = typeof props.src === "string" ? props.src : "";
    props.alt = element.getAttribute("alt") || "";
  }

  if (tagName === "a") {
    if (element.hasAttribute("href")) {
      props.href = typeof props.href === "string" ? props.href : "";
    }
    const target = element.getAttribute("target");
    const rel = element.getAttribute("rel");
    if (target) {
      props.target = target;
    }
    if (rel) {
      props.rel = rel;
    }
  }

  if (tagName === "input") {
    props.type = element.getAttribute("type") || "text";
    const placeholder = element.getAttribute("placeholder");
    if (placeholder) {
      props.placeholder = placeholder;
    }
  }

  const slot = element.getAttribute("slot") || undefined;
  const a11y: NodeAccessibility = {};
  if (element.getAttribute("role"))
    a11y.role = element.getAttribute("role") ?? undefined;
  if (element.getAttribute("aria-label"))
    a11y.ariaLabel = element.getAttribute("aria-label") ?? undefined;
  if (element.getAttribute("aria-describedby"))
    a11y.ariaDescribedBy =
      element.getAttribute("aria-describedby") ?? undefined;
  if (element.getAttribute("aria-labelledby"))
    a11y.ariaLabelledBy = element.getAttribute("aria-labelledby") ?? undefined;
  if (element.getAttribute("aria-hidden"))
    a11y.ariaHidden = element.getAttribute("aria-hidden") === "true";
  if (element.getAttribute("aria-expanded"))
    a11y.ariaExpanded = element.getAttribute("aria-expanded") === "true";
  if (element.getAttribute("aria-controls"))
    a11y.ariaControls = element.getAttribute("aria-controls") ?? undefined;
  if (element.getAttribute("tabindex")) {
    a11y.tabIndex = parseInt(element.getAttribute("tabindex")!, 10);
  }

  const variants: NodeVariants = {};
  const children = collectImportedChildren(element, report);
  applyImportedTextFallback(
    tagName,
    props,
    children,
    element.textContent ?? "",
  );

  return {
    id,
    type,
    props,
    styles,
    children,
    slot,
    ...(classNames ? { classNames } : {}),
    ...(customClasses.length > 0 ? { customClasses } : {}),
    ...(Object.keys(a11y).length > 0 ? { a11y } : {}),
    ...(Object.keys(variants).length > 0 ? { variants } : {}),
  };
}

function sanitizeImportDocument(html: string): {
  bodyChildren: Element[];
  report: HtmlToNodesImportReport;
} {
  const report = createEmptyImportReport();
  const sanitizedHtml = DOMPurify.sanitize(normalizeImportedHtml(html), {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: DISALLOWED_TAGS,
  });

  const removedEntries = Array.isArray(DOMPurify.removed)
    ? [...DOMPurify.removed]
    : [];
  for (const entry of removedEntries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if ("attribute" in entry && entry.attribute && "from" in entry) {
      const attributeName =
        entry.attribute &&
        typeof entry.attribute === "object" &&
        "name" in entry.attribute
          ? String(entry.attribute.name)
          : String(entry.attribute);
      const tagName =
        entry.from && typeof entry.from === "object" && "tagName" in entry.from
          ? String(entry.from.tagName).toLowerCase()
          : "unknown";
      report.removedAttributes.push({
        attribute: attributeName,
        tagName,
      });
      continue;
    }

    if ("element" in entry && entry.element) {
      const tagName =
        entry.element &&
        typeof entry.element === "object" &&
        "tagName" in entry.element
          ? String(entry.element.tagName).toLowerCase()
          : "unknown";
      report.removedElements.push({ tagName });
    }
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedHtml, "text/html");

  return {
    bodyChildren: Array.from(doc.body.children),
    report,
  };
}

function countMarkupTagsInString(value: string): number {
  return (value.match(/<[a-z][\w:-]*\b/gi) ?? []).length;
}

function nodeTextForReparse(node: BuilderNode): string {
  const props = node.props ?? {};
  if (typeof props.text === "string") {
    return props.text;
  }
  if (typeof props.content === "string") {
    return props.content;
  }
  return "";
}

function containerNodeIsEmptyShell(node: BuilderNode): boolean {
  const typeKey = (node.type ?? "").toLowerCase();
  if (typeKey !== "container") {
    return false;
  }

  const props = node.props ?? {};
  const hasProps = Object.keys(props).some((key) => {
    const value = props[key];
    return value !== undefined && value !== null && value !== "";
  });

  if (hasProps) {
    return false;
  }

  const hasClasses =
    (node.classNames?.base?.length ?? 0) > 0 ||
    (node.customClasses?.length ?? 0) > 0;
  if (hasClasses) {
    return false;
  }

  return Object.keys(node.styles ?? {}).length === 0;
}

function hoistRedundantContainerNodes(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map((node) => {
    const children = hoistRedundantContainerNodes(node.children ?? []);

    if (
      containerNodeIsEmptyShell(node) &&
      children.length === 1 &&
      containerNodeIsEmptyShell(children[0]!)
    ) {
      return children[0]!;
    }

    if (children === node.children) {
      return node;
    }

    return { ...node, children };
  });
}

async function reparseHtmlTextNodesInTree(
  nodes: BuilderNode[],
  depth: number,
): Promise<BuilderNode[]> {
  const result: BuilderNode[] = [];

  for (const node of nodes) {
    const children = node.children?.length
      ? await reparseHtmlTextNodesInTree(node.children, depth)
      : [];
    const text = nodeTextForReparse(node);
    const shouldReparse =
      children.length === 0 &&
      text.trim().length > 0 &&
      countMarkupTagsInString(text) >= 3 &&
      /<\/?[a-z][\s\S]*>/i.test(text);

    if (shouldReparse && depth < 2) {
      const reparsed = await importHtmlToNodes(text, depth + 1);
      if (
        reparsed.nodes.length > 0 &&
        !detectTokenizedMarkupImport(reparsed.nodes)
      ) {
        result.push(...reparsed.nodes);
        continue;
      }
    }

    result.push(children === node.children ? node : { ...node, children });
  }

  return result;
}

export async function importHtmlToNodes(
  html: string,
  importDepth = 0,
): Promise<HtmlToNodesImportResult> {
  const { cleanedHtml, styleBlocks, rejectedStyleBlocks } =
    extractImportedStyleBlocks(html);
  const styleCodeNodes = styleBlocks.map(createImportedStyleCodeNode);

  let { bodyChildren, report } = sanitizeImportDocument(cleanedHtml);

  if (bodyChildren.length === 0 && importDepth < 1) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      normalizeImportedHtml(cleanedHtml),
      "text/html",
    );
    const bodyText = doc.body.textContent?.trim() ?? "";
    if (/<\/?[a-z][\s\S]*>/i.test(bodyText)) {
      return importHtmlToNodes(bodyText, importDepth + 1);
    }
  }

  const markupNodes = bodyChildren.map((element) =>
    importElementToNode(element, report),
  );

  let nodes = normalizeImportedNodeTree([...styleCodeNodes, ...markupNodes]);
  nodes = hoistRedundantContainerNodes(nodes);
  if (importDepth < 2) {
    nodes = await reparseHtmlTextNodesInTree(nodes, importDepth);
  }

  return {
    nodes,
    report: {
      ...report,
      extractedStyleBlocks: styleCodeNodes.length,
      rejectedStyleBlocks: report.rejectedStyleBlocks + rejectedStyleBlocks,
      createdCustomClasses: Array.from(new Set(report.createdCustomClasses)),
    },
  };
}

export {
  normalizeImportedNodeTree,
  sanitizeBuilderNodeTree,
  collectUndefinedPropPaths,
} from "./sanitizeBuilderNodeTree";

/**
 * Parse element attributes into props object
 */
function parseAttributeValue(value: string): JsonValue {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isJsonValue(parsed)) {
        return parsed;
      }
    } catch {
      // Fall back to the raw string when the attribute is not valid JSON.
    }
  }

  if (!isNaN(Number(value)) && value !== "") {
    return Number(value);
  }

  return value;
}

function parseAttributes(element: Element): JsonObject {
  const props: JsonObject = {};

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name;
    const value = attr.value;

    // Skip special attributes (class and style are handled separately)
    if (
      name === "style" ||
      name === "class" ||
      name === "data-node-id" ||
      name === "data-type"
    ) {
      continue;
    }

    if (value === "" || value === name) {
      props[name] = true;
      continue;
    }

    props[name] = parseAttributeValue(value);
  }

  return props;
}

function mapTagToType(tagName: string): string {
  const tagMap: Record<string, string> = {
    div: "Container",
    section: "Section",
    article: "Article",
    header: "Header",
    footer: "Footer",
    nav: "Nav",
    main: "Main",
    aside: "Aside",
    figure: "Container",
    figcaption: "Span",
    blockquote: "Container",
    address: "Container",
    details: "Container",
    summary: "Span",
    dl: "List",
    dt: "ListItem",
    dd: "ListItem",
    h1: "Heading",
    h2: "Heading",
    h3: "Heading",
    h4: "Heading",
    h5: "Heading",
    h6: "Heading",
    p: "Paragraph",
    span: "Span",
    a: "Link",
    button: "Button",
    i: "Icon",
    img: "Image",
    video: "Video",
    audio: "Audio",
    ul: "List",
    ol: "List",
    li: "ListItem",
    form: "Form",
    input: "Input",
    textarea: "Textarea",
    select: "Select",
    label: "Label",
    pre: "Code",
    code: "Span",
    strong: "Span",
    em: "Span",
    b: "Span",
    small: "Span",
    mark: "Span",
    cite: "Span",
    dfn: "Span",
    kbd: "Span",
    samp: "Span",
    var: "Span",
    sub: "Span",
    sup: "Span",
    abbr: "Span",
    time: "Span",
    u: "Span",
    del: "Span",
    ins: "Span",
    q: "Span",
    ruby: "Span",
    rt: "Span",
    rp: "Span",
    wbr: "Span",
    br: "Break",
    hr: "Container",
  };

  return tagMap[tagName.toLowerCase()] || "Container";
}

function getHeadingLevel(tagName: string): number {
  const match = tagName.match(/^h(\d)$/i);
  return match ? parseInt(match[1]) : 2;
}

function elementToNode(element: Element): BuilderNode {
  const tagName = element.tagName.toLowerCase();
  const type = mapTagToType(tagName);

  // Get existing node ID or generate new one
  const id = generateNodeId();

  const styleAttr = element.getAttribute("style");
  const styles = parseInlineStyles(styleAttr || "");

  // Parse class attribute into classNames
  const classNameStr = element.getAttribute("class") || undefined;
  const classTokens = tokenizeImportedClasses(classNameStr ?? null);
  const classNames = classNameStr
    ? parseClassNameString(classNameStr)
    : undefined;

  // Parse attributes as props (excluding class and style which are handled separately)
  const props = parseAttributes(element);

  // Add special props based on element type
  if (tagName.startsWith("h")) {
    props.level = getHeadingLevel(tagName);
  }

  applyImportedListSemantics(tagName, props, styles, classTokens);

  if (tagName === "img") {
    props.src = element.getAttribute("src") || "";
    props.alt = element.getAttribute("alt") || "";
  }

  if (tagName === "a") {
    props.href = element.getAttribute("href") || "";
    const target = element.getAttribute("target");
    const rel = element.getAttribute("rel");
    if (target) {
      props.target = target;
    }
    if (rel) {
      props.rel = rel;
    }
  }

  if (tagName === "input") {
    props.type = element.getAttribute("type") || "text";
    props.placeholder = element.getAttribute("placeholder") || undefined;
  }

  const slot = element.getAttribute("slot") || undefined;

  const a11y: NodeAccessibility = {};
  if (element.getAttribute("role"))
    a11y.role = element.getAttribute("role") ?? undefined;
  if (element.getAttribute("aria-label"))
    a11y.ariaLabel = element.getAttribute("aria-label") ?? undefined;
  if (element.getAttribute("aria-describedby"))
    a11y.ariaDescribedBy =
      element.getAttribute("aria-describedby") ?? undefined;
  if (element.getAttribute("aria-labelledby"))
    a11y.ariaLabelledBy = element.getAttribute("aria-labelledby") ?? undefined;
  if (element.getAttribute("aria-hidden"))
    a11y.ariaHidden = element.getAttribute("aria-hidden") === "true";
  if (element.getAttribute("aria-expanded"))
    a11y.ariaExpanded = element.getAttribute("aria-expanded") === "true";
  if (element.getAttribute("aria-controls"))
    a11y.ariaControls = element.getAttribute("aria-controls") ?? undefined;
  if (element.getAttribute("tabindex"))
    a11y.tabIndex = parseInt(element.getAttribute("tabindex")!);

  const interactions: NodeInteractions = {};
  if (element.getAttribute("data-onclick"))
    interactions.onClick = element.getAttribute("data-onclick") ?? undefined;
  if (element.getAttribute("data-onhover"))
    interactions.onHover = element.getAttribute("data-onhover") ?? undefined;
  if (element.getAttribute("data-onscroll"))
    interactions.onScroll = element.getAttribute("data-onscroll") ?? undefined;
  if (element.getAttribute("data-animations")) {
    try {
      const parsedAnimations = AnimationConfigSchema.array().safeParse(
        JSON.parse(element.getAttribute("data-animations")!),
      );
      if (parsedAnimations.success) {
        interactions.animations = parsedAnimations.data;
      }
    } catch {}
  }

  const variants: NodeVariants = {};
  if (element.getAttribute("data-variant"))
    variants.default = element.getAttribute("data-variant") ?? undefined;

  let dataSource: NodeDataSource | undefined;
  const sourceType = element.getAttribute("data-source");
  if (
    sourceType === "static" ||
    sourceType === "cms" ||
    sourceType === "collection" ||
    sourceType === "api"
  ) {
    dataSource = {
      type: sourceType,
      ...(element.getAttribute("data-collection")
        ? { collection: element.getAttribute("data-collection") ?? undefined }
        : {}),
    };
  }

  const children: BuilderNode[] = [];

  for (const child of Array.from(element.children)) {
    children.push(elementToNode(child));
  }

  // Handle text content for elements without child elements
  if (
    children.length === 0 &&
    element.textContent &&
    element.textContent.trim()
  ) {
    const text = element.textContent.trim();
    const canonicalProp = getCanonicalContentPropName(type);
    if (canonicalProp) {
      props[canonicalProp] = text;
    } else {
      props.content = text;
    }
  }

  return {
    id,
    type,
    props,
    ...(classNames ? { classNames } : {}),
    styles,
    children,
    slot,
    ...(Object.keys(a11y).length > 0 && { a11y }),
    ...(Object.keys(interactions).length > 0 && { interactions }),
    ...(Object.keys(variants).length > 0 && { variants }),
    ...(dataSource ? { dataSource } : {}),
  };
}

/**
 * Parse HTML string into BuilderNode array
 */
export function htmlToNodes(html: string): BuilderNode[] {
  // Create a temporary DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Get body children (skip <html>, <head>, <body> wrapper)
  const bodyChildren = Array.from(doc.body.children);

  if (bodyChildren.length === 0) {
    return [];
  }

  // Convert each child element to a node
  return normalizeImportedNodeTree(bodyChildren.map(elementToNode));
}

/**
 * Parse HTML fragment (without document wrapper)
 */
export function htmlFragmentToNodes(html: string): BuilderNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const wrapper = doc.body.firstElementChild;

  if (!wrapper) {
    return [];
  }

  const children = Array.from(wrapper.children);
  return normalizeImportedNodeTree(children.map(elementToNode));
}

export function htmlElementToNode(element: Element): BuilderNode {
  return normalizeImportedNodeTree([elementToNode(element)])[0]!;
}

/**
 * Convert nodes back to HTML string (for validation/preview)
 */
export function nodesToSimpleHtml(nodes: BuilderNode[]): string {
  const getStringProp = (
    props: JsonObject,
    key: string,
  ): string | undefined => {
    const value = props[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    return undefined;
  };

  const getHeadingTag = (node: BuilderNode): string => {
    if (node.type !== "Heading") {
      return "div";
    }

    const level = node.props.level;
    return typeof level === "number" && level >= 1 && level <= 6
      ? `h${level}`
      : "h2";
  };

  function renderNode(node: BuilderNode): string {
    const tag = getHeadingTag(node);
    const attrs: string[] = [];

    attrs.push(`data-node-id="${node.id}"`);

    const className =
      getStringProp(node.props, "class") ||
      getStringProp(node.props, "className");
    if (className) {
      attrs.push(`class="${className}"`);
    }

    const attrsStr = attrs.length > 0 ? " " + attrs.join(" ") : "";

    const text =
      getStringProp(node.props, "text") ||
      getStringProp(node.props, "content") ||
      "";

    const childrenHtml =
      node.children && node.children.length > 0
        ? node.children.map(renderNode).join("")
        : text;

    return `<${tag}${attrsStr}>${childrenHtml}</${tag}>`;
  }

  return nodes.map(renderNode).join("");
}

/**
 * Extract structure information from HTML (for preview/analysis)
 */
export function analyzeHtmlStructure(html: string): {
  elementCount: number;
  depth: number;
  tags: Record<string, number>;
} {
  const nodes = htmlToNodes(html);
  let elementCount = 0;
  let maxDepth = 0;
  const tags: Record<string, number> = {};

  function traverse(node: BuilderNode, depth: number) {
    elementCount++;
    maxDepth = Math.max(maxDepth, depth);
    tags[node.type] = (tags[node.type] || 0) + 1;

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => traverse(child, depth + 1));
    }
  }

  nodes.forEach((node) => traverse(node, 1));

  return {
    elementCount,
    depth: maxDepth,
    tags,
  };
}
