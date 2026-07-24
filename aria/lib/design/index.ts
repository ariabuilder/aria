/**
 * Template support, shade generation, and export/import.
 */

export type {
  ColorPaletteShades,
  ColorPalette,
  SemanticColors,
  TemplateColorBases,
  PaletteTemplate,
  DesignSystemColors,
  DesignSystemExport,
  ColorShade,
  UnoThemeColors,
  CSSVariables,
} from "./types";

export {
  COLOR_SHADES,
  ColorPaletteShadesSchema,
  ColorPaletteSchema,
  SemanticColorsSchema,
  PaletteTemplateSchema,
  TemplateColorBasesSchema,
  DesignSystemColorsSchema,
  DesignSystemExportSchema,
} from "./types";

export {
  generateShades,
  generatePerceptualShades,
  generateNaturalShades,
  generateNeutralShades,
  generateNeutralPalette,
  generateBrandPalette,
  generateMutedPalette,
  expandTemplateColorBases,
  mixColors,
  isLightColor,
  getContrastText,
  adjustBrightness,
} from "./shades";

export type { PerceptualShadeOptions } from "./shades";

export {
  ContrastPairInputSchema,
  ContrastEvaluationSchema,
  getRelativeLuminance,
  getContrastRatio,
  evaluateContrastPair,
  formatContrastRatio,
  resolveEffectiveBackgroundColor,
  pickReadableTextColor,
} from "./colorContrast";

export type {
  ContrastPairInput,
  ContrastEvaluation,
  PickReadableTextColorOptions,
  ReadableTextColor,
} from "./colorContrast";

export {
  PALETTE_TEMPLATES,
  TEMPLATE_IDS,
  REMOVED_TEMPLATE_IDS,
  getTemplate,
  getDefaultTemplate,
  getMinimalTemplate,
  normalizeTemplateId,
  expandTemplateToPalettes,
  templateToUnoColors,
  templateToCSSVariables,
} from "./palettes";

export type { ThemePaletteName } from "./palettes";

export {
  EXPORT_VERSION,
  EXPORT_FILE_EXTENSION,
  EXPORT_MIME_TYPE,
  createExport,
  exportToJSON,
  exportToBlob,
  downloadExport,
  copyToClipboard,
  importFromJSON,
  importFromFile,
  importFromClipboard,
  colorsToUnoTheme,
  unoThemeToColors,
  isValidHexColor,
  isValidExport,
  getExportValidationErrors,
} from "./export";

export type { ImportResult } from "./export";
