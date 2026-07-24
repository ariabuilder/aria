import type { BuilderNode } from "@/lib/types/nodes";
import {
  getSiteSettingsUtilityEngine,
  type SiteSettings,
} from "@/lib/storage/adapter";
import { resolveNodeClasses } from "@/lib/blocks/resolveNodeClasses";
import { nodesToHtmlFragment } from "../../../../../lib/blocks/nodesToHtml";
import { NON_CONFLICTING_SEMANTIC_UNO_COLORS } from "@/lib/styles/unoSystemDefaults";
import { DEFAULT_BREAKPOINTS } from "../../../../../lib/types/nodes";
import { normalizeResponsiveStyleMap } from "../../../../../lib/blocks/normalizeResponsiveStyleMap";
import { DESKTOP_BASE_BREAKPOINT } from "../../../../../lib/styles/responsiveBreakpoints";
import type { PagePreviewRenderStylesData } from "./pagePreviewActionResults";
import { THEME_STYLES, UNOCSS_CDN } from "./pagePreviewConstants";
import type { IconRenderResources } from "../../../../../lib/icons/iconRenderResources";

export interface GenerateLiveHtmlInput {
  nodes: BuilderNode[];
  settings: SiteSettings | null;
  renderStyles: PagePreviewRenderStylesData;
  pageCssVariables: Record<string, string>;
  iconResources?: IconRenderResources;
}

const TEXT_LINK_WRAPPER_NODE_TYPES = new Set(["heading", "text", "paragraph"]);

export function toHtmlAttributeValue(value: unknown): string | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return null;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function cssVariablesToString(
  variables: Record<string, string> = {},
): string {
  const entries = Object.entries(variables).filter(
    ([, value]) => value != null,
  );
  if (entries.length === 0) return "";

  const declarations = entries
    .map(([key, value]) => {
      const varName = key.startsWith("--") ? key : `--${key}`;
      return `${varName}: ${String(value)};`;
    })
    .join("\n");

  return `:root {\n${declarations}\n}`;
}

export function normalizePreviewNodes(nodes: unknown): BuilderNode[] {
  return Array.isArray(nodes) ? (nodes as BuilderNode[]) : [];
}

export function nodesToHtml(nodes: BuilderNode[]): string {
  return nodes.map((node) => nodeToHtml(node)).join("");
}

function buildTextLinkAttributes(props: BuilderNode["props"]): string {
  const href = toHtmlAttributeValue(props?.href);
  if (!href) {
    return "";
  }

  const attrs = [`href="${escapeHtml(href)}"`];

  const target = toHtmlAttributeValue(props?.target);
  if (target) {
    attrs.push(`target="${escapeHtml(target)}"`);
  }

  const rel = toHtmlAttributeValue(props?.rel);
  if (rel) {
    attrs.push(`rel="${escapeHtml(rel)}"`);
  }

  const title = toHtmlAttributeValue(props?.title);
  if (title) {
    attrs.push(`title="${escapeHtml(title)}"`);
  }

  if (props?.download === true) {
    attrs.push("download");
  }

  return attrs.join(" ");
}

function wrapTextLinkContent(
  nodeType: string,
  props: BuilderNode["props"],
  content: string,
): string {
  if (!TEXT_LINK_WRAPPER_NODE_TYPES.has(nodeType) || !content) {
    return content;
  }

  const linkAttrs = buildTextLinkAttributes(props);
  if (!linkAttrs) {
    return content;
  }

  return `<a ${linkAttrs}>${content}</a>`;
}

export function nodeToHtml(node: BuilderNode): string {
  const nodeType = String(node.type || "")
    .trim()
    .toLowerCase();
  const typeToTag: Record<string, string> = {
    container: "div",
    section: "section",
    heading: "h2",
    text: "p",
    paragraph: "p",
    button: "button",
    image: "img",
    link: "a",
    list: "ul",
    listitem: "li",
    div: "div",
    span: "span",
    svg: "svg",
  };

  const isSvg = nodeType === "svg";

  const tag = typeToTag[nodeType] || (isSvg ? "svg" : "div");
  const props = node.props || {};
  const children = node.children || [];
  const attrs: string[] = [];

  const className = resolveNodeClasses(node);
  if (className) {
    attrs.push(`class="${escapeHtml(className)}"`);
  }

  if (node.styles && Object.keys(node.styles).length > 0) {
    const styleStr = Object.entries(node.styles)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        const value =
          typeof v === "object" && v !== null
            ? normalizeResponsiveStyleMap(v)[DESKTOP_BASE_BREAKPOINT]
            : v;
        if (value === undefined) {
          return "";
        }
        return `${camelToKebab(k)}: ${value}`;
      })
      .filter(Boolean)
      .join("; ");
    if (styleStr) {
      attrs.push(`style="${escapeHtml(styleStr)}"`);
    }
  }

  if (tag === "img") {
    const imageSrc = toHtmlAttributeValue(props.src);
    if (imageSrc) {
      attrs.push(`src="${escapeHtml(imageSrc)}"`);
    }

    const imageAlt = toHtmlAttributeValue(props.alt) ?? "";
    attrs.push(`alt="${escapeHtml(imageAlt)}"`);
  }

  if (tag === "a") {
    const href = toHtmlAttributeValue(props.href);
    if (href) {
      attrs.push(`href="${escapeHtml(href)}"`);
    }
  }

  if (isSvg) {
    // Render SVG presentation attributes from props
    // These are stored by importSvgElementToNode via parseImportedAttributes
    const svgAttrNames = [
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-opacity",
      "fill-opacity",
      "opacity",
      "viewBox",
      "preserveAspectRatio",
      "xmlns",
      "xmlns:xlink",
      "width",
      "height",
    ];
    for (const attrName of svgAttrNames) {
      const value = toHtmlAttributeValue(props[attrName]);
      if (value) {
        attrs.push(`${attrName}="${escapeHtml(value)}"`);
      }
    }
  }

  const selfClosing = ["img", "br", "hr", "input", "meta", "link"];
  if (selfClosing.includes(tag)) {
    return `<${tag} ${attrs.join(" ")} />`;
  }

  // SVG content is raw innerHTML (not escaped) — it was captured as
  // element.innerHTML during import and is valid SVG markup.
  if (isSvg && typeof props.content === "string") {
    return `<${tag}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>${props.content}</${tag}>`;
  }

  const content =
    typeof props.content === "string"
      ? props.content
      : typeof props.text === "string"
        ? props.text
        : children.length > 0
          ? nodesToHtml(children)
          : "";

  const wrappedContent = wrapTextLinkContent(nodeType, props, content);

  return `<${tag}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>${wrappedContent}</${tag}>`;
}

export function generateLiveHtml(input: GenerateLiveHtmlInput): string {
  const bodyContent = nodesToHtmlFragment(
    input.nodes,
    0,
    DEFAULT_BREAKPOINTS,
    "stylesheet",
    input.iconResources,
  );
  const framework = getSiteSettingsUtilityEngine(input.settings);

  const unocssConfig = input.settings?.unocssConfig || {};
  const runtimeTheme =
    unocssConfig.theme && typeof unocssConfig.theme === "object"
      ? (unocssConfig.theme as Record<string, unknown>)
      : {};
  const runtimeColors =
    runtimeTheme.colors && typeof runtimeTheme.colors === "object"
      ? (runtimeTheme.colors as Record<string, unknown>)
      : {};

  const configJSON = JSON.stringify({
    theme: {
      ...runtimeTheme,
      colors: {
        ...runtimeColors,
        ...NON_CONFLICTING_SEMANTIC_UNO_COLORS,
      },
    },
    shortcuts: unocssConfig.shortcuts || {},
    rules: unocssConfig.rules || [],
    safelist: unocssConfig.safelist || [],
  });

  const frameworkAssets =
    framework === "unocss"
      ? `<script src="${UNOCSS_CDN}/uno.global.js"><\/script>`
      : framework === "custom" && input.settings?.customFrameworkURL
        ? `<link rel="stylesheet" href="${escapeHtml(input.settings.customFrameworkURL)}">`
        : "";

  const unocssSetup =
    framework === "unocss"
      ? `<script>window.__unocss = ${configJSON};<\/script>`
      : "";
  const pageVariables = cssVariablesToString(input.pageCssVariables);
  const compiledStyles = input.renderStyles.globalCSS?.trim()
    ? input.renderStyles.globalCSS
    : [input.renderStyles.baseCSS, input.renderStyles.utilityCSS]
        .filter(Boolean)
        .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>${THEME_STYLES}</style>
  <style>${compiledStyles}</style>
  <style>${pageVariables}</style>
  ${unocssSetup}
  ${frameworkAssets}
</head>
<body class="preview-mode">${bodyContent}</body>
</html>`;
}
