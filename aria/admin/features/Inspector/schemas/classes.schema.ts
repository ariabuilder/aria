/**
 * Classes Schema
 *
 * Zod validation for CSS class management.
 */

import { z } from "zod";

/**
 * Tailwind class categories
 */
export const TailwindClassCategorySchema = z.enum([
  "layout",
  "flexbox",
  "grid",
  "spacing",
  "sizing",
  "typography",
  "backgrounds",
  "borders",
  "effects",
  "filters",
  "transitions",
  "transforms",
  "interactivity",
  "custom",
]);

export const ClassesValueSchema = z.object({
  tailwind: z.array(z.string()).default([]),
  custom: z.array(z.string()).default([]),
  className: z.string().default(""),
  byCategory: z
    .record(TailwindClassCategorySchema, z.array(z.string()))
    .optional(),
});

export type ClassesValue = z.infer<typeof ClassesValueSchema>;
export type TailwindClassCategory = z.infer<typeof TailwindClassCategorySchema>;

export const DEFAULT_CLASSES: ClassesValue = {
  tailwind: [],
  custom: [],
  className: "",
};

export const CLASS_CATEGORY_LABELS: Record<TailwindClassCategory, string> = {
  layout: "Layout",
  flexbox: "Flexbox",
  grid: "Grid",
  spacing: "Spacing",
  sizing: "Sizing",
  typography: "Typography",
  backgrounds: "Backgrounds",
  borders: "Borders",
  effects: "Effects",
  filters: "Filters",
  transitions: "Transitions",
  transforms: "Transforms",
  interactivity: "Interactivity",
  custom: "Custom",
};

export const CATEGORY_PREFIXES: Record<TailwindClassCategory, string[]> = {
  layout: [
    "block",
    "inline",
    "flex",
    "grid",
    "hidden",
    "container",
    "columns",
    "break-",
    "box-",
    "float-",
    "clear-",
    "isolate",
    "object-",
    "overflow-",
    "overscroll-",
    "position",
    "static",
    "fixed",
    "absolute",
    "relative",
    "sticky",
    "inset-",
    "top-",
    "right-",
    "bottom-",
    "left-",
    "z-",
  ],
  flexbox: [
    "flex-",
    "basis-",
    "grow",
    "shrink",
    "order-",
    "justify-",
    "items-",
    "self-",
    "place-",
    "gap-",
  ],
  grid: ["grid-", "col-", "row-", "auto-cols-", "auto-rows-"],
  spacing: [
    "p-",
    "px-",
    "py-",
    "pt-",
    "pr-",
    "pb-",
    "pl-",
    "m-",
    "mx-",
    "my-",
    "mt-",
    "mr-",
    "mb-",
    "ml-",
    "space-",
  ],
  sizing: ["w-", "h-", "min-w-", "min-h-", "max-w-", "max-h-", "size-"],
  typography: [
    "font-",
    "text-",
    "antialiased",
    "italic",
    "not-italic",
    "tracking-",
    "leading-",
    "list-",
    "align-",
    "whitespace-",
    "break-",
    "hyphens-",
    "indent-",
    "underline",
    "overline",
    "line-through",
    "no-underline",
    "uppercase",
    "lowercase",
    "capitalize",
    "normal-case",
    "truncate",
  ],
  backgrounds: ["bg-", "from-", "via-", "to-", "gradient-"],
  borders: ["border", "rounded", "divide-", "outline-", "ring-"],
  effects: ["shadow", "opacity-", "mix-blend-", "bg-blend-"],
  filters: [
    "blur",
    "brightness-",
    "contrast-",
    "grayscale",
    "hue-rotate-",
    "invert",
    "saturate-",
    "sepia",
    "backdrop-",
  ],
  transitions: ["transition", "duration-", "ease-", "delay-", "animate-"],
  transforms: [
    "scale-",
    "rotate-",
    "translate-",
    "skew-",
    "origin-",
    "transform",
  ],
  interactivity: [
    "accent-",
    "appearance-",
    "cursor-",
    "caret-",
    "pointer-events-",
    "resize",
    "scroll-",
    "snap-",
    "touch-",
    "select-",
    "will-change-",
  ],
  custom: [],
};

export function parseClassName(className: string): ClassesValue {
  const classes = className.trim().split(/\s+/).filter(Boolean);
  const tailwind: string[] = [];
  const custom: string[] = [];

  for (const cls of classes) {
    if (isTailwindClass(cls)) {
      tailwind.push(cls);
    } else {
      custom.push(cls);
    }
  }

  return {
    tailwind,
    custom,
    className,
    byCategory: categorizeClasses(tailwind),
  };
}

/**
 * Combine arrays back to className string
 */
export function buildClassName(value: ClassesValue): string {
  return [...value.tailwind, ...value.custom].join(" ");
}

/**
 * Check if a class looks like a Tailwind utility
 */
export function isTailwindClass(cls: string): boolean {
  // Check for responsive prefix
  if (/^(sm|md|lg|xl|2xl):/.test(cls)) return true;

  // Check for state prefix
  if (/^(hover|focus|active|disabled|group-hover|dark):/.test(cls)) return true;

  for (const prefixes of Object.values(CATEGORY_PREFIXES)) {
    for (const prefix of prefixes) {
      if (cls === prefix.replace("-", "") || cls.startsWith(prefix))
        return true;
    }
  }

  return false;
}

export function categorizeClasses(
  classes: string[]
): Record<TailwindClassCategory, string[]> {
  const result: Record<TailwindClassCategory, string[]> = {
    layout: [],
    flexbox: [],
    grid: [],
    spacing: [],
    sizing: [],
    typography: [],
    backgrounds: [],
    borders: [],
    effects: [],
    filters: [],
    transitions: [],
    transforms: [],
    interactivity: [],
    custom: [],
  };

  for (const cls of classes) {
    // Strip responsive/state prefixes for categorization
    const baseClass = cls.replace(
      /^(sm|md|lg|xl|2xl|hover|focus|active|disabled|group-hover|dark):/,
      ""
    );
    let found = false;

    for (const [category, prefixes] of Object.entries(CATEGORY_PREFIXES)) {
      for (const prefix of prefixes) {
        if (
          baseClass === prefix.replace("-", "") ||
          baseClass.startsWith(prefix)
        ) {
          result[category as TailwindClassCategory].push(cls);
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      result.custom.push(cls);
    }
  }

  return result;
}

export function addClass(value: ClassesValue, cls: string): ClassesValue {
  if (value.tailwind.includes(cls) || value.custom.includes(cls)) {
    return value;
  }

  const newValue = { ...value };

  if (isTailwindClass(cls)) {
    newValue.tailwind = [...value.tailwind, cls];
  } else {
    newValue.custom = [...value.custom, cls];
  }

  newValue.className = buildClassName(newValue);
  newValue.byCategory = categorizeClasses(newValue.tailwind);

  return newValue;
}

export function removeClass(value: ClassesValue, cls: string): ClassesValue {
  const newValue = {
    tailwind: value.tailwind.filter((c) => c !== cls),
    custom: value.custom.filter((c) => c !== cls),
    className: "",
    byCategory: undefined as
      | Record<TailwindClassCategory, string[]>
      | undefined,
  };

  newValue.className = buildClassName(newValue);
  newValue.byCategory = categorizeClasses(newValue.tailwind);

  return newValue;
}

export function toggleClass(value: ClassesValue, cls: string): ClassesValue {
  const exists = value.tailwind.includes(cls) || value.custom.includes(cls);
  return exists ? removeClass(value, cls) : addClass(value, cls);
}
