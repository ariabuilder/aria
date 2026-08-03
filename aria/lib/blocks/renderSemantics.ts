import type { BuilderNode, JsonObject } from "../types/nodes";
import { getButtonVariantOrDefault } from "./buttonVariants";
import { getCodeBlockRenderMode } from "../utils/codeLanguage";
import {
  LIST_ITEM_LINK_PROP_NAMES,
  shouldStripContainerLinkWrapperProps,
  TEXT_LINK_PROP_NAMES,
} from "./listItemLinks";
import {
  isRenderableContainerNodeType,
  normalizeContainerNodeType,
} from "./containerTypes";

const BUTTON_RENDER_ONLY_PROP_NAMES = [
  "variant",
  "size",
  "icon",
  "iconPosition",
  "iconGap",
  "iconSpaceBetween",
  "iconSize",
  "iconColor",
] as const;

const ICON_RENDER_ONLY_PROP_NAMES = ["icon"] as const;

/** Paste/import HTML attrs that must not be stored or rendered on Image nodes. */
export const IMAGE_NON_MANAGED_HTML_ATTRS = [
  "srcset",
  "sizes",
  "type",
] as const;

const IMAGE_NON_MANAGED_HTML_ATTR_SET = new Set<string>(
  IMAGE_NON_MANAGED_HTML_ATTRS,
);

export function stripNonManagedImageProps(props: JsonObject): JsonObject {
  const nextProps = { ...props };

  for (const propName of IMAGE_NON_MANAGED_HTML_ATTRS) {
    delete nextProps[propName];
  }

  return nextProps;
}

export function isNonManagedImageHtmlAttr(name: string): boolean {
  return IMAGE_NON_MANAGED_HTML_ATTR_SET.has(name);
}

export const CONTAINER_TAG_OVERRIDES = [
  "div",
  "section",
  "article",
  "main",
  "aside",
  "nav",
  "header",
  "footer",
  "figure",
  "address",
] as const;

export const TEXT_TAG_OVERRIDES = [
  "div",
  "p",
  "span",
  "figcaption",
  "address",
  "figure",
] as const;

export const HEADING_TAG_OVERRIDES = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "div",
  "p",
  "span",
] as const;

export const LIST_TAG_OVERRIDES = ["ul", "ol", "dl"] as const;
export const LIST_ITEM_TAG_OVERRIDES = ["li", "dt", "dd"] as const;

const NATIVE_TYPE_TO_TAG: Record<string, string> = {
  Heading: "h1",
  heading: "h1",
  Text: "p",
  text: "p",
  Paragraph: "p",
  paragraph: "p",
  Button: "button",
  button: "button",
  Link: "a",
  link: "a",
  Image: "img",
  image: "img",
  Video: "video",
  video: "video",
  List: "ul",
  list: "ul",
  ListItem: "li",
  listitem: "li",
  Code: "pre",
  code: "pre",
  Svg: "svg",
  svg: "svg",
  Icon: "i",
  icon: "i",
  Pagination: "nav",
  pagination: "nav",
  Navigation: "nav",
  navigation: "nav",
  NavItems: "ul",
  "nav-items": "ul",
  NavItem: "li",
  "nav-item": "li",
  NavToggle: "button",
  "nav-toggle": "button",
  Container: "div",
  container: "div",
  Section: "section",
  section: "section",
  Header: "header",
  header: "header",
  Footer: "footer",
  footer: "footer",
  Nav: "nav",
  nav: "nav",
  Article: "article",
  article: "article",
  Aside: "aside",
  aside: "aside",
  Main: "main",
  main: "main",
  Span: "span",
  span: "span",
  Break: "br",
  break: "br",
};

const CONTAINER_TAG_OVERRIDE_SET = new Set<string>(CONTAINER_TAG_OVERRIDES);
const TEXT_TAG_OVERRIDE_SET = new Set<string>(TEXT_TAG_OVERRIDES);
const HEADING_TAG_OVERRIDE_SET = new Set<string>(HEADING_TAG_OVERRIDES);
const LIST_TAG_OVERRIDE_SET = new Set<string>(LIST_TAG_OVERRIDES);
const LIST_ITEM_TAG_OVERRIDE_SET = new Set<string>(LIST_ITEM_TAG_OVERRIDES);

export function stripConsumedRenderProps(props: JsonObject): JsonObject {
  const nextProps = { ...props };
  delete nextProps.element;
  return nextProps;
}

export function stripConsumedRenderPropsForNode(
  node: BuilderNode,
  props: JsonObject,
): JsonObject {
  const nextProps = stripConsumedRenderProps(props);

  const normalizedType = normalizeContainerNodeType(node.type).toLowerCase();

  if (normalizedType === "list") {
    delete nextProps.items;
    delete nextProps.ordered;
    return nextProps;
  }

  if (normalizedType === "link") {
    delete nextProps.__navCurrent;
    // Strip empty href so it doesn't render as href="" on the anchor tag.
    // The getLinkAnchorAttributes / textLinkWrapperAttrs path handles
    // non-empty href rendering separately for text/heading/paragraph.
    // For Link nodes with children (e.g. inline SVG + text), the href
    // ends up in attributeProps via propsToAttributes, so we must
    // explicitly remove empty values here.
    if (
      !nextProps.href ||
      (typeof nextProps.href === "string" && !nextProps.href.trim())
    ) {
      delete nextProps.href;
    }
    return nextProps;
  }

  if (normalizedType === "listitem") {
    for (const propName of LIST_ITEM_LINK_PROP_NAMES) {
      delete nextProps[propName];
    }

    return nextProps;
  }

  if (normalizedType === "icon") {
    for (const propName of ICON_RENDER_ONLY_PROP_NAMES) {
      delete nextProps[propName];
    }

    return nextProps;
  }

  if (normalizedType === "image") {
    return stripNonManagedImageProps(nextProps);
  }

  if (normalizedType === "navigation") {
    for (const key of [
      "sourceMode",
      "direction",
      "align",
      "submenuTrigger",
      "submenuOpenDelay",
      "submenuCloseDelay",
      "mobileEnabled",
      "mobileBreakpoint",
      "mobileMode",
      "mobileDrawerSide",
      "activeMatch",
      "builderKeepOpen",
      "loopMode",
      "fieldPath",
      "ariaLabel",
    ]) {
      delete nextProps[key];
    }
    return nextProps;
  }

  if (normalizedType === "nav-item") {
    delete nextProps.submenuType;
    delete nextProps.visibility;
    return nextProps;
  }

  if (normalizedType === "nav-toggle") {
    delete nextProps.variant;
    delete nextProps.ariaLabel;
    return nextProps;
  }

  if (shouldStripContainerLinkWrapperProps(node)) {
    for (const propName of TEXT_LINK_PROP_NAMES) {
      delete nextProps[propName];
    }

    return nextProps;
  }

  if (normalizedType !== "button") {
    return nextProps;
  }

  for (const propName of BUTTON_RENDER_ONLY_PROP_NAMES) {
    delete nextProps[propName];
  }

  return nextProps;
}

export function resolveRenderedButtonVariant(
  node: BuilderNode,
  props: JsonObject = node.props ?? {},
): string | null {
  if (normalizeContainerNodeType(node.type).toLowerCase() !== "button") {
    return null;
  }

  return getButtonVariantOrDefault(props.variant);
}

export function getNativeTagForRenderableNode(
  node: BuilderNode,
  props: JsonObject = node.props ?? {},
): string | null {
  const normalizedType = normalizeContainerNodeType(node.type);
  let tag = NATIVE_TYPE_TO_TAG[normalizedType] ?? null;
  if (!tag) {
    return null;
  }

  if (
    (normalizedType === "Button" || normalizedType === "button") &&
    typeof props.href === "string" &&
    props.href.trim().length > 0
  ) {
    tag = "a";
  }

  if (
    (normalizedType === "Heading" || normalizedType === "heading") &&
    props.level
  ) {
    tag = `h${props.level}`;
  }

  if (
    (normalizedType === "List" || normalizedType === "list") &&
    props.ordered
  ) {
    tag = "ol";
  }

  if (
    (normalizedType === "Code" || normalizedType === "code") &&
    getCodeBlockRenderMode(props.renderMode) === "render"
  ) {
    tag = "div";
  }

  const elementOverride = props.element;
  if (typeof elementOverride === "string") {
    if (
      ["List", "list"].includes(normalizedType) &&
      LIST_TAG_OVERRIDE_SET.has(elementOverride)
    ) {
      return elementOverride;
    }

    if (
      ["ListItem", "listitem"].includes(normalizedType) &&
      LIST_ITEM_TAG_OVERRIDE_SET.has(elementOverride)
    ) {
      return elementOverride;
    }

    if (
      isRenderableContainerNodeType(node.type) &&
      CONTAINER_TAG_OVERRIDE_SET.has(elementOverride)
    ) {
      return elementOverride;
    }

    if (
      ["Text", "text", "Paragraph", "paragraph", "Span", "span"].includes(
        normalizedType,
      ) &&
      TEXT_TAG_OVERRIDE_SET.has(elementOverride)
    ) {
      return elementOverride;
    }

    if (
      ["Heading", "heading"].includes(normalizedType) &&
      HEADING_TAG_OVERRIDE_SET.has(elementOverride)
    ) {
      return elementOverride;
    }
  }

  return tag;
}

export type RenderableNodeTagContext = {
  insideContainerLinkWrapper?: boolean;
};

export function getNativeTagForRenderableNodeInContext(
  node: BuilderNode,
  props: JsonObject = node.props ?? {},
  context: RenderableNodeTagContext = {},
): string {
  const tag = getNativeTagForRenderableNode(node, props) ?? "div";

  if (context.insideContainerLinkWrapper && tag === "a") {
    return "div";
  }

  return tag;
}
