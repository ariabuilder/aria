/**
 * - Typography scales and fonts - Visual
 * effects (shadows, animations, transitions) - Keyboard.
 */

import { z } from "zod";

/**
 * Design system sections available in the Design feature
 */
export type DesignSection =
  | "framework"
  | "breakpoints"
  | "colors"
  | "typography"
  | "global-styles"
  | "icons"
  | "class-manager"
  | "variable-manager";

export type DesignSectionGroup = "foundation" | "management";

export interface DesignSectionConfig {
  id: DesignSection;
  group: DesignSectionGroup;
  label: string;
  description: string;
  icon: string;
  status?: "active" | "placeholder";
}

export interface DesignSectionGroupConfig {
  id: DesignSectionGroup;
  label: string;
  sectionIds: readonly DesignSection[];
}

export const DESIGN_SECTION_CONFIG: Record<DesignSection, DesignSectionConfig> =
  {
    framework: {
      id: "framework",
      group: "management",
      label: "Utilities",
      description: "Aria utility packs for your site",
      icon: "i-hugeicons:audio-wave-01",
    },
    breakpoints: {
      id: "breakpoints",
      group: "foundation",
      label: "Breakpoints",
      description: "Manage your sites breakpoints",
      icon: "i-hugeicons:computer",
    },
    colors: {
      id: "colors",
      group: "foundation",
      label: "Colors",
      description: "Palettes, shades, and semantic tokens",
      icon: "i-hugeicons:paint-board",
    },
    typography: {
      id: "typography",
      group: "foundation",
      label: "Fonts",
      description: "Upload, enable, and manage fonts",
      icon: "i-hugeicons:text",
    },
    "global-styles": {
      id: "global-styles",
      group: "foundation",
      label: "Global Styles",
      description: "Site-wide default styling",
      icon: "i-hugeicons:global",
    },
    icons: {
      id: "icons",
      group: "foundation",
      label: "Icons",
      description: "Enable icon packs for your site",
      icon: "i-hugeicons:arrow-right-01",
    },
    "class-manager": {
      id: "class-manager",
      group: "management",
      label: "Class Manager",
      description: "Manage reusable classes and shortcuts",
      icon: "i-hugeicons:code",
    },
    "variable-manager": {
      id: "variable-manager",
      group: "management",
      label: "Variable Manager",
      description: "Manage global variables and aliases",
      icon: "i-hugeicons:flash",
    },
  } as const;

export const DESIGN_SECTION_GROUPS: readonly DesignSectionGroupConfig[] = [
  {
    id: "foundation",
    label: "Foundation",
    sectionIds: [
      "colors",
      "typography",
      "global-styles",
      "breakpoints",
      "icons",
    ],
  },
  {
    id: "management",
    label: "Management",
    sectionIds: ["framework", "class-manager", "variable-manager"],
  },
] as const;

export function isDesignSection(value: string | null): value is DesignSection {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(DESIGN_SECTION_CONFIG, value);
}

// QUERY PARAM MAPPING (short URL params → DesignSection)

/**
 * Maps compact URL-safe query param values (?design=) to full DesignSection keys.
 * e.g. "globals" → "global-styles", "classes" → "class-manager"
 */
export const DESIGN_PARAM_TO_SECTION = {
  framework: "framework",
  breakpoints: "breakpoints",
  colors: "colors",
  typography: "typography",
  globals: "global-styles",
  icons: "icons",
  classes: "class-manager",
  variables: "variable-manager",
} as const satisfies Record<string, DesignSection>;

/** Union of valid ?design= query param values */
export type DesignParam = keyof typeof DESIGN_PARAM_TO_SECTION;

/** Zod schema for validating the ?design= query param at runtime */
export const DesignParamSchema = z.enum(
  Object.keys(DESIGN_PARAM_TO_SECTION) as [DesignParam, ...DesignParam[]],
);

export type DesignParamValue = z.infer<typeof DesignParamSchema>;

/** Teleport target element ids for Design PageHeader manager toolbars */
export const DESIGN_HEADER_TELEPORT_TARGETS = {
  search: "design-header-search",
  toolbar: "design-header-toolbar",
  importExport: "design-header-import-export",
  maintenance: "design-header-maintenance",
  actions: "design-header-actions",
} as const satisfies Record<
  "search" | "toolbar" | "importExport" | "maintenance" | "actions",
  string
>;

export type DesignHeaderTeleportTarget =
  keyof typeof DESIGN_HEADER_TELEPORT_TARGETS;

/** Reverse mapping: DesignSection → short query param for URL writing */
export const DESIGN_SECTION_TO_PARAM: Record<DesignSection, DesignParam> = {
  framework: "framework",
  breakpoints: "breakpoints",
  colors: "colors",
  typography: "typography",
  "global-styles": "globals",
  icons: "icons",
  "class-manager": "classes",
  "variable-manager": "variables",
};

/** Sidebar child link for the Design nav group — consumed by StudioSidebar */
export interface DesignSidebarChild {
  label: string;
  param: DesignParam;
}

/** All Design sub-section links shown in the sidebar */
export const DESIGN_SIDEBAR_CHILDREN: readonly DesignSidebarChild[] = [
  { label: "Colors", param: "colors" },
  { label: "Fonts", param: "typography" },
  { label: "Global Styles", param: "globals" },
  { label: "Icons", param: "icons" },
  { label: "Breakpoints", param: "breakpoints" },
  { label: "Utilities", param: "framework" },
  { label: "Class Manager", param: "classes" },
  { label: "Variable Manager", param: "variables" },
] as const;

export type ColorShade =
  | 25
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | 950;

export type SemanticColorKey = "success" | "warning" | "error" | "info";

export type ColorMode = "light" | "dark";

export interface ColorPalette {
  id: string;
  name: string;
  hex: string;
  shade: ColorShade;
  isSemanticToken: boolean;
}

export interface SemanticColorMapping {
  role: string;
  lightMode: string;
  darkMode: string;
  description?: string;
}

export type FontWeight = 100 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface TypographyScale {
  id: string;
  name: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: FontWeight;
}

export interface GoogleFont {
  family: string;
  variants: string[];
  category: string;
}

export interface LayoutPreset {
  id: string;
  name: string;
  gridUnit: number;
  baselineGrid: number;
}

export interface Shortcut {
  id: string;
  name: string;
  description: string;
  classNames: string[];
  preview?: string;
  category?: string;
}

export interface ShortcutTemplate {
  id: string;
  name: string;
  description: string;
  shortcuts: Shortcut[];
}

export interface DesignComponent {
  id: string;
  name: string;
  category: string;
  markup: string;
  styles: string;
  preview?: string;
}
