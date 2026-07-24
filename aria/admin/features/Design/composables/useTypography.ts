/**
 * State management for typography settings. A clean API for components without prop drilling.
 */

import { ref, computed, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { log } from "@/lib/utils/logger";
import {
  DEFAULT_TYPOGRAPHY_FAMILIES,
  DEFAULT_TYPOGRAPHY_SCALE,
} from "../../../../lib/styles/defaultTypography";
import {
  FontConfigActionSuccessSchema,
  TypographyConfigSchema,
  TypographyLoadActionSuccessSchema,
  TypographySaveActionSuccessSchema,
  unwrapFontActionResult,
  unwrapTypographyDesignSystemActionResult,
} from "./typographyActionResults";

export interface TypeScaleStep {
  id: string;
  label: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
}

export interface TypographyConfig {
  families: {
    body: string;
    heading: string;
    mono: string;
  };
  scale: TypeScaleStep[];
  headingOverrides?: Record<string, string>;
  bodyOverrides?: Record<string, string>;
}

export interface FontOption {
  label: string;
  family: string;
  source: "system" | "custom" | "google";
  category?: "sans-serif" | "serif" | "mono" | "display";
}

export interface TypePreset {
  id: string;
  label: string;
  ratio: ScaleRatio;
  spacing: SpacingStyle;
  overallScale?: number;
  families?: Partial<TypographyConfig["families"]>;
}

export type SpacingStyle = "compact" | "normal" | "relaxed" | "airy";
export type ScaleRatio =
  | "minor-second"
  | "major-second"
  | "minor-third"
  | "major-third"
  | "perfect-fourth"
  | "perfect-fifth";

export const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  families: {
    body: DEFAULT_TYPOGRAPHY_FAMILIES.body,
    heading: DEFAULT_TYPOGRAPHY_FAMILIES.heading,
    mono: "ui-monospace, monospace",
  },
  scale: DEFAULT_TYPOGRAPHY_SCALE.map((step) => ({ ...step })),
  headingOverrides: {},
  bodyOverrides: {},
};

export const SYSTEM_FONTS: FontOption[] = [
  {
    label: "Outfit",
    family: "Outfit, -apple-system, BlinkMacSystemFont, sans-serif",
    source: "system",
    category: "sans-serif",
  },
  {
    label: "System Sans",
    family: "-apple-system, BlinkMacSystemFont, sans-serif",
    source: "system",
    category: "sans-serif",
  },
  {
    label: "Monospace",
    family: "ui-monospace, monospace",
    source: "system",
    category: "mono",
  },
];

export const SCALE_RATIOS: Record<ScaleRatio, number> = {
  "minor-second": 1.067,
  "major-second": 1.125,
  "minor-third": 1.2,
  "major-third": 1.25,
  "perfect-fourth": 1.333,
  "perfect-fifth": 1.5,
};

export const SPACING_MULTIPLIERS: Record<SpacingStyle, number> = {
  compact: 0.85,
  normal: 1,
  relaxed: 1.15,
  airy: 1.3,
};

export const TYPE_PRESETS: TypePreset[] = [
  {
    id: "editorial",
    label: "Editorial",
    ratio: "perfect-fourth",
    spacing: "relaxed",
    overallScale: 102,
  },
  {
    id: "product",
    label: "Product",
    ratio: "major-third",
    spacing: "normal",
    overallScale: 100,
  },
  {
    id: "technical",
    label: "Technical",
    ratio: "minor-third",
    spacing: "compact",
    overallScale: 96,
  },
];

export const TYPOGRAPHY_FONTS_UPDATED_EVENT = "aria:fonts-updated";

const typography: Ref<TypographyConfig> = ref(
  structuredClone(DEFAULT_TYPOGRAPHY),
);
const isLoading = ref(false);
const isSaving = ref(false);
const hasUnsavedChanges = ref(false);

const overallScale = ref(100);
const spacingStyle = ref<SpacingStyle>("normal");
const scaleRatio = ref<ScaleRatio>("minor-third");
const customFontOptions: Ref<FontOption[]> = ref([]);
const googleFontOptions: Ref<FontOption[]> = ref([]);

const bodyFont = computed(() => typography.value.families.body);
const headingFont = computed(() => typography.value.families.heading);
const monoFont = computed(() => typography.value.families.mono);

const fontOptions = computed<FontOption[]>(() => {
  const deduped = new Map<string, FontOption>();

  for (const font of SYSTEM_FONTS) {
    deduped.set(font.family, font);
  }

  for (const font of googleFontOptions.value) {
    deduped.set(font.family, font);
  }

  for (const font of customFontOptions.value) {
    deduped.set(font.family, font);
  }

  for (const family of Object.values(typography.value.families)) {
    if (!deduped.has(family)) {
      deduped.set(family, {
        label: family,
        family,
        source: "custom",
      });
    }
  }

  return Array.from(deduped.values());
});

const fontsByCategory = computed(() => {
  const grouped: Record<string, FontOption[]> = {
    "sans-serif": [],
    serif: [],
    mono: [],
    display: [],
  };

  for (const font of fontOptions.value) {
    const cat = font.category || "sans-serif";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(font);
  }

  return grouped;
});

function cloneConfig(config: TypographyConfig): TypographyConfig {
  return {
    families: { ...config.families },
    scale: config.scale.map((step) => ({ ...step })),
    headingOverrides: config.headingOverrides
      ? { ...config.headingOverrides }
      : {},
    bodyOverrides: config.bodyOverrides ? { ...config.bodyOverrides } : {},
  };
}

function getDefaultScaleStep(stepId: string): TypeScaleStep | undefined {
  return DEFAULT_TYPOGRAPHY.scale.find((step) => step.id === stepId);
}

export function resolveNearestScaleRatio(scale: TypeScaleStep[]): ScaleRatio {
  const baseIndex = scale.findIndex((step) => step.id === "base");
  const baseStep = scale[baseIndex];

  if (!baseStep || baseStep.size <= 0) {
    return "minor-third";
  }

  let bestRatio: ScaleRatio = "minor-third";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [ratio, ratioValue] of Object.entries(SCALE_RATIOS) as Array<
    [ScaleRatio, number]
  >) {
    const score = scale.reduce((total, step, index) => {
      const distance = index - baseIndex;
      const expectedSize = Math.round(
        baseStep.size * Math.pow(ratioValue, distance),
      );

      return total + Math.abs(expectedSize - step.size);
    }, 0);

    if (score < bestScore) {
      bestScore = score;
      bestRatio = ratio;
    }
  }

  return bestRatio;
}

export function resolveNearestSpacingStyle(
  scale: TypeScaleStep[],
): SpacingStyle {
  let bestStyle: SpacingStyle = "normal";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [style, multiplier] of Object.entries(
    SPACING_MULTIPLIERS,
  ) as Array<[SpacingStyle, number]>) {
    const score = scale.reduce((total, step) => {
      const defaultStep = getDefaultScaleStep(step.id);
      if (!defaultStep || defaultStep.size <= 0) {
        return total;
      }

      const defaultRatio = defaultStep.lineHeight / defaultStep.size;
      const expectedLineHeight = Math.max(
        step.size,
        Math.round(step.size * defaultRatio * multiplier),
      );

      return total + Math.abs(expectedLineHeight - step.lineHeight);
    }, 0);

    if (score < bestScore) {
      bestScore = score;
      bestStyle = style;
    }
  }

  return bestStyle;
}

function updateFamily(
  role: keyof TypographyConfig["families"],
  family: string,
) {
  typography.value.families[role] = family;
  hasUnsavedChanges.value = true;
}

function updateHeadingOverride(stepId: string, family: string) {
  if (!typography.value.headingOverrides) {
    typography.value.headingOverrides = {};
  }

  if (family === typography.value.families.heading) {
    delete typography.value.headingOverrides[stepId];
    hasUnsavedChanges.value = true;
    return;
  }

  typography.value.headingOverrides[stepId] = family;
  hasUnsavedChanges.value = true;
}

function clearHeadingOverride(stepId: string) {
  if (typography.value.headingOverrides) {
    delete typography.value.headingOverrides[stepId];
  }
  hasUnsavedChanges.value = true;
}

function clearAllHeadingOverrides() {
  typography.value.headingOverrides = {};
  hasUnsavedChanges.value = true;
}

function updateBodyOverride(stepId: string, family: string) {
  if (!typography.value.bodyOverrides) {
    typography.value.bodyOverrides = {};
  }

  if (family === typography.value.families.body) {
    delete typography.value.bodyOverrides[stepId];
    hasUnsavedChanges.value = true;
    return;
  }

  typography.value.bodyOverrides[stepId] = family;
  hasUnsavedChanges.value = true;
}

function clearBodyOverride(stepId: string) {
  if (typography.value.bodyOverrides) {
    delete typography.value.bodyOverrides[stepId];
  }
  hasUnsavedChanges.value = true;
}

function clearAllBodyOverrides() {
  typography.value.bodyOverrides = {};
  hasUnsavedChanges.value = true;
}

function applyPreset(preset: TypePreset) {
  if (preset.families) {
    typography.value.families = {
      ...typography.value.families,
      ...preset.families,
    };
  }

  if (preset.overallScale !== undefined) {
    applyOverallScale(preset.overallScale);
  }

  applyScaleRatio(preset.ratio);
  applySpacingStyle(preset.spacing);
  hasUnsavedChanges.value = true;
}

function applyOverallScale(percent: number) {
  const factor = percent / 100;
  const baseFactor = overallScale.value / 100;
  const adjustment = factor / baseFactor;

  typography.value.scale = typography.value.scale.map((step) => ({
    ...step,
    size: Math.max(10, Math.round(step.size * adjustment)),
    lineHeight: Math.max(step.size, Math.round(step.lineHeight * adjustment)),
  }));

  overallScale.value = percent;
  hasUnsavedChanges.value = true;
}

function applySpacingStyle(style: SpacingStyle) {
  const multiplier = SPACING_MULTIPLIERS[style];
  const baseMultiplier = SPACING_MULTIPLIERS[spacingStyle.value];
  const adjustment = multiplier / baseMultiplier;

  typography.value.scale = typography.value.scale.map((step) => ({
    ...step,
    lineHeight: Math.max(step.size, Math.round(step.lineHeight * adjustment)),
  }));

  spacingStyle.value = style;
  hasUnsavedChanges.value = true;
}

function applyScaleRatio(ratio: ScaleRatio) {
  const ratioValue = SCALE_RATIOS[ratio];
  const baseIndex = typography.value.scale.findIndex((s) => s.id === "base");
  const baseSize = typography.value.scale[baseIndex]?.size || 16;

  // Only rescale steps above base (heading levels: lg, xl, 2xl, …).
  // Body and smaller steps (base, sm, xs) are left untouched so that
  // changing the heading scale doesn't affect body text sizes.
  typography.value.scale = typography.value.scale.map((step, index) => {
    if (index <= baseIndex) return step;

    const distance = index - baseIndex;
    const newSize = Math.round(baseSize * Math.pow(ratioValue, distance));
    const currentLineHeightRatio =
      step.size > 0 ? step.lineHeight / step.size : 1.5;
    return {
      ...step,
      size: newSize,
      lineHeight: Math.max(
        newSize,
        Math.round(newSize * currentLineHeightRatio),
      ),
    };
  });

  scaleRatio.value = ratio;
  hasUnsavedChanges.value = true;
}

function updateScaleStep(
  stepId: string,
  updates: Partial<Omit<TypeScaleStep, "id">>,
) {
  const step = typography.value.scale.find((s) => s.id === stepId);
  if (!step) return;

  Object.assign(step, updates);
  hasUnsavedChanges.value = true;
}

function resetToDefaults() {
  typography.value = structuredClone(DEFAULT_TYPOGRAPHY);
  overallScale.value = 100;
  spacingStyle.value = "normal";
  scaleRatio.value = "minor-third";
  hasUnsavedChanges.value = true;
}

function applyImportedTypographyState(config: TypographyConfig): void {
  typography.value = cloneConfig(config);

  const baseStep = typography.value.scale.find((s) => s.id === "base");
  if (baseStep) {
    overallScale.value = Math.round((baseStep.size / 16) * 100);
  }

  scaleRatio.value = resolveNearestScaleRatio(typography.value.scale);
  spacingStyle.value = resolveNearestSpacingStyle(typography.value.scale);
  hasUnsavedChanges.value = false;
}

function applyImportedTypography(config: TypographyConfig): void {
  applyImportedTypographyState(config);
}

async function loadTypography(options: { silent?: boolean } = {}) {
  isLoading.value = true;
  try {
    const [typographyResult] = await Promise.all([
      actions.designSystem.getTypography({}),
      loadFontOptions(),
    ]);

    const parsedTypography = unwrapTypographyDesignSystemActionResult(
      typographyResult,
      TypographyLoadActionSuccessSchema,
      "Failed to load typography",
      {
        source: "useTypography.loadTypography",
      },
    );

    if (!parsedTypography.success) {
      throw new Error(parsedTypography.error);
    }

    applyImportedTypographyState(parsedTypography.data.data.typography);
  } catch (error) {
    log("error", "[useTypography] Failed to load typography", { error });
    if (!options.silent) {
      toast.error("Failed to load typography settings");
    }
  } finally {
    isLoading.value = false;
  }
}

async function loadFontOptions() {
  try {
    const result = unwrapFontActionResult(
      await actions.fonts.getConfig({}),
      FontConfigActionSuccessSchema,
      "Failed to load font options",
      {
        source: "useTypography.loadFontOptions",
      },
    );

    if (!result.success) {
      return;
    }

    customFontOptions.value = result.data.data.customFonts.map((font) => ({
      label: font.name,
      family: font.family,
      source: "custom" as const,
    }));

    googleFontOptions.value = result.data.data.enabledGoogleFonts.map(
      (font) => ({
        label: font.family,
        family: font.family,
        source: "google" as const,
      }),
    );
  } catch (error) {
    log("error", "[useTypography] Failed to load font options", { error });
  }
}

async function saveTypography() {
  isSaving.value = true;
  try {
    const parsedTypography = TypographyConfigSchema.safeParse(
      cloneConfig(typography.value),
    );
    if (!parsedTypography.success) {
      throw new Error(
        parsedTypography.error.issues[0]?.message ??
          "Invalid typography configuration",
      );
    }

    const result = unwrapTypographyDesignSystemActionResult(
      await actions.designSystem.saveTypography({
        typography: parsedTypography.data,
      }),
      TypographySaveActionSuccessSchema,
      "Failed to save typography",
      {
        source: "useTypography.saveTypography",
      },
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    hasUnsavedChanges.value = false;
    toast.success("Typography saved");
  } catch (error) {
    log("error", "[useTypography] Failed to save typography", { error });
    toast.error("Failed to save typography");
  } finally {
    isSaving.value = false;
  }
}

export function useTypography() {
  return {
    typography,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    overallScale,
    spacingStyle,
    scaleRatio,

    bodyFont,
    headingFont,
    monoFont,
    fontOptions,
    fontsByCategory,

    updateFamily,
    updateHeadingOverride,
    clearHeadingOverride,
    clearAllHeadingOverrides,
    updateBodyOverride,
    clearBodyOverride,
    clearAllBodyOverrides,
    applyPreset,
    applyOverallScale,
    applySpacingStyle,
    applyScaleRatio,
    updateScaleStep,
    resetToDefaults,
    loadTypography,
    applyImportedTypography,
    loadFontOptions,
    saveTypography,
  };
}
