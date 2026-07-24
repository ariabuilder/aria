/**
 * Typography scales - Visual effects (shadows, borders, etc. ) - Breakpoint configuration -.
 */

export { default as DesignView } from "./views/DesignView.vue";
export { default as FrameworkView } from "./views/FrameworkView.vue";
export { default as ColorSystemView } from "./views/ColorSystemView.vue";
export { default as FontView } from "./views/FontView.vue";
export { default as BreakpointsView } from "./views/BreakpointsView.vue";

export { default as DesignStage } from "./components/DesignStage.vue";

export { default as TypeFamilySelector } from "./components/TypeFamilySelector.vue";
export { default as FontManager } from "./components/font-manager/FontManager.vue";

export {
  useDesignTokens,
  designTokensState,
  type ColorScale,
  type SemanticColors,
  type TypographyConfig,
  type EffectsConfig,
  type DesignTokensState,
  useUtilityParser,
  type ParsedUtility,
  type UtilityParseResult,
  useStyleApplicator,
  type GeneratedConfig,
  type SaveResult,
  type ValidationResult,
  useAppearance,
  applyAppearanceWithTransition,
  type AppearanceSettings,
  type ColorScheme,
  type FontFamily,
  type ThemeId,
  THEME_REGISTRY,
  THEME_OPTIONS,
  type ThemeDefinition,
  COLOR_SCHEME_OPTIONS,
  type ColorSchemeOption,
  useTheme,
  // Typography (new)
  useTypography,
  type TypeScaleStep,
  type FontOption,
  type SpacingStyle,
  type ScaleRatio,
  DEFAULT_TYPOGRAPHY,
  SYSTEM_FONTS,
  SCALE_RATIOS,
  SPACING_MULTIPLIERS,
} from "./composables";

export { default as BreakpointsSettingsDialog } from "./dialogs/BreakpointsSettingsDialog.vue";
export { default as DesignWorkbenchDialog } from "./dialogs/DesignWorkbenchDialog.vue";
export { default as DesignWorkbenchTrigger } from "./components/DesignWorkbenchTrigger.vue";
export {
  useDesignWorkbenchDialog,
  useDesignWorkbenchHighlightClass,
  type DesignWorkbenchView,
} from "./composables/useDesignWorkbenchDialog";

// INPUTS (re-exported from Inspector)

export * from "./inputs";

export * from "./types";
