import { z } from "zod";
import type { DesignSystemColors, ColorPaletteShades } from "../design/types";
import type { CustomFont, GoogleFont, StylesData } from "../types/classes";

import type { BreakpointDefinition } from "../types/nodes";
import {
  CustomClassSchema,
  BreakpointSchema,
  CSSRuleValueSchema,
  type CustomClass as SemanticClass,
} from "../schemas/classEditor";
import { BREAKPOINT_ORDER, BREAKPOINT_WIDTHS } from "../schemas/classEditor";
import { StylesSchema } from "../schemas/storage";
import { normalizeLegacyDefaultTypographyLetterSpacing } from "./defaultTypography";
import {
  compareBreakpointsLargestFirst,
  compareDesktopFirstBreakpointOrder,
  DEFAULT_DESKTOP_CANVAS_WIDTH,
  DEFAULT_DESKTOP_MIN_WIDTH,
  DEFAULT_MOBILE_CANVAS_WIDTH,
  DEFAULT_MOBILE_MIN_WIDTH,
  DEFAULT_TABLET_MIN_WIDTH,
  DESKTOP_BASE_BREAKPOINT,
  DESKTOP_BASE_LABEL,
} from "./responsiveBreakpoints";

type LegacyCompiledStylesFields = {
  compiledTailwindCSS?: string;
  tailwindClasses?: string[];
};

export type StylesDataLike = StylesData &
  LegacyCompiledStylesFields & {
    globalStyles?: GlobalStylesConfig;
  };

export type AuthoringMode = "utility" | "semantic" | "hybrid";

export type GlobalStyleTarget =
  | "body"
  | "heading"
  | "subheading"
  | "paragraph"
  | "link"
  | "button"
  | "input"
  | "section";

export const GLOBAL_STYLE_BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "muted",
  "destructive",
  "disabled",
] as const;

export type GlobalStyleButtonVariant =
  (typeof GLOBAL_STYLE_BUTTON_VARIANTS)[number];

export const GLOBAL_STYLE_VARIABLE_CATEGORIES = [
  "color",
  "spacing",
  "typography",
  "borders",
  "effects",
  "layout",
  "other",
] as const;

export type GlobalStyleVariableCategory =
  (typeof GLOBAL_STYLE_VARIABLE_CATEGORIES)[number];

export interface BodyGlobalStyle {
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  letterSpacing: string;
  maxWidth: string;
  margin: string;
  padding: string;
  textWrap?: string;
}

export interface HeadingGlobalStyle {
  color: string;
  fontFamily: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  textWrap?: string;
}

export interface SubheadingGlobalStyle {
  color: string;
  fontFamily: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface ParagraphGlobalStyle {
  color: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  maxWidth: string;
  textWrap?: string;
}

export interface LinkGlobalStyle {
  color: string;
  hoverColor: string;
  visitedColor: string;
  textDecoration: string;
  underlineOffset: string;
  fontWeight: string;
}

export interface ButtonVariantGlobalStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
  hoverBackgroundColor: string;
  hoverColor: string;
  hoverBorderColor: string;
}

export interface ButtonBaseGlobalStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  borderRadius: string;
  paddingX: string;
  paddingY: string;
  borderWidth: string;
}

export interface ButtonGlobalStyle {
  base: ButtonBaseGlobalStyle;
  variants: Record<GlobalStyleButtonVariant, ButtonVariantGlobalStyle>;
}

export interface InputGlobalStyle {
  backgroundColor: string;
  color: string;
  placeholderColor: string;
  borderColor: string;
  borderRadius: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  paddingX: string;
  paddingY: string;
  focusRingColor: string;
}

export interface SectionGlobalStyle {
  contentMaxWidth: string;
  horizontalPadding: string;
  verticalPadding: string;
  sectionGap: string;
}

export interface ContainerGlobalStyle {
  maxWidth: string;
  width: string;
}

export interface RootGlobalStyle {
  fontSize: string;
  margin: string;
  padding: string;
  cursor: string;
  caretColor: string;
  selectionColor: string;
  selectionBackgroundColor: string;
  scrollBehavior: string;
  outlineColor: string;
  outlineWidth: string;
  outlineStyle: string;
  borderColor: string;
  borderRadius: string;
}

export interface GlobalStyleDefaults {
  body: BodyGlobalStyle;
  heading: HeadingGlobalStyle;
  subheading: SubheadingGlobalStyle;
  paragraph: ParagraphGlobalStyle;
  link: LinkGlobalStyle;
  button: ButtonGlobalStyle;
  input: InputGlobalStyle;
  section: SectionGlobalStyle;
  container: ContainerGlobalStyle;
  root: RootGlobalStyle;
}

export interface GlobalStyleVariableDefinition {
  label: string;
  value: string;
  category: GlobalStyleVariableCategory;
  description?: string;
}

export interface GlobalStyleVariableAlias {
  label: string;
  sourceType: "token" | "custom";
  sourceKey: string;
  fallback?: string;
}

export interface GlobalStyleVariables {
  custom: Record<string, GlobalStyleVariableDefinition>;
  aliases: Record<string, GlobalStyleVariableAlias>;
}

export interface GlobalStylesConfig {
  defaults: GlobalStyleDefaults;
  variables: GlobalStyleVariables;
}

export interface UniversalBreakpointItem {
  id: string;
  label: string;
  icon: string;
  minWidth: number;
  canvasWidth: number | null;
  enabled: boolean;
  isDefault: boolean;
  order: number;
}

export interface UniversalDesignSystem {
  schemaVersion: 2;
  authoring: {
    preferredMode: AuthoringMode;
    utilityEngine: "unocss";
  };
  tokens: {
    colors: {
      palette: Record<string, string>;
      paletteLabels?: Record<string, string>;
      paletteAliases?: Record<string, string>;
      semantic: Record<string, string>;
      gradients: Record<string, string>;
    };
    spacing: Record<string, string>;
    typography: {
      families: Record<string, string>;
      sizes: Record<string, string>;
      weights: Record<string, string>;
      lineHeights: Record<string, string>;
      letterSpacing: Record<string, string>;
    };
    borders: {
      widths: Record<string, string>;
      colors: Record<string, string>;
      radii: Record<string, string>;
    };
    effects: {
      shadows: Record<string, string>;
      opacity: Record<string, string>;
      transitions: Record<string, string>;
    };
    layering: {
      zIndex: Record<string, number>;
    };
  };
  breakpoints: {
    items: UniversalBreakpointItem[];
  };
  fonts: {
    uploaded: Record<string, CustomFont>;
    google: Record<string, GoogleFont>;
    assignments: Record<string, string>;
  };
  globalStyles: GlobalStylesConfig;
  semanticClasses: Record<string, SemanticClass>;
  contextRules: ContextRule[];
  animations: {
    keyframes: Record<
      string,
      { steps: Record<string, Record<string, string>> }
    >;
  };
  utilities: {
    safelist: string[];
    shortcuts: Record<string, string>;
  };
  artifacts: {
    baseCSS: string;
    baseCSSHash: string;
    customClassesCSS: string;
    customFontsCSS: string;
    compiledUnoCSS: string;
    globalCSS: string;
    globalCSSHash: string;
    utilityCSS: string;
    utilityCSSHash: string;
    unocssClasses: string[];
    lastCompiled: string;
  };
}

const UploadedFontSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string(),
  formats: z.array(
    z.object({
      format: z.string(),
      url: z.string(),
    }),
  ),
  weight: z.string().optional(),
  style: z.string().optional(),
});

const GoogleFontSchema = z.object({
  id: z.string(),
  family: z.string(),
  variants: z.array(z.string()),
  googleFontsURL: z.string(),
});

const CssValueSchema = z.string();

export const CssCustomPropertyKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+$/i);

export const VariableSourceTypeSchema = z.enum(["token", "custom"]);

export const GlobalStyleVariableCategorySchema = z.enum(
  GLOBAL_STYLE_VARIABLE_CATEGORIES,
);

export const BodyGlobalStyleSchema = z.object({
  backgroundColor: CssValueSchema,
  color: CssValueSchema,
  fontFamily: CssValueSchema,
  fontSize: CssValueSchema,
  lineHeight: CssValueSchema,
  fontWeight: CssValueSchema,
  letterSpacing: CssValueSchema,
  maxWidth: CssValueSchema.optional().default(""),
  margin: CssValueSchema.optional().default("0"),
  padding: CssValueSchema.optional().default("0"),
  textWrap: CssValueSchema.optional(),
});

export const HeadingGlobalStyleSchema = z.object({
  color: CssValueSchema,
  fontFamily: CssValueSchema,
  fontWeight: CssValueSchema,
  lineHeight: CssValueSchema,
  letterSpacing: CssValueSchema,
  textTransform: CssValueSchema,
  textWrap: CssValueSchema.optional(),
});

export const SubheadingGlobalStyleSchema = z.object({
  color: CssValueSchema,
  fontFamily: CssValueSchema,
  fontWeight: CssValueSchema,
  lineHeight: CssValueSchema,
  letterSpacing: CssValueSchema,
});

export const ParagraphGlobalStyleSchema = z.object({
  color: CssValueSchema,
  fontFamily: CssValueSchema,
  fontSize: CssValueSchema,
  lineHeight: CssValueSchema,
  letterSpacing: CssValueSchema,
  maxWidth: CssValueSchema,
  textWrap: CssValueSchema.optional(),
});

export const LinkGlobalStyleSchema = z.object({
  color: CssValueSchema,
  hoverColor: CssValueSchema,
  visitedColor: CssValueSchema,
  textDecoration: CssValueSchema,
  underlineOffset: CssValueSchema,
  fontWeight: CssValueSchema,
});

export const ButtonVariantGlobalStyleSchema = z.object({
  backgroundColor: CssValueSchema,
  color: CssValueSchema,
  borderColor: CssValueSchema,
  hoverBackgroundColor: CssValueSchema,
  hoverColor: CssValueSchema,
  hoverBorderColor: CssValueSchema,
});

export const ButtonBaseGlobalStyleSchema = z.object({
  fontFamily: CssValueSchema,
  fontSize: CssValueSchema,
  fontWeight: CssValueSchema,
  lineHeight: CssValueSchema,
  letterSpacing: CssValueSchema,
  borderRadius: CssValueSchema,
  paddingX: CssValueSchema,
  paddingY: CssValueSchema,
  borderWidth: CssValueSchema,
});

export const ButtonGlobalStyleSchema = z.object({
  base: ButtonBaseGlobalStyleSchema,
  variants: z.object({
    primary: ButtonVariantGlobalStyleSchema,
    secondary: ButtonVariantGlobalStyleSchema,
    muted: ButtonVariantGlobalStyleSchema,
    destructive: ButtonVariantGlobalStyleSchema,
    disabled: ButtonVariantGlobalStyleSchema,
  }),
});

export const InputGlobalStyleSchema = z.object({
  backgroundColor: CssValueSchema,
  color: CssValueSchema,
  placeholderColor: CssValueSchema,
  borderColor: CssValueSchema,
  borderRadius: CssValueSchema,
  fontFamily: CssValueSchema,
  fontSize: CssValueSchema,
  lineHeight: CssValueSchema,
  paddingX: CssValueSchema,
  paddingY: CssValueSchema,
  focusRingColor: CssValueSchema,
});

export const SectionGlobalStyleSchema = z.object({
  contentMaxWidth: CssValueSchema,
  horizontalPadding: CssValueSchema,
  verticalPadding: CssValueSchema,
  sectionGap: CssValueSchema,
});

export const ContainerGlobalStyleSchema = z
  .object({
    maxWidth: CssValueSchema,
    width: CssValueSchema,
  })
  .default({
    maxWidth: "",
    width: "",
  });

export const RootGlobalStyleSchema = z
  .object({
    fontSize: CssValueSchema,
    margin: CssValueSchema.optional().default("0"),
    padding: CssValueSchema.optional().default("0"),
    cursor: CssValueSchema,
    caretColor: CssValueSchema,
    selectionColor: CssValueSchema,
    selectionBackgroundColor: CssValueSchema,
    scrollBehavior: CssValueSchema,
    outlineColor: CssValueSchema,
    outlineWidth: CssValueSchema,
    outlineStyle: CssValueSchema,
    borderColor: CssValueSchema,
    borderRadius: CssValueSchema,
  })
  .default({
    fontSize: "",
    margin: "0",
    padding: "0",
    cursor: "",
    caretColor: "",
    selectionColor: "",
    selectionBackgroundColor: "",
    scrollBehavior: "",
    outlineColor: "",
    outlineWidth: "",
    outlineStyle: "",
    borderColor: "",
    borderRadius: "",
  });

export const GlobalStyleDefaultsSchema = z.object({
  body: BodyGlobalStyleSchema,
  heading: HeadingGlobalStyleSchema,
  subheading: SubheadingGlobalStyleSchema,
  paragraph: ParagraphGlobalStyleSchema,
  link: LinkGlobalStyleSchema,
  button: ButtonGlobalStyleSchema,
  input: InputGlobalStyleSchema,
  section: SectionGlobalStyleSchema,
  container: ContainerGlobalStyleSchema,
  root: RootGlobalStyleSchema,
});

export const GlobalStyleVariableDefinitionSchema = z.object({
  label: z.string().trim().min(1),
  value: CssValueSchema,
  category: GlobalStyleVariableCategorySchema,
  description: z.string().optional(),
});

export const GlobalStyleVariableAliasSchema = z.object({
  label: z.string().trim().min(1),
  sourceType: VariableSourceTypeSchema,
  sourceKey: z.string().trim(),
  fallback: CssValueSchema.optional(),
});

export const GlobalStyleVariablesSchema = z.object({
  custom: z.record(
    CssCustomPropertyKeySchema,
    GlobalStyleVariableDefinitionSchema,
  ),
  aliases: z.record(CssCustomPropertyKeySchema, GlobalStyleVariableAliasSchema),
});

export const GlobalStylesConfigSchema = z.object({
  defaults: GlobalStyleDefaultsSchema,
  variables: GlobalStyleVariablesSchema,
});

export const UniversalBreakpointItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().min(1),
  minWidth: z.number().min(0),
  canvasWidth: z.number().min(0).nullable(),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  order: z.int().min(0),
});

const LegacySiteBreakpointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().min(1).default("Monitor"),
  width: z.number().min(0).nullable(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  order: z.int().min(0).optional(),
});

export const LegacySiteBreakpointsSchema = z.array(LegacySiteBreakpointSchema);
type LegacySiteBreakpoint = z.infer<typeof LegacySiteBreakpointSchema>;

export type UniversalBreakpointInput = z.infer<
  typeof UniversalBreakpointItemSchema
>;

export const ContextRuleSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1).max(256),
  breakpoint: BreakpointSchema.optional(),
  rules: z.array(CSSRuleValueSchema),
});
export type ContextRule = z.infer<typeof ContextRuleSchema>;

export const UniversalDesignSystemSchema = z.object({
  schemaVersion: z.literal(2),
  authoring: z.object({
    preferredMode: z.enum(["utility", "semantic", "hybrid"]),
    utilityEngine: z.literal("unocss"),
  }),
  tokens: z.object({
    colors: z.object({
      palette: z.record(z.string(), z.string()),
      paletteLabels: z.record(z.string(), z.string()).optional(),
      paletteAliases: z.record(z.string(), z.string()).optional(),
      semantic: z.record(z.string(), z.string()),
      gradients: z.record(z.string(), z.string()),
    }),
    spacing: z.record(z.string(), z.string()),
    typography: z.object({
      families: z.record(z.string(), z.string()),
      sizes: z.record(z.string(), z.string()),
      weights: z.record(z.string(), z.string()),
      lineHeights: z.record(z.string(), z.string()),
      letterSpacing: z.record(z.string(), z.string()),
    }),
    borders: z.object({
      widths: z.record(z.string(), z.string()),
      colors: z.record(z.string(), z.string()),
      radii: z.record(z.string(), z.string()),
    }),
    effects: z.object({
      shadows: z.record(z.string(), z.string()),
      opacity: z.record(z.string(), z.string()),
      transitions: z.record(z.string(), z.string()),
    }),
    layering: z.object({
      zIndex: z.record(z.string(), z.number()),
    }),
  }),
  breakpoints: z.object({
    items: z.array(UniversalBreakpointItemSchema),
  }),
  fonts: z.object({
    uploaded: z.record(z.string(), UploadedFontSchema),
    google: z.record(z.string(), GoogleFontSchema),
    assignments: z.record(z.string(), z.string()),
  }),
  globalStyles: GlobalStylesConfigSchema,
  semanticClasses: z.record(z.string(), CustomClassSchema),
  contextRules: z.array(ContextRuleSchema).default([]),
  animations: z
    .object({
      keyframes: z.record(
        z.string(),
        z.object({
          steps: z.record(z.string(), z.record(z.string(), z.string())),
        }),
      ),
    })
    .default({ keyframes: {} }),
  utilities: z.object({
    safelist: z.array(z.string()),
    shortcuts: z.record(z.string(), z.string()),
  }),
  artifacts: z.object({
    baseCSS: z.string(),
    baseCSSHash: z.string(),
    customClassesCSS: z.string(),
    customFontsCSS: z.string(),
    compiledUnoCSS: z.string(),
    globalCSS: z.string(),
    globalCSSHash: z.string(),
    utilityCSS: z.string(),
    utilityCSSHash: z.string(),
    unocssClasses: z.array(z.string()),
    lastCompiled: z.string(),
  }),
});

const UniversalDesignSystemV1Schema = z.object({
  schemaVersion: z.literal(1),
  authoring: z.object({
    preferredMode: z.enum(["utility", "semantic", "hybrid"]),
    utilityEngine: z.literal("unocss"),
  }),
  tokens: z.object({
    colors: z.object({
      palette: z.record(z.string(), z.string()),
      semantic: z.record(z.string(), z.string()),
      gradients: z.record(z.string(), z.string()),
    }),
    spacing: z.record(z.string(), z.string()),
    typography: z.object({
      families: z.record(z.string(), z.string()),
      sizes: z.record(z.string(), z.string()),
      weights: z.record(z.string(), z.string()),
      lineHeights: z.record(z.string(), z.string()),
      letterSpacing: z.record(z.string(), z.string()),
    }),
    borders: z.object({
      widths: z.record(z.string(), z.string()),
      colors: z.record(z.string(), z.string()),
      radii: z.record(z.string(), z.string()),
    }),
    effects: z.object({
      shadows: z.record(z.string(), z.string()),
      opacity: z.record(z.string(), z.string()),
      transitions: z.record(z.string(), z.string()),
    }),
    layering: z.object({
      zIndex: z.record(z.string(), z.number()),
    }),
  }),
  breakpoints: z.object({
    items: z.array(UniversalBreakpointItemSchema),
  }),
  fonts: z.object({
    uploaded: z.record(z.string(), UploadedFontSchema),
    google: z.record(z.string(), GoogleFontSchema),
    assignments: z.record(z.string(), z.string()),
  }),
  semanticClasses: z.record(z.string(), CustomClassSchema),
  utilities: z.object({
    safelist: z.array(z.string()),
    shortcuts: z.record(z.string(), z.string()),
  }),
  artifacts: z.object({
    baseCSS: z.string(),
    baseCSSHash: z.string(),
    customClassesCSS: z.string(),
    customFontsCSS: z.string(),
    compiledUnoCSS: z.string(),
    globalCSS: z.string(),
    globalCSSHash: z.string(),
    utilityCSS: z.string(),
    utilityCSSHash: z.string(),
    unocssClasses: z.array(z.string()),
    lastCompiled: z.string(),
  }),
});

const DESIGN_SYSTEM_SHADE_KEYS = [
  "25",
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

const DEFAULT_SEMANTIC_COLORS = {
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
} as const;

const BREAKPOINT_ICONS: Record<string, string> = {
  base: "Monitor",
  mobile: "Smartphone",
  xs: "Smartphone",
  sm: "Tablet",
  tablet: "Tablet",
  md: "Monitor",
  laptop: "Laptop",
  lg: "MonitorSpeaker",
  desktop: "Monitor",
  xl: "Tv",
  "2xl": "Tv2",
};

function normalizePaletteShades(
  shades: Partial<ColorPaletteShades>,
): ColorPaletteShades {
  const defaultShade = shades.DEFAULT ?? shades[500] ?? "#737373";

  return {
    25: shades[25] ?? shades[50] ?? defaultShade,
    50: shades[50] ?? shades[100] ?? defaultShade,
    100: shades[100] ?? shades[50] ?? shades[25] ?? defaultShade,
    200: shades[200] ?? shades[100] ?? defaultShade,
    300: shades[300] ?? shades[200] ?? defaultShade,
    400: shades[400] ?? shades[300] ?? defaultShade,
    500: shades[500] ?? shades.DEFAULT ?? defaultShade,
    600: shades[600] ?? shades[500] ?? defaultShade,
    700: shades[700] ?? shades[600] ?? defaultShade,
    800: shades[800] ?? shades[700] ?? defaultShade,
    900: shades[900] ?? shades[800] ?? defaultShade,
    950: shades[950] ?? shades[900] ?? defaultShade,
    DEFAULT: defaultShade,
  };
}

function createEmptyUniversalDesignSystem(): UniversalDesignSystem {
  return {
    schemaVersion: 2,
    authoring: {
      preferredMode: "semantic",
      utilityEngine: "unocss",
    },
    tokens: {
      colors: {
        palette: {},
        paletteLabels: {},
        paletteAliases: {},
        semantic: {},
        gradients: {},
      },
      spacing: {},
      typography: {
        families: {},
        sizes: {},
        weights: {},
        lineHeights: {},
        letterSpacing: {},
      },
      borders: {
        widths: {},
        colors: {},
        radii: {},
      },
      effects: {
        shadows: {},
        opacity: {},
        transitions: {},
      },
      layering: {
        zIndex: {},
      },
    },
    breakpoints: {
      items: createDefaultUniversalBreakpointItems(),
    },
    fonts: {
      uploaded: {},
      google: {},
      assignments: {},
    },
    globalStyles: createDefaultGlobalStylesConfig(),
    semanticClasses: {},
    contextRules: [],
    animations: {
      keyframes: {},
    },
    utilities: {
      safelist: [],
      shortcuts: {},
    },
    artifacts: {
      baseCSS: "",
      baseCSSHash: "",
      customClassesCSS: "",
      customFontsCSS: "",
      compiledUnoCSS: "",
      globalCSS: "",
      globalCSSHash: "",
      utilityCSS: "",
      utilityCSSHash: "",
      unocssClasses: [],
      lastCompiled: "",
    },
  };
}

export function createDefaultGlobalStylesConfig(): GlobalStylesConfig {
  const emptyButtonVariant = (): ButtonVariantGlobalStyle => ({
    backgroundColor: "",
    color: "",
    borderColor: "",
    hoverBackgroundColor: "",
    hoverColor: "",
    hoverBorderColor: "",
  });

  return {
    defaults: {
      body: {
        backgroundColor: "",
        color: "",
        fontFamily: "",
        fontSize: "",
        lineHeight: "",
        fontWeight: "",
        letterSpacing: "",
        maxWidth: "",
        margin: "0",
        padding: "0",
        textWrap: "",
      },
      heading: {
        color: "",
        fontFamily: "",
        fontWeight: "",
        lineHeight: "",
        letterSpacing: "",
        textTransform: "",
        textWrap: "",
      },
      subheading: {
        color: "",
        fontFamily: "",
        fontWeight: "",
        lineHeight: "",
        letterSpacing: "",
      },
      paragraph: {
        color: "",
        fontFamily: "",
        fontSize: "",
        lineHeight: "",
        letterSpacing: "",
        maxWidth: "",
        textWrap: "",
      },
      link: {
        color: "",
        hoverColor: "",
        visitedColor: "",
        textDecoration: "",
        underlineOffset: "",
        fontWeight: "",
      },
      button: {
        base: {
          fontFamily: "",
          fontSize: "",
          fontWeight: "",
          lineHeight: "",
          letterSpacing: "",
          borderRadius: "",
          paddingX: "",
          paddingY: "",
          borderWidth: "",
        },
        variants: {
          primary: emptyButtonVariant(),
          secondary: emptyButtonVariant(),
          muted: emptyButtonVariant(),
          destructive: emptyButtonVariant(),
          disabled: emptyButtonVariant(),
        },
      },
      input: {
        backgroundColor: "",
        color: "",
        placeholderColor: "",
        borderColor: "",
        borderRadius: "",
        fontFamily: "",
        fontSize: "",
        lineHeight: "",
        paddingX: "",
        paddingY: "",
        focusRingColor: "",
      },
      section: {
        contentMaxWidth: "",
        horizontalPadding: "",
        verticalPadding: "",
        sectionGap: "",
      },
      container: {
        maxWidth: "",
        width: "",
      },
      root: {
        fontSize: "",
        margin: "0",
        padding: "0",
        cursor: "",
        caretColor: "",
        selectionColor: "",
        selectionBackgroundColor: "",
        scrollBehavior: "",
        outlineColor: "",
        outlineWidth: "",
        outlineStyle: "",
        borderColor: "",
        borderRadius: "",
      },
    },
    variables: {
      custom: {},
      aliases: {},
    },
  };
}

function createBaseBreakpoint(): UniversalBreakpointItem {
  return {
    id: "base",
    label: DESKTOP_BASE_LABEL,
    icon: BREAKPOINT_ICONS.base,
    minWidth: DEFAULT_DESKTOP_MIN_WIDTH,
    canvasWidth: DEFAULT_DESKTOP_CANVAS_WIDTH,
    enabled: true,
    isDefault: true,
    order: 0,
  };
}

export function createDefaultUniversalBreakpointItems(): UniversalBreakpointItem[] {
  return normalizeUniversalBreakpointItems([
    createBaseBreakpoint(),
    {
      id: "laptop",
      label: "Laptop",
      icon: BREAKPOINT_ICONS.laptop,
      minWidth: 1024,
      canvasWidth: 1024,
      enabled: true,
      isDefault: true,
      order: 1,
    },
    {
      id: "tablet",
      label: "Tablet",
      icon: BREAKPOINT_ICONS.tablet,
      minWidth: DEFAULT_TABLET_MIN_WIDTH,
      canvasWidth: 768,
      enabled: true,
      isDefault: true,
      order: 2,
    },
    {
      id: "mobile",
      label: "Mobile",
      icon: BREAKPOINT_ICONS.mobile,
      minWidth: DEFAULT_MOBILE_MIN_WIDTH,
      canvasWidth: DEFAULT_MOBILE_CANVAS_WIDTH,
      enabled: true,
      isDefault: true,
      order: 3,
    },
  ]);
}

function sortUniversalBreakpointItems(
  breakpoints: readonly UniversalBreakpointItem[],
): UniversalBreakpointItem[] {
  return [...breakpoints].sort((left, right) =>
    compareDesktopFirstBreakpointOrder(
      left.id,
      left.minWidth,
      right.id,
      right.minWidth,
    ),
  );
}

export function normalizeUniversalBreakpointItems(
  breakpoints: readonly UniversalBreakpointItem[] | null | undefined,
): UniversalBreakpointItem[] {
  const parsed = z
    .array(UniversalBreakpointItemSchema)
    .safeParse(breakpoints ?? []);

  const deduped = new Map<string, UniversalBreakpointItem>();
  for (const breakpoint of parsed.success ? parsed.data : []) {
    deduped.set(breakpoint.id, { ...breakpoint });
  }

  const legacyDesktopBreakpoint = deduped.get("desktop");
  if (legacyDesktopBreakpoint) {
    deduped.delete("desktop");
  }

  // Ensure all system default breakpoints are present.
  // Users may disable them but they should always exist in the list.
  if (!deduped.has("laptop")) {
    deduped.set("laptop", {
      id: "laptop",
      label: "Laptop",
      icon: BREAKPOINT_ICONS.laptop,
      minWidth: 1024,
      canvasWidth: 1024,
      enabled: true,
      isDefault: true,
      order: 1,
    });
  }

  if (!deduped.has("tablet")) {
    deduped.set("tablet", {
      id: "tablet",
      label: "Tablet",
      icon: BREAKPOINT_ICONS.tablet,
      minWidth: DEFAULT_TABLET_MIN_WIDTH,
      canvasWidth: DEFAULT_TABLET_MIN_WIDTH,
      enabled: true,
      isDefault: true,
      order: 2,
    });
  }

  if (!deduped.has("mobile")) {
    deduped.set("mobile", {
      id: "mobile",
      label: "Mobile",
      icon: BREAKPOINT_ICONS.mobile,
      minWidth: DEFAULT_MOBILE_MIN_WIDTH,
      canvasWidth: DEFAULT_MOBILE_CANVAS_WIDTH,
      enabled: true,
      isDefault: true,
      order: 3,
    });
  }

  const baseBreakpoint = deduped.get("base") ?? createBaseBreakpoint();
  const resolvedBaseCanvasWidth =
    typeof baseBreakpoint.canvasWidth === "number" &&
    baseBreakpoint.canvasWidth >= DEFAULT_DESKTOP_MIN_WIDTH
      ? baseBreakpoint.canvasWidth
      : DEFAULT_DESKTOP_CANVAS_WIDTH;
  const resolvedBaseMinWidth = Math.max(
    DEFAULT_DESKTOP_MIN_WIDTH,
    Math.min(
      typeof baseBreakpoint.minWidth === "number" && baseBreakpoint.minWidth > 0
        ? baseBreakpoint.minWidth
        : resolvedBaseCanvasWidth,
      resolvedBaseCanvasWidth,
    ),
  );

  deduped.set("base", {
    ...baseBreakpoint,
    id: "base",
    label: DESKTOP_BASE_LABEL,
    icon: BREAKPOINT_ICONS.base,
    minWidth: resolvedBaseMinWidth,
    canvasWidth: resolvedBaseCanvasWidth,
    enabled: true,
    isDefault: true,
    order: 0,
  });

  return sortUniversalBreakpointItems(Array.from(deduped.values())).map(
    (breakpoint, index) => ({
      ...breakpoint,
      order: breakpoint.id === "base" ? 0 : index,
    }),
  );
}

export function hasCustomUniversalBreakpoints(
  breakpoints: readonly UniversalBreakpointItem[] | null | undefined,
): boolean {
  return normalizeUniversalBreakpointItems(breakpoints).some(
    (breakpoint) => !breakpoint.isDefault,
  );
}

export function createUniversalBreakpointsFromSiteBreakpoints(
  breakpoints: readonly LegacySiteBreakpoint[] | null | undefined,
): UniversalBreakpointItem[] {
  const parsed = LegacySiteBreakpointsSchema.safeParse(breakpoints ?? []);
  const siteBreakpoints = parsed.success ? parsed.data : [];

  if (siteBreakpoints.length === 0) {
    return createDefaultUniversalBreakpointItems();
  }

  const explicitWidths = siteBreakpoints
    .map((breakpoint) => breakpoint.width)
    .filter((width): width is number => typeof width === "number" && width > 0);
  const fallbackDesktopWidth = Math.max(
    1280,
    explicitWidths.length > 0 ? Math.max(...explicitWidths) : 0,
  );

  const projected = siteBreakpoints.map((breakpoint, index) => {
    const resolvedCanvasWidth =
      typeof breakpoint.width === "number" && breakpoint.width > 0
        ? breakpoint.width
        : null;
    const resolvedMinWidth = resolvedCanvasWidth ?? fallbackDesktopWidth;

    return {
      id: breakpoint.id,
      label: breakpoint.label,
      icon: breakpoint.icon,
      minWidth:
        breakpoint.id === "base" ? DEFAULT_DESKTOP_MIN_WIDTH : resolvedMinWidth,
      canvasWidth:
        breakpoint.id === "base"
          ? (resolvedCanvasWidth ?? DEFAULT_DESKTOP_CANVAS_WIDTH)
          : resolvedCanvasWidth,
      enabled: breakpoint.enabled,
      isDefault: breakpoint.isDefault,
      order: (breakpoint.order ?? index) + 1,
    } satisfies UniversalBreakpointItem;
  });

  return normalizeUniversalBreakpointItems([
    createBaseBreakpoint(),
    ...projected,
  ]);
}

export function resolveUniversalBreakpointItems(
  designSystem: UniversalDesignSystem,
  legacySiteBreakpoints?: readonly LegacySiteBreakpoint[] | null,
): UniversalBreakpointItem[] {
  const normalizedStored = normalizeUniversalBreakpointItems(
    designSystem.breakpoints.items,
  );

  if (hasCustomUniversalBreakpoints(normalizedStored)) {
    return normalizedStored;
  }

  const migrated = createUniversalBreakpointsFromSiteBreakpoints(
    legacySiteBreakpoints,
  );

  return hasCustomUniversalBreakpoints(migrated) ? migrated : normalizedStored;
}

export function createBreakpointDefinitionsFromUniversalBreakpoints(
  breakpoints: readonly UniversalBreakpointItem[] | null | undefined,
): BreakpointDefinition[] {
  return normalizeUniversalBreakpointItems(breakpoints)
    .filter(
      (breakpoint) =>
        breakpoint.id === DESKTOP_BASE_BREAKPOINT || breakpoint.enabled,
    )
    .sort((left, right) =>
      compareBreakpointsLargestFirst(
        {
          name: left.id,
          minWidth: left.minWidth,
          canvasWidth: left.canvasWidth,
          order: left.order,
        },
        {
          name: right.id,
          minWidth: right.minWidth,
          canvasWidth: right.canvasWidth,
          order: right.order,
        },
      ),
    )
    .map((breakpoint) => ({
      name: breakpoint.id,
      minWidth: `${breakpoint.minWidth}px`,
      canvasWidth: breakpoint.canvasWidth,
      label: breakpoint.label,
      order: breakpoint.order,
    }));
}

export function createBreakpointWidthMapFromUniversalBreakpoints(
  breakpoints: readonly UniversalBreakpointItem[] | null | undefined,
): Record<string, number> {
  const normalizedBreakpoints = normalizeUniversalBreakpointItems(breakpoints);
  const baseBreakpoint =
    normalizedBreakpoints.find((breakpoint) => breakpoint.id === "base") ??
    createBaseBreakpoint();
  const widthMap: Record<string, number> = { base: baseBreakpoint.minWidth };

  for (const breakpoint of normalizedBreakpoints) {
    widthMap[breakpoint.id] = breakpoint.minWidth;
  }

  return widthMap;
}

export function resolveBreakpointDefinitionsFromDesignSystem(
  designSystem: UniversalDesignSystem | null | undefined,
): BreakpointDefinition[] {
  const resolvedDesignSystem =
    designSystem ?? createDefaultUniversalDesignSystem();

  return createBreakpointDefinitionsFromUniversalBreakpoints(
    resolveUniversalBreakpointItems(resolvedDesignSystem),
  );
}

export function resolveBreakpointWidthMapFromDesignSystem(
  designSystem: UniversalDesignSystem | null | undefined,
): Record<string, number> {
  const resolvedDesignSystem =
    designSystem ?? createDefaultUniversalDesignSystem();

  return createBreakpointWidthMapFromUniversalBreakpoints(
    resolveUniversalBreakpointItems(resolvedDesignSystem),
  );
}

export function createUnoBreakpointsFromUniversalBreakpoints(
  breakpoints: readonly UniversalBreakpointItem[] | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    normalizeUniversalBreakpointItems(breakpoints)
      .filter((breakpoint) => breakpoint.enabled && breakpoint.minWidth > 0)
      .sort((left, right) => left.minWidth - right.minWidth)
      .map((breakpoint) => [breakpoint.id, `${breakpoint.minWidth}px`]),
  );
}

function mapFrameworkModeToAuthoringMode(
  frameworkMode: StylesDataLike["frameworkMode"],
): AuthoringMode {
  if (frameworkMode === "unocss") return "utility";
  if (frameworkMode === "custom") return "semantic";
  return "hybrid";
}

function formatBreakpointLabel(id: string): string {
  if (id === "2xl") return "2XL";

  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parsePixelWidth(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const normalized = value.trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return fallback;

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compareBreakpointIds(left: string, right: string): number {
  const leftIndex = BREAKPOINT_ORDER.indexOf(left);
  const rightIndex = BREAKPOINT_ORDER.indexOf(right);

  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
  if (leftIndex >= 0) return -1;
  if (rightIndex >= 0) return 1;

  return left.localeCompare(right);
}

function normalizeBreakpoints(
  tokenBreakpoints: Record<string, string> | undefined,
): UniversalBreakpointItem[] {
  const source = Object.fromEntries(
    Object.entries(tokenBreakpoints ?? {}).filter(([id]) => id !== "desktop"),
  );
  const ids = Array.from(new Set(["base", ...Object.keys(source)])).sort(
    compareBreakpointIds,
  );

  return ids.map((id, index) => {
    const fallbackWidth = BREAKPOINT_WIDTHS[id] ?? 1280;
    const minWidth =
      id === "base" ? 0 : parsePixelWidth(source[id], fallbackWidth);

    return {
      id,
      label: id === "base" ? DESKTOP_BASE_LABEL : formatBreakpointLabel(id),
      icon:
        id === "base"
          ? BREAKPOINT_ICONS.base
          : (BREAKPOINT_ICONS[id] ?? "Monitor"),
      minWidth:
        id === "base"
          ? Math.max(DEFAULT_DESKTOP_MIN_WIDTH, minWidth)
          : minWidth,
      canvasWidth: id === "base" ? DEFAULT_DESKTOP_CANVAS_WIDTH : minWidth,
      enabled: true,
      isDefault: id === "base",
      order: index,
    };
  });
}

export function normalizeStylesDataToUniversalDesignSystem(
  stylesData: StylesDataLike | null | undefined,
): UniversalDesignSystem {
  const normalized = createEmptyUniversalDesignSystem();

  if (!stylesData) return normalized;

  normalized.authoring.preferredMode = mapFrameworkModeToAuthoringMode(
    stylesData.frameworkMode,
  );

  normalized.tokens.colors.palette = { ...(stylesData.tokens?.colors ?? {}) };
  normalized.tokens.colors.gradients = {
    ...(stylesData.tokens?.gradients ?? {}),
  };
  normalized.tokens.spacing = { ...(stylesData.tokens?.spacing ?? {}) };
  normalized.tokens.typography.families = {
    ...(stylesData.tokens?.fonts ?? {}),
  };
  normalized.tokens.typography.sizes = {
    ...(stylesData.tokens?.fontSizes ?? {}),
  };
  normalized.tokens.typography.weights = {
    ...(stylesData.tokens?.fontWeights ?? {}),
  };
  normalized.tokens.typography.lineHeights = {
    ...(stylesData.tokens?.lineHeights ?? {}),
  };
  normalized.tokens.typography.letterSpacing = {
    ...(stylesData.tokens?.letterSpacing ?? {}),
  };
  normalized.tokens.borders.widths = {
    ...(stylesData.tokens?.borderWidths ?? {}),
  };
  normalized.tokens.borders.colors = {
    ...(stylesData.tokens?.borderColors ?? {}),
  };
  normalized.tokens.borders.radii = {
    ...(stylesData.tokens?.borderRadius ?? {}),
  };
  normalized.tokens.effects.shadows = {
    ...(stylesData.tokens?.boxShadows ?? {}),
  };
  normalized.tokens.effects.opacity = {
    ...(stylesData.tokens?.opacity ?? {}),
  };
  normalized.tokens.effects.transitions = {
    ...(stylesData.tokens?.transitions ?? {}),
  };
  normalized.tokens.layering.zIndex = {
    ...(stylesData.tokens?.zIndex ?? {}),
  };

  normalized.breakpoints.items = normalizeBreakpoints(
    stylesData.tokens?.breakpoints,
  );

  normalized.fonts.uploaded = { ...(stylesData.customFonts?.fonts ?? {}) };
  normalized.fonts.google = { ...(stylesData.customFonts?.googleFonts ?? {}) };
  normalized.fonts.assignments = { ...(stylesData.tokens?.fonts ?? {}) };
  normalized.globalStyles = GlobalStylesConfigSchema.parse(
    stylesData.globalStyles ?? normalized.globalStyles,
  );

  normalized.semanticClasses = { ...(stylesData.customClasses ?? {}) };
  normalized.contextRules = Array.isArray(
    (stylesData as { contextRules?: ContextRule[] }).contextRules,
  )
    ? [...(stylesData as { contextRules?: ContextRule[] }).contextRules!]
    : normalized.contextRules;
  normalized.animations = {
    keyframes: {
      ...(((stylesData as { animations?: UniversalDesignSystem["animations"] })
        .animations?.keyframes ??
        {}) as UniversalDesignSystem["animations"]["keyframes"]),
    },
  };

  normalized.artifacts.baseCSS = stylesData.baseCSS ?? "";
  normalized.artifacts.baseCSSHash = stylesData.baseCSSHash ?? "";
  normalized.artifacts.customClassesCSS = stylesData.customClassesCSS ?? "";
  normalized.artifacts.customFontsCSS = stylesData.customFontsCSS ?? "";
  normalized.artifacts.compiledUnoCSS =
    stylesData.compiledUnoCSS ?? stylesData.compiledTailwindCSS ?? "";
  normalized.artifacts.globalCSS = stylesData.globalCSS ?? "";
  normalized.artifacts.globalCSSHash = stylesData.globalCSSHash ?? "";
  normalized.artifacts.utilityCSS =
    stylesData.utilityCSS ??
    stylesData.compiledUnoCSS ??
    stylesData.compiledTailwindCSS ??
    "";
  normalized.artifacts.utilityCSSHash = stylesData.utilityCSSHash ?? "";
  normalized.artifacts.unocssClasses = [
    ...(stylesData.unocssClasses ?? stylesData.tailwindClasses ?? []),
  ];
  normalized.artifacts.lastCompiled = stylesData.lastCompiled ?? "";

  return normalized;
}

export function createUniversalDesignSystemFromStylesData(
  stylesData: StylesDataLike | null | undefined,
): UniversalDesignSystem {
  return normalizeStylesDataToUniversalDesignSystem(stylesData);
}

export function createDesignSystemColorsFromUniversalDesignSystem(
  designSystem: UniversalDesignSystem,
): DesignSystemColors {
  const paletteGroups: Record<string, Partial<ColorPaletteShades>> = {};

  for (const [tokenName, tokenValue] of Object.entries(
    designSystem.tokens.colors.palette,
  )) {
    const shadeMatch = tokenName.match(
      /^(.*)-(25|50|100|200|300|400|500|600|700|800|900|950)$/,
    );

    if (shadeMatch) {
      const [, paletteName, shade] = shadeMatch;
      const currentPalette = paletteGroups[paletteName] ?? {};
      currentPalette[Number(shade) as keyof ColorPaletteShades] = tokenValue;
      paletteGroups[paletteName] = currentPalette;
      continue;
    }

    const currentPalette = paletteGroups[tokenName] ?? {};
    currentPalette.DEFAULT = tokenValue;
    currentPalette[500] = currentPalette[500] ?? tokenValue;
    paletteGroups[tokenName] = currentPalette;
  }

  return {
    activeTemplateId: "custom",
    palettes: Object.fromEntries(
      Object.entries(paletteGroups).map(([paletteName, shades]) => [
        paletteName,
        normalizePaletteShades(shades),
      ]),
    ),
    customPalettes: Object.entries(paletteGroups).map(
      ([paletteName, shades]) => ({
        id: paletteName,
        name:
          designSystem.tokens.colors.paletteLabels?.[paletteName] ??
          paletteName,
        shades: normalizePaletteShades(shades),
        isCustom: true,
      }),
    ),
    paletteAliases: { ...(designSystem.tokens.colors.paletteAliases ?? {}) },
    semantic: {
      ...DEFAULT_SEMANTIC_COLORS,
      ...designSystem.tokens.colors.semantic,
    },
  };
}

export function applyDesignSystemColorsToUniversalDesignSystem(
  designSystem: UniversalDesignSystem,
  colors: DesignSystemColors,
): UniversalDesignSystem {
  const paletteTokens: Record<string, string> = {};
  const paletteLabels: Record<string, string> = {};
  const paletteMetadataById = new Map(
    (colors.customPalettes ?? []).map((palette) => [palette.id, palette]),
  );

  for (const [paletteName, shades] of Object.entries(colors.palettes)) {
    paletteTokens[paletteName] = shades.DEFAULT ?? shades[500];
    paletteLabels[paletteName] =
      paletteMetadataById.get(paletteName)?.name ?? paletteName;

    for (const shade of DESIGN_SYSTEM_SHADE_KEYS) {
      paletteTokens[`${paletteName}-${shade}`] = shades[shade];
    }
  }

  return {
    ...designSystem,
    tokens: {
      ...designSystem.tokens,
      colors: {
        ...designSystem.tokens.colors,
        palette: paletteTokens,
        paletteLabels,
        paletteAliases: { ...(colors.paletteAliases ?? {}) },
        semantic: { ...colors.semantic },
      },
    },
  };
}

export function createDefaultUniversalDesignSystem(): UniversalDesignSystem {
  return createEmptyUniversalDesignSystem();
}

export function getFrameworkModeFromUniversalDesignSystem(
  designSystem: UniversalDesignSystem,
): "unocss" | "custom" {
  return designSystem.authoring.preferredMode === "semantic"
    ? "custom"
    : "unocss";
}

export function getCustomFontsLibraryFromUniversalDesignSystem(
  designSystem: UniversalDesignSystem,
): NonNullable<StylesData["customFonts"]> {
  return {
    fonts: { ...designSystem.fonts.uploaded },
    googleFonts: { ...designSystem.fonts.google },
  };
}

export function createStylesDataSnapshotFromUniversalDesignSystem(
  designSystem: UniversalDesignSystem,
): StylesDataLike {
  return {
    tokens: {
      colors: { ...designSystem.tokens.colors.palette },
      gradients: { ...designSystem.tokens.colors.gradients },
      spacing: { ...designSystem.tokens.spacing },
      fonts: { ...designSystem.fonts.assignments },
      fontSizes: { ...designSystem.tokens.typography.sizes },
      fontWeights: { ...designSystem.tokens.typography.weights },
      lineHeights: { ...designSystem.tokens.typography.lineHeights },
      letterSpacing: { ...designSystem.tokens.typography.letterSpacing },
      borderWidths: { ...designSystem.tokens.borders.widths },
      borderColors: { ...designSystem.tokens.borders.colors },
      borderRadius: { ...designSystem.tokens.borders.radii },
      boxShadows: { ...designSystem.tokens.effects.shadows },
      opacity: { ...designSystem.tokens.effects.opacity },
      zIndex: { ...designSystem.tokens.layering.zIndex },
      transitions: { ...designSystem.tokens.effects.transitions },
      breakpoints: Object.fromEntries(
        designSystem.breakpoints.items
          .filter((breakpoint) => breakpoint.id !== "base")
          .map((breakpoint) => [breakpoint.id, `${breakpoint.minWidth}px`]),
      ),
    },
    customFonts: getCustomFontsLibraryFromUniversalDesignSystem(designSystem),
    customClasses: { ...designSystem.semanticClasses },
    globalStyles: GlobalStylesConfigSchema.parse(designSystem.globalStyles),
    baseCSS: designSystem.artifacts.baseCSS,
    baseCSSHash: designSystem.artifacts.baseCSSHash,
    frameworkMode: getFrameworkModeFromUniversalDesignSystem(designSystem),
    compiledUnoCSS: designSystem.artifacts.compiledUnoCSS,
    customClassesCSS: designSystem.artifacts.customClassesCSS,
    customFontsCSS: designSystem.artifacts.customFontsCSS,
    globalCSS: designSystem.artifacts.globalCSS,
    globalCSSHash: designSystem.artifacts.globalCSSHash,
    utilityCSS: designSystem.artifacts.utilityCSS,
    utilityCSSHash: designSystem.artifacts.utilityCSSHash,
    unocssClasses: [...designSystem.artifacts.unocssClasses],
    lastCompiled: designSystem.artifacts.lastCompiled,
  };
}

export function parseStoredUniversalDesignSystem(
  input: unknown,
): UniversalDesignSystem {
  const universal = UniversalDesignSystemSchema.safeParse(input);
  if (universal.success) {
    const parsed = universal.data as UniversalDesignSystem;

    parsed.tokens.typography.letterSpacing =
      normalizeLegacyDefaultTypographyLetterSpacing(
        parsed.tokens.typography.letterSpacing,
      );

    parsed.contextRules = parsed.contextRules ?? [];
    parsed.animations = parsed.animations ?? { keyframes: {} };

    return parsed;
  }

  const universalV1 = UniversalDesignSystemV1Schema.safeParse(input);
  if (universalV1.success) {
    const parsed = {
      ...universalV1.data,
      schemaVersion: 2 as const,
      globalStyles: createDefaultGlobalStylesConfig(),
      contextRules: [],
      animations: { keyframes: {} },
    } satisfies UniversalDesignSystem;

    parsed.tokens.typography.letterSpacing =
      normalizeLegacyDefaultTypographyLetterSpacing(
        parsed.tokens.typography.letterSpacing,
      );

    return parsed;
  }

  const legacy = StylesSchema.parse(input) as StylesDataLike;
  const normalized = normalizeStylesDataToUniversalDesignSystem(legacy);

  normalized.tokens.typography.letterSpacing =
    normalizeLegacyDefaultTypographyLetterSpacing(
      normalized.tokens.typography.letterSpacing,
    );

  return normalized;
}

export function validateUniversalDesignSystem(
  input: UniversalDesignSystem,
): UniversalDesignSystem {
  return UniversalDesignSystemSchema.parse(input) as UniversalDesignSystem;
}
