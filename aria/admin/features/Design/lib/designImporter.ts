import { z } from "zod";

import {
  DesignSystemColorsSchema,
  type DesignSystemColors,
} from "../../../../lib/design/types";
import {
  GlobalStylesConfigSchema,
  type GlobalStylesConfig,
  type GlobalStyleVariables,
} from "../../../../lib/styles/universalDesignSystem";
import {
  CSSRuleValueSchema,
  CustomClassesMapSchema,
  CustomClassSchema,
  type CustomClassesMap,
} from "../../../../lib/schemas/classEditor";
import { TypographyConfigSchema } from "../composables/typographyActionResults";
import type { TypographyConfigRecord } from "../composables/typographyActionResults";
import {
  parseVariableImportInput,
  parseVariableImportJson,
  type VariableImportMode,
} from "./variableManagerImport";
import {
  parseClassCssImportInput,
  type ClassCssImportKeyframes,
} from "./classManagerImport";
import {
  ContextRuleSchema,
  type ContextRule,
} from "../../../../lib/styles/universalDesignSystem";
import { CompoundVariantSchema } from "../../../../lib/schemas/classEditor";
import { validateAdvancedCss } from "../../../../lib/styles/cssValidation";

export type DesignImportFormat =
  | "full-design-system"
  | "colors"
  | "variables"
  | "classes"
  | "css-variables"
  | "css-classes"
  | "css-mixed"
  | "unknown";

export type DesignImportSectionId =
  | "colors"
  | "variables"
  | "globalStyles"
  | "typography"
  | "classes"
  | "contextRules"
  | "animations";

export type DesignImportMode = "merge" | "replace";

export interface DesignImportWarning {
  section?: DesignImportSectionId;
  message: string;
}

export interface DesignImportError {
  section?: DesignImportSectionId;
  message: string;
  details?: unknown;
}

export interface DesignImportCollision {
  section: DesignImportSectionId;
  key: string;
  action: "overwrite" | "rename" | "missing-reference" | "ignored";
  message: string;
}

interface SectionBase<TSection extends DesignImportSectionId, TData> {
  id: TSection;
  label: string;
  count: number;
  defaultMode: DesignImportMode;
  data: TData;
  warnings: DesignImportWarning[];
  collisions: DesignImportCollision[];
}

export type DesignImportColorsSection = SectionBase<
  "colors",
  DesignSystemColors
>;
export type DesignImportVariablesSection = SectionBase<
  "variables",
  GlobalStyleVariables
> & {
  summary: {
    customCount: number;
    aliasCount: number;
  };
};
export type DesignImportGlobalStylesSection = SectionBase<
  "globalStyles",
  GlobalStylesConfig
>;
export type DesignImportTypographySection = SectionBase<
  "typography",
  TypographyConfigRecord
>;
export type DesignImportClassesSection = SectionBase<
  "classes",
  DesignImporterClassesMap
>;
export type DesignImportContextRulesSection = SectionBase<
  "contextRules",
  ContextRule[]
>;
export type DesignImportAnimationsSection = SectionBase<
  "animations",
  { keyframes: ClassCssImportKeyframes }
>;

export type DesignImportSection =
  | DesignImportColorsSection
  | DesignImportVariablesSection
  | DesignImportGlobalStylesSection
  | DesignImportTypographySection
  | DesignImportClassesSection
  | DesignImportContextRulesSection
  | DesignImportAnimationsSection;

export interface DesignImportPlan {
  success: true;
  format: DesignImportFormat;
  name: string | null;
  exportedAt: string | null;
  sections: DesignImportSection[];
  warnings: DesignImportWarning[];
  collisions: DesignImportCollision[];
}

export interface DesignImportFailure {
  success: false;
  format: DesignImportFormat;
  errors: DesignImportError[];
  warnings: DesignImportWarning[];
}

export type DesignImportParseResult = DesignImportPlan | DesignImportFailure;

export interface DesignImportCollisionContext {
  classNames?: readonly string[];
  contextRuleSelectors?: readonly string[];
  keyframeNames?: readonly string[];
  variableKeys?: readonly string[];
}

export interface DesignImportParseOptions {
  collisionContext?: DesignImportCollisionContext;
}

function addPrefixedImportIssue(
  ctx: z.RefinementCtx,
  field: "variants" | "pseudoVariants" | "compoundVariants",
  issue: { message?: string; path?: readonly PropertyKey[] },
): void {
  ctx.addIssue({
    code: "custom",
    message: issue.message ?? "Invalid class import value",
    path: [field, ...(issue.path ?? [])],
  });
}

const ImporterClassSchema = CustomClassSchema.extend({
  variants: z.array(z.any()).default([]),
  pseudoVariants: z.array(z.any()).default([]),
  usageCount: z.int().min(0).optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
}).superRefine((cls, ctx) => {
  const variants = z.array(
    z.object({
      breakpoint: z.string().trim().min(1),
      rules: z.array(CSSRuleValueSchema).default([]),
    }),
  );
  const pseudoVariants = CustomClassSchema.shape.pseudoVariants;

  const parsedVariants = variants.safeParse(cls.variants);
  if (!parsedVariants.success) {
    for (const issue of parsedVariants.error.issues) {
      addPrefixedImportIssue(ctx, "variants", issue);
    }
  }

  const parsedPseudoVariants = pseudoVariants.safeParse(cls.pseudoVariants);
  if (!parsedPseudoVariants.success) {
    for (const issue of parsedPseudoVariants.error.issues) {
      addPrefixedImportIssue(ctx, "pseudoVariants", issue);
    }
  }

  const parsedCompoundVariants = z
    .array(CompoundVariantSchema)
    .safeParse(cls.compoundVariants);
  if (!parsedCompoundVariants.success) {
    for (const issue of parsedCompoundVariants.error.issues) {
      addPrefixedImportIssue(ctx, "compoundVariants", issue);
    }
  }

  if (cls.advancedCss?.trim()) {
    const validation = validateAdvancedCss(cls.advancedCss);
    if (!validation.valid) {
      ctx.addIssue({
        code: "custom",
        message: validation.error ?? "Invalid advanced CSS",
        path: ["advancedCss"],
      });
    }
  }
});

const ImporterClassesMapSchema = z.record(z.string(), ImporterClassSchema);

export type DesignImporterClass = z.infer<typeof ImporterClassSchema>;
export type DesignImporterClassesMap = z.infer<typeof ImporterClassesMapSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createZodError(
  section: DesignImportSectionId,
  fallback: string,
  error: z.ZodError,
): DesignImportError {
  return {
    section,
    message: error.issues[0]?.message ?? fallback,
    details: error.issues,
  };
}

function detectJsonFormat(parsed: Record<string, unknown>): DesignImportFormat {
  if (
    isRecord(parsed.colors) ||
    isRecord(parsed.globalStyles) ||
    isRecord(parsed.typography) ||
    isRecord(parsed.semanticClasses)
  ) {
    const sectionCount = [
      parsed.colors,
      parsed.globalStyles,
      parsed.typography,
      parsed.semanticClasses,
      parsed.classes,
    ].filter(isRecord).length;
    return sectionCount > 1 ? "full-design-system" : "colors";
  }

  if (
    isRecord(parsed.custom) ||
    isRecord(parsed.aliases) ||
    isRecord(parsed.variables)
  ) {
    return "variables";
  }

  if (looksLikeClassMap(parsed)) {
    return "classes";
  }

  return "unknown";
}

function looksLikeClassMap(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([, entry]) => {
    if (!isRecord(entry)) {
      return false;
    }
    return (
      typeof entry.name === "string" ||
      Array.isArray(entry.variants) ||
      Array.isArray(entry.pseudoVariants)
    );
  });
}

function extractClassPayload(parsed: Record<string, unknown>): unknown {
  if (looksLikeClassMap(parsed.semanticClasses)) {
    return parsed.semanticClasses;
  }

  if (looksLikeClassMap(parsed.classes)) {
    return parsed.classes;
  }

  if (looksLikeClassMap(parsed)) {
    return parsed;
  }

  return null;
}

function countColors(colors: DesignSystemColors): number {
  return (
    Object.keys(colors.palettes).length +
    Object.keys(colors.semantic).length +
    Object.keys(colors.paletteAliases ?? {}).length
  );
}

function buildClassWarnings(
  classes: DesignImporterClassesMap,
): DesignImportWarning[] {
  const warnings: DesignImportWarning[] = [];

  for (const [key, cls] of Object.entries(classes)) {
    if (key !== cls.name || key !== cls.id) {
      warnings.push({
        section: "classes",
        message: `Class "${key}" will be normalized from id/name "${cls.id}" / "${cls.name}".`,
      });
    }

    if (cls.usageCount !== undefined) {
      warnings.push({
        section: "classes",
        message: `Usage counts for "${key}" are server-managed and will be reset.`,
      });
    }
  }

  return warnings;
}

function buildVariableWarnings(
  variables: GlobalStyleVariables,
): DesignImportWarning[] {
  const warnings: DesignImportWarning[] = [];

  for (const [key, alias] of Object.entries(variables.aliases)) {
    if (alias.sourceType === "custom" && !variables.custom[alias.sourceKey]) {
      warnings.push({
        section: "variables",
        message: `Alias "--${key}" references "--${alias.sourceKey}", which is not included in this import.`,
      });
    }
  }

  return warnings;
}

function buildImportCollisions(
  sections: DesignImportSection[],
  collisionContext?: DesignImportCollisionContext,
): DesignImportCollision[] {
  if (!collisionContext) {
    return [];
  }

  const collisions: DesignImportCollision[] = [];
  const existingClasses = new Set(collisionContext.classNames ?? []);
  const existingContextSelectors = new Set(
    collisionContext.contextRuleSelectors ?? [],
  );
  const existingKeyframes = new Set(collisionContext.keyframeNames ?? []);
  const existingVariables = new Set(collisionContext.variableKeys ?? []);

  for (const section of sections) {
    if (section.id === "classes") {
      for (const className of Object.keys(section.data)) {
        if (existingClasses.has(className)) {
          collisions.push({
            section: "classes",
            key: className,
            action: "overwrite",
            message: `Class "${className}" already exists and will be overwritten in merge mode.`,
          });
        }
      }
      continue;
    }

    if (section.id === "contextRules") {
      for (const rule of section.data) {
        if (existingContextSelectors.has(rule.selector)) {
          collisions.push({
            section: "contextRules",
            key: rule.selector,
            action: "overwrite",
            message: `Context rule "${rule.selector}" already exists and will be overwritten in merge mode.`,
          });
        }
      }
      continue;
    }

    if (section.id === "animations") {
      for (const keyframeName of Object.keys(section.data.keyframes)) {
        if (existingKeyframes.has(keyframeName)) {
          collisions.push({
            section: "animations",
            key: keyframeName,
            action: "overwrite",
            message: `Animation "${keyframeName}" already exists and will be overwritten in merge mode.`,
          });
        }
      }
      continue;
    }

    if (section.id === "variables") {
      for (const key of Object.keys(section.data.custom)) {
        if (existingVariables.has(key)) {
          collisions.push({
            section: "variables",
            key,
            action: "overwrite",
            message: `Variable "--${key}" already exists and will be overwritten in merge mode.`,
          });
        }
      }
    }
  }

  return collisions;
}

function buildCssClassSections(
  classResult: ReturnType<typeof parseClassCssImportInput>,
): DesignImportSection[] {
  const sections: DesignImportSection[] = [];

  if (Object.keys(classResult.classes).length > 0) {
    const validation = ImporterClassesMapSchema.safeParse(classResult.classes);
    if (validation.success) {
      const sectionWarnings = buildClassWarnings(validation.data);
      sections.push({
        id: "classes",
        label: "Classes",
        count: Object.keys(validation.data).length,
        defaultMode: "merge",
        data: validation.data,
        warnings: sectionWarnings,
        collisions: [],
      });
    }
  }

  if (classResult.contextRules.length > 0) {
    const parsed = z
      .array(ContextRuleSchema)
      .safeParse(classResult.contextRules);
    if (parsed.success) {
      sections.push({
        id: "contextRules",
        label: "Context Rules",
        count: parsed.data.length,
        defaultMode: "merge",
        data: parsed.data,
        warnings: [],
        collisions: [],
      });
    }
  }

  if (Object.keys(classResult.keyframes).length > 0) {
    sections.push({
      id: "animations",
      label: "Animations",
      count: Object.keys(classResult.keyframes).length,
      defaultMode: "merge",
      data: { keyframes: classResult.keyframes },
      warnings: [],
      collisions: [],
    });
  }

  return sections;
}

function parseCssImport(
  input: string,
  options: DesignImportParseOptions = {},
): DesignImportParseResult {
  const classResult = parseClassCssImportInput(input, {
    existingClassNames: options.collisionContext?.classNames,
  });
  const variableResult = parseVariableImportInput(input);

  const sections: DesignImportSection[] = [
    ...buildCssClassSections(classResult),
  ];
  const warnings: DesignImportWarning[] = [...classResult.warnings];
  if (variableResult.success) {
    const sectionWarnings = buildVariableWarnings(variableResult.data);
    sections.push({
      id: "variables",
      label: "CSS Variables",
      count: variableResult.summary.totalCount,
      defaultMode: "merge",
      data: variableResult.data,
      summary: {
        customCount: variableResult.summary.customCount,
        aliasCount: variableResult.summary.aliasCount,
      },
      warnings: sectionWarnings,
      collisions: [],
    });
    warnings.push(...sectionWarnings);
  }

  for (const skipped of classResult.skipped) {
    warnings.push({
      section: "classes",
      message: `Skipped "${skipped.selector}": ${skipped.reason}`,
    });
  }

  if (sections.length === 0) {
    return {
      success: false,
      format: "css-variables",
      errors: [
        {
          message:
            classResult.error ??
            (!variableResult.success ? variableResult.error : undefined) ??
            "No importable CSS found. Paste class rules (`.foo { ... }`), CSS variables (`--token: value`), or Aria JSON.",
        },
      ],
      warnings,
    };
  }

  const hasClassContent =
    classResult.summary.classCount > 0 ||
    classResult.summary.contextRuleCount > 0 ||
    classResult.summary.keyframeCount > 0;
  const hasVariables = variableResult.success;

  const format: DesignImportFormat =
    hasClassContent && hasVariables
      ? "css-mixed"
      : hasClassContent
        ? "css-classes"
        : "css-variables";

  const collisions = buildImportCollisions(sections, options.collisionContext);
  if (collisions.length > 0) {
    for (const section of sections) {
      section.collisions = collisions.filter(
        (collision) => collision.section === section.id,
      );
    }
  }

  return {
    success: true,
    format,
    name: null,
    exportedAt: null,
    sections,
    warnings,
    collisions,
  };
}

function parseJsonImport(input: string): DesignImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      success: false,
      format: "unknown",
      errors: [
        {
          message: "Invalid JSON syntax.",
          details: error,
        },
      ],
      warnings: [],
    };
  }

  if (!isRecord(parsed)) {
    return {
      success: false,
      format: "unknown",
      errors: [{ message: "Import JSON must be an object." }],
      warnings: [],
    };
  }

  const format = detectJsonFormat(parsed);
  const sections: DesignImportSection[] = [];
  const errors: DesignImportError[] = [];
  const warnings: DesignImportWarning[] = [];
  const collisions: DesignImportCollision[] = [];

  const name = getString(parsed.name);
  const exportedAt = getString(parsed.exportedAt);

  if (isRecord(parsed.colors)) {
    const result = DesignSystemColorsSchema.safeParse(parsed.colors);
    if (result.success) {
      sections.push({
        id: "colors",
        label: "Colors",
        count: countColors(result.data),
        defaultMode: "replace",
        data: result.data,
        warnings: [],
        collisions: [],
      });
    } else {
      errors.push(
        createZodError("colors", "Imported colors are invalid.", result.error),
      );
    }
  }

  const variableResult = parseVariableImportJson(input);
  if (variableResult.success) {
    const sectionWarnings = buildVariableWarnings(variableResult.data);
    sections.push({
      id: "variables",
      label: "Variables",
      count: variableResult.summary.totalCount,
      defaultMode: "merge",
      data: variableResult.data,
      summary: {
        customCount: variableResult.summary.customCount,
        aliasCount: variableResult.summary.aliasCount,
      },
      warnings: sectionWarnings,
      collisions: [],
    });
    warnings.push(...sectionWarnings);
  } else if (
    isRecord(parsed.custom) ||
    isRecord(parsed.aliases) ||
    isRecord(parsed.variables) ||
    (isRecord(parsed.globalStyles) && isRecord(parsed.globalStyles.variables))
  ) {
    errors.push({
      section: "variables",
      message: variableResult.error,
    });
  }

  if (isRecord(parsed.globalStyles)) {
    const result = GlobalStylesConfigSchema.safeParse(parsed.globalStyles);
    if (result.success) {
      sections.push({
        id: "globalStyles",
        label: "Global Styles",
        count: Object.keys(result.data.defaults).length,
        defaultMode: "replace",
        data: result.data,
        warnings: [],
        collisions: [],
      });
    } else {
      errors.push(
        createZodError(
          "globalStyles",
          "Imported global styles are invalid.",
          result.error,
        ),
      );
    }
  }

  if (isRecord(parsed.typography)) {
    const result = TypographyConfigSchema.safeParse(parsed.typography);
    if (result.success) {
      sections.push({
        id: "typography",
        label: "Typography",
        count:
          result.data.scale.length + Object.keys(result.data.families).length,
        defaultMode: "replace",
        data: result.data,
        warnings: [],
        collisions: [],
      });
    } else {
      errors.push(
        createZodError(
          "typography",
          "Imported typography is invalid.",
          result.error,
        ),
      );
    }
  }

  const classPayload = extractClassPayload(parsed);
  if (classPayload) {
    const result = ImporterClassesMapSchema.safeParse(classPayload);
    if (result.success) {
      const sectionWarnings = buildClassWarnings(result.data);
      sections.push({
        id: "classes",
        label: "Classes",
        count: Object.keys(result.data).length,
        defaultMode: "merge",
        data: result.data,
        warnings: sectionWarnings,
        collisions: [],
      });
      warnings.push(...sectionWarnings);
    } else {
      errors.push(
        createZodError(
          "classes",
          "Imported classes are invalid.",
          result.error,
        ),
      );
    }
  }

  if (sections.length === 0) {
    return {
      success: false,
      format,
      errors:
        errors.length > 0
          ? errors
          : [
              {
                message:
                  "No importable design assets were found. Paste JSON or CSS variables exported from Aria.",
              },
            ],
      warnings,
    };
  }

  return {
    success: true,
    format,
    name,
    exportedAt,
    sections,
    warnings,
    collisions,
  };
}

export function parseDesignImportInput(
  input: string,
  options: DesignImportParseOptions = {},
): DesignImportParseResult {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return {
      success: false,
      format: "unknown",
      errors: [{ message: "Paste JSON or CSS to import design assets." }],
      warnings: [],
    };
  }

  if (trimmedInput.startsWith("{") || trimmedInput.startsWith("[")) {
    return parseJsonImport(trimmedInput);
  }

  return parseCssImport(trimmedInput, options);
}

export function getSection<TSection extends DesignImportSectionId>(
  plan: DesignImportPlan,
  section: TSection,
): Extract<DesignImportSection, { id: TSection }> | null {
  return (
    (plan.sections.find((entry) => entry.id === section) as Extract<
      DesignImportSection,
      { id: TSection }
    > | null) ?? null
  );
}

export function resolveSectionMode(
  section: DesignImportSection,
  selectedModes: Partial<Record<DesignImportSectionId, DesignImportMode>>,
): DesignImportMode {
  return selectedModes[section.id] ?? section.defaultMode;
}

export function isVariableImportMode(
  mode: DesignImportMode,
): mode is VariableImportMode {
  return mode === "merge" || mode === "replace";
}

export function coerceClassesForServer(
  classes: DesignImporterClassesMap,
): CustomClassesMap {
  const now = new Date().toISOString();

  return CustomClassesMapSchema.parse(
    Object.fromEntries(
      Object.entries(classes).map(([key, cls]) => [
        key,
        {
          ...cls,
          id: key,
          name: key,
          usageCount: 0,
          createdAt: cls.createdAt ?? now,
          updatedAt: cls.updatedAt ?? now,
        },
      ]),
    ),
  );
}
