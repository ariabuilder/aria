/**
 * Custom CSS Generation
 *
 * Generates CSS from user-defined custom classes and fonts.
 */

import type { CustomFontsLibrary, CustomFont } from "../types/classes";
import type {
  CustomClass as NewCustomClass,
  Breakpoint,
  BreakpointVariant,
  CSSRuleValue,
} from "../schemas/classEditor";
import type { ContextRule } from "./universalDesignSystem";
import { BREAKPOINT_WIDTHS, BREAKPOINT_ORDER } from "../schemas/classEditor";
import { getPseudoSelectorSuffix } from "./pseudoSelectors";
import { camelToKebab } from "../types/classes";
import {
  compareDesktopFirstBreakpointOrder,
  formatBreakpointWidth,
} from "./responsiveBreakpoints";
import { validateAdvancedCss } from "./cssValidation";

export interface BreakpointWidthConfig {
  [breakpointName: string]: number;
}

export interface DesignSystemAnimations {
  keyframes: Record<string, { steps: Record<string, Record<string, string>> }>;
}

function toCssPropertyName(property: string): string {
  if (property.startsWith("--")) {
    return property;
  }

  return camelToKebab(property);
}

function formatRulesCSS(rules: CSSRuleValue[]): string {
  return rules
    .map(
      (rule) =>
        `  ${toCssPropertyName(rule.property)}: ${rule.value}${rule.important ? " !important" : ""};`,
    )
    .join("\n");
}

function resolveOrderedBreakpoints(
  breakpointWidths: BreakpointWidthConfig,
  breakpointNames: readonly string[],
): string[] {
  return [
    "base",
    ...Array.from(
      new Set(breakpointNames.filter((breakpoint) => breakpoint !== "base")),
    ).sort((left, right) =>
      compareDesktopFirstBreakpointOrder(
        left,
        breakpointWidths[left] ?? 0,
        right,
        breakpointWidths[right] ?? 0,
      ),
    ),
  ];
}

function getDesktopFirstMediaQuery(
  orderedBreakpoints: readonly string[],
  breakpointWidths: BreakpointWidthConfig,
  breakpoint: string,
): string | null {
  const currentIndex = orderedBreakpoints.indexOf(breakpoint);

  if (currentIndex <= 0) {
    return null;
  }

  const previousBreakpoint = orderedBreakpoints[currentIndex - 1];
  const previousWidth =
    breakpointWidths[previousBreakpoint] ?? breakpointWidths.base ?? 1280;

  return `(max-width: ${formatBreakpointWidth(previousWidth - 0.02)})`;
}

function pushRuleBlock(
  lines: string[],
  selector: string,
  rules: CSSRuleValue[],
  orderedBreakpoints: readonly string[],
  breakpointWidths: BreakpointWidthConfig,
  breakpoint: string,
): void {
  if (rules.length === 0) {
    return;
  }

  const rulesCSS = formatRulesCSS(rules);

  if (!breakpoint || breakpoint === "base") {
    lines.push(`${selector} {\n${rulesCSS}\n}`);
    return;
  }

  const mediaQuery = getDesktopFirstMediaQuery(
    orderedBreakpoints,
    breakpointWidths,
    breakpoint,
  );

  if (!mediaQuery) {
    return;
  }

  lines.push(`@media ${mediaQuery} {\n  ${selector} {\n  ${rulesCSS}\n  }\n}`);
}

function pushPseudoRuleBlock(
  lines: string[],
  selector: string,
  pseudoState: string | undefined,
  rules: CSSRuleValue[],
  orderedBreakpoints: readonly string[],
  breakpointWidths: BreakpointWidthConfig,
  breakpoint: string,
): void {
  if (rules.length === 0) {
    return;
  }

  const pseudoSelector = pseudoState
    ? `${selector}${getPseudoSelectorSuffix(pseudoState)}`
    : selector;

  pushRuleBlock(
    lines,
    pseudoSelector,
    rules,
    orderedBreakpoints,
    breakpointWidths,
    breakpoint,
  );
}

/**
 * Generate CSS from custom classes (with breakpoint variants)
 */
export function generateCustomClasses(
  classes: Record<
    string,
    Pick<NewCustomClass, "name"> & Partial<NewCustomClass>
  >,
  breakpointWidths: BreakpointWidthConfig = BREAKPOINT_WIDTHS,
): string {
  if (!classes || Object.keys(classes).length === 0) {
    return "";
  }

  const lines: string[] = [];

  for (const cls of Object.values(classes)) {
    const selector = `.${cls.name}`;

    const byBreakpoint = new Map<Breakpoint, BreakpointVariant>();
    for (const variant of cls.variants ?? []) {
      byBreakpoint.set(variant.breakpoint, variant);
    }

    const orderedBreakpoints = resolveOrderedBreakpoints(
      breakpointWidths,
      [
        ...BREAKPOINT_ORDER,
        ...Array.from(byBreakpoint.keys()),
        ...(cls.pseudoVariants ?? []).map((variant) => variant.breakpoint),
        ...(cls.compoundVariants ?? []).map((variant) => variant.breakpoint),
      ].filter(Boolean) as string[],
    );

    for (const bp of orderedBreakpoints) {
      const variant = byBreakpoint.get(bp);
      if (!variant || variant.rules.length === 0) continue;

      pushRuleBlock(
        lines,
        selector,
        variant.rules,
        orderedBreakpoints,
        breakpointWidths,
        bp,
      );
    }

    for (const pseudo of cls.pseudoVariants ?? []) {
      pushPseudoRuleBlock(
        lines,
        selector,
        pseudo.state,
        pseudo.rules,
        orderedBreakpoints,
        breakpointWidths,
        pseudo.breakpoint,
      );
    }

    for (const compound of cls.compoundVariants ?? []) {
      const compoundSelector =
        selector + compound.withClasses.map((name) => `.${name}`).join("");

      if (compound.pseudoState) {
        pushPseudoRuleBlock(
          lines,
          compoundSelector,
          compound.pseudoState,
          compound.rules,
          orderedBreakpoints,
          breakpointWidths,
          compound.breakpoint,
        );
      } else {
        pushRuleBlock(
          lines,
          compoundSelector,
          compound.rules,
          orderedBreakpoints,
          breakpointWidths,
          compound.breakpoint,
        );
      }
    }

    if (cls.advancedCss?.trim()) {
      const validation = validateAdvancedCss(cls.advancedCss);
      if (validation.valid) {
        lines.push(cls.advancedCss.trim());
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate @keyframes CSS from the design system animations registry.
 */
export function generateKeyframesCSS(
  animations: DesignSystemAnimations | undefined,
): string {
  const keyframes = animations?.keyframes;

  if (!keyframes || Object.keys(keyframes).length === 0) {
    return "";
  }

  const blocks: string[] = [];

  for (const [name, definition] of Object.entries(keyframes)) {
    const stepLines = Object.entries(definition.steps)
      .map(([step, properties]) => {
        const declarations = Object.entries(properties)
          .map(
            ([property, value]) =>
              `    ${toCssPropertyName(property)}: ${value};`,
          )
          .join("\n");

        return `  ${step} {\n${declarations}\n  }`;
      })
      .join("\n");

    blocks.push(`@keyframes ${name} {\n${stepLines}\n}`);
  }

  return blocks.join("\n\n");
}

export function generateContextRulesCSS(
  contextRules: ContextRule[] | undefined,
  breakpointWidths: BreakpointWidthConfig = BREAKPOINT_WIDTHS,
): string {
  if (!contextRules || contextRules.length === 0) {
    return "";
  }

  const lines: string[] = [];
  const orderedBreakpoints = resolveOrderedBreakpoints(
    breakpointWidths,
    contextRules
      .map((rule) => rule.breakpoint)
      .filter((breakpoint): breakpoint is Breakpoint => Boolean(breakpoint)),
  );

  for (const rule of contextRules) {
    if (rule.rules.length === 0) {
      continue;
    }

    pushRuleBlock(
      lines,
      rule.selector,
      rule.rules,
      orderedBreakpoints,
      breakpointWidths,
      rule.breakpoint ?? "base",
    );
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function generateCustomFontsCSS(
  customFonts: CustomFontsLibrary,
): string {
  if (!customFonts || !customFonts.fonts) {
    return "";
  }

  const fontFaceRules: string[] = [];

  for (const fontId of Object.keys(customFonts.fonts)) {
    const font = customFonts.fonts[fontId];
    fontFaceRules.push(generateFontFace(font));
  }

  return fontFaceRules.filter(Boolean).join("\n\n");
}

function generateFontFace(font: CustomFont): string {
  if (!font.formats || font.formats.length === 0) {
    return "";
  }

  const srcDeclarations = font.formats
    .map((fmt) => `url('${fmt.url}') format('${fmt.format}')`)
    .join(",\n       ");

  const weight = font.weight || "400";
  const style = font.style || "normal";

  return `@font-face {
  font-family: '${font.family}';
  src: ${srcDeclarations};
  font-weight: ${weight};
  font-style: ${style};
  font-display: swap;
}`;
}

/**
 * Generate Google Fonts link tags
 */
export function generateGoogleFontsLinks(
  customFonts: CustomFontsLibrary,
): string {
  if (!customFonts || !customFonts.googleFonts) {
    return "";
  }

  const googleFonts = Object.values(customFonts.googleFonts);

  if (googleFonts.length === 0) {
    return "";
  }

  const preconnect = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;

  const fontLinks = googleFonts
    .map(
      (font) =>
        `<link href="${buildGoogleFontsURL(font.family, font.variants)}" rel="stylesheet">`,
    )
    .join("\n");

  return `${preconnect}\n${fontLinks}`;
}

/**
 * Build Google Fonts API URL from font selection
 */
export function buildGoogleFontsURL(
  family: string,
  variants: string[],
): string {
  if (!variants || variants.length === 0) {
    variants = ["400"];
  }

  const weights = variants.map((v) => {
    const isItalic = v.includes("italic");
    const weight = v.replace("italic", "");
    return isItalic ? `1,${weight}` : `0,${weight}`;
  });

  const familyParam = family.replace(/\s+/g, "+");
  const weightsParam = weights.join(";");

  return `https://fonts.googleapis.com/css2?family=${familyParam}:ital,wght@${weightsParam}&display=swap`;
}
