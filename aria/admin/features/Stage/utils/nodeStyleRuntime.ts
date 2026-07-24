import type { Responsive, StyleMap } from "../../../../lib/types/nodes";

const TYPOGRAPHY_STYLE_PROPERTIES = new Set([
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textDecoration",
  "textWrap",
  "color",
  "opacity",
]);

const IMAGE_CONTENT_STYLE_PROPERTIES = new Set([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "justifySelf",
  "objectFit",
  "objectPosition",
  "aspectRatio",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
]);

const VIDEO_CONTENT_STYLE_PROPERTIES = IMAGE_CONTENT_STYLE_PROPERTIES;

const ICON_CONTENT_STYLE_PROPERTIES = new Set([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "justifySelf",
  "fontSize",
  "color",
  "opacity",
]);

function getIconHost(container: HTMLElement): HTMLElement | null {
  return container.matches('[data-aria-icon-host="1"]')
    ? container
    : container.querySelector('[data-aria-icon-host="1"]');
}

const HEADING_EDITABLE_SELECTOR = "h1, h2, h3, h4, h5, h6, div, p, span";
const TEXT_EDITABLE_SELECTOR = "p, div, span, figcaption, address, figure";

function matchesEditableSelector(
  container: HTMLElement,
  selector: string,
): HTMLElement | null {
  return container.matches(selector)
    ? container
    : (container.querySelector(selector) as HTMLElement | null);
}

export function getInlineEditableElement(
  container: HTMLElement,
  nodeType: string,
): HTMLElement | null {
  const normalizedType = nodeType.toLowerCase();
  const tagName = container.tagName.toLowerCase();

  if (normalizedType === "icon") {
    return getIconHost(container);
  }

  if (normalizedType === "heading") {
    return /^h[1-6]$/.test(tagName) || /^(div|p|span)$/.test(tagName)
      ? container
      : matchesEditableSelector(container, HEADING_EDITABLE_SELECTOR);
  }

  if (
    normalizedType === "text" ||
    normalizedType === "paragraph" ||
    normalizedType === "span"
  ) {
    return /^(p|div|span|figcaption|address|figure)$/.test(tagName)
      ? container
      : matchesEditableSelector(container, TEXT_EDITABLE_SELECTOR);
  }

  if (normalizedType === "button") {
    return tagName === "button" ? container : container.querySelector("button");
  }

  if (normalizedType === "link") {
    return tagName === "a" ? container : container.querySelector("a");
  }

  return null;
}

export function getContentStyleTargetElement(
  container: HTMLElement,
  nodeType: string,
): HTMLElement | null {
  const normalizedType = nodeType.toLowerCase();

  if (normalizedType === "icon") {
    return getIconHost(container);
  }

  if (normalizedType === "image") {
    return container.tagName.toLowerCase() === "img"
      ? container
      : (container.querySelector("img") as HTMLElement | null);
  }

  if (normalizedType === "video") {
    return container.tagName.toLowerCase() === "video"
      ? container
      : (container.querySelector("video") as HTMLElement | null);
  }

  return null;
}

export function isTypographyStyleProperty(property: string): boolean {
  return TYPOGRAPHY_STYLE_PROPERTIES.has(property);
}

export function isContentStyleProperty(
  property: string,
  nodeType: string,
): boolean {
  const normalizedType = nodeType.toLowerCase();

  if (normalizedType === "icon") {
    return ICON_CONTENT_STYLE_PROPERTIES.has(property);
  }

  if (normalizedType === "image") {
    return IMAGE_CONTENT_STYLE_PROPERTIES.has(property);
  }

  if (normalizedType === "video") {
    return VIDEO_CONTENT_STYLE_PROPERTIES.has(property);
  }

  return false;
}

export function getTypographyStyleTargetSelector(
  nodeId: string,
  nodeType: string,
): string | null {
  const selectorBase = `[data-aria-id="${nodeId}"]`;
  const normalizedType = nodeType.toLowerCase();

  if (normalizedType === "icon") {
    return `${selectorBase} [data-aria-icon-host="1"]`;
  }

  if (normalizedType === "heading") {
    return `${selectorBase}, ${selectorBase} > h1, ${selectorBase} > h2, ${selectorBase} > h3, ${selectorBase} > h4, ${selectorBase} > h5, ${selectorBase} > h6, ${selectorBase} > div, ${selectorBase} > p, ${selectorBase} > span`;
  }

  if (
    normalizedType === "text" ||
    normalizedType === "paragraph" ||
    normalizedType === "span"
  ) {
    return `${selectorBase}, ${selectorBase} > p, ${selectorBase} > div, ${selectorBase} > span, ${selectorBase} > figcaption, ${selectorBase} > address, ${selectorBase} > figure`;
  }

  if (normalizedType === "button") {
    return `${selectorBase}, ${selectorBase} > button`;
  }

  if (normalizedType === "link") {
    return `${selectorBase}, ${selectorBase} > a`;
  }

  return null;
}

export function getContentStyleTargetSelector(
  nodeId: string,
  nodeType: string,
): string | null {
  const normalizedType = nodeType.toLowerCase();

  if (normalizedType === "image") {
    return `[data-aria-id="${nodeId}"], [data-aria-id="${nodeId}"] > img`;
  }

  if (normalizedType === "video") {
    return `[data-aria-id="${nodeId}"], [data-aria-id="${nodeId}"] > video`;
  }

  return null;
}

export function partitionNodeStyles(
  styles: StyleMap = {},
  nodeType: string,
): {
  containerStyles: StyleMap;
  typographyStyles: StyleMap;
  contentStyles: StyleMap;
} {
  if (!getTypographyStyleTargetSelector("__node__", nodeType)) {
    const containerStyles = { ...styles };
    const contentStyles: StyleMap = {};

    for (const [property, value] of Object.entries(styles)) {
      if (isContentStyleProperty(property, nodeType)) {
        contentStyles[property] = value as Responsive<string>;
      }
    }

    return {
      containerStyles,
      typographyStyles: {},
      contentStyles,
    };
  }

  const containerStyles: StyleMap = {};
  const typographyStyles: StyleMap = {};
  const contentStyles: StyleMap = {};

  for (const [property, value] of Object.entries(styles)) {
    if (isTypographyStyleProperty(property)) {
      typographyStyles[property] = value as Responsive<string>;
    } else {
      containerStyles[property] = value as Responsive<string>;

      if (isContentStyleProperty(property, nodeType)) {
        contentStyles[property] = value as Responsive<string>;
      }
    }
  }

  return { containerStyles, typographyStyles, contentStyles };
}
