/**
 * Converts hierarchical BuilderNode structures to HTML strings. Used for: -
 * Snapshot generation (published HTML) - Preview rendering - Export functionality.
 */

import type {
  BuilderNode,
  ComponentDSL,
  JsonObject,
  StyleMap,
  BreakpointDefinition,
} from "../types/nodes";
import { DEFAULT_BREAKPOINTS } from "../types/nodes";
import { buildGoogleFontsURL } from "../styles/generateCustomCSS";
import { serializeFontFamilyValue } from "../styles/fontFamily";
import { getUnoCSSTags } from "../styles/user-uno";
import { classNamesToString } from "../schemas/classEditor";
import {
  compileMotionClassString,
  compileMotionDataAttributes,
  compileParallaxClassString,
  compileParallaxDataAttributes,
} from "../motion/compile";
import {
  buildButtonContentRowStyle,
  buildButtonIconStyle,
  getButtonIconHostClassName,
  getButtonIconPosition,
} from "./buttonContent";
import {
  getSlotDefaultContent,
  type LayoutSlotDefinitionLike,
} from "../layouts/slotEditing";
import { resolveNodeSlotForLayout } from "../layouts/resolveNodeSlot";
import {
  compareResponsiveMediaQueryOutputOrder,
  createResponsiveMediaQuery,
  DESKTOP_BASE_BREAKPOINT,
  getDesktopFirstOverrideBreakpoints,
  sortBreakpointsByEffectiveWidthDesc,
} from "../styles/responsiveBreakpoints";
import { buildRobotsMetaTag, resolvePageRobotsMeta } from "../seo/robotsMeta";
import {
  getCanonicalIconIdFromValue,
  getIconClassFromValue,
} from "../icons/reference";
import { getIconMediaUrl } from "../icons/mediaIcon";
import {
  createIconRenderResources,
  renderIconFromResources,
  type IconRenderResources,
} from "../icons/iconRenderResources";
import {
  getNativeTagForRenderableNode,
  getNativeTagForRenderableNodeInContext,
  resolveRenderedButtonVariant,
  stripConsumedRenderPropsForNode,
  type RenderableNodeTagContext,
} from "./renderSemantics";
import {
  findListItemTextLinkChildIndex,
  isTextLinkWrapperNodeType,
  resolveListItemLinkScope,
  shouldWrapContainerChildrenInLink,
  stripLinkPropsForContainerWrapper,
  stripTextLinkWrapperPropsFromNode,
} from "./listItemLinks";
import { BUTTON_VARIANT_ATTRIBUTE as BUTTON_VARIANT_DATA_ATTRIBUTE } from "./buttonVariants";
import { normalizeContainerNodeType } from "./containerTypes";
import { normalizeResponsiveStyleMap } from "./normalizeResponsiveStyleMap";
import { mergeSizingResolutionAcrossBreakpoints } from "../layout/resolveSizingCss";
import {
  buildRenderedCodeMarkup,
  getCodeBlockRenderMode,
  inferCodeLanguage,
} from "../utils/codeLanguage";
import { tryRenderStructuredTextContent } from "../cms/structuredText";
import {
  buildNavItemDataAttributes,
  buildNavigationDataAttributes,
  buildNavItemsDataAttributes,
  buildNavMegaSlotDataAttributes,
  buildNavToggleDataAttributes,
} from "../nav/navRenderAttributes";
import { parseNavigationProps } from "./navigationSchema";
import type { RuntimeLocals } from "../cloudflare/env";
import { projectManagedImage } from "../rendering/canonical/managedImage";
import {
  assembleRendererBaseCss,
  collectRendererStyleRequirements,
} from "../rendering/canonical/rendererStyles";
import { normalizeLegacyNodeCompatibility } from "../rendering/canonical/legacyNodeCompatibility";

type ComponentDSLResolver = (
  id: string,
) => Promise<ComponentDSL | null | undefined>;

interface CustomFontFormat {
  url: string;
  format: string;
}

interface CustomFontDefinition {
  family: string;
  formats: CustomFontFormat[];
  weight?: string;
  style?: string;
}

interface GoogleFontDefinition {
  id: string;
  family: string;
  variants: string[];
  googleFontsURL: string;
}

export type HtmlRenderStyleMode = "inline" | "stylesheet";

/** Pre-resolved icon records supplied by the async publishing prepass. */
export { createIconRenderResources, type IconRenderResources };

export function resolvePublishedHtmlRenderStyleMode(
  options: Pick<
    NodeToHtmlDocumentOptions,
    "globalCSSEnabled" | "inlineGeneratedDocumentCss"
  > = {},
): HtmlRenderStyleMode {
  if (options.globalCSSEnabled || options.inlineGeneratedDocumentCss) {
    return "stylesheet";
  }

  return "inline";
}

const SIZING_METADATA_PROPERTIES = new Set(["widthSizing", "heightSizing"]);

function resolveBreakpoints(
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): BreakpointDefinition[] {
  return sortBreakpointsByEffectiveWidthDesc(
    breakpoints.length > 0 ? breakpoints : DEFAULT_BREAKPOINTS,
  );
}

function collectStyleDeclarations(
  styles: StyleMap = {},
  breakpointName: string,
): string[] {
  const declarations: string[] = [];

  for (const [property, value] of Object.entries(styles)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    if (SIZING_METADATA_PROPERTIES.has(property)) {
      continue;
    }

    const responsive = normalizeResponsiveStyleMap(value);
    const breakpointValue = responsive[breakpointName];
    if (!breakpointValue) {
      continue;
    }

    const cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
    const cssValue =
      cssProperty === "font-family"
        ? serializeFontFamilyValue(breakpointValue)
        : breakpointValue;
    declarations.push(`${cssProperty}: ${cssValue}`);
  }

  return declarations;
}

function hasRenderableStyles(styles: StyleMap = {}): boolean {
  return Object.values(styles).some((value) => {
    if (!value || typeof value !== "object") {
      return false;
    }

    const normalized = normalizeResponsiveStyleMap(value);
    return Object.values(normalized).some(
      (candidate) =>
        typeof candidate === "string" && candidate.trim().length > 0,
    );
  });
}

/**
 * Convert StyleMap to inline style string (uses base breakpoint)
 */
function stylesToInline(
  styles: StyleMap = {},
  _breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  return collectStyleDeclarations(styles, DESKTOP_BASE_BREAKPOINT).join("; ");
}

type ResponsiveStyleBucket = {
  query: string;
  rules: Set<string>;
};

function getResponsiveStyleSelector(nodeId: string, tag = "div"): string {
  return `${tag}.${getResponsiveStyleClass(nodeId)}`;
}

function collectNodeResponsiveCssRules(
  styles: StyleMap = {},
  nodeId: string,
  tag: string,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  buckets: Map<string, ResponsiveStyleBucket>,
): void {
  const resolvedBreakpoints = resolveBreakpoints(breakpoints);
  const selector = getResponsiveStyleSelector(nodeId, tag);

  for (const bp of getDesktopFirstOverrideBreakpoints(resolvedBreakpoints)) {
    const mediaQuery = createResponsiveMediaQuery(resolvedBreakpoints, bp.name);
    if (!mediaQuery) continue;

    const responsiveStyles = collectStyleDeclarations(styles, bp.name);

    if (responsiveStyles.length === 0) {
      continue;
    }

    const bucket = buckets.get(bp.name) ?? {
      query: mediaQuery,
      rules: new Set<string>(),
    };
    bucket.rules.add(`${selector} { ${responsiveStyles.join("; ")}; }`);
    buckets.set(bp.name, bucket);
  }
}

function collectNodeStylesheetRules(
  styles: StyleMap = {},
  nodeId: string,
  tag: string,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  baseRules: Set<string>,
  responsiveBuckets: Map<string, ResponsiveStyleBucket>,
): void {
  const resolvedBreakpoints = resolveBreakpoints(breakpoints);
  const selector = getResponsiveStyleSelector(nodeId, tag);
  const baseDeclarations = collectStyleDeclarations(
    styles,
    DESKTOP_BASE_BREAKPOINT,
  );

  if (baseDeclarations.length > 0) {
    baseRules.add(`${selector} { ${baseDeclarations.join("; ")}; }`);
  }

  collectNodeResponsiveCssRules(
    styles,
    nodeId,
    tag,
    resolvedBreakpoints,
    responsiveBuckets,
  );
}

function serializeResponsiveStyleBuckets(
  buckets: Map<string, ResponsiveStyleBucket>,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  const resolvedBreakpoints = resolveBreakpoints(breakpoints);
  const queryBuckets = new Map<string, Set<string>>();

  for (const bp of getDesktopFirstOverrideBreakpoints(resolvedBreakpoints)) {
    const bucket = buckets.get(bp.name);
    if (!bucket || bucket.rules.size === 0) {
      continue;
    }

    const rules = queryBuckets.get(bucket.query) ?? new Set<string>();
    for (const rule of bucket.rules) {
      rules.add(rule);
    }
    queryBuckets.set(bucket.query, rules);
  }

  return Array.from(queryBuckets.entries())
    .sort(([leftQuery], [rightQuery]) =>
      compareResponsiveMediaQueryOutputOrder(leftQuery, rightQuery),
    )
    .map(([query, rules]) => {
      const rulesText = Array.from(rules)
        .map((rule) => `  ${rule}`)
        .join("\n");

      return `@media ${query} {\n${rulesText}\n}`;
    })
    .join("\n");
}

function getResponsiveStyleClass(nodeId: string): string {
  const sanitizedId = nodeId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `aria-${sanitizedId}`;
}

function hasResponsiveStyleOverrides(
  styles: StyleMap = {},
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): boolean {
  for (const value of Object.values(styles)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const normalized = normalizeResponsiveStyleMap(value);
    if (normalized[DESKTOP_BASE_BREAKPOINT]) {
      return true;
    }
  }

  for (const bp of getDesktopFirstOverrideBreakpoints(
    resolveBreakpoints(breakpoints),
  )) {
    for (const value of Object.values(styles)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const normalized = normalizeResponsiveStyleMap(value);
      if (normalized[bp.name]) {
        return true;
      }
    }
  }

  return false;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get appropriate CSS framework tags based on site settings
 */
function getCSSFrameworkTags(
  siteSettings?: NodeToHtmlDocumentOptions["siteSettings"],
  globalCSSEnabled?: boolean,
  globalCSSHash?: string,
  globalCSSHref?: string,
  suppressFrameworkTags?: boolean,
): string {
  if (suppressFrameworkTags) {
    return "";
  }

  if (globalCSSEnabled) {
    const globalCssTag =
      typeof globalCSSHref === "string" && globalCSSHref.trim().length > 0
        ? `<link rel="stylesheet" href="${escapeHTML(globalCSSHref.trim())}">`
        : `<link rel="stylesheet" href="/styles/global.css${
            typeof globalCSSHash === "string" && globalCSSHash.trim().length > 0
              ? `?v=${encodeURIComponent(globalCSSHash.trim())}`
              : ""
          }">`;

    if (
      siteSettings?.framework === "custom" &&
      siteSettings.customFrameworkURL
    ) {
      return `${globalCssTag}\n<link rel="stylesheet" href="${escapeHTML(siteSettings.customFrameworkURL)}">`;
    }

    return globalCssTag;
  }

  if (siteSettings?.framework === "unocss") {
    return getUnoCSSTags(siteSettings);
  }

  // Custom framework with CDN URL
  if (siteSettings?.framework === "custom" && siteSettings.customFrameworkURL) {
    return `<link rel="stylesheet" href="${escapeHTML(siteSettings.customFrameworkURL)}">`;
  }

  return "";
}

function propsToAttributes(props: JsonObject): string {
  const attrs: string[] = [];

  // Props that should NOT be output as HTML attributes
  // These are used for rendering decisions or content, not as HTML attributes
  const excludedProps = new Set([
    "content", // Text content
    "text", // Text content
    "code", // Legacy code content prop
    "level", // Used to determine h1/h2/h3 tag in Heading blocks
    "label", // Used for button text content
    "language", // Used for code language hint
    "renderMode", // Used for code rendering mode
    "class", // Reserved for class composition pipeline
    "className", // Reserved for class composition pipeline
    "style", // Styles must pass through the validated style pipeline
    "srcdoc", // Embeds arbitrary HTML in an iframe
  ]);

  const urlProps = new Set([
    "action",
    "formaction",
    "href",
    "poster",
    "src",
    "xlink:href",
  ]);

  const isSafeUrlAttribute = (key: string, value: string): boolean => {
    const normalized = value.trim().replace(/[\u0000-\u0020]+/g, "");
    if (!normalized) return true;
    if (
      normalized.startsWith("#") ||
      normalized.startsWith("/") ||
      normalized.startsWith("./") ||
      normalized.startsWith("../") ||
      normalized.startsWith("?")
    ) {
      return true;
    }
    if (
      key === "src" &&
      /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(normalized)
    ) {
      return true;
    }
    try {
      return ["http:", "https:", "mailto:", "tel:"].includes(
        new URL(normalized, "https://aria.local").protocol,
      );
    } catch {
      return false;
    }
  };

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    const normalizedKey = key.toLowerCase();
    if (excludedProps.has(key) || excludedProps.has(normalizedKey)) continue;
    if (!/^[a-zA-Z][\w:.-]*$/.test(key) || normalizedKey.startsWith("on")) {
      continue;
    }
    if (
      urlProps.has(normalizedKey) &&
      !isSafeUrlAttribute(normalizedKey, String(value))
    ) {
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        attrs.push(key);
      }
      continue;
    }

    // Handle objects and arrays (serialize to JSON)
    if (typeof value === "object") {
      attrs.push(`${key}='${escapeHTML(JSON.stringify(value))}'`);
      continue;
    }

    attrs.push(`${key}="${escapeHTML(String(value))}"`);
  }

  return attrs.join(" ");
}

/**
 * Build a flat class attribute string from canonical node class fields.
 */
function getNodeClassName(
  node: BuilderNode,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  const collected = new Set<string>();

  const add = (value: unknown): void => {
    if (!value) return;
    if (typeof value === "string") {
      value
        .split(/\s+/)
        .filter(Boolean)
        .forEach((className) => collected.add(className));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => add(item));
    }
  };

  if (node.classNames) {
    add(classNamesToString(node.classNames, resolveBreakpoints(breakpoints)));
  }

  if (Array.isArray(node.customClasses)) {
    add(node.customClasses);
  }

  add(compileMotionClassString(node.motion));
  add(compileParallaxClassString(node.motion?.parallax));

  return Array.from(collected).join(" ");
}

function openTag(tag: string, attrs: string): string {
  return attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
}

function selfClosingTag(tag: string, attrs: string): string {
  return attrs ? `<${tag} ${attrs} />` : `<${tag} />`;
}

function renderResponsivePicture(input: {
  node: BuilderNode;
  imageAttrs: string;
  imageLinkWrapperAttrs: string;
  breakpoints: BreakpointDefinition[];
  indent: number;
}): string | null {
  const projection = projectManagedImage({
    node: input.node,
    breakpoints: input.breakpoints,
  });
  if (!projection) return null;

  const indentStr = "  ".repeat(input.indent);
  const childIndent = "  ".repeat(input.indent + 1);
  const sourceMarkup = projection.sources.map(({ media, srcSet, sizes }) =>
    selfClosingTag(
      "source",
      `media="${escapeHTML(media)}" srcset="${escapeHTML(srcSet)}" sizes="${escapeHTML(sizes)}"`,
    ),
  );
  const imageAttrs = [
    input.imageAttrs,
    !/(?:^|\s)width=/u.test(input.imageAttrs)
      ? `width="${projection.width}"`
      : "",
    projection.height && !/(?:^|\s)height=/u.test(input.imageAttrs)
      ? `height="${projection.height}"`
      : "",
    `srcset="${escapeHTML(projection.srcSet)}"`,
    `sizes="${escapeHTML(projection.sizes)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  const image = selfClosingTag("img", imageAttrs);
  if (sourceMarkup.length === 0) {
    return input.imageLinkWrapperAttrs
      ? `${indentStr}${openTag("a", input.imageLinkWrapperAttrs)}${image}</a>`
      : `${indentStr}${image}`;
  }
  const picture = [
    `${indentStr}<picture style="display: contents">`,
    ...sourceMarkup.map((source) => `${childIndent}${source}`),
    `${childIndent}${image}`,
    `${indentStr}</picture>`,
  ].join("\n");

  if (!input.imageLinkWrapperAttrs) return picture;
  return [
    `${indentStr}${openTag("a", input.imageLinkWrapperAttrs)}`,
    picture,
    `${indentStr}</a>`,
  ].join("\n");
}

function renderButtonIconMarkup(
  iconValue: unknown,
  iconSize?: string,
  iconColor?: string,
  iconResources?: IconRenderResources,
): string {
  const mediaUrl = getIconMediaUrl(iconValue);
  const iconClass = getIconClassFromValue(iconValue);
  const canonicalId = getCanonicalIconIdFromValue(iconValue);

  if (!mediaUrl && !iconClass && !canonicalId) {
    return "";
  }

  const iconStyle = buildButtonIconStyle({ iconSize, iconColor } as JsonObject);
  const iconHostClass = getButtonIconHostClassName({
    iconColor,
  } as JsonObject);
  const directIconStyle = iconStyle.replace(
    "display: inline-flex; align-items: center",
    "display: block",
  );
  const iconClassName = [canonicalId ? "" : iconClass, iconHostClass]
    .filter(Boolean)
    .join(" ");
  const iconClassAttr = iconClassName
    ? ` class="${escapeHTML(iconClassName)}"`
    : "";

  if (mediaUrl) {
    return `<img src="${escapeHTML(mediaUrl)}" alt="" aria-hidden="true"${iconClassAttr} style="${directIconStyle};object-fit:contain" />`;
  }

  if (canonicalId) {
    const svgAttrs = [
      iconClassAttr.trim(),
      `style="${directIconStyle}"`,
      `aria-hidden="true"`,
      `focusable="false"`,
    ]
      .filter(Boolean)
      .join(" ");
    const svg = renderIconFromResources(iconResources, canonicalId, svgAttrs);
    if (svg) {
      return svg;
    }
    return "";
  }

  return `<i aria-hidden="true"${iconClassAttr} style="${directIconStyle}"></i>`;
}

function renderButtonInnerHtml(
  props: JsonObject,
  iconResources?: IconRenderResources,
): string {
  const label =
    typeof props.content === "string"
      ? props.content
      : typeof props.text === "string"
        ? props.text
        : typeof props.label === "string"
          ? props.label
          : "";
  const escapedLabel = escapeHTML(label);
  const iconPosition = getButtonIconPosition(props.iconPosition);
  const iconMarkup = renderButtonIconMarkup(
    props.icon,
    props.iconSize as string | undefined,
    props.iconColor as string | undefined,
    iconResources,
  );

  if (!iconMarkup) {
    return escapedLabel;
  }

  const innerContent =
    iconPosition === "right"
      ? `${escapedLabel}${iconMarkup}`
      : `${iconMarkup}${escapedLabel}`;

  return `<span style="${escapeHTML(buildButtonContentRowStyle(props))}">${innerContent}</span>`;
}

function renderStructuredTextContent(value: unknown): string | null {
  return tryRenderStructuredTextContent(value);
}

const TEXT_LINK_PROP_NAMES = [
  "href",
  "target",
  "rel",
  "title",
  "download",
] as const;

function shouldStripOuterLinkWrapperProps(nodeType: string): boolean {
  return isTextLinkWrapperNodeType(nodeType) || nodeType === "image";
}

function stripTextLinkWrapperProps(
  nodeType: string,
  props: JsonObject,
): JsonObject {
  const nextProps = { ...props };

  if (!shouldStripOuterLinkWrapperProps(nodeType)) {
    return nextProps;
  }

  for (const propName of TEXT_LINK_PROP_NAMES) {
    delete nextProps[propName];
  }

  return nextProps;
}

function getTextLinkWrapperAttributes(
  nodeType: string,
  props: JsonObject,
): string {
  if (!isTextLinkWrapperNodeType(nodeType)) {
    return "";
  }

  return getLinkAnchorAttributes(props);
}

function getImageLinkWrapperAttributes(
  nodeType: string,
  props: JsonObject,
): string {
  if (nodeType !== "image") {
    return "";
  }

  return getLinkAnchorAttributes(props);
}

function getLinkAnchorAttributes(props: JsonObject): string {
  const href = typeof props.href === "string" ? props.href.trim() : "";
  if (!href) {
    return "";
  }

  const attrs = [`href="${escapeHTML(href)}"`];

  if (typeof props.target === "string" && props.target.trim().length > 0) {
    attrs.push(`target="${escapeHTML(props.target.trim())}"`);
  }

  if (typeof props.rel === "string" && props.rel.trim().length > 0) {
    attrs.push(`rel="${escapeHTML(props.rel.trim())}"`);
  }

  if (typeof props.title === "string" && props.title.trim().length > 0) {
    attrs.push(`title="${escapeHTML(props.title.trim())}"`);
  }

  if (props.__navCurrent === true) {
    attrs.push('aria-current="page"');
  }

  if (props.download === true) {
    attrs.push("download");
  }

  return attrs.join(" ");
}

function renderListItemChildren(
  node: BuilderNode,
  linkAttrs: string,
  indent: number,
  breakpoints: BreakpointDefinition[],
  iconResources?: IconRenderResources,
): string {
  const indentStr = "  ".repeat(indent);
  const childIndentStr = "  ".repeat(indent + 1);
  const linkedTextChildIndex = findListItemTextLinkChildIndex(node);
  const shouldWrapWholeRow =
    resolveListItemLinkScope(node) === "row" || linkedTextChildIndex === -1;

  if (shouldWrapWholeRow) {
    const linkedChildrenHtml = node.children
      .map((child) =>
        renderNode(
          stripTextLinkWrapperPropsFromNode(child),
          indent + 2,
          breakpoints,
          "inline",
          node,
          {},
          iconResources,
        ),
      )
      .join("\n");

    return `\n${childIndentStr}${openTag("a", linkAttrs)}\n${linkedChildrenHtml}\n${childIndentStr}</a>\n${indentStr}`;
  }

  const childLines = node.children
    .map((child, index) => {
      if (index !== linkedTextChildIndex) {
        return renderNode(
          child,
          indent + 1,
          breakpoints,
          "inline",
          node,
          {},
          iconResources,
        );
      }

      const linkedChildHtml = renderNode(
        stripTextLinkWrapperPropsFromNode(child),
        indent + 2,
        breakpoints,
        "inline",
        node,
        {},
        iconResources,
      );

      return `${childIndentStr}${openTag("a", linkAttrs)}\n${linkedChildHtml}\n${childIndentStr}</a>`;
    })
    .join("\n");

  return `\n${childLines}\n${indentStr}`;
}

function renderContainerLinkedChildren(
  node: BuilderNode,
  linkAttrs: string,
  indent: number,
  breakpoints: BreakpointDefinition[],
  styleMode: HtmlRenderStyleMode,
  iconResources?: IconRenderResources,
): string {
  const indentStr = "  ".repeat(indent);
  const childIndentStr = "  ".repeat(indent + 1);
  const childContext: RenderableNodeTagContext = {
    insideContainerLinkWrapper: true,
  };
  const linkedChildrenHtml = (node.children ?? [])
    .map((child) =>
      renderNode(
        stripLinkPropsForContainerWrapper(child),
        indent + 2,
        breakpoints,
        styleMode,
        node,
        childContext,
        iconResources,
      ),
    )
    .join("\n");

  if (!linkedChildrenHtml) {
    return `\n${childIndentStr}${openTag("a", linkAttrs)}</a>\n${indentStr}`;
  }

  return `\n${childIndentStr}${openTag("a", linkAttrs)}\n${linkedChildrenHtml}\n${childIndentStr}</a>\n${indentStr}`;
}

function renderNode(
  node: BuilderNode,
  indent: number = 0,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  styleMode: HtmlRenderStyleMode = "inline",
  parent: BuilderNode | null = null,
  renderContext: RenderableNodeTagContext = {},
  iconResources?: IconRenderResources,
): string {
  const indentStr = "  ".repeat(indent);

  if (node.type === "Fragment") {
    return node.children
      .map((child) =>
        renderNode(
          child,
          indent,
          breakpoints,
          styleMode,
          parent,
          renderContext,
          iconResources,
        ),
      )
      .join("\n");
  }

  const { props: renderProps, styles: rawStyles } =
    normalizeLegacyNodeCompatibility(node);
  const renderStyles = mergeSizingResolutionAcrossBreakpoints(
    rawStyles,
    parent,
    breakpoints,
  );
  const normalizedNodeType = normalizeContainerNodeType(
    node.type,
  ).toLowerCase();

  if (normalizedNodeType === "pagination") {
    const renderedHtml = node.props.__paginationHtml;
    return typeof renderedHtml === "string" && renderedHtml.length > 0
      ? `${indentStr}${renderedHtml}`
      : "";
  }

  const textLinkWrapperAttrs = renderContext.insideContainerLinkWrapper
    ? ""
    : getTextLinkWrapperAttributes(normalizedNodeType, renderProps);
  const imageLinkWrapperAttrs = renderContext.insideContainerLinkWrapper
    ? ""
    : getImageLinkWrapperAttributes(normalizedNodeType, renderProps);
  const listItemLinkAttrs =
    normalizedNodeType === "listitem" && resolveListItemLinkScope(node)
      ? getLinkAnchorAttributes(renderProps)
      : "";
  const attributeProps = stripConsumedRenderPropsForNode(
    node,
    stripTextLinkWrapperProps(normalizedNodeType, renderProps),
  );

  // Determine HTML tag based on block type
  const tag = getNativeTagForRenderableNodeInContext(
    node,
    renderProps,
    renderContext,
  );

  const attrs: string[] = [];

  // Include class attribute from canonical class fields and internal responsive scope when needed.
  const managedImage = projectManagedImage({ node, breakpoints });
  const classNames = [getNodeClassName(node, breakpoints)];
  if (managedImage) {
    classNames.push(managedImage.classToken.name);
  }
  const shouldIncludeStyleScopeClass =
    styleMode === "stylesheet"
      ? hasRenderableStyles(renderStyles)
      : hasResponsiveStyleOverrides(renderStyles, breakpoints);
  if (shouldIncludeStyleScopeClass) {
    classNames.push(getResponsiveStyleClass(node.id));
  }
  const className = classNames.filter(Boolean).join(" ");
  if (className) {
    attrs.push(`class="${escapeHTML(className)}"`);
  }

  if (styleMode === "inline") {
    const inlineStyle = stylesToInline(renderStyles, breakpoints);
    if (inlineStyle) {
      attrs.push(`style="${escapeHTML(inlineStyle)}"`);
    }
  }

  if (node.a11y) {
    if (node.a11y.role) attrs.push(`role="${escapeHTML(node.a11y.role)}"`);
    if (node.a11y.ariaLabel)
      attrs.push(`aria-label="${escapeHTML(node.a11y.ariaLabel)}"`);
    if (node.a11y.ariaDescribedBy)
      attrs.push(`aria-describedby="${escapeHTML(node.a11y.ariaDescribedBy)}"`);
    if (node.a11y.ariaLabelledBy)
      attrs.push(`aria-labelledby="${escapeHTML(node.a11y.ariaLabelledBy)}"`);
    if (node.a11y.ariaHidden !== undefined)
      attrs.push(`aria-hidden="${node.a11y.ariaHidden}"`);
    if (node.a11y.ariaExpanded !== undefined)
      attrs.push(`aria-expanded="${node.a11y.ariaExpanded}"`);
    if (node.a11y.ariaControls)
      attrs.push(`aria-controls="${escapeHTML(node.a11y.ariaControls)}"`);
    if (node.a11y.tabIndex !== undefined)
      attrs.push(`tabindex="${node.a11y.tabIndex}"`);
  }

  const buttonVariant = resolveRenderedButtonVariant(node, renderProps);
  if (buttonVariant) {
    attrs.push(
      `${BUTTON_VARIANT_DATA_ATTRIBUTE}="${escapeHTML(buttonVariant)}"`,
    );
  }

  const motionAttrs = compileMotionDataAttributes(node.motion);
  for (const [key, value] of Object.entries(motionAttrs)) {
    attrs.push(`${key}="${escapeHTML(value)}"`);
  }

  const parallaxAttrs = compileParallaxDataAttributes(node.motion?.parallax);
  for (const [key, value] of Object.entries(parallaxAttrs)) {
    attrs.push(`${key}="${escapeHTML(value)}"`);
  }

  if (normalizedNodeType === "navigation") {
    const navProps = parseNavigationProps(node.props);
    if (navProps.ariaLabel) {
      attrs.push(`aria-label="${escapeHTML(navProps.ariaLabel)}"`);
    }
    attrs.push(...buildNavigationDataAttributes(node));
  } else if (normalizedNodeType === "nav-items") {
    attrs.push(...buildNavItemsDataAttributes());
  } else if (normalizedNodeType === "nav-item") {
    attrs.push(...buildNavItemDataAttributes(node));
  } else if (normalizedNodeType === "nav-toggle") {
    attrs.push(...buildNavToggleDataAttributes(node));
  } else if (
    normalizedNodeType === "container" &&
    node.metadata?.ariaNavMegaSlot === true
  ) {
    attrs.push(...buildNavMegaSlotDataAttributes());
  }

  if (node.interactions) {
    if (node.interactions.onClick)
      attrs.push(`data-onclick="${escapeHTML(node.interactions.onClick)}"`);
    if (node.interactions.onHover)
      attrs.push(`data-onhover="${escapeHTML(node.interactions.onHover)}"`);
    if (node.interactions.onScroll)
      attrs.push(`data-onscroll="${escapeHTML(node.interactions.onScroll)}"`);
    if (node.interactions.animations)
      attrs.push(
        `data-animations='${escapeHTML(JSON.stringify(node.interactions.animations))}'`,
      );
  }

  if (node.variants?.default) {
    attrs.push(`data-variant="${escapeHTML(node.variants.default)}"`);
  }

  if (node.dataSource) {
    attrs.push(`data-source="${node.dataSource.type}"`);
    if (node.dataSource.collection)
      attrs.push(`data-collection="${escapeHTML(node.dataSource.collection)}"`);
  }

  // Add props as attributes (excluding rendering-only props)
  const propsStr = propsToAttributes(attributeProps);
  if (propsStr) {
    attrs.push(propsStr);
  }

  const attrsStr = attrs.join(" ");

  // Render content from props
  let content = "";
  const structuredContent = renderStructuredTextContent(renderProps.content);
  if (structuredContent !== null) {
    content = structuredContent;
  } else if (renderProps.content) {
    content = escapeHTML(String(renderProps.content));
  } else if (renderProps.text) {
    content = escapeHTML(String(renderProps.text));
  } else if (renderProps.label) {
    content = escapeHTML(String(renderProps.label));
  }

  // Handle blocks with text content
  if (
    normalizedNodeType === "button" &&
    (content ||
      getCanonicalIconIdFromValue(renderProps.icon) ||
      getIconClassFromValue(renderProps.icon))
  ) {
    return `${indentStr}${openTag(tag, attrsStr)}${renderButtonInnerHtml(renderProps, iconResources)}</${tag}>`;
  }

  if (
    ["text", "heading", "link", "paragraph", "span", "label"].includes(
      normalizedNodeType,
    ) &&
    content
  ) {
    const finalContent = textLinkWrapperAttrs
      ? `${openTag("a", textLinkWrapperAttrs)}${content}</a>`
      : content;
    return `${indentStr}${openTag(tag, attrsStr)}${finalContent}</${tag}>`;
  }

  if (normalizedNodeType === "listitem" && content) {
    const finalContent = listItemLinkAttrs
      ? `${openTag("a", listItemLinkAttrs)}${content}</a>`
      : content;

    return `${indentStr}${openTag(tag, attrsStr)}${finalContent}</${tag}>`;
  }

  if (node.type === "Code" || node.type === "code") {
    const rawCode = String(
      renderProps.content ?? renderProps.code ?? renderProps.text ?? "",
    );
    const renderMode = getCodeBlockRenderMode(renderProps.renderMode);
    if (renderMode === "render") {
      return `${indentStr}${openTag("div", attrsStr)}${buildRenderedCodeMarkup(rawCode)}</div>`;
    }
    const codeContent = escapeHTML(rawCode);
    const resolvedLanguage =
      typeof renderProps.language === "string" && renderProps.language.trim()
        ? renderProps.language.trim()
        : inferCodeLanguage(rawCode);
    const language = resolvedLanguage
      ? ` data-language="${escapeHTML(resolvedLanguage)}"`
      : "";
    return `${indentStr}${openTag("pre", attrsStr)}<code${language}>${codeContent}</code></pre>`;
  }

  if (node.type === "Svg" || node.type === "svg") {
    const svgInner =
      typeof renderProps.content === "string" ? renderProps.content : "";
    return `${indentStr}${openTag("svg", attrsStr)}${svgInner}</svg>`;
  }

  if (node.type === "Icon" || node.type === "icon") {
    const iconClass = getIconClassFromValue(renderProps.icon);
    const canonicalId = getCanonicalIconIdFromValue(renderProps.icon);
    const classAttr = attrs.find((attr) => attr.startsWith("class="));
    const mergedClass = [
      canonicalId ? "" : iconClass,
      classAttr ? classAttr.replace(/^class=\"|\"$/g, "") : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const attrsWithoutClass = attrs.filter(
      (attr) => !attr.startsWith("class="),
    );
    if (mergedClass) {
      attrsWithoutClass.unshift(`class="${escapeHTML(mergedClass)}"`);
    }

    const iconAttrs = attrsWithoutClass.join(" ");

    if (canonicalId) {
      const svg = renderIconFromResources(
        iconResources,
        canonicalId,
        iconAttrs,
      );
      if (svg) {
        return `${indentStr}${svg}`;
      }
      return "";
    }

    return `${indentStr}${openTag("i", iconAttrs)}</i>`;
  }

  if (
    normalizedNodeType === "list" &&
    (!node.children || node.children.length === 0) &&
    Array.isArray(renderProps.items) &&
    renderProps.items.length > 0
  ) {
    const listItemsHtml = renderProps.items
      .map(
        (item) =>
          `${indentStr}  <li>${escapeHTML(typeof item === "string" ? item : String(item ?? ""))}</li>`,
      )
      .join("\n");

    return `${indentStr}${openTag(tag, attrsStr)}\n${listItemsHtml}\n${indentStr}</${tag}>`;
  }

  const containerLinkAttrs = shouldWrapContainerChildrenInLink(node)
    ? getLinkAnchorAttributes(renderProps)
    : "";
  const childrenHTML = containerLinkAttrs
    ? renderContainerLinkedChildren(
        node,
        containerLinkAttrs,
        indent,
        breakpoints,
        styleMode,
        iconResources,
      )
    : node.children && node.children.length > 0
      ? normalizedNodeType === "listitem" && listItemLinkAttrs
        ? renderListItemChildren(
            node,
            listItemLinkAttrs,
            indent,
            breakpoints,
            iconResources,
          )
        : "\n" +
          node.children
            .map((child) =>
              renderNode(
                child,
                indent + 1,
                breakpoints,
                styleMode,
                node,
                renderContext,
                iconResources,
              ),
            )
            .join("\n") +
          "\n" +
          indentStr
      : "";

  const selfClosing = ["img", "br", "hr", "input", "meta", "link"];
  if (selfClosing.includes(tag)) {
    if (tag === "img") {
      const responsivePicture = renderResponsivePicture({
        node,
        imageAttrs: attrsStr,
        imageLinkWrapperAttrs,
        breakpoints,
        indent,
      });
      if (responsivePicture) return responsivePicture;
    }
    if (tag === "img" && imageLinkWrapperAttrs) {
      return `${indentStr}${openTag("a", imageLinkWrapperAttrs)}${selfClosingTag(tag, attrsStr)}</a>`;
    }

    return `${indentStr}${selfClosingTag(tag, attrsStr)}`;
  }

  return `${indentStr}${openTag(tag, attrsStr)}${childrenHTML}</${tag}>`;
}

/**
 * Collect all CSS rules from node tree
 */
function collectResponsiveStyleRules(
  nodes: BuilderNode[],
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  styles: Set<string>,
): void {
  const resolvedBreakpoints = resolveBreakpoints(breakpoints);
  const buckets = new Map<string, ResponsiveStyleBucket>();

  function traverse(node: BuilderNode, parent: BuilderNode | null) {
    const { props: renderProps, styles: rawStyles } =
      normalizeLegacyNodeCompatibility(node);
    const renderStyles = mergeSizingResolutionAcrossBreakpoints(
      rawStyles,
      parent,
      resolvedBreakpoints,
    );

    if (Object.keys(renderStyles).length > 0) {
      const tag = getNativeTagForRenderableNode(node, renderProps) ?? "div";
      collectNodeResponsiveCssRules(
        renderStyles,
        node.id,
        tag,
        resolvedBreakpoints,
        buckets,
      );
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => traverse(child, node));
    }
  }

  nodes.forEach((node) => traverse(node, null));

  const groupedCss = serializeResponsiveStyleBuckets(
    buckets,
    resolvedBreakpoints,
  );
  if (groupedCss) {
    styles.add(groupedCss);
  }
}

export function collectResponsiveStyles(
  nodes: BuilderNode[],
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  const styles = new Set<string>();

  collectResponsiveStyleRules(nodes, breakpoints, styles);

  return Array.from(styles).join("\n");
}

export function appendResponsiveStyles(
  nodes: BuilderNode[],
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  target: Set<string>,
): void {
  collectResponsiveStyleRules(nodes, breakpoints, target);
}

/**
 * Convert nodes to HTML fragment
 */
/**
 * Convert nodes to HTML fragment (just the body content)
 * Automatically expands component references if getComponentDSL is provided
 */
export function nodesToHtmlFragment(
  nodes: BuilderNode[],
  indent: number = 0,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  styleMode: HtmlRenderStyleMode = "inline",
  iconResources?: IconRenderResources,
): string {
  return nodes
    .map((node) =>
      renderNode(node, indent, breakpoints, styleMode, null, {}, iconResources),
    )
    .join("\n");
}

export interface HtmlFragmentStylesheetPreview {
  html: string;
  stylesheet: string;
}

export function collectNodeStylesheet(
  nodes: BuilderNode[],
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  const baseRules = new Set<string>();
  const responsiveBuckets = new Map<string, ResponsiveStyleBucket>();

  function traverse(node: BuilderNode, parent: BuilderNode | null): void {
    const { props: renderProps, styles: rawStyles } =
      normalizeLegacyNodeCompatibility(node);
    const resolvedStyles = mergeSizingResolutionAcrossBreakpoints(
      rawStyles,
      parent,
      breakpoints,
    );

    if (hasRenderableStyles(resolvedStyles)) {
      const tag = getNativeTagForRenderableNode(node, renderProps) ?? "div";
      collectNodeStylesheetRules(
        resolvedStyles,
        node.id,
        tag,
        breakpoints,
        baseRules,
        responsiveBuckets,
      );
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => traverse(child, node));
    }
  }

  nodes.forEach((node) => traverse(node, null));

  const stylesheetSections = [
    Array.from(baseRules).join("\n"),
    serializeResponsiveStyleBuckets(responsiveBuckets, breakpoints),
  ].filter((section) => section.length > 0);

  return stylesheetSections.join("\n\n");
}

export function nodesToHtmlFragmentWithStylesheet(
  nodes: BuilderNode[],
  indent: number = 0,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  iconResources?: IconRenderResources,
): HtmlFragmentStylesheetPreview {
  return {
    html: nodes
      .map((node) =>
        renderNode(
          node,
          indent,
          breakpoints,
          "stylesheet",
          null,
          {},
          iconResources,
        ),
      )
      .join("\n"),
    stylesheet: collectNodeStylesheet(nodes, breakpoints),
  };
}

/**
 * Convert nodes to HTML fragment with component expansion (async version)
 * Used when you need to expand component references before rendering
 */
export async function nodesToHtmlFragmentAsync(
  nodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  indent: number = 0,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  styleMode: HtmlRenderStyleMode = "inline",
  iconResources?: IconRenderResources,
  iconLocals?: RuntimeLocals,
): Promise<string> {
  const { expandComponentReferencesServer } = await import("./nodeUtils");
  const expandedNodes = await expandComponentReferencesServer(
    nodes,
    getComponentDSL,
  );
  const resolvedIcons =
    iconResources ??
    (await (
      await import("../icons/resolveIconResources")
    ).resolveIconRenderResources(expandedNodes, { locals: iconLocals }));
  return expandedNodes
    .map((node) =>
      renderNode(node, indent, breakpoints, styleMode, null, {}, resolvedIcons),
    )
    .join("\n");
}

export interface NodeToHtmlDocumentOptions {
  /** Pre-resolved records from the icon provider; renderers never fetch. */
  iconResources?: IconRenderResources;
  /** Runtime bindings used only by async wrappers to run the icon prepass. */
  iconLocals?: RuntimeLocals;
  /** Page title (falls back to SEO title) */
  title?: string;
  /** Page description (falls back to SEO description) */
  description?: string;
  /** Language code (default: 'en') */
  lang?: string;
  /** Writing direction for the document element. */
  dir?: "ltr" | "rtl";
  /** Layout slot definitions for merge fallback (`defaultContent`). */
  layoutSlots?: LayoutSlotDefinitionLike[];
  /** Responsive breakpoint definitions */
  breakpoints?: BreakpointDefinition[];

  seo?: {
    title?: string;
    description?: string;
    ogImage?: string;
    canonical?: string;
    noindex?: boolean;
    nofollow?: boolean;
  };

  head?: {
    links?: Array<{ rel: string; href: string; [key: string]: string }>;
    scripts?: Array<{
      src?: string;
      content?: string;
      [key: string]: string | undefined;
    }>;
    meta?: Array<{ name?: string; property?: string; content: string }>;
  };

  cssVariables?: Record<string, string>;

  headHTML?: string;

  /** Additional raw HTML injected immediately after opening <body> */
  bodyStartHTML?: string;

  /** Additional raw HTML injected immediately before closing </body> */
  bodyEndHTML?: string;

  bodyClass?: string;

  /** Use compiled global CSS from API endpoint instead of CDN (default: false) */
  globalCSSEnabled?: boolean;

  /** Hash for compiled global CSS used to version the stylesheet URL */
  globalCSSHash?: string;

  globalCSSHref?: string;

  /** Suppress framework tags when CSS is already fully inlined */
  suppressFrameworkTags?: boolean;

  /** Inline generated global/responsive document CSS instead of relying on the stylesheet */
  inlineGeneratedDocumentCss?: boolean;

  /** Serialized Global Styles CSS used by fallback document rendering. */
  inlineGlobalStylesCSS?: string;

  /**
   * Renderer-owned semantic CSS for this resolved surface. When omitted,
   * standalone fallback rendering derives it from `nodes`.
   */
  rendererBaseCss?: string;

  customFonts?: {
    fonts?: Record<string, CustomFontDefinition>;
    googleFonts?: Record<string, GoogleFontDefinition>;
  };

  /** Dark mode strategy (media | class | disabled) */
  darkMode?: "media" | "class" | "disabled";

  /** Site settings for user CSS framework configuration */
  siteSettings?: {
    framework?: "unocss" | "custom";
    unocssConfig?: {
      theme?: Record<string, unknown>;
      shortcuts?: Record<string, string>;
      safelist?: string[];
    };
    customFrameworkURL?: string;
  };

  /** Deprecated: canonical icons are rendered inline and no runtime is injected. */
  iconRuntimeNodes?: BuilderNode[];
}

/**
 * Convert nodes to complete HTML document with full SEO and metadata support
 */
export function nodesToHtmlDocument(
  nodes: BuilderNode[],
  options?: NodeToHtmlDocumentOptions,
): string {
  const {
    title = "",
    description = "",
    lang = "en",
    dir,
    breakpoints = DEFAULT_BREAKPOINTS,
    seo = {},
    head = {},
    cssVariables = {},
    headHTML = "",
    bodyStartHTML = "",
    bodyEndHTML = "",
    bodyClass = "",
    globalCSSEnabled = false,
    globalCSSHash = "",
    globalCSSHref = "",
    suppressFrameworkTags = false,
    inlineGeneratedDocumentCss = true,
    inlineGlobalStylesCSS = "",
    rendererBaseCss,
    customFonts,
    darkMode = "media",
    siteSettings,
  } = options || {};

  // Use SEO title/description if provided, otherwise fall back to page title/description
  const finalTitle = seo.title || title;
  const finalDescription = seo.description || description;

  let googleFontsLinks = "";
  if (customFonts?.googleFonts && inlineGeneratedDocumentCss) {
    const fontsArray = Object.values(customFonts.googleFonts);
    if (fontsArray.length > 0) {
      googleFontsLinks = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;
      for (const font of fontsArray) {
        googleFontsLinks += `\n  <link href="${buildGoogleFontsURL(font.family, font.variants)}" rel="stylesheet">`;
      }
    }
  }

  // Generate custom fonts CSS (@font-face rules)
  let customFontsCSS = "";
  if (customFonts?.fonts) {
    const fontsArray = Object.values(customFonts.fonts);
    for (const font of fontsArray) {
      const srcFormats = font.formats
        .map((format) => `url("${format.url}") format("${format.format}")`)
        .join(", ");
      customFontsCSS += `@font-face {\n  font-family: "${font.family}";\n  src: ${srcFormats};\n  font-weight: ${font.weight || "400"};\n  font-style: ${font.style || "normal"};\n  font-display: swap;\n}\n\n`;
    }
  }

  const renderStyleMode = resolvePublishedHtmlRenderStyleMode({
    globalCSSEnabled,
    inlineGeneratedDocumentCss,
  });

  // Collect all styles from nodes when embedding document CSS in-page.
  const nodeStyles = inlineGeneratedDocumentCss
    ? collectNodeStylesheet(nodes, breakpoints)
    : "";
  const resolvedRendererBaseCss = inlineGeneratedDocumentCss
    ? (rendererBaseCss ??
      assembleRendererBaseCss(collectRendererStyleRequirements(nodes)))
    : "";

  const cssVarsArray: string[] = [];
  for (const [key, value] of Object.entries(cssVariables)) {
    cssVarsArray.push(`  ${key}: ${value};`);
  }
  const cssVarsString =
    cssVarsArray.length > 0 ? `:root {\n${cssVarsArray.join("\n")}\n}` : "";

  const linkTags = (head.links || [])
    .map((link) => {
      const attrs = Object.entries(link)
        .map(([key, value]) => `${key}="${escapeHTML(String(value))}"`)
        .join(" ");
      return `  <link ${attrs}>`;
    })
    .join("\n");

  const metaTags = (head.meta || [])
    .map((meta) => {
      const attrs = Object.entries(meta)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}="${escapeHTML(String(value))}"`)
        .join(" ");
      return `  <meta ${attrs}>`;
    })
    .join("\n");

  const scriptTags = (head.scripts || [])
    .map((script) => {
      if (script.content) {
        const attrs = Object.entries(script)
          .filter(([key]) => key !== "content" && key !== "src")
          .map(([key, value]) => `${key}="${escapeHTML(String(value))}"`)
          .join(" ");
        return `  <script ${attrs}>\n${script.content}\n  </script>`;
      } else if (script.src) {
        const attrs = Object.entries(script)
          .filter(([key]) => key !== "content")
          .map(([key, value]) =>
            value ? `${key}="${escapeHTML(String(value))}"` : key,
          )
          .join(" ");
        return `  <script ${attrs}></script>`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const bodyContent = nodesToHtmlFragment(
    nodes,
    1,
    breakpoints,
    renderStyleMode,
    options?.iconResources,
  );

  const documentBaseStyles = inlineGeneratedDocumentCss
    ? inlineGlobalStylesCSS.trim()
    : "";
  const inlineCustomFontsCSS = inlineGeneratedDocumentCss ? customFontsCSS : "";

  const htmlClass = darkMode === "class" ? ` class="dark"` : "";
  const darkModeScript =
    darkMode === "class"
      ? `  <script>
    const isDark = localStorage.getItem('darkMode') === 'true' || (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  </script>\n`
      : "";

  const headSections = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    finalTitle ? `<title>${escapeHTML(finalTitle)}</title>` : "",
    finalDescription
      ? `<meta name="description" content="${escapeHTML(finalDescription)}">`
      : "",
    seo.ogImage
      ? `<meta property="og:image" content="${escapeHTML(seo.ogImage)}">`
      : "",
    seo.canonical
      ? `<link rel="canonical" href="${escapeHTML(seo.canonical)}">`
      : "",
    buildRobotsMetaTag(
      resolvePageRobotsMeta({
        seo: {
          noindex: seo.noindex,
          nofollow: seo.nofollow,
        },
      }),
    ),
    linkTags,
    metaTags,
    googleFontsLinks,
    headHTML,
    getCSSFrameworkTags(
      siteSettings,
      globalCSSEnabled,
      globalCSSHash,
      globalCSSHref,
      suppressFrameworkTags,
    ),
    resolvedRendererBaseCss ||
    documentBaseStyles ||
    cssVarsString ||
    nodeStyles ||
    inlineCustomFontsCSS
      ? `<style>
${resolvedRendererBaseCss}${documentBaseStyles ? "\n\n" + documentBaseStyles : ""}${inlineCustomFontsCSS ? "\n\n" + inlineCustomFontsCSS : ""}${cssVarsString ? "\n\n" + cssVarsString : ""}${nodeStyles ? "\n\n" + nodeStyles : ""}
  </style>`
      : "",
    scriptTags,
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n  ");

  return `<!DOCTYPE html>
<html lang="${escapeHTML(lang)}"${dir ? ` dir="${dir}"` : ""}${htmlClass}>
<head>
  ${headSections}
</head>
<body${bodyClass ? ` class="${escapeHTML(bodyClass)}"` : ""}>
${darkModeScript}${bodyStartHTML ? `${bodyStartHTML}\n` : ""}${bodyContent}${bodyEndHTML ? `\n${bodyEndHTML}` : ""}
</body>
</html>`;
}

/**
 * Convert nodes to a full HTML document with component expansion (async version)
 */
export async function nodesToHtmlDocumentAsync(
  nodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  options?: NodeToHtmlDocumentOptions,
): Promise<string> {
  const { expandComponentReferencesServer } = await import("./nodeUtils");
  const expandedNodes = await expandComponentReferencesServer(
    nodes,
    getComponentDSL,
  );
  const iconResources =
    options?.iconResources ??
    (await (
      await import("../icons/resolveIconResources")
    ).resolveIconRenderResources(expandedNodes, {
      locals: options?.iconLocals,
    }));
  return nodesToHtmlDocument(expandedNodes, { ...options, iconResources });
}

export function nodesToHtmlWithLayout(
  pageNodes: BuilderNode[],
  layoutNodes: BuilderNode[],
  options?: NodeToHtmlDocumentOptions,
): string {
  const mergedNodes = mergePageNodesIntoLayoutForRender(
    pageNodes,
    layoutNodes,
    options?.layoutSlots,
  );

  return nodesToHtmlDocument(mergedNodes, options);
}

/**
 * Convert nodes to HTML with layout and component expansion (async version)
 */
export async function nodesToHtmlWithLayoutAsync(
  pageNodes: BuilderNode[],
  layoutNodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  options?: NodeToHtmlDocumentOptions,
): Promise<string> {
  const { expandComponentReferencesServer } = await import("./nodeUtils");

  // Expand components in both page and layout nodes
  const expandedPageNodes = await expandComponentReferencesServer(
    pageNodes,
    getComponentDSL,
  );
  const expandedLayoutNodes = await expandComponentReferencesServer(
    layoutNodes,
    getComponentDSL,
  );
  const mergedNodes = mergePageNodesIntoLayoutForRender(
    expandedPageNodes,
    expandedLayoutNodes,
    options?.layoutSlots,
  );
  const iconResources =
    options?.iconResources ??
    (await (
      await import("../icons/resolveIconResources")
    ).resolveIconRenderResources(mergedNodes, { locals: options?.iconLocals }));
  return nodesToHtmlDocument(mergedNodes, { ...options, iconResources });
}

export function mergePageNodesIntoLayoutForRender(
  pageNodes: BuilderNode[],
  layoutNodes: BuilderNode[],
  layoutSlots?: LayoutSlotDefinitionLike[],
): BuilderNode[] {
  return layoutNodes.map((layoutNode) =>
    mergeNodesIntoSlots(layoutNode, pageNodes, layoutSlots),
  );
}

function mergeNodesIntoSlots(
  layoutNode: BuilderNode,
  pageNodes: BuilderNode[],
  layoutSlots?: LayoutSlotDefinitionLike[],
): BuilderNode {
  const layoutContext =
    layoutSlots && layoutSlots.length > 0 ? { slots: layoutSlots } : null;

  // If this is a slot placeholder, replace with page nodes
  if (layoutNode.type === "Slot" && layoutNode.props.name) {
    const slotName = String(layoutNode.props.name);

    const slotNodes = pageNodes.filter(
      (node) => resolveNodeSlotForLayout(node, layoutContext) === slotName,
    );

    const resolvedNodes =
      slotNodes.length > 0
        ? slotNodes
        : getSlotDefaultContent(layoutContext, slotName);

    if (resolvedNodes.length > 0) {
      return resolvedNodes.length === 1
        ? resolvedNodes[0]!
        : {
            id: `slot-${slotName}`,
            type: "Fragment",
            props: {},
            styles: {},
            children: [...resolvedNodes],
          };
    }

    return layoutNode.children && layoutNode.children.length > 0
      ? { ...layoutNode, children: layoutNode.children }
      : layoutNode;
  }

  if (layoutNode.children && layoutNode.children.length > 0) {
    return {
      ...layoutNode,
      children: layoutNode.children.map((child) =>
        mergeNodesIntoSlots(child, pageNodes, layoutSlots),
      ),
    };
  }

  return layoutNode;
}

/**
 * Extract text content from nodes (for search/preview)
 */
export function extractTextContent(nodes: BuilderNode[]): string {
  const texts: string[] = [];

  function traverse(node: BuilderNode) {
    // Extract text from common text props
    if (node.props.text || node.props.content || node.props.value) {
      const text = node.props.text || node.props.content || node.props.value;
      if (typeof text === "string") {
        texts.push(text);
      }
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);

  return texts.join(" ");
}
