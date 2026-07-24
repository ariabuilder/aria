import type { BuilderNode } from "../types/nodes";
import {
  NavigationActiveMatchSchema,
  parseNavigationProps,
} from "../blocks/navigationSchema";
import { markNavigationMegaSlots } from "../nav/navRenderAttributes";

const NAV_ACTIVE_CLASS = "aria-nav-active";
const NAV_ANCESTOR_CLASS = "aria-nav-ancestor";

export function normalizeNavPathname(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0]?.trim() ?? "/";
  if (!path || path === "/") {
    return "/";
  }
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.length > 1 && withLeading.endsWith("/")
    ? withLeading.slice(0, -1)
    : withLeading;
}

export function hrefMatchesNavPathname(
  href: string,
  pathname: string,
  mode: "exact" | "prefix" | "none",
): boolean {
  if (mode === "none") {
    return false;
  }

  const normalizedHref = normalizeNavPathname(href);
  const normalizedPath = normalizeNavPathname(pathname);

  if (!normalizedHref || normalizedHref === "#") {
    return false;
  }

  if (mode === "exact") {
    return normalizedHref === normalizedPath;
  }

  if (normalizedHref === "/") {
    return normalizedPath === "/";
  }

  return (
    normalizedPath === normalizedHref ||
    normalizedPath.startsWith(`${normalizedHref}/`)
  );
}

function appendClassName(
  node: BuilderNode,
  className: string,
): void {
  const base = node.classNames?.base ?? [];
  if (base.includes(className)) {
    return;
  }
  node.classNames = {
    ...node.classNames,
    base: [...base, className],
  };
}

function findLinkChild(node: BuilderNode): BuilderNode | null {
  return (
    node.children.find((child) => child.type.toLowerCase() === "link") ?? null
  );
}

function findNestedNavItems(node: BuilderNode): BuilderNode | null {
  return (
    node.children.find((child) => child.type.toLowerCase() === "nav-items") ??
    null
  );
}

function walkNavItems(
  items: readonly BuilderNode[],
  pathname: string,
  mode: "exact" | "prefix" | "none",
): boolean {
  let subtreeHasActive = false;

  for (const item of items) {
    const link = findLinkChild(item);
    const href = typeof link?.props?.href === "string" ? link.props.href : "";
    const isActive = hrefMatchesNavPathname(href, pathname, mode);

    if (link && isActive) {
      link.props = {
        ...link.props,
        __navCurrent: true,
      };
      appendClassName(item, NAV_ACTIVE_CLASS);
      appendClassName(link, NAV_ACTIVE_CLASS);
      subtreeHasActive = true;
    }

    const nestedItems = findNestedNavItems(item);
    if (nestedItems?.children?.length) {
      const childActive = walkNavItems(nestedItems.children, pathname, mode);
      if (childActive) {
        appendClassName(item, NAV_ANCESTOR_CLASS);
        subtreeHasActive = true;
      }
    }
  }

  return subtreeHasActive;
}

function applyNavActiveToNavigation(
  node: BuilderNode,
  pathname: string,
): void {
  const props = parseNavigationProps(node.props);
  const mode = NavigationActiveMatchSchema.parse(props.activeMatch);
  if (mode === "none") {
    return;
  }

  const navItemsGroups = node.children.filter(
    (child) => child.type.toLowerCase() === "nav-items",
  );
  if (navItemsGroups.length === 0) {
    return;
  }

  for (const navItems of navItemsGroups) {
    if (navItems.children.length > 0) {
      walkNavItems(navItems.children, pathname, mode);
    }
  }
}

export function applyNavActiveStateOnNodes(
  nodes: readonly BuilderNode[],
  pathname: string,
): void {
  const normalizedPath = normalizeNavPathname(pathname);

  const walk = (list: readonly BuilderNode[]): void => {
    for (const node of list) {
      if (node.type.toLowerCase() === "navigation") {
        applyNavActiveToNavigation(node, normalizedPath);
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
}

export function prepareNavigationForRender(
  nodes: readonly BuilderNode[],
  pathname: string,
): void {
  markNavigationMegaSlots(nodes);
  applyNavActiveStateOnNodes(nodes, pathname);
}
