/**
 * Converts hierarchical BuilderNode structures to. astro file format.
 */

import type {
  BuilderNode,
  ComponentDSL,
  ComponentPropSchemaDefinition,
  JsonObject,
  StyleMap,
  Responsive,
  BreakpointDefinition,
} from "../types/nodes";
import { DEFAULT_BREAKPOINTS } from "../types/nodes";
import { getBlockRegistry } from "./blockRegistry";
import { resolveNodeClasses } from "../blocks/resolveNodeClasses";
import {
  buildButtonContentRowStyle,
  buildButtonIconStyle,
  getButtonIconHostClassName,
  getButtonIconPosition,
} from "./buttonContent";
import { DESKTOP_BASE_BREAKPOINT } from "../styles/responsiveBreakpoints";
import {
  getCanonicalIconIdFromValue,
  getIconClassFromValue,
} from "../icons/reference";
import { getIconMediaUrl } from "../icons/mediaIcon";
import {
  renderIconFromResources,
  type IconRenderResources,
} from "../icons/iconRenderResources";
import type { RuntimeLocals } from "../cloudflare/env";
import { getLayoutDefaultSlotName } from "../layouts/resolveNodeSlot";
import {
  getNativeTagForRenderableNode,
  resolveRenderedButtonVariant,
  stripConsumedRenderPropsForNode,
} from "./renderSemantics";
import { BUTTON_VARIANT_ATTRIBUTE } from "./buttonVariants";
import {
  buildRenderedCodeMarkup,
  getCodeBlockRenderMode,
  inferCodeLanguage,
} from "../utils/codeLanguage";
import { projectManagedImage } from "../rendering/canonical/managedImage";
import { normalizeLegacyNodeCompatibility } from "../rendering/canonical/legacyNodeCompatibility";

/**
 * Convert StyleMap to inline style attribute
 */
function stylesToInline(
  styles: StyleMap = {},
  _breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  const styleArray: string[] = [];
  const baseBp = DESKTOP_BASE_BREAKPOINT;

  for (const [property, value] of Object.entries(styles)) {
    if (value && typeof value === "object") {
      const responsive = value as Responsive<string>;
      if (responsive[baseBp]) {
        const cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
        styleArray.push(`${cssProperty}: ${responsive[baseBp]}`);
      }
    }
  }

  return styleArray.join("; ");
}

/**
 * Escape special characters in strings for Astro
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderResponsiveAstroPicture(input: {
  node: BuilderNode;
  imageAttrs: string;
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
  const sources = projection.sources.map(
    ({ media, srcSet, sizes }) =>
      `${childIndent}<source media="${escapeString(media)}" srcset="${escapeString(srcSet)}" sizes="${escapeString(sizes)}" />`,
  );
  const intrinsicWidth = /(?:^|\s)width=/u.test(input.imageAttrs)
    ? ""
    : ` width={${projection.width}}`;
  const intrinsicHeight =
    projection.height && !/(?:^|\s)height=/u.test(input.imageAttrs)
      ? ` height={${projection.height}}`
      : "";
  const imageAttrs = `${input.imageAttrs}${intrinsicWidth}${intrinsicHeight} srcset="${escapeString(projection.srcSet)}" sizes="${escapeString(projection.sizes)}"`;
  if (sources.length === 0) {
    return `${indentStr}<img${imageAttrs} />`;
  }
  return [
    `${indentStr}<picture style="display: contents">`,
    ...sources,
    `${childIndent}<img${imageAttrs} />`,
    `${indentStr}</picture>`,
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
    ? ` class="${escapeString(iconClassName)}"`
    : "";

  if (mediaUrl) {
    return `<img src="${escapeString(mediaUrl)}" alt="" aria-hidden="true"${iconClassAttr} style="${escapeString(directIconStyle)};object-fit:contain" />`;
  }

  if (canonicalId) {
    const svgAttrs = [
      iconClassAttr.trim(),
      `style="${escapeString(directIconStyle)}"`,
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

  return `<i aria-hidden="true"${iconClassAttr} style="${escapeString(directIconStyle)}"></i>`;
}

function renderButtonInnerAstro(
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
  const escapedLabel = escapeHtmlText(label);
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

  return `<span style="${escapeString(buildButtonContentRowStyle(props))}">${innerContent}</span>`;
}

function shouldIncludeFrontmatterValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
}

type ComponentDSLResolver = (
  id: string,
) => Promise<ComponentDSL | null | undefined>;

type AstroComponentProp = Pick<ComponentPropSchemaDefinition, "name"> & {
  type: string;
  default?: unknown;
};

export interface NodesToAstroOptions {
  title?: string;
  description?: string;
  layoutImportPath?: string;
  layoutComponentName?: string;
  frontmatter?: JsonObject;
  breakpoints?: BreakpointDefinition[];
  iconResources?: IconRenderResources;
  iconLocals?: RuntimeLocals;
}

interface NodesToAstroComponentOptions {
  name?: string;
  description?: string;
  props?: AstroComponentProp[];
  breakpoints?: BreakpointDefinition[];
  iconResources?: IconRenderResources;
  iconLocals?: RuntimeLocals;
}

function propsToAstroAttributes(props: JsonObject): string {
  const attrs: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        attrs.push(key);
      }
      continue;
    }

    if (typeof value === "number") {
      attrs.push(`${key}={${value}}`);
      continue;
    }

    if (typeof value === "string") {
      attrs.push(`${key}="${escapeString(value)}"`);
      continue;
    }

    attrs.push(`${key}={${JSON.stringify(value)}}`);
  }

  return attrs.join(" ");
}

function getHydrationDirective(node: BuilderNode): string {
  if (!node.hydration || node.hydration.mode === "static") {
    return "";
  }

  switch (node.hydration.mode) {
    case "load":
      return "client:load";
    case "idle":
      return "client:idle";
    case "visible":
      return "client:visible";
    case "media":
      return node.hydration.media
        ? `client:media="${node.hydration.media}"`
        : "client:idle";
    case "only":
      return node.hydration.framework
        ? `client:only="${node.hydration.framework}"`
        : "client:only";
    default:
      return "";
  }
}

function collectImports(nodes: BuilderNode[]): Map<string, string> {
  const imports = new Map<string, string>();
  const registry = getBlockRegistry();

  function traverse(node: BuilderNode) {
    const blockDef = registry.blocks[node.type];
    if (blockDef && blockDef.componentPath) {
      imports.set(node.type, blockDef.componentPath);
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);

  return imports;
}

/**
 * Generate import statements
 */
function generateImports(imports: Map<string, string>): string {
  const lines: string[] = [];

  for (const [componentName, componentPath] of imports.entries()) {
    // Convert path to relative if needed
    const importPath = componentPath.startsWith("/")
      ? componentPath
      : `./${componentPath}`;

    lines.push(`import ${componentName} from '${importPath}';`);
  }

  return lines.join("\n");
}

/**
 * Render a single node as Astro syntax
 */
function renderNodeToAstro(
  node: BuilderNode,
  indent: number = 0,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  iconResources?: IconRenderResources,
): string {
  const indentStr = "  ".repeat(indent);
  const { props: renderProps, styles: renderStyles } =
    normalizeLegacyNodeCompatibility(node);
  const nativeTag = getNativeTagForRenderableNode(node, renderProps);
  const attributeProps = stripConsumedRenderPropsForNode(node, renderProps);
  const registry = getBlockRegistry();
  const blockDef = registry.blocks[node.type];

  if (nativeTag) {
    const attrs: string[] = [];
    const managedImage = projectManagedImage({ node, breakpoints });
    const className = [
      resolveNodeClasses(node),
      managedImage?.classToken.name ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    if (className) {
      attrs.push(`class="${escapeString(className)}"`);
    }

    const inlineStyle = stylesToInline(renderStyles, breakpoints);
    if (inlineStyle) {
      attrs.push(`style="${escapeString(inlineStyle)}"`);
    }

    if (node.a11y) {
      if (node.a11y.role) attrs.push(`role="${escapeString(node.a11y.role)}"`);
      if (node.a11y.ariaLabel)
        attrs.push(`aria-label="${escapeString(node.a11y.ariaLabel)}"`);
      if (node.a11y.ariaDescribedBy)
        attrs.push(
          `aria-describedby="${escapeString(node.a11y.ariaDescribedBy)}"`,
        );
      if (node.a11y.ariaLabelledBy)
        attrs.push(
          `aria-labelledby="${escapeString(node.a11y.ariaLabelledBy)}"`,
        );
      if (node.a11y.ariaHidden !== undefined)
        attrs.push(`aria-hidden={${node.a11y.ariaHidden}}`);
      if (node.a11y.ariaExpanded !== undefined)
        attrs.push(`aria-expanded={${node.a11y.ariaExpanded}}`);
      if (node.a11y.ariaControls)
        attrs.push(`aria-controls="${escapeString(node.a11y.ariaControls)}"`);
      if (node.a11y.tabIndex !== undefined)
        attrs.push(`tabIndex={${node.a11y.tabIndex}}`);
    }

    if (node.slot) {
      attrs.push(`slot="${escapeString(node.slot)}"`);
    }

    const buttonVariant = resolveRenderedButtonVariant(node, renderProps);
    if (buttonVariant) {
      attrs.push(
        `${BUTTON_VARIANT_ATTRIBUTE}="${escapeString(buttonVariant)}"`,
      );
    }

    const excludedProps = new Set([
      "text",
      "content",
      "code",
      "label",
      "level",
      "ordered",
      "icon",
      "language",
      "renderMode",
    ]);
    const propsStr = propsToAstroAttributes(
      Object.fromEntries(
        Object.entries(attributeProps).filter(
          ([key]) => !excludedProps.has(key),
        ),
      ),
    );
    if (propsStr) {
      attrs.push(propsStr);
    }

    const attrsStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
    const content =
      typeof renderProps.content === "string"
        ? renderProps.content
        : typeof renderProps.text === "string"
          ? renderProps.text
          : typeof renderProps.label === "string"
            ? renderProps.label
            : "";

    if (
      (node.type === "Button" || node.type === "button") &&
      (content ||
        getCanonicalIconIdFromValue(renderProps.icon) ||
        getIconClassFromValue(renderProps.icon))
    ) {
      return `${indentStr}<${nativeTag}${attrsStr}>${renderButtonInnerAstro(renderProps, iconResources)}</${nativeTag}>`;
    }

    if (node.type === "Code" || node.type === "code") {
      const rawCode = String(
        renderProps.content ?? renderProps.code ?? renderProps.text ?? "",
      );
      const renderMode = getCodeBlockRenderMode(renderProps.renderMode);
      if (renderMode === "render") {
        return `${indentStr}<div${attrsStr}>${buildRenderedCodeMarkup(rawCode)}</div>`;
      }
      const codeContent = escapeHtmlText(rawCode);
      const resolvedLanguage =
        typeof renderProps.language === "string" && renderProps.language.trim()
          ? renderProps.language.trim()
          : inferCodeLanguage(rawCode);
      const language = resolvedLanguage
        ? ` data-language="${escapeString(resolvedLanguage)}"`
        : "";
      return `${indentStr}<pre${attrsStr}><code${language}>${codeContent}</code></pre>`;
    }

    if (node.type === "Svg" || node.type === "svg") {
      const svgInner =
        typeof renderProps.content === "string" ? renderProps.content : "";
      return `${indentStr}<svg${attrsStr}>${svgInner}</svg>`;
    }

    if (node.type === "Icon" || node.type === "icon") {
      const iconClass = getIconClassFromValue(renderProps.icon);
      const canonicalId = getCanonicalIconIdFromValue(renderProps.icon);
      const mergedClass = [canonicalId ? "" : iconClass, className]
        .filter(Boolean)
        .join(" ")
        .trim();
      const iconAttrs = attrs
        .filter((attr) => !attr.startsWith("class="))
        .join(" ");
      const classAttr = mergedClass
        ? ` class="${escapeString(mergedClass)}"`
        : "";
      const restAttrs = iconAttrs ? ` ${iconAttrs}` : "";
      if (canonicalId) {
        const svg = renderIconFromResources(
          iconResources,
          canonicalId,
          [classAttr.trim(), iconAttrs].filter(Boolean).join(" "),
        );
        if (svg) {
          return `${indentStr}${svg}`;
        }
        return "";
      }

      return `${indentStr}<i${classAttr}${restAttrs}></i>`;
    }

    if (
      String(node.type ?? "").toLowerCase() === "list" &&
      (!node.children || node.children.length === 0) &&
      Array.isArray(renderProps.items) &&
      renderProps.items.length > 0
    ) {
      const listItemsStr = renderProps.items
        .map(
          (item) =>
            `${indentStr}  <li>${escapeHtmlText(typeof item === "string" ? item : String(item ?? ""))}</li>`,
        )
        .join("\n");

      return `${indentStr}<${nativeTag}${attrsStr}>\n${listItemsStr}\n${indentStr}</${nativeTag}>`;
    }

    const childrenStr = node.children
      .map((child) =>
        renderNodeToAstro(child, indent + 1, breakpoints, iconResources),
      )
      .join("\n");

    const bodyContent = [
      content ? `${indentStr}  ${escapeHtmlText(content)}` : "",
      childrenStr,
    ]
      .filter(Boolean)
      .join("\n");

    const selfClosing = ["img", "br", "hr", "input", "meta", "link"];
    if (selfClosing.includes(nativeTag)) {
      if (nativeTag === "img") {
        const responsivePicture = renderResponsiveAstroPicture({
          node,
          imageAttrs: attrsStr,
          breakpoints,
          indent,
        });
        if (responsivePicture) return responsivePicture;
      }
      return `${indentStr}<${nativeTag}${attrsStr} />`;
    }

    if (!bodyContent) {
      return `${indentStr}<${nativeTag}${attrsStr}></${nativeTag}>`;
    }

    return `${indentStr}<${nativeTag}${attrsStr}>\n${bodyContent}\n${indentStr}</${nativeTag}>`;
  }

  if (!blockDef) {
    if (node.type?.toLowerCase() === "icon") {
      const attrs: string[] = [];
      const iconClass =
        typeof node.props.icon === "string" ? node.props.icon.trim() : "";
      const nodeClasses = resolveNodeClasses(node);
      const className = [iconClass, nodeClasses]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (className) {
        attrs.push(`class=\"${escapeString(className)}\"`);
      }

      const propsStr = propsToAstroAttributes(
        Object.fromEntries(
          Object.entries(renderProps).filter(([key]) => key !== "icon"),
        ),
      );
      if (propsStr) {
        attrs.push(propsStr);
      }

      const inlineStyle = stylesToInline(renderStyles, breakpoints);
      if (inlineStyle) {
        attrs.push(`style=\"${escapeString(inlineStyle)}\"`);
      }

      const attrsStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
      return `${indentStr}<i${attrsStr}></i>`;
    }

    return `${indentStr}{/* Unknown block type: ${node.type} */}`;
  }

  const componentName = node.type;

  const attrs: string[] = [];

  attrs.push(`data-node-id="${node.id}"`);

  // Add classes from classNames/customClasses
  const nodeClasses = resolveNodeClasses(node);
  if (nodeClasses) {
    attrs.push(`class="${escapeString(nodeClasses)}"`);
  }

  const propsStr = propsToAstroAttributes(renderProps);
  if (propsStr) {
    attrs.push(propsStr);
  }

  const inlineStyle = stylesToInline(renderStyles, breakpoints);
  if (inlineStyle) {
    attrs.push(`style="${escapeString(inlineStyle)}"`);
  }

  if (node.a11y) {
    if (node.a11y.role) attrs.push(`role="${node.a11y.role}"`);
    if (node.a11y.ariaLabel) attrs.push(`aria-label="${node.a11y.ariaLabel}"`);
    if (node.a11y.ariaDescribedBy)
      attrs.push(`aria-describedby="${node.a11y.ariaDescribedBy}"`);
    if (node.a11y.ariaLabelledBy)
      attrs.push(`aria-labelledby="${node.a11y.ariaLabelledBy}"`);
    if (node.a11y.ariaHidden !== undefined)
      attrs.push(`aria-hidden={${node.a11y.ariaHidden}}`);
    if (node.a11y.ariaExpanded !== undefined)
      attrs.push(`aria-expanded={${node.a11y.ariaExpanded}}`);
    if (node.a11y.ariaControls)
      attrs.push(`aria-controls="${node.a11y.ariaControls}"`);
    if (node.a11y.tabIndex !== undefined)
      attrs.push(`tabIndex={${node.a11y.tabIndex}}`);
  }

  if (node.interactions) {
    if (node.interactions.onClick)
      attrs.push(`data-onclick="${node.interactions.onClick}"`);
    if (node.interactions.onHover)
      attrs.push(`data-onhover="${node.interactions.onHover}"`);
    if (node.interactions.onScroll)
      attrs.push(`data-onscroll="${node.interactions.onScroll}"`);
    if (node.interactions.animations)
      attrs.push(
        `data-animations={${JSON.stringify(JSON.stringify(node.interactions.animations))}}`,
      );
  }

  if (node.variants?.default) {
    attrs.push(`data-variant="${node.variants.default}"`);
  }

  if (node.dataSource) {
    attrs.push(`data-source="${node.dataSource.type}"`);
    if (node.dataSource.collection)
      attrs.push(`data-collection="${node.dataSource.collection}"`);
  }

  const hydration = getHydrationDirective(node);
  if (hydration) {
    attrs.push(hydration);
  }

  if (node.slot) {
    attrs.push(`slot="${node.slot}"`);
  }

  const attrsStr = attrs.length > 0 ? " " + attrs.join(" ") : "";

  if (node.children && node.children.length > 0) {
    const childrenStr = node.children
      .map((child) =>
        renderNodeToAstro(child, indent + 1, breakpoints, iconResources),
      )
      .join("\n");

    return `${indentStr}<${componentName}${attrsStr}>\n${childrenStr}\n${indentStr}</${componentName}>`;
  }

  // Self-closing if no children
  return `${indentStr}<${componentName}${attrsStr} />`;
}

export function nodesToAstro(
  nodes: BuilderNode[],
  options?: NodesToAstroOptions,
): string {
  const {
    title = "",
    description = "",
    layoutImportPath,
    layoutComponentName = "Layout",
    frontmatter = {},
    breakpoints = DEFAULT_BREAKPOINTS,
    iconResources,
  } = options || {};

  const imports = collectImports(nodes);
  const importLines = generateImports(imports).split("\n").filter(Boolean);

  if (layoutImportPath) {
    importLines.unshift(
      `import ${layoutComponentName} from '${layoutImportPath}';`,
    );
  }

  const frontmatterLines: string[] = [];

  if (title) {
    frontmatterLines.push(`title: '${escapeString(title)}'`);
  }

  if (description) {
    frontmatterLines.push(`description: '${escapeString(description)}'`);
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    if (!shouldIncludeFrontmatterValue(value)) {
      continue;
    }

    if (typeof value === "string") {
      frontmatterLines.push(`${key}: '${escapeString(value)}'`);
    } else {
      frontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  // Build the Astro file
  const parts: string[] = [];

  if (importLines.length > 0 || frontmatterLines.length > 0) {
    parts.push("---");
    if (importLines.length > 0) {
      parts.push(...importLines);
    }
    if (frontmatterLines.length > 0) {
      if (importLines.length > 0) parts.push("");
      frontmatterLines.forEach((line) => parts.push(line));
    }
    parts.push("---");
    parts.push("");
  }

  const renderedNodes = nodes
    .map((node) => renderNodeToAstro(node, 0, breakpoints, iconResources))
    .join("\n\n");

  if (layoutImportPath) {
    parts.push(`<${layoutComponentName}>`);
    if (renderedNodes) {
      parts.push(renderedNodes);
    }
    parts.push(`</${layoutComponentName}>`);
  } else {
    parts.push(renderedNodes);
  }

  return parts.join("\n");
}

/**
 * Convert nodes to Astro with component expansion (async version)
 */
export async function nodesToAstroAsync(
  nodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  options?: NodesToAstroOptions,
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
  return nodesToAstro(expandedNodes, { ...options, iconResources });
}

export function nodesToAstroWithLayout(
  nodes: BuilderNode[],
  layoutPath: string,
  options?: {
    title?: string;
    description?: string;
    breakpoints?: BreakpointDefinition[];
    iconResources?: IconRenderResources;
    iconLocals?: RuntimeLocals;
  },
): string {
  return nodesToAstro(nodes, {
    ...options,
    layoutImportPath: layoutPath,
  });
}

/**
 * Convert nodes to Astro with layout and component expansion (async version)
 */
export async function nodesToAstroWithLayoutAsync(
  nodes: BuilderNode[],
  layoutPath: string,
  getComponentDSL: ComponentDSLResolver,
  options?: NodesToAstroOptions,
): Promise<string> {
  return nodesToAstroAsync(nodes, getComponentDSL, {
    ...options,
    layoutImportPath: layoutPath,
  });
}

export type LayoutSlotAstroInput = {
  name: string;
  label?: string;
  isDefault?: boolean;
  defaultContent?: BuilderNode[];
};

function mergeImportsFromNodes(
  target: Map<string, string>,
  nodes: BuilderNode[],
): void {
  for (const [key, value] of collectImports(nodes)) {
    target.set(key, value);
  }
}

function renderDeclaredSlotFallback(
  slot: LayoutSlotAstroInput,
  defaultSlotName: string,
  breakpoints: BreakpointDefinition[],
  iconResources?: IconRenderResources,
): string {
  const defaultMarkup = (slot.defaultContent ?? [])
    .map((node) => renderNodeToAstro(node, 0, breakpoints, iconResources))
    .filter(Boolean)
    .join("\n\n");

  const isDefaultSlot =
    slot.name === defaultSlotName || slot.isDefault === true;

  if (isDefaultSlot && defaultSlotName === "default") {
    return defaultMarkup ? `<slot>\n${defaultMarkup}\n</slot>` : `<slot />`;
  }

  if (defaultMarkup) {
    return `<slot name="${slot.name}">\n${defaultMarkup}\n</slot>`;
  }

  return `<slot name="${slot.name}" />`;
}

export function nodesToAstroLayout(
  nodes: BuilderNode[],
  slots: LayoutSlotAstroInput[],
  options?: {
    title?: string;
    description?: string;
    breakpoints?: BreakpointDefinition[];
    iconResources?: IconRenderResources;
  },
): string {
  const {
    title = "",
    description = "",
    breakpoints = DEFAULT_BREAKPOINTS,
    iconResources,
  } = options || {};

  const imports = collectImports(nodes);
  for (const slot of slots) {
    if (slot.defaultContent?.length) {
      mergeImportsFromNodes(imports, slot.defaultContent);
    }
  }
  const importStatements = generateImports(imports);

  // Build the Astro layout file
  const parts: string[] = [];

  parts.push("---");
  if (importStatements) {
    parts.push(importStatements);
  }

  parts.push("");
  parts.push(`// Layout: ${title || "Unnamed Layout"}`);
  if (description) {
    parts.push(`// ${description}`);
  }
  parts.push("");
  parts.push("// Available slots:");
  slots.forEach((slot) => {
    parts.push(`// - ${slot.name}${slot.label ? ` (${slot.label})` : ""}`);
  });

  parts.push("---");
  parts.push("");

  const declaredSlots = slots.filter(
    (slot) => typeof slot.name === "string" && slot.name.trim().length > 0,
  );
  const hasExplicitSlotNode = (items: BuilderNode[]): boolean =>
    items.some(
      (node) =>
        (node.type === "Slot" && typeof node.props.name === "string") ||
        (Array.isArray(node.children) && hasExplicitSlotNode(node.children)),
    );

  // Render nodes (replace Slot components with <slot> tags)
  const renderedNodes = nodes
    .map((node) => {
      if (node.type === "Slot" && node.props.name) {
        const slotName = node.props.name;
        return `<slot name="${slotName}">\n  {/* Default content for ${slotName} slot */}\n</slot>`;
      }
      return renderNodeToAstro(node, 0, breakpoints, iconResources);
    })
    .join("\n\n");

  if (renderedNodes.trim().length > 0) {
    parts.push(renderedNodes);
  } else if (declaredSlots.length > 0 && !hasExplicitSlotNode(nodes)) {
    const defaultSlotName = getLayoutDefaultSlotName({ slots: declaredSlots });
    const fallbackSlots = declaredSlots
      .map((slot) =>
        renderDeclaredSlotFallback(
          slot,
          defaultSlotName,
          breakpoints,
          iconResources,
        ),
      )
      .join("\n\n");

    parts.push(fallbackSlots);
  }

  return parts.join("\n");
}

export function nodesToAstroComponent(
  nodes: BuilderNode[],
  options?: NodesToAstroComponentOptions,
): string {
  const {
    name = "Component",
    description = "",
    props = [],
    breakpoints = DEFAULT_BREAKPOINTS,
    iconResources,
  } = options || {};

  const imports = collectImports(nodes);
  const importStatements = generateImports(imports);

  // Build the Astro component file
  const parts: string[] = [];

  parts.push("---");
  parts.push(`// ${name}`);
  if (description) {
    parts.push(`// ${description}`);
  }
  parts.push("");

  if (importStatements) {
    parts.push(importStatements);
    parts.push("");
  }

  if (props.length > 0) {
    parts.push("interface Props {");
    props.forEach((prop) => {
      parts.push(
        `  ${prop.name}${prop.default === undefined ? "" : "?"}: ${prop.type};`,
      );
    });
    parts.push("}");
    parts.push("");
    parts.push(
      "const { " + props.map((p) => p.name).join(", ") + " } = Astro.props;",
    );
  }

  parts.push("---");
  parts.push("");

  const renderedNodes = nodes
    .map((node) => renderNodeToAstro(node, 0, breakpoints, iconResources))
    .join("\n\n");
  parts.push(renderedNodes);

  return parts.join("\n");
}

/**
 * Convert nodes to reusable Astro component with expansion (async version)
 */
export async function nodesToAstroComponentAsync(
  nodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  options?: NodesToAstroComponentOptions,
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
  return nodesToAstroComponent(expandedNodes, { ...options, iconResources });
}
