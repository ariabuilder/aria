import {
  parseNavItemProps,
  parseNavigationProps,
} from "../blocks/navigationSchema";
import type { BuilderNode } from "../types/nodes";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function buildNavigationDataAttributes(node: BuilderNode): string[] {
  const props = parseNavigationProps(node.props);
  const attrs = [
    `data-aria-nav="root"`,
    `data-submenu-trigger="${escapeAttr(props.submenuTrigger)}"`,
    `data-submenu-open-delay="${props.submenuOpenDelay}"`,
    `data-submenu-close-delay="${props.submenuCloseDelay}"`,
    `data-mobile-enabled="${props.mobileEnabled ? "true" : "false"}"`,
    `data-mobile-breakpoint="${escapeAttr(props.mobileBreakpoint)}"`,
    `data-mobile-mode="${escapeAttr(props.mobileMode)}"`,
    `data-mobile-drawer-side="${escapeAttr(props.mobileDrawerSide)}"`,
    `data-nav-direction="${escapeAttr(props.direction)}"`,
    `data-nav-align="${escapeAttr(props.align)}"`,
  ];

  if (props.builderKeepOpen) {
    attrs.push(`data-builder-keep-open="true"`);
  }

  return attrs;
}

export function buildNavItemDataAttributes(node: BuilderNode): string[] {
  const props = parseNavItemProps(node.props);
  const attrs = [`data-aria-nav="item"`];

  if (props.submenuType !== "none") {
    attrs.push(`data-submenu-type="${escapeAttr(props.submenuType)}"`);
  }

  if (props.visibility !== "all") {
    attrs.push(`data-nav-visibility="${escapeAttr(props.visibility)}"`);
  }

  return attrs;
}

export function buildNavToggleDataAttributes(node: BuilderNode): string[] {
  const variant =
    typeof node.props?.variant === "string" ? node.props.variant : "open";
  const ariaLabel =
    typeof node.props?.ariaLabel === "string"
      ? node.props.ariaLabel
      : variant === "close"
        ? "Close menu"
        : "Open menu";

  return [
    `data-aria-nav="toggle"`,
    `data-nav-toggle-variant="${escapeAttr(variant)}"`,
    `aria-label="${escapeAttr(ariaLabel)}"`,
    `type="button"`,
  ];
}

export function buildNavItemsDataAttributes(): string[] {
  return [`data-aria-nav="items"`];
}

export function buildNavMegaSlotDataAttributes(): string[] {
  return [`data-aria-nav="mega"`];
}

export function markNavigationMegaSlots(nodes: readonly BuilderNode[]): void {
  const walk = (list: readonly BuilderNode[]): void => {
    for (const node of list) {
      const type = node.type.toLowerCase();
      if (type === "nav-item") {
        const props = parseNavItemProps(node.props);
        if (props.submenuType === "mega") {
          for (const child of node.children) {
            if (child.type.toLowerCase() === "container") {
              child.metadata = {
                ...child.metadata,
                ariaNavMegaSlot: true,
              };
            }
          }
        }
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
}
