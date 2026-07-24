/**
 * Exports all composables for the Design feature. These
 * manage the design system state, styling, and appearance.
 */

export {
  useDesignTokens,
  designTokensState,
  type ColorScale,
  type SemanticColors,
  type TypographyConfig,
  type EffectsConfig,
  type DesignTokensState,
} from "./useDesignTokens";

export {
  useUtilityParser,
  type ParsedUtility,
  type UtilityParseResult,
} from "./useUtilityParser";

export {
  useStyleApplicator,
  type GeneratedConfig,
  type SaveResult,
  type ValidationResult,
} from "./useStyleApplicator";

export {
  useAppearance,
  type ColorScheme,
  type FontFamily,
  type ThemeId,
  type AppearanceSettings,
} from "./useAppearance";

export { applyAppearanceWithTransition } from "./applyAppearanceWithTransition";
export { useTheme } from "./useTheme";
export {
  THEME_REGISTRY,
  THEME_OPTIONS,
  type ThemeDefinition,
} from "../themes/registry";
export {
  COLOR_SCHEME_OPTIONS,
  type ColorSchemeOption,
} from "../themes/colorSchemeOptions";

export { useDesignSystem, type UseDesignSystemReturn } from "./useDesignSystem";

export {
  useFrameworkSettings,
  type UtilityEngineCard,
} from "./useFrameworkSettings";
export { useBreakpointsViewState } from "./useBreakpointsViewState";
export {
  useColorSystemViewState,
  COLOR_SHADES,
  SEMANTIC_TOKENS,
  type AccessibilityPairCard,
} from "./useColorSystemViewState";
export { useIconPackSettings } from "./useIconPackSettings";
export {
  useIconShowcase,
  type IconShowcaseItem,
} from "./useIconShowcase";
export { useDesignViewState } from "./useDesignViewState";
export {
  useDesignWorkbenchDialog,
  useDesignWorkbenchHighlightClass,
  type DesignWorkbenchView,
} from "./useDesignWorkbenchDialog";

// Typography management (new)
export {
  useTypography,
  type TypeScaleStep,
  type FontOption,
  type SpacingStyle,
  type ScaleRatio,
  DEFAULT_TYPOGRAPHY,
  SYSTEM_FONTS,
  SCALE_RATIOS,
  SPACING_MULTIPLIERS,
} from "./useTypography";
export { useGlobalStyles } from "./useGlobalStyles";
export { useVariableManagerTable } from "./useVariableManagerTable";

export { useDesignSection } from "./useDesignSection";
