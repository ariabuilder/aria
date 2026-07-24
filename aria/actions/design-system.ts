/**
 * Astro actions for managing design system
 * colors, palette templates, and import/export functionality.
 */

import {
  defineAction,
  ActionError,
  type ActionAPIContext,
} from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../lib/content-sync/mutations";
import { getSiteSettingsUtilityEngine } from "../lib/storage/adapter";
import type {
  ColorPaletteShades,
  DesignSystemColors,
} from "../lib/design/types";
import { DesignSystemColorsSchema } from "../lib/design/types";
import {
  GlobalStylesConfigSchema,
  GlobalStyleVariablesSchema,
  UniversalBreakpointItemSchema,
  applyDesignSystemColorsToUniversalDesignSystem,
  createUniversalBreakpointsFromSiteBreakpoints,
  LegacySiteBreakpointsSchema,
  createDefaultUniversalDesignSystem,
  createDesignSystemColorsFromUniversalDesignSystem,
  ContextRuleSchema,
  type ContextRule,
  hasCustomUniversalBreakpoints,
  normalizeUniversalBreakpointItems,
  resolveUniversalBreakpointItems,
  type UniversalDesignSystem,
  type GlobalStyleVariables,
} from "../lib/styles/universalDesignSystem";
import {
  CustomClassSchema,
  type CustomClass,
} from "../lib/schemas/classEditor";
import { mergeImportedVariableSet } from "../admin/features/Design/lib/variableManagerImport";
import {
  DEFAULT_TYPOGRAPHY_FAMILIES,
  DEFAULT_TYPOGRAPHY_SCALE,
} from "../lib/styles/defaultTypography";
import { serializeFontFamilyList } from "../lib/styles/fontFamily";
import {
  requireAuth,
  requireOperation,
  resolveAuthorizedMutation,
  type AuthorshipSaveContext,
} from "./_shared";
import {
  persistDesignSystem,
  persistSiteSettings,
} from "./_designSystemPersist";
import { log as baseLog } from "../lib/utils/logger";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Design System][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

function rethrowActionError(error: unknown): void {
  if (typeof ActionError === "function" && error instanceof ActionError) {
    throw error;
  }
}

const ColorShadesSchema = z.object({
  25: z.string(),
  50: z.string(),
  100: z.string(),
  200: z.string(),
  300: z.string(),
  400: z.string(),
  500: z.string(),
  600: z.string(),
  700: z.string(),
  800: z.string(),
  900: z.string(),
  950: z.string(),
  DEFAULT: z.string().optional(),
});

const PaletteSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  shades: ColorShadesSchema,
});

const SemanticColorsSchema = z.object({
  success: z.string(),
  warning: z.string(),
  error: z.string(),
  info: z.string(),
});

const TypographyScaleStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  size: z.number().positive(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
});

const TypographyFamiliesSchema = z.object({
  body: z.string().min(1),
  heading: z.string().min(1),
  mono: z.string().min(1),
});

const TypographyConfigSchema = z.object({
  families: TypographyFamiliesSchema,
  scale: z.array(TypographyScaleStepSchema).min(1),
  headingOverrides: z.record(z.string(), z.string().min(1)).optional(),
  bodyOverrides: z.record(z.string(), z.string().min(1)).optional(),
});

const BreakpointItemsSchema = z
  .array(UniversalBreakpointItemSchema)
  .min(1)
  .superRefine((items, ctx) => {
    const hasBase = items.some((item) => item.id === "base");

    if (!hasBase) {
      ctx.addIssue({
        code: "custom" as const,
        message: "Breakpoints must include the base breakpoint",
      });
    }
  });

type TypographyScaleStep = z.infer<typeof TypographyScaleStepSchema>;
export type TypographyConfig = z.infer<typeof TypographyConfigSchema>;
type BreakpointItems = z.infer<typeof BreakpointItemsSchema>;

const StyleRefreshStatusSchema = z
  .object({
    success: z.boolean(),
    framework: z.enum(["unocss", "custom"]),
    error: z.string().optional(),
    styleRevision: z.string().optional(),
    invalidatedPageCount: z.int().nonnegative().optional(),
    globalCSSHash: z.string().optional(),
    cssSize: z.number().nonnegative().optional(),
    classCount: z.int().nonnegative().optional(),
    lastCompiled: z.string().optional(),
  })
  .strict();

type StyleRefreshStatus = z.infer<typeof StyleRefreshStatusSchema>;

const DEFAULT_TYPOGRAPHY_SCALE_STEPS: TypographyScaleStep[] =
  DEFAULT_TYPOGRAPHY_SCALE.map((step) => ({ ...step }));

const HEADING_SCALE_IDS = ["5xl", "4xl", "3xl", "2xl", "xl", "lg"] as const;
const BODY_SCALE_IDS = ["base", "sm"] as const;
const TYPOGRAPHY_FAMILY_KEYS = new Set<string>([
  "body",
  "heading",
  "mono",
  ...HEADING_SCALE_IDS,
  ...BODY_SCALE_IDS,
]);

type DesignSystemStorageAdapter = Awaited<
  ReturnType<typeof getStorageAdapterAsync>
>;

async function getDesignSystem(
  adapter: DesignSystemStorageAdapter,
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystem()) ?? createDefaultUniversalDesignSystem()
  );
}

async function getDesignSystemSegments(
  adapter: DesignSystemStorageAdapter,
  segmentKeys: readonly string[],
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystemSegments(segmentKeys)) ??
    createDefaultUniversalDesignSystem()
  );
}

async function saveDesignSystem(
  adapter: DesignSystemStorageAdapter,
  designSystem: UniversalDesignSystem,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  await persistDesignSystem(adapter, designSystem, authorship);
}

function readLegacySiteBreakpoints(siteSettings: unknown) {
  const breakpoints = (
    siteSettings as { breakpoints?: unknown } | null | undefined
  )?.breakpoints;

  const parsed = LegacySiteBreakpointsSchema.safeParse(breakpoints ?? []);
  if (!parsed.success || parsed.data.length === 0) {
    return null;
  }

  return parsed.data;
}

async function getResolvedDesignSystemBreakpoints(
  adapter: DesignSystemStorageAdapter,
  designSystemInput?: UniversalDesignSystem,
): Promise<{
  designSystem: UniversalDesignSystem;
  breakpoints: BreakpointItems;
}> {
  const designSystem = designSystemInput ?? (await getDesignSystem(adapter));
  const currentSettings = await adapter.getSiteSettings();
  const resolvedBreakpoints = resolveUniversalBreakpointItems(
    designSystem,
    readLegacySiteBreakpoints(currentSettings),
  );

  return {
    designSystem,
    breakpoints: BreakpointItemsSchema.parse(resolvedBreakpoints),
  };
}

async function syncDerivedUnoThemeColors(
  adapter: DesignSystemStorageAdapter,
  colors: DesignSystemColors,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  const { colorsToUnoTheme } = await import("../lib/design");
  const currentSettings = await adapter.getSiteSettings();
  const unoColors = colorsToUnoTheme(colors);

  await persistSiteSettings(
    adapter,
    {
      ...currentSettings,
      unocssConfig: {
        ...currentSettings?.unocssConfig,
        theme: {
          ...currentSettings?.unocssConfig?.theme,
          colors: unoColors,
        },
      },
    },
    authorship
      ? { ...authorship, mutationKind: "save-site-settings" }
      : undefined,
  );
}

function formatRem(value: number): string {
  return `${(value / 16)
    .toFixed(4)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")}rem`;
}

function formatEm(value: number): string {
  return `${value
    .toFixed(4)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")}em`;
}

function buildUnoFontSizes(
  scale: TypographyScaleStep[],
): Record<string, string> {
  return Object.fromEntries(
    scale.map((step) => [step.id, `var(--font-size-${step.id})`]),
  );
}

export function buildTypographyConfig(
  designSystem: UniversalDesignSystem,
): TypographyConfig {
  const defaultScaleById = new Map(
    DEFAULT_TYPOGRAPHY_SCALE_STEPS.map((step) => [step.id, step]),
  );

  const scale = DEFAULT_TYPOGRAPHY_SCALE_STEPS.map((step) => {
    const size = designSystem.tokens.typography.sizes[step.id];
    const lineHeight = designSystem.tokens.typography.lineHeights[step.id];
    const letterSpacing = designSystem.tokens.typography.letterSpacing[step.id];

    return {
      id: step.id,
      label: step.label,
      size: size ? Math.round(Number.parseFloat(size) * 16) : step.size,
      lineHeight: lineHeight
        ? Math.round(Number.parseFloat(lineHeight) * 16)
        : step.lineHeight,
      letterSpacing: letterSpacing
        ? Number.parseFloat(letterSpacing)
        : step.letterSpacing,
    };
  }).map((step) => ({
    ...defaultScaleById.get(step.id),
    ...step,
  }));

  const familyAssignments = {
    ...designSystem.tokens.typography.families,
    ...designSystem.fonts.assignments,
  };

  const headingOverrides = Object.fromEntries(
    HEADING_SCALE_IDS.flatMap((stepId) => {
      const family = familyAssignments[stepId];
      return family ? [[stepId, family]] : [];
    }),
  );

  const bodyOverrides = Object.fromEntries(
    BODY_SCALE_IDS.flatMap((stepId) => {
      const family = familyAssignments[stepId];
      return family ? [[stepId, family]] : [];
    }),
  );

  return {
    families: {
      body: familyAssignments.body || DEFAULT_TYPOGRAPHY_FAMILIES.body,
      heading: familyAssignments.heading || DEFAULT_TYPOGRAPHY_FAMILIES.heading,
      mono: familyAssignments.mono || DEFAULT_TYPOGRAPHY_FAMILIES.mono,
    },
    scale,
    headingOverrides,
    bodyOverrides,
  };
}

function buildTypographyFamilyAssignments(
  typography: TypographyConfig,
): Record<string, string> {
  return {
    body: typography.families.body,
    heading: typography.families.heading,
    mono: typography.families.mono,
    ...(typography.headingOverrides ?? {}),
    ...(typography.bodyOverrides ?? {}),
  };
}

function omitTypographyFamilyKeys(
  record: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record ?? {}).filter(
      ([key]) => !TYPOGRAPHY_FAMILY_KEYS.has(key),
    ),
  );
}

function applyTypographyToDesignSystem(
  designSystem: UniversalDesignSystem,
  typography: TypographyConfig,
): void {
  const typographyFamilies = buildTypographyFamilyAssignments(typography);

  designSystem.tokens.typography.families = {
    ...omitTypographyFamilyKeys(designSystem.tokens.typography.families),
    ...typographyFamilies,
  };
  designSystem.fonts.assignments = {
    ...omitTypographyFamilyKeys(designSystem.fonts.assignments),
    ...typographyFamilies,
  };
  designSystem.tokens.typography.sizes = Object.fromEntries(
    typography.scale.map((step) => [step.id, formatRem(step.size)]),
  );
  designSystem.tokens.typography.lineHeights = Object.fromEntries(
    typography.scale.map((step) => [step.id, formatRem(step.lineHeight)]),
  );
  designSystem.tokens.typography.letterSpacing = Object.fromEntries(
    typography.scale.map((step) => [step.id, formatEm(step.letterSpacing)]),
  );
}

function applyTypographyToSiteSettings(
  currentSettings: Awaited<
    ReturnType<DesignSystemStorageAdapter["getSiteSettings"]>
  >,
  typography: TypographyConfig,
) {
  return {
    ...currentSettings,
    unocssConfig: {
      ...currentSettings?.unocssConfig,
      theme: {
        ...currentSettings?.unocssConfig?.theme,
        fontFamily: {
          ...currentSettings?.unocssConfig?.theme?.fontFamily,
          sans: serializeFontFamilyList([
            typography.families.body,
            "system-ui",
            "sans-serif",
          ]),
          serif: serializeFontFamilyList([
            typography.families.heading,
            "Georgia",
            "serif",
          ]),
          mono: serializeFontFamilyList([
            typography.families.mono,
            "Consolas",
            "monospace",
          ]),
        },
        fontSize: {
          ...((
            currentSettings?.unocssConfig?.theme as
              | Record<string, unknown>
              | undefined
          )?.fontSize as Record<string, string> | undefined),
          ...buildUnoFontSizes(typography.scale),
        },
      },
    },
  };
}

async function syncDerivedTypography(
  adapter: DesignSystemStorageAdapter,
  designSystem: UniversalDesignSystem,
  typography: TypographyConfig,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  const currentSettings = await adapter.getSiteSettings();
  applyTypographyToDesignSystem(designSystem, typography);

  await saveDesignSystem(adapter, designSystem, authorship);
  await persistSiteSettings(
    adapter,
    applyTypographyToSiteSettings(currentSettings, typography),
    authorship
      ? { ...authorship, mutationKind: "save-site-settings" }
      : undefined,
  );
}

async function refreshRenderStyles(
  adapter: DesignSystemStorageAdapter,
  authorship?: AuthorshipSaveContext,
  options: {
    colorsOnly?: boolean;
    invalidatePageRenderArtifacts?: boolean;
  } = {},
): Promise<StyleRefreshStatus> {
  const siteSettings = await adapter.getSiteSettings();
  const framework = getSiteSettingsUtilityEngine(siteSettings);
  const invalidatePageRenderArtifacts =
    options.invalidatePageRenderArtifacts ?? !options.colorsOnly;

  try {
    const stylesModule = await import("./styles");
    const result = await stylesModule.regenerateGlobalCSSArtifacts(adapter, {
      bumpStyleRevision: true,
      invalidatePageRenderArtifacts,
      colorsOnly: options.colorsOnly,
      authorship,
    });

    return StyleRefreshStatusSchema.parse({
      success: true,
      framework: result.framework,
      styleRevision: result.styleRevision,
      invalidatedPageCount: result.invalidatedPageCount,
      globalCSSHash: result.globalCSSHash,
      cssSize: result.cssSize,
      classCount: result.classCount,
      lastCompiled: result.lastCompiled,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    // Sanitize: hide internal Vite paths from user-facing error messages
    const message = rawMessage.includes("node_modules/.vite")
      ? "Style artifacts could not be regenerated (dev-only Vite issue)"
      : rawMessage;

    log("warn", "Render style refresh failed after design-system mutation", {
      framework,
      error: rawMessage,
    });

    return StyleRefreshStatusSchema.parse({
      success: false,
      framework,
      error: message,
    });
  }
}

async function getStoredDesignSystemColors(
  adapter: DesignSystemStorageAdapter,
) {
  const storedDesignSystem = await adapter.getDesignSystemSegments([
    "tokens-colors",
  ]);
  if (storedDesignSystem) {
    return createDesignSystemColorsFromUniversalDesignSystem(
      storedDesignSystem,
    );
  }

  const { unoThemeToColors } = await import("../lib/design");
  const settings = await adapter.getSiteSettings();
  return unoThemeToColors(settings?.unocssConfig?.theme?.colors || {});
}

const ApplyTemplateInputSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
});

export async function handleApplyTemplate(
  input: z.infer<typeof ApplyTemplateInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { templateId } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "designSystem.applyTemplate",
    "save-styles",
  );

  try {
    const { getTemplate } = await import("../lib/design");

    const template = getTemplate(templateId);
    if (!template) {
      return {
        success: false,
        error: {
          code: "TEMPLATE_NOT_FOUND",
          message: `Template "${templateId}" not found`,
        },
      };
    }

    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const { expandTemplateToPalettes } = await import("../lib/design");
    const expanded = expandTemplateToPalettes(template);
    const colors = {
      activeTemplateId: templateId,
      palettes: {
        primary: { ...expanded.primary },
        secondary: { ...expanded.secondary },
        muted: { ...expanded.muted },
        neutral: { ...expanded.neutral },
      },
      semantic: { ...template.semantic },
    };

    await saveDesignSystem(
      adapter,
      applyDesignSystemColorsToUniversalDesignSystem(designSystem, colors),
      authorship,
    );
    await syncDerivedUnoThemeColors(adapter, colors, authorship);
    const styleRefresh = await refreshRenderStyles(adapter, authorship, {
      colorsOnly: true,
      invalidatePageRenderArtifacts: false,
    });
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: "design-system.template",
      },
      context,
    );

    log("info", "Palette template applied", { templateId });

    return {
      success: true,
      data: {
        templateId,
        templateName: template.name,
        colors,
        styleRefresh,
      },
    };
  } catch (error) {
    rethrowActionError(error);
    log("error", "Failed to apply template", { error });
    return {
      success: false,
      error: {
        code: "APPLY_TEMPLATE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to apply template",
      },
    };
  }
}

const SaveColorsInputSchema = z.object({
  colors: z.object({
    templateId: z.string().optional(),
    palettes: z.array(PaletteSchema),
    paletteAliases: z.record(z.string(), z.string()).optional(),
    semantic: SemanticColorsSchema,
  }),
});

export async function handleSaveColors(
  input: z.infer<typeof SaveColorsInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { colors } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "designSystem.saveColors",
    "save-styles",
  );

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const palettesRecord: Record<string, ColorPaletteShades> = {};
    for (const palette of colors.palettes) {
      palettesRecord[palette.name] = { ...palette.shades };
    }

    const designSystemColors: DesignSystemColors = {
      activeTemplateId: colors.templateId ?? "custom",
      palettes: palettesRecord,
      customPalettes: colors.palettes.map((palette) => ({
        id: palette.name,
        name: palette.label?.trim() || palette.name,
        shades: { ...palette.shades },
        isCustom: true,
      })),
      paletteAliases: { ...(colors.paletteAliases ?? {}) },
      semantic: {
        ...colors.semantic,
      },
    };

    await saveDesignSystem(
      adapter,
      applyDesignSystemColorsToUniversalDesignSystem(
        designSystem,
        designSystemColors,
      ),
      authorship,
    );
    await syncDerivedUnoThemeColors(adapter, designSystemColors, authorship);
    const styleRefresh = await refreshRenderStyles(adapter, authorship, {
      colorsOnly: true,
      invalidatePageRenderArtifacts: false,
    });
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: "design-system.colors",
      },
      context,
    );

    log("info", "Design system colors saved", {
      palettes: colors.palettes.length,
    });

    return {
      success: true,
      data: {
        paletteCount: colors.palettes.length,
        colors: designSystemColors,
        styleRefresh,
      },
    };
  } catch (error) {
    rethrowActionError(error);
    log("error", "Failed to save colors", { error });
    return {
      success: false,
      error: {
        code: "SAVE_COLORS_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to save colors",
      },
    };
  }
}

const SaveTypographyInputSchema = z.object({
  typography: TypographyConfigSchema,
});

export async function handleSaveTypography(
  input: z.infer<typeof SaveTypographyInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { typography } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "designSystem.saveTypography",
    "save-styles",
  );

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);

    await syncDerivedTypography(adapter, designSystem, typography, authorship);
    const styleRefresh = await refreshRenderStyles(adapter, authorship);

    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: "design-system.typography",
      },
      context,
    );

    return {
      success: true,
      data: {
        typography,
        styleRefresh,
      },
    };
  } catch (error) {
    rethrowActionError(error);
    log("error", "Failed to save typography", { error });
    return {
      success: false,
      error: {
        code: "SAVE_TYPOGRAPHY_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to save typography",
      },
    };
  }
}

const SaveGlobalStylesInputSchema = z.object({
  globalStyles: GlobalStylesConfigSchema,
});

export async function handleSaveGlobalStyles(
  input: z.infer<typeof SaveGlobalStylesInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { globalStyles } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "designSystem.saveGlobalStyles",
    "save-styles",
  );

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);

    designSystem.globalStyles = GlobalStylesConfigSchema.parse(globalStyles);

    await saveDesignSystem(adapter, designSystem, authorship);
    const styleRefresh = await refreshRenderStyles(adapter, authorship);

    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: "design-system.global-styles",
      },
      context,
    );

    return {
      success: true,
      data: {
        globalStyles: designSystem.globalStyles,
        styleRefresh,
      },
    };
  } catch (error) {
    rethrowActionError(error);
    log("error", "Failed to save global styles", { error });
    return {
      success: false,
      error: {
        code: "SAVE_GLOBAL_STYLES_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save global styles",
      },
    };
  }
}

const SaveBreakpointsInputSchema = z.object({
  breakpoints: BreakpointItemsSchema,
});

const ImportBundleModeSchema = z.enum(["merge", "replace"]);
const ImportBundleClassSchema = CustomClassSchema.omit({
  usageCount: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  usageCount: z.int().min(0).optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});
const ImportBundleClassesMapSchema = z.record(
  z.string(),
  ImportBundleClassSchema,
);
const ImportBundleAnimationsSchema = z.object({
  keyframes: z.record(
    z.string(),
    z.object({
      steps: z.record(z.string(), z.record(z.string(), z.string())),
    }),
  ),
});
const ImportBundleInputSchema = z.object({
  sections: z.object({
    colors: DesignSystemColorsSchema.optional(),
    variables: GlobalStyleVariablesSchema.optional(),
    globalStyles: GlobalStylesConfigSchema.optional(),
    typography: TypographyConfigSchema.optional(),
    classes: ImportBundleClassesMapSchema.optional(),
    contextRules: z.array(ContextRuleSchema).optional(),
    animations: ImportBundleAnimationsSchema.optional(),
  }),
  modes: z
    .object({
      variables: ImportBundleModeSchema.optional(),
      classes: ImportBundleModeSchema.optional(),
      colors: ImportBundleModeSchema.optional(),
      globalStyles: ImportBundleModeSchema.optional(),
      typography: ImportBundleModeSchema.optional(),
      contextRules: ImportBundleModeSchema.optional(),
      animations: ImportBundleModeSchema.optional(),
    })
    .optional(),
});

function mergeImportedContextRules(
  baseRules: ContextRule[],
  importedRules: ContextRule[],
  mode: "merge" | "replace",
): ContextRule[] {
  if (mode === "replace") {
    return importedRules.map((rule) => ContextRuleSchema.parse(rule));
  }

  const byId = new Map(baseRules.map((rule) => [rule.id, rule]));
  for (const rule of importedRules) {
    byId.set(rule.id, ContextRuleSchema.parse(rule));
  }
  return Array.from(byId.values());
}

function mergeImportedKeyframes(
  baseKeyframes: Record<string, { steps: Record<string, Record<string, string>> }>,
  importedKeyframes: Record<string, { steps: Record<string, Record<string, string>> }>,
  mode: "merge" | "replace",
): Record<string, { steps: Record<string, Record<string, string>> }> {
  if (mode === "replace") {
    return { ...importedKeyframes };
  }

  return {
    ...baseKeyframes,
    ...importedKeyframes,
  };
}

function normalizeImportedClasses(
  classes: z.infer<typeof ImportBundleClassesMapSchema>,
): Record<string, CustomClass> {
  const now = new Date().toISOString();

  return Object.fromEntries(
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
  );
}

function mergeGlobalStyleVariables(
  baseVariables: GlobalStyleVariables,
  importedVariables: GlobalStyleVariables,
  mode: "merge" | "replace",
): GlobalStyleVariables {
  if (mode === "replace") {
    return GlobalStyleVariablesSchema.parse(importedVariables);
  }

  return mergeImportedVariableSet(baseVariables, importedVariables);
}

export async function handleSaveBreakpoints(
  input: z.infer<typeof SaveBreakpointsInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { breakpoints } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "designSystem.saveBreakpoints",
    "save-styles",
  );

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const normalizedBreakpoints = BreakpointItemsSchema.parse(
      normalizeUniversalBreakpointItems(breakpoints),
    );

    designSystem.breakpoints.items = normalizedBreakpoints;

    await saveDesignSystem(adapter, designSystem, authorship);
    const styleRefresh = await refreshRenderStyles(adapter, authorship);
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: "design-system.breakpoints",
      },
      context,
    );

    return {
      success: true,
      data: {
        breakpoints: normalizedBreakpoints,
        styleRefresh,
      },
    };
  } catch (error) {
    rethrowActionError(error);
    log("error", "Failed to save breakpoints", { error });
    return {
      success: false,
      error: {
        code: "SAVE_BREAKPOINTS_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to save breakpoints",
      },
    };
  }
}

export const designSystem = {
  /**
   * Apply a built-in palette template
   *
   * Applies a pre-defined color palette template to the canonical
   * design system and synchronizes derived UnoCSS theme colors.
   *
   * @param templateId - ID of the palette template to apply
   * @returns Applied template details and colors
   */
  applyTemplate: defineAction({
    accept: "json",
    input: ApplyTemplateInputSchema,
    handler: handleApplyTemplate,
  }),

  /**
   * Save custom design system colors
   *
   * Saves custom color palettes and semantic colors to the
   * canonical design system and synchronizes derived UnoCSS theme colors.
   *
   * @param colors - Color configuration with palettes and semantic colors
   * @returns Save confirmation with palette count
   */
  saveColors: defineAction({
    accept: "json",
    input: SaveColorsInputSchema,
    handler: handleSaveColors,
  }),

  getTypography: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);

        return {
          success: true,
          data: {
            typography: buildTypographyConfig(designSystem),
          },
        };
      } catch (error) {
        log("error", "Failed to get typography", { error });
        return {
          success: false,
          error: {
            code: "GET_TYPOGRAPHY_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get typography",
          },
        };
      }
    },
  }),

  saveTypography: defineAction({
    accept: "json",
    input: SaveTypographyInputSchema,
    handler: handleSaveTypography,
  }),

  getGlobalStyles: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystemSegments(adapter, [
          "global-styles",
        ]);

        return {
          success: true,
          data: {
            globalStyles: designSystem.globalStyles,
          },
        };
      } catch (error) {
        log("error", "Failed to get global styles", { error });
        return {
          success: false,
          error: {
            code: "GET_GLOBAL_STYLES_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get global styles",
          },
        };
      }
    },
  }),

  saveGlobalStyles: defineAction({
    accept: "json",
    input: SaveGlobalStylesInputSchema,
    handler: handleSaveGlobalStyles,
  }),

  getBreakpoints: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const { breakpoints } =
          await getResolvedDesignSystemBreakpoints(adapter);

        return {
          success: true,
          data: {
            breakpoints,
          },
        };
      } catch (error) {
        log("error", "Failed to get breakpoints", { error });
        return {
          success: false,
          error: {
            code: "GET_BREAKPOINTS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get breakpoints",
          },
        };
      }
    },
  }),

  saveBreakpoints: defineAction({
    accept: "json",
    input: SaveBreakpointsInputSchema,
    handler: handleSaveBreakpoints,
  }),

  importBundle: defineAction({
    accept: "json",
    input: ImportBundleInputSchema,
    handler: async ({ sections, modes }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "designSystem.importBundle",
        "save-styles",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        let designSystem = await getDesignSystem(adapter);
        let siteSettings = (await adapter.getSiteSettings()) ?? {};
        const summary: Record<string, unknown> = {};

        if (sections.colors) {
          designSystem = applyDesignSystemColorsToUniversalDesignSystem(
            designSystem,
            sections.colors,
          );

          const { colorsToUnoTheme } = await import("../lib/design");
          siteSettings = {
            ...siteSettings,
            unocssConfig: {
              ...siteSettings?.unocssConfig,
              theme: {
                ...siteSettings?.unocssConfig?.theme,
                colors: colorsToUnoTheme(sections.colors),
              },
            },
          };

          summary.colors = {
            paletteCount: Object.keys(sections.colors.palettes).length,
            semanticCount: Object.keys(sections.colors.semantic).length,
          };
        }

        if (sections.typography) {
          applyTypographyToDesignSystem(designSystem, sections.typography);
          siteSettings = applyTypographyToSiteSettings(
            siteSettings,
            sections.typography,
          );
          summary.typography = {
            familyCount: Object.keys(sections.typography.families).length,
            scaleCount: sections.typography.scale.length,
          };
        }

        if (sections.globalStyles) {
          designSystem.globalStyles = GlobalStylesConfigSchema.parse(
            sections.globalStyles,
          );
          summary.globalStyles = {
            imported: true,
            variableCount:
              Object.keys(sections.globalStyles.variables.custom).length +
              Object.keys(sections.globalStyles.variables.aliases).length,
          };
        }

        if (sections.variables) {
          const variableMode = modes?.variables ?? "merge";
          designSystem.globalStyles = {
            ...designSystem.globalStyles,
            variables: mergeGlobalStyleVariables(
              designSystem.globalStyles.variables,
              sections.variables,
              variableMode,
            ),
          };
          summary.variables = {
            mode: variableMode,
            customCount: Object.keys(sections.variables.custom).length,
            aliasCount: Object.keys(sections.variables.aliases).length,
          };
        }

        if (sections.classes) {
          const classMode = modes?.classes ?? "merge";
          const normalizedClasses = normalizeImportedClasses(sections.classes);
          const overwrittenKeys =
            classMode === "merge"
              ? Object.keys(normalizedClasses).filter(
                  (key) => designSystem.semanticClasses[key],
                )
              : Object.keys(designSystem.semanticClasses);

          designSystem.semanticClasses =
            classMode === "replace"
              ? normalizedClasses
              : {
                  ...designSystem.semanticClasses,
                  ...normalizedClasses,
                };
          summary.classes = {
            mode: classMode,
            importedCount: Object.keys(normalizedClasses).length,
            overwrittenCount: overwrittenKeys.length,
          };
        }

        if (sections.contextRules) {
          const contextMode = modes?.contextRules ?? "merge";
          const overwrittenSelectors =
            contextMode === "merge"
              ? sections.contextRules
                  .map((rule) => rule.selector)
                  .filter((selector) =>
                    designSystem.contextRules.some(
                      (rule) => rule.selector === selector,
                    ),
                  )
              : designSystem.contextRules.map((rule) => rule.selector);

          designSystem.contextRules = mergeImportedContextRules(
            designSystem.contextRules,
            sections.contextRules,
            contextMode,
          );
          summary.contextRules = {
            mode: contextMode,
            importedCount: sections.contextRules.length,
            overwrittenCount: overwrittenSelectors.length,
          };
        }

        if (sections.animations) {
          const animationMode = modes?.animations ?? "merge";
          const importedNames = Object.keys(sections.animations.keyframes);
          const overwrittenNames =
            animationMode === "merge"
              ? importedNames.filter(
                  (name) => designSystem.animations.keyframes[name],
                )
              : Object.keys(designSystem.animations.keyframes);

          designSystem.animations = {
            keyframes: mergeImportedKeyframes(
              designSystem.animations.keyframes,
              sections.animations.keyframes,
              animationMode,
            ),
          };
          summary.animations = {
            mode: animationMode,
            importedCount: importedNames.length,
            overwrittenCount: overwrittenNames.length,
          };
        }

        await saveDesignSystem(adapter, designSystem, authorship);
        await persistSiteSettings(
          adapter,
          siteSettings,
          authorship
            ? { ...authorship, mutationKind: "save-site-settings" }
            : undefined,
        );
        const styleRefresh = await refreshRenderStyles(adapter, authorship, {
          invalidatePageRenderArtifacts: true,
        });
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: "design-system.import-bundle",
          },
          context,
        );

        log("info", "Design system bundle imported", {
          sections: Object.keys(summary),
        });

        return {
          success: true,
          data: {
            summary,
            colors: sections.colors
              ? createDesignSystemColorsFromUniversalDesignSystem(designSystem)
              : undefined,
            globalStyles: designSystem.globalStyles,
            typography: sections.typography
              ? buildTypographyConfig(designSystem)
              : undefined,
            classes: sections.classes ? designSystem.semanticClasses : undefined,
            contextRules: sections.contextRules
              ? designSystem.contextRules
              : undefined,
            animations: sections.animations
              ? designSystem.animations
              : undefined,
            styleRefresh,
          },
        };
      } catch (error) {
        rethrowActionError(error);
        log("error", "Failed to import design system bundle", { error });
        return {
          success: false,
          error: {
            code: "IMPORT_BUNDLE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to import design system bundle",
          },
        };
      }
    },
  }),

  /**
   * Import design system from JSON
   *
   * Validates and imports a design system configuration from
   * a JSON string.
   *
   * @param json - JSON string containing design system configuration
   * @returns Import result with applied colors
   */
  import: defineAction({
    accept: "json",
    input: z.object({
      json: z.string().min(1, "JSON string is required"),
    }),
    handler: async ({ json }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "designSystem.import",
        "save-styles",
      );

      try {
        const { importFromJSON } = await import("../lib/design");

        const result = importFromJSON(json);
        if (!result.success) {
          return {
            success: false,
            error: {
              code: "IMPORT_VALIDATION_FAILED",
              message: result.error,
              context: { details: result.details },
            },
          };
        }

        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const updatedDesignSystem =
          applyDesignSystemColorsToUniversalDesignSystem(
            designSystem,
            result.data.colors,
          );
        const migratedBreakpoints = readLegacySiteBreakpoints(
          await adapter.getSiteSettings(),
        );
        if (
          migratedBreakpoints &&
          !hasCustomUniversalBreakpoints(updatedDesignSystem.breakpoints.items)
        ) {
          updatedDesignSystem.breakpoints.items =
            normalizeUniversalBreakpointItems(
              createUniversalBreakpointsFromSiteBreakpoints(
                migratedBreakpoints,
              ),
            );
        }
        await saveDesignSystem(adapter, updatedDesignSystem, authorship);
        await syncDerivedUnoThemeColors(
          adapter,
          result.data.colors,
          authorship,
        );
        const styleRefresh = await refreshRenderStyles(adapter, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: "design-system.import",
          },
          context,
        );

        log("info", "Design system imported", {
          name: result.data.name,
          palettes: Object.keys(result.data.colors.palettes).length,
        });

        return {
          success: true,
          data: {
            name: result.data.name,
            exportedAt: result.data.exportedAt,
            paletteCount: Object.keys(result.data.colors.palettes).length,
            colors: result.data.colors,
            styleRefresh,
          },
        };
      } catch (error) {
        rethrowActionError(error);
        log("error", "Failed to import design system", { error });
        return {
          success: false,
          error: {
            code: "IMPORT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to import design system",
          },
        };
      }
    },
  }),

  /**
   * Export design system as JSON
   *
   * Exports current design system colors in a validated JSON
   * format that can be imported later.
   *
   * @param name - Optional name for the exported design system
   * @param description - Optional description
   * @returns JSON string of the design system
   */
  export: defineAction({
    accept: "json",
    input: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
    }),
    handler: async ({ name, description }, context) => {
      await requireOperation(context, "designSystem.export");

      try {
        const { exportToJSON } = await import("../lib/design");

        const adapter = await getStorageAdapterAsync(context.locals);
        const colors = await getStoredDesignSystemColors(adapter);

        const json = exportToJSON(colors, {
          name,
          description,
          pretty: true,
        });

        log("info", "Design system exported", {
          name: name || "Custom Design System",
        });

        return {
          success: true,
          data: {
            json,
            name: name || "Custom Design System",
          },
        };
      } catch (error) {
        rethrowActionError(error);
        log("error", "Failed to export design system", { error });
        return {
          success: false,
          error: {
            code: "EXPORT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to export design system",
          },
        };
      }
    },
  }),

  /**
   * List available palette templates
   *
   * Returns all built-in palette templates that can be applied.
   *
   * @returns List of available templates
   */
  listTemplates: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      try {
        const { PALETTE_TEMPLATES, TEMPLATE_IDS } =
          await import("../lib/design");

        return {
          success: true,
          data: {
            templates: TEMPLATE_IDS.map((id) => {
              const t = PALETTE_TEMPLATES[id];
              return {
                id,
                name: t.name,
                description: t.description,
              };
            }),
          },
        };
      } catch (error) {
        log("error", "Failed to list templates", { error });
        return {
          success: false,
          error: {
            code: "LIST_TEMPLATES_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to list templates",
          },
        };
      }
    },
  }),

  /**
   * Get current design system colors
   *
   * Returns the current color configuration from site settings.
   * Returns the canonical color configuration from the design system,
   * with site settings only used as a legacy fallback.
   *
   * @returns Current design system colors
   */
  getColors: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const colors = await getStoredDesignSystemColors(adapter);

        return {
          success: true,
          data: {
            colors,
          },
        };
      } catch (error) {
        log("error", "Failed to get colors", { error });
        return {
          success: false,
          error: {
            code: "GET_COLORS_FAILED",
            message:
              error instanceof Error ? error.message : "Failed to get colors",
          },
        };
      }
    },
  }),

  getVariableManagerBootstrap: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystemSegments(adapter, [
          "global-styles",
          "tokens-colors",
        ]);
        const colors =
          createDesignSystemColorsFromUniversalDesignSystem(designSystem);

        return {
          success: true,
          data: {
            globalStyles: designSystem.globalStyles,
            colors,
          },
        };
      } catch (error) {
        log("error", "Failed to get variable manager bootstrap", { error });
        return {
          success: false,
          error: {
            code: "GET_VARIABLE_MANAGER_BOOTSTRAP_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load variable manager data",
          },
        };
      }
    },
  }),
};
