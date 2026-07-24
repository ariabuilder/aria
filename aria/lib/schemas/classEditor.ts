/**
 * Type-safe schemas for the Class Editor system. Handles
 * breakpoint-aware utility classes and custom CSS classes.
 */

import { z } from "zod";
import type { BreakpointDefinition } from "../types/nodes";
import {
  compareBreakpointsLargestFirst,
  compareDesktopFirstBreakpointOrder,
} from "../styles/responsiveBreakpoints";
import {
  CustomPseudoInputSchema,
  CustomPseudoStateSchema,
  InspectorPseudoStateSchema,
  PSEUDO_PRESET_DEFINITIONS,
  PseudoPresetDefinitionSchema,
  PseudoPresetIdSchema,
  PseudoStateSchema,
  filterPseudoPresets,
  formatPseudoStateLabel,
  getPseudoPresetById,
  getPseudoSelectorSuffix,
  parseCustomPseudoInput,
  type CustomPseudoState,
  type InspectorPseudoState,
  type PseudoPresetDefinition,
  type PseudoPresetId,
  type PseudoState,
} from "../styles/pseudoSelectors";

export {
  CustomPseudoInputSchema,
  CustomPseudoStateSchema,
  InspectorPseudoStateSchema,
  PSEUDO_PRESET_DEFINITIONS,
  PseudoPresetDefinitionSchema,
  PseudoPresetIdSchema,
  PseudoStateSchema,
  filterPseudoPresets,
  formatPseudoStateLabel,
  getPseudoPresetById,
  getPseudoSelectorSuffix,
  parseCustomPseudoInput,
};

export type {
  CustomPseudoState,
  InspectorPseudoState,
  PseudoPresetDefinition,
  PseudoPresetId,
  PseudoState,
};

/**
 * Canonical authoring preference for the class editor.
 * - "utility": utility-first editing
 * - "semantic": semantic-class-first editing
 * - "hybrid": both surfaces are first-class
 */
export const AuthoringModeSchema = z.enum(["utility", "semantic", "hybrid"]);
export type AuthoringMode = z.infer<typeof AuthoringModeSchema>;

/**
 * CSS framework mode for the project.
 * - "unocss": Uses UnoCSS runtime with autocomplete
 * - "custom": Custom classes only, no utility framework
 */
export const FrameworkModeSchema = z.enum(["unocss", "custom"]);
export type FrameworkMode = z.infer<typeof FrameworkModeSchema>;

export function frameworkModeToAuthoringMode(
  mode: FrameworkMode,
): AuthoringMode {
  return mode === "custom" ? "semantic" : "utility";
}

export function authoringModeToFrameworkMode(
  mode: AuthoringMode,
): FrameworkMode {
  return mode === "semantic" ? "custom" : "unocss";
}

/**
 * Breakpoint identifier used by the class editor.
 * "base" is the desktop baseline with no media query wrapper,
 * while all other breakpoint ids are smaller-screen overrides.
 */
export const BreakpointSchema = z.string().trim().min(1);
export type Breakpoint = z.infer<typeof BreakpointSchema>;

/**
 * Breakpoint minimum widths in pixels.
 * Used for media query generation and viewport detection.
 */
export const BREAKPOINT_WIDTHS: Record<string, number> = {
  base: 1280,
  mobile: 0,
  xs: 475,
  sm: 640,
  tablet: 768,
  md: 768,
  laptop: 1024,
  lg: 1024,
  desktop: 1280,
  xl: 1280,
  "2xl": 1280,
} as const;

/**
 * Breakpoint configuration for UI display.
 */
export const BreakpointConfigSchema = z.object({
  name: z.string().trim().min(1),
  minWidth: z.number().min(0),
  label: z.string(),
});
export type BreakpointConfig = z.infer<typeof BreakpointConfigSchema>;

/**
 * Known breakpoint ids in desktop-first order.
 */
export const BREAKPOINT_ORDER: readonly Breakpoint[] = [
  "base",
  "desktop",
  "xl",
  "2xl",
  "laptop",
  "lg",
  "tablet",
  "md",
  "sm",
  "xs",
  "mobile",
] as const;

// NODE CLASS NAMES (For DSL Nodes)

/**
 * Breakpoint and pseudo-selector keyed object of utility class arrays.
 * This is the NEW format stored on each node.
 *
 * @example
 * {
 *   base: ["text-4xl", "font-bold", "text-white"],
 *   md: ["text-6xl"],
 *   hover: ["bg-blue-600"],
 *   "hover:md": ["bg-blue-700"],
 *   focus: ["ring-2", "ring-blue-300"],
 *   before: ["content-[\"\"]"],
 * }
 */
export const NodeClassNamesSchema = z.record(
  z.string(),
  z.array(z.string()).default([]),
);
export type NodeClassNames = z.infer<typeof NodeClassNamesSchema>;

// PSEUDO-SELECTOR TYPES & CATEGORIES

export const PSEUDO_SELECTORS = {
  INTERACTIVE: [
    "hover",
    "focus",
    "active",
    "focus-within",
    "focus-visible",
  ] as const,
  FORM: [
    "disabled",
    "enabled",
    "checked",
    "indeterminate",
    "required",
    "optional",
    "valid",
    "invalid",
    "read-only",
  ] as const,
  STRUCTURAL: [
    "first-child",
    "last-child",
    "only-child",
    "first-of-type",
    "last-of-type",
    "only-of-type",
    "even",
    "odd",
  ] as const,
  ELEMENTS: [
    "before",
    "after",
    "placeholder",
    "selection",
    "marker",
    "file",
  ] as const,
} as const;

export type PseudoSelector =
  | (typeof PSEUDO_SELECTORS.INTERACTIVE)[number]
  | (typeof PSEUDO_SELECTORS.FORM)[number]
  | (typeof PSEUDO_SELECTORS.STRUCTURAL)[number]
  | (typeof PSEUDO_SELECTORS.ELEMENTS)[number];

export type PseudoCategory = keyof typeof PSEUDO_SELECTORS;

export const PSEUDO_CATEGORY_INFO: Record<
  PseudoCategory,
  { label: string; description: string }
> = {
  INTERACTIVE: {
    label: "Interactive States",
    description: "User interaction feedback",
  },
  FORM: {
    label: "Form States",
    description: "Input and form element states",
  },
  STRUCTURAL: {
    label: "Structural",
    description: "Position-based styling",
  },
  ELEMENTS: {
    label: "Pseudo-Elements",
    description: "Generated content & decorations",
  },
};

export function isBreakpoint(key: string): key is Breakpoint {
  return key === "base" || (!key.includes(":") && !isPseudoSelector(key));
}

export function isPseudoSelector(key: string): key is PseudoSelector {
  return Object.values(PSEUDO_SELECTORS)
    .flat()
    .some((candidate) => candidate === key);
}

/**
 * Parse a combined key like "hover:md" into parts
 */
export function parseClassNameKey(key: string): {
  pseudo?: PseudoSelector;
  breakpoint?: Breakpoint;
} {
  const parts = key.split(":");

  if (parts.length === 1) {
    if (isBreakpoint(parts[0])) {
      return { breakpoint: parts[0] as Breakpoint };
    }
    if (isPseudoSelector(parts[0])) {
      return { pseudo: parts[0] as PseudoSelector };
    }
    return {};
  }

  // Check both orders: "hover:md" and "md:hover"
  const [first, second] = parts;

  if (isPseudoSelector(first) && isBreakpoint(second)) {
    return {
      pseudo: first as PseudoSelector,
      breakpoint: second as Breakpoint,
    };
  }

  if (isBreakpoint(first) && isPseudoSelector(second)) {
    return {
      breakpoint: first as Breakpoint,
      pseudo: second as PseudoSelector,
    };
  }

  return {};
}

/**
 * Build a classNames key from pseudo and breakpoint parts.
 *
 * @example
 * buildClassNameKey('hover', 'md') // 'hover:md'
 * buildClassNameKey('hover') // 'hover'
 * buildClassNameKey(undefined, 'md') // 'md'
 * buildClassNameKey() // 'base'
 */
export function buildClassNameKey(
  pseudo?: PseudoSelector,
  breakpoint?: Breakpoint,
): string {
  if (pseudo && breakpoint) {
    return `${pseudo}:${breakpoint}`;
  }
  if (pseudo) return pseudo;
  if (breakpoint) return breakpoint;
  return "base";
}

/**
 * Create an empty classNames object with base key initialized.
 */
export function createEmptyClassNames(): NodeClassNames {
  return {
    base: [],
  };
}

/**
 * Merge classNames for a specific breakpoint (desktop-first cascade).
 * Returns all classes that should be active at the given breakpoint.
 * Only considers breakpoint keys, not pseudo-selectors.
 *
 * @param classNames - The node's classNames object
 * @param breakpoint - The target breakpoint
 * @returns Array of class names active at that breakpoint (deduplicated)
 */
export function mergeClassNamesForBreakpoint(
  classNames: NodeClassNames,
  breakpoint: Breakpoint,
): string[] {
  const orderedBreakpoints = [
    "base",
    ...Object.keys(classNames)
      .filter((key) => isBreakpoint(key) && key !== "base")
      .sort((a, b) =>
        compareDesktopFirstBreakpointOrder(
          a,
          BREAKPOINT_WIDTHS[a] ?? 0,
          b,
          BREAKPOINT_WIDTHS[b] ?? 0,
        ),
      ),
  ];
  const idx = orderedBreakpoints.indexOf(breakpoint);
  const result: string[] = [];

  if (idx === -1) {
    return [
      ...new Set([
        ...(classNames.base ?? []),
        ...(classNames[breakpoint] ?? []),
      ]),
    ];
  }

  for (let i = 0; i <= idx; i++) {
    const key = orderedBreakpoints[i];
    if (classNames[key]) {
      result.push(...classNames[key]);
    }
  }

  return [...new Set(result)];
}

/**
 * Convert structured classNames to flat string with Tailwind-style prefixes.
 * Used for static HTML output.
 *
 * @example
 * { base: ["flex", "gap-4"], sm: ["gap-6"], hover: ["bg-blue-600"] }
 * → "flex gap-4 sm:gap-6 hover:bg-blue-600"
 */
function resolveDesktopFirstBreakpointNames(
  breakpoints?: readonly BreakpointDefinition[],
): string[] {
  if (breakpoints && breakpoints.length > 0) {
    return [...breakpoints]
      .sort((left, right) =>
        compareBreakpointsLargestFirst(
          {
            name: left.name,
            minWidth: left.minWidth,
            canvasWidth: left.canvasWidth,
            order: left.order,
          },
          {
            name: right.name,
            minWidth: right.minWidth,
            canvasWidth: right.canvasWidth,
            order: right.order,
          },
        ),
      )
      .map((breakpoint) => breakpoint.name);
  }

  return [...BREAKPOINT_ORDER];
}

function resolveDesktopFirstVariantPrefix(
  breakpoint: string,
  breakpoints?: readonly BreakpointDefinition[],
): string | null {
  if (breakpoint === "base") {
    return null;
  }

  const orderedBreakpoints = resolveDesktopFirstBreakpointNames(breakpoints);
  const currentIndex = orderedBreakpoints.indexOf(breakpoint);

  if (currentIndex <= 0) {
    return breakpoint;
  }

  return `lt-${orderedBreakpoints[currentIndex - 1]}`;
}

export function classNamesToString(
  classNames: NodeClassNames,
  breakpoints?: readonly BreakpointDefinition[],
): string {
  const parts: string[] = [...(classNames.base || [])];

  // Add all other keys (breakpoints, pseudo-selectors, combined)
  for (const [key, classes] of Object.entries(classNames)) {
    if (key === "base" || !classes || classes.length === 0) continue;

    const { breakpoint, pseudo } = parseClassNameKey(key);
    const prefixParts: string[] = [];

    if (pseudo) {
      prefixParts.push(pseudo);
    }

    if (breakpoint && breakpoint !== "base") {
      const responsivePrefix = resolveDesktopFirstVariantPrefix(
        breakpoint,
        breakpoints,
      );
      if (responsivePrefix) {
        prefixParts.push(responsivePrefix);
      }
    } else if (!pseudo && !breakpoint) {
      prefixParts.push(key);
    }

    for (const cls of classes) {
      parts.push(
        prefixParts.length > 0 ? `${prefixParts.join(":")}:${cls}` : cls,
      );
    }
  }

  return parts.join(" ");
}

/**
 * Parse a flat className string into structured format.
 * Used for migrating existing DSL files.
 *
 * @example
 * "flex gap-4 sm:gap-6 hover:bg-blue-600"
 * → { base: ["flex", "gap-4"], sm: ["gap-6"], hover: ["bg-blue-600"] }
 */
export function parseClassNameString(
  className: string,
  breakpoints?: readonly BreakpointDefinition[],
): NodeClassNames {
  const result = createEmptyClassNames();
  if (!className) return result;

  const orderedBreakpoints = resolveDesktopFirstBreakpointNames(breakpoints);
  const breakpointPrefixes = orderedBreakpoints
    .slice(1)
    .map((breakpoint) => ({
      breakpoint,
      prefix: `${resolveDesktopFirstVariantPrefix(breakpoint, breakpoints)}:`,
    }))
    .filter((entry): entry is { breakpoint: string; prefix: string } =>
      Boolean(entry.prefix),
    );
  const pseudoPrefixes = Object.values(PSEUDO_SELECTORS)
    .flat()
    .map((p) => `${p}:`);

  for (const cls of className.split(/\s+/).filter(Boolean)) {
    let assigned = false;

    // Check for breakpoint prefixes
    for (const { breakpoint, prefix } of breakpointPrefixes) {
      if (cls.startsWith(prefix)) {
        const bp = breakpoint as Breakpoint;
        if (!result[bp]) result[bp] = [];
        result[bp].push(cls.slice(prefix.length));
        assigned = true;
        break;
      }
    }

    if (assigned) continue;

    // Check for pseudo-selector prefixes
    for (const prefix of pseudoPrefixes) {
      if (cls.startsWith(prefix)) {
        const pseudo = prefix.slice(0, -1);
        if (!result[pseudo]) result[pseudo] = [];
        result[pseudo].push(cls.slice(prefix.length));
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      result.base.push(cls);
    }
  }

  return result;
}

// CSS RULE VALUE (For Custom Classes)

/**
 * A single CSS property-value pair. Values can be: - Direct: "16px", "#ff0000", "1.
 */
export const CSSRuleValueSchema = z.object({
  /** CSS property name (e.g., "padding", "background-color") */
  property: z.string().min(1),
  /** CSS value (e.g., "16px", "var(--primary)") */
  value: z.string(),
  important: z.boolean().default(false),
});
export type CSSRuleValue = z.infer<typeof CSSRuleValueSchema>;

// BREAKPOINT VARIANT (For Custom Classes)

/**
 * CSS rules for a specific breakpoint.
 * Base breakpoint (desktop-first) has no media query wrapper.
 */
export const BreakpointVariantSchema = z.object({
  breakpoint: BreakpointSchema,
  rules: z.array(CSSRuleValueSchema),
});
export type BreakpointVariant = z.infer<typeof BreakpointVariantSchema>;

// PSEUDO STATE (For Custom Classes)
// Re-exported from ../styles/pseudoSelectors (see imports at top of file)

/**
 * Pseudo-state variant with optional breakpoint scope.
 */
export const PseudoVariantSchema = z.object({
  state: PseudoStateSchema,
  /** Breakpoint scope (defaults to "base" = desktop baseline) */
  breakpoint: BreakpointSchema.default("base"),
  rules: z.array(CSSRuleValueSchema),
});
export type PseudoVariant = z.infer<typeof PseudoVariantSchema>;

/**
 * Compound selector variant (e.g. .reveal.active).
 */
export const CompoundVariantSchema = z.object({
  withClasses: z.array(z.string().min(1)).min(1),
  breakpoint: BreakpointSchema,
  pseudoState: PseudoStateSchema.optional(),
  rules: z.array(CSSRuleValueSchema),
});
export type CompoundVariant = z.infer<typeof CompoundVariantSchema>;

/**
 * Valid CSS class name pattern.
 * Must start with letter, underscore, or hyphen.
 * Can contain letters, numbers, underscores, hyphens.
 */
export const CSS_CLASS_NAME_REGEX = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;

/**
 * A user-defined CSS class with responsive + pseudo variants.
 *
 * @example
 * {
 *   id: "btn-primary",
 *   name: "btn-primary",
 *   description: "Primary button style",
 *   variants: [
 *     { breakpoint: "base", rules: [
 *       { property: "padding", value: "8px 16px" },
 *       { property: "background-color", value: "var(--color-primary)" }
 *     ]},
 *     { breakpoint: "md", rules: [
 *       { property: "padding", value: "12px 24px" }
 *     ]}
 *   ],
 *   pseudoVariants: [
 *     { state: "hover", rules: [
 *       { property: "background-color", value: "var(--color-primary-dark)" }
 *     ]}
 *   ],
 *   usageCount: 12,
 *   createdAt: "2026-01-21T10:00:00Z",
 *   updatedAt: "2026-01-21T12:30:00Z"
 * }
 */
export const CustomClassSchema = z.object({
  /** Unique identifier (same as name for simplicity) */
  id: z.string().min(1),

  /** CSS class name (valid CSS identifier) */
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),

  description: z.string().max(256).optional(),

  variants: z.array(BreakpointVariantSchema).default([]),

  /** Pseudo-state variants (hover, focus, etc.) */
  pseudoVariants: z.array(PseudoVariantSchema).default([]),

  /** Compound selector variants (e.g. .reveal.active) */
  compoundVariants: z.array(CompoundVariantSchema).default([]),

  advancedCss: z.string().max(4096).optional(),

  /** How many nodes reference this class */
  usageCount: z.int().min(0).default(0),

  createdAt: z.iso.datetime(),

  /** ISO timestamp when last modified */
  updatedAt: z.iso.datetime(),
});
export type CustomClass = z.infer<typeof CustomClassSchema>;

/**
 * Record of all custom classes, keyed by class name.
 */
export const CustomClassesMapSchema = z.record(z.string(), CustomClassSchema);
export type CustomClassesMap = z.infer<typeof CustomClassesMapSchema>;

/**
 * Input for getting all classes.
 */
export const GetClassesInputSchema = z.object({}).optional();

/**
 * Input for creating a new custom class.
 */
export const CreateClassInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
  description: z.string().max(256).optional(),
  initialRules: z.array(CSSRuleValueSchema).optional(),
});
export type CreateClassInput = z.infer<typeof CreateClassInputSchema>;

/**
 * Input for bulk importing custom classes.
 * Replaces all existing classes with the provided map.
 */
export const BulkImportClassesInputSchema = z.object({
  classes: CustomClassesMapSchema,
  mode: z.enum(["replace", "merge"]).default("replace"),
});
export type BulkImportClassesInput = z.infer<
  typeof BulkImportClassesInputSchema
>;

/**
 * Input for updating a custom class rule at a specific breakpoint.
 */
export const UpdateClassRuleInputSchema = z.object({
  className: z.string().min(1),
  breakpoint: BreakpointSchema,
  property: z.string().min(1),
  value: z.string(),
  important: z.boolean().default(false),
});
export type UpdateClassRuleInput = z.infer<typeof UpdateClassRuleInputSchema>;

/**
 * Input for removing a rule from a custom class.
 */
export const RemoveClassRuleInputSchema = z.object({
  className: z.string().min(1),
  breakpoint: BreakpointSchema,
  property: z.string().min(1),
});
export type RemoveClassRuleInput = z.infer<typeof RemoveClassRuleInputSchema>;

/**
 * Input for updating a pseudo-state rule.
 */
export const UpdateClassPseudoRuleInputSchema = z.object({
  className: z.string().min(1),
  state: PseudoStateSchema,
  breakpoint: BreakpointSchema.default("base"),
  property: z.string().min(1),
  value: z.string(),
  important: z.boolean().default(false),
});
export type UpdateClassPseudoRuleInput = z.infer<
  typeof UpdateClassPseudoRuleInputSchema
>;

/**
 * Input for removing a pseudo-state rule.
 */
export const RemoveClassPseudoRuleInputSchema = z.object({
  className: z.string().min(1),
  state: PseudoStateSchema,
  breakpoint: BreakpointSchema.default("base"),
  property: z.string().min(1),
});
export type RemoveClassPseudoRuleInput = z.infer<
  typeof RemoveClassPseudoRuleInputSchema
>;

/**
 * Input for deleting a custom class.
 */
export const DeleteClassInputSchema = z.object({
  name: z.string().min(1),
});
export type DeleteClassInput = z.infer<typeof DeleteClassInputSchema>;

/**
 * Input for renaming a custom class.
 */
export const RenameClassInputSchema = z.object({
  oldName: z.string().min(1),
  newName: z
    .string()
    .min(1)
    .max(64)
    .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
});
export type RenameClassInput = z.infer<typeof RenameClassInputSchema>;

/**
 * Input for duplicating a custom class.
 */
export const DuplicateClassInputSchema = z.object({
  sourceName: z.string().min(1),
  newName: z
    .string()
    .min(1)
    .max(64)
    .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
});
export type DuplicateClassInput = z.infer<typeof DuplicateClassInputSchema>;

/**
 * Input for replacing one custom class's style rules with another class's rules.
 */
export const ReplaceClassStylesInputSchema = z.object({
  targetName: z.string().min(1),
  sourceName: z.string().min(1).optional(),
  variants: z.array(BreakpointVariantSchema).optional(),
  pseudoVariants: z.array(PseudoVariantSchema).optional(),
}).refine(
  (value) =>
    Boolean(value.sourceName) ||
    (Array.isArray(value.variants) && Array.isArray(value.pseudoVariants)),
  "Provide sourceName or replacement style rules",
);
export type ReplaceClassStylesInput = z.infer<
  typeof ReplaceClassStylesInputSchema
>;

/**
 * Input for atomically replacing all rules in a single class variant slice.
 */
export const ReplaceClassVariantRulesInputSchema = z.object({
  className: z.string().min(1),
  breakpoint: BreakpointSchema,
  pseudoState: InspectorPseudoStateSchema.default("default"),
  rules: z.array(CSSRuleValueSchema),
});
export type ReplaceClassVariantRulesInput = z.infer<
  typeof ReplaceClassVariantRulesInputSchema
>;

/**
 * Input for setting the framework mode.
 */
export const SetFrameworkModeInputSchema = z.object({
  mode: FrameworkModeSchema,
});
export type SetFrameworkModeInput = z.infer<typeof SetFrameworkModeInputSchema>;

/**
 * Input for setting the canonical authoring mode.
 */
export const SetAuthoringModeInputSchema = z.object({
  mode: AuthoringModeSchema,
});
export type SetAuthoringModeInput = z.infer<typeof SetAuthoringModeInputSchema>;

/**
 * Input for incrementing/decrementing usage count.
 */
export const UpdateUsageInputSchema = z.object({
  className: z.string().min(1),
  delta: z.int(),
});
export type UpdateUsageInput = z.infer<typeof UpdateUsageInputSchema>;

/**
 * Standard success response with optional data.
 */
export const ActionSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema.optional(),
  });

/**
 * Standard error response.
 */
export const ActionErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

/**
 * Response for getAll action.
 */
export const GetAllClassesResponseSchema = z.object({
  success: z.literal(true),
  classes: CustomClassesMapSchema,
  authoringMode: AuthoringModeSchema,
  css: z.string(),
});
export type GetAllClassesResponse = z.infer<typeof GetAllClassesResponseSchema>;

/**
 * Response for create/update actions.
 */
export const ClassMutationResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    class: CustomClassSchema,
    css: z.string(),
  }),
  ActionErrorSchema,
]);
export type ClassMutationResponse = z.infer<typeof ClassMutationResponseSchema>;

/**
 * Response for delete action.
 */
export const DeleteClassResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    css: z.string(),
  }),
  ActionErrorSchema,
]);
export type DeleteClassResponse = z.infer<typeof DeleteClassResponseSchema>;

/**
 * Input for deleting multiple custom classes at once.
 */
export const DeleteClassesInputSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});
export type DeleteClassesInput = z.infer<typeof DeleteClassesInputSchema>;

/**
 * Response for batch delete action.
 */
export const DeleteClassesResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    css: z.string(),
    deleted: z.array(z.string()),
    notFound: z.array(z.string()),
  }),
  ActionErrorSchema,
]);
export type DeleteClassesResponse = z.infer<typeof DeleteClassesResponseSchema>;

/**
 * Response for getCSS action.
 */
export const GetCSSResponseSchema = z.object({
  success: z.literal(true),
  css: z.string(),
});
export type GetCSSResponse = z.infer<typeof GetCSSResponseSchema>;
