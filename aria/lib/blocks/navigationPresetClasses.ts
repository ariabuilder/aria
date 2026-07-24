import type { CustomClass } from "../schemas/classEditor";
import type { BuilderNode } from "../types/nodes";

export const NAVIGATION_PRESET_CLASS_NAMES = {
  bar: "site-nav-bar",
  items: "site-nav-items",
  item: "site-nav-item",
  link: "site-nav-link",
  toggle: "site-nav-toggle",
  icon: "site-nav-icon",
} as const;

type CssRule = CustomClass["variants"][number]["rules"][number];
type PseudoVariant = CustomClass["pseudoVariants"][number];

function rule(property: string, value: string): CssRule {
  return { property, value, important: false };
}

function cssClass(input: {
  name: string;
  description: string;
  rules: CssRule[];
  pseudoVariants?: PseudoVariant[];
  timestamp: string;
}): CustomClass {
  return {
    id: input.name,
    name: input.name,
    description: input.description,
    variants: [{ breakpoint: "base", rules: input.rules }],
    pseudoVariants: input.pseudoVariants ?? [],
    compoundVariants: [],
    usageCount: 0,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

export function createNavigationPresetClasses(
  timestamp = new Date().toISOString(),
): Record<string, CustomClass> {
  const classes = {
    [NAVIGATION_PRESET_CLASS_NAMES.bar]: cssClass({
      name: NAVIGATION_PRESET_CLASS_NAMES.bar,
      description: "Drop-in site navigation bar shell.",
      timestamp,
      rules: [
        rule("width", "100%"),
        rule("min-height", "4rem"),
        rule("display", "flex"),
        rule("align-items", "center"),
        rule("justify-content", "space-between"),
        rule("gap", "1rem"),
        rule("padding", "0.75rem 1.5rem"),
        rule("background-color", "var(--background, #ffffff)"),
        rule("color", "var(--foreground, #111827)"),
        rule("border-bottom", "1px solid var(--border, rgb(17 24 39 / 0.12))"),
        rule("box-sizing", "border-box"),
      ],
    }),
    [NAVIGATION_PRESET_CLASS_NAMES.items]: cssClass({
      name: NAVIGATION_PRESET_CLASS_NAMES.items,
      description: "Horizontal navigation item list reset.",
      timestamp,
      rules: [
        rule("display", "flex"),
        rule("align-items", "center"),
        rule("justify-content", "flex-start"),
        rule("gap", "0.25rem"),
        rule("list-style", "none"),
        rule("margin", "0"),
        rule("padding", "0"),
      ],
    }),
    [NAVIGATION_PRESET_CLASS_NAMES.item]: cssClass({
      name: NAVIGATION_PRESET_CLASS_NAMES.item,
      description: "Navigation list item reset.",
      timestamp,
      rules: [
        rule("display", "flex"),
        rule("align-items", "center"),
        rule("list-style", "none"),
        rule("margin", "0"),
        rule("padding", "0"),
      ],
    }),
    [NAVIGATION_PRESET_CLASS_NAMES.link]: cssClass({
      name: NAVIGATION_PRESET_CLASS_NAMES.link,
      description: "Navigation link/button visual treatment.",
      timestamp,
      rules: [
        rule("display", "inline-flex"),
        rule("align-items", "center"),
        rule("justify-content", "center"),
        rule("min-height", "2.5rem"),
        rule("padding", "0.5rem 0.875rem"),
        rule("border-radius", "0.5rem"),
        rule("color", "var(--muted-foreground, #4b5563)"),
        rule("font-size", "0.9375rem"),
        rule("font-weight", "500"),
        rule("line-height", "1.25rem"),
        rule("text-decoration", "none"),
        rule("transition", "background-color 150ms ease, color 150ms ease"),
      ],
      pseudoVariants: [
        {
          state: "hover",
          breakpoint: "base",
          rules: [
            rule("background-color", "var(--accent, rgb(17 24 39 / 0.06))"),
            rule("color", "var(--foreground, #111827)"),
          ],
        },
        {
          state: "focus-visible",
          breakpoint: "base",
          rules: [
            rule("outline", "2px solid var(--ring, #2563eb)"),
            rule("outline-offset", "2px"),
          ],
        },
      ],
    }),
    [NAVIGATION_PRESET_CLASS_NAMES.toggle]: cssClass({
      name: NAVIGATION_PRESET_CLASS_NAMES.toggle,
      description: "Mobile navigation toggle button.",
      timestamp,
      rules: [
        rule("width", "2.5rem"),
        rule("height", "2.5rem"),
        rule("display", "inline-flex"),
        rule("align-items", "center"),
        rule("justify-content", "center"),
        rule("border", "1px solid var(--border, rgb(17 24 39 / 0.12))"),
        rule("border-radius", "0.5rem"),
        rule("background", "transparent"),
        rule("color", "inherit"),
        rule("cursor", "pointer"),
      ],
      pseudoVariants: [
        {
          state: "hover",
          breakpoint: "base",
          rules: [
            rule("background-color", "var(--accent, rgb(17 24 39 / 0.06))"),
          ],
        },
        {
          state: "focus-visible",
          breakpoint: "base",
          rules: [
            rule("outline", "2px solid var(--ring, #2563eb)"),
            rule("outline-offset", "2px"),
          ],
        },
      ],
    }),
    [NAVIGATION_PRESET_CLASS_NAMES.icon]: cssClass({
      name: NAVIGATION_PRESET_CLASS_NAMES.icon,
      description: "Navigation icon sizing.",
      timestamp,
      rules: [
        rule("width", "1.25rem"),
        rule("height", "1.25rem"),
        rule("display", "inline-block"),
        rule("flex-shrink", "0"),
      ],
    }),
  };

  return classes;
}

export function nodeTreeContainsNavigation(node: BuilderNode): boolean {
  if (node.type.toLowerCase() === "navigation") {
    return true;
  }

  return node.children.some((child) => nodeTreeContainsNavigation(child));
}

export function nodeListContainsNavigation(
  nodes: readonly BuilderNode[],
): boolean {
  return nodes.some((node) => nodeTreeContainsNavigation(node));
}
