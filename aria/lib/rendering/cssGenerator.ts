/**
 * Generate scoped utility classes from StyleMap to cut inline styles (~90%+).
 */

import type { StyleMap, BuilderNode, PageDSL } from "../types/nodes";
import { DEFAULT_BREAKPOINTS } from "../types/nodes";
import { mergeSizingResolutionAcrossBreakpoints } from "../layout/resolveSizingCss";
import { formatBreakpointWidth } from "../styles/responsiveBreakpoints";
import { serializeFontFamilyValue } from "../styles/fontFamily";

type CanonicalBreakpoint = "base" | "tablet" | "mobile";

const RESPONSIVE_BREAKPOINTS: Array<{
  name: Exclude<CanonicalBreakpoint, "base">;
  maxWidth: string;
}> = [
  { name: "tablet", maxWidth: formatBreakpointWidth(1279.98) },
  { name: "mobile", maxWidth: formatBreakpointWidth(767.98) },
];

function getResponsiveStyleValue(
  value: unknown,
  breakpoint: CanonicalBreakpoint,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const responsive = value as Record<string, unknown>;
  const cascade =
    breakpoint === "mobile"
      ? ["mobile", "tablet", "base"]
      : breakpoint === "tablet"
        ? ["tablet", "base"]
        : ["base"];

  for (const key of cascade) {
    const candidate = responsive[key];
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return undefined;
}

function withPx(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${Math.round(Number(trimmed))}px`;
  }

  return trimmed;
}

function appendDeclaration(
  declarations: string[],
  property: string,
  value: string | undefined,
): void {
  if (!value) {
    return;
  }

  const resolvedValue =
    property === "font-family" ? serializeFontFamilyValue(value) : value;
  declarations.push(`    ${property}: ${resolvedValue};`);
}

function collectDeclarations(
  styles: StyleMap,
  breakpoint: CanonicalBreakpoint,
): string[] {
  const declarations: string[] = [];

  appendDeclaration(
    declarations,
    "padding",
    withPx(getResponsiveStyleValue(styles.padding, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "margin",
    withPx(getResponsiveStyleValue(styles.margin, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "color",
    getResponsiveStyleValue(styles.color, breakpoint),
  );
  appendDeclaration(
    declarations,
    "background",
    getResponsiveStyleValue(styles.background, breakpoint),
  );
  appendDeclaration(
    declarations,
    "font-size",
    withPx(getResponsiveStyleValue(styles.fontSize, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "font-weight",
    getResponsiveStyleValue(styles.fontWeight, breakpoint),
  );
  appendDeclaration(
    declarations,
    "font-family",
    getResponsiveStyleValue(styles.fontFamily, breakpoint),
  );
  appendDeclaration(
    declarations,
    "line-height",
    getResponsiveStyleValue(styles.lineHeight, breakpoint),
  );
  appendDeclaration(
    declarations,
    "text-align",
    getResponsiveStyleValue(styles.textAlign, breakpoint),
  );
  appendDeclaration(
    declarations,
    "display",
    getResponsiveStyleValue(styles.display, breakpoint),
  );
  appendDeclaration(
    declarations,
    "flex-direction",
    getResponsiveStyleValue(styles.flexDirection, breakpoint),
  );
  appendDeclaration(
    declarations,
    "align-items",
    getResponsiveStyleValue(styles.alignItems, breakpoint),
  );
  appendDeclaration(
    declarations,
    "justify-content",
    getResponsiveStyleValue(styles.justifyContent, breakpoint),
  );
  appendDeclaration(
    declarations,
    "gap",
    withPx(getResponsiveStyleValue(styles.gap, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "flow-tolerance",
    getResponsiveStyleValue(styles.flowTolerance, breakpoint),
  );
  appendDeclaration(
    declarations,
    "grid-column",
    getResponsiveStyleValue(styles.gridColumn, breakpoint),
  );
  appendDeclaration(
    declarations,
    "grid-template-columns",
    getResponsiveStyleValue(styles.gridTemplateColumns, breakpoint),
  );
  appendDeclaration(
    declarations,
    "grid-template-rows",
    getResponsiveStyleValue(styles.gridTemplateRows, breakpoint),
  );
  appendDeclaration(
    declarations,
    "position",
    getResponsiveStyleValue(styles.position, breakpoint),
  );
  appendDeclaration(
    declarations,
    "top",
    withPx(getResponsiveStyleValue(styles.top, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "right",
    withPx(getResponsiveStyleValue(styles.right, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "bottom",
    withPx(getResponsiveStyleValue(styles.bottom, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "left",
    withPx(getResponsiveStyleValue(styles.left, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "z-index",
    getResponsiveStyleValue(styles.zIndex, breakpoint),
  );
  appendDeclaration(
    declarations,
    "width",
    withPx(getResponsiveStyleValue(styles.width, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "height",
    withPx(getResponsiveStyleValue(styles.height, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "min-width",
    withPx(getResponsiveStyleValue(styles.minWidth, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "min-height",
    withPx(getResponsiveStyleValue(styles.minHeight, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "max-width",
    withPx(getResponsiveStyleValue(styles.maxWidth, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "max-height",
    withPx(getResponsiveStyleValue(styles.maxHeight, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "flex-grow",
    getResponsiveStyleValue(styles.flexGrow, breakpoint),
  );
  appendDeclaration(
    declarations,
    "flex-shrink",
    getResponsiveStyleValue(styles.flexShrink, breakpoint),
  );
  appendDeclaration(
    declarations,
    "flex-basis",
    withPx(getResponsiveStyleValue(styles.flexBasis, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "align-self",
    getResponsiveStyleValue(styles.alignSelf, breakpoint),
  );
  appendDeclaration(
    declarations,
    "justify-self",
    getResponsiveStyleValue(styles.justifySelf, breakpoint),
  );
  appendDeclaration(
    declarations,
    "object-fit",
    getResponsiveStyleValue(styles.objectFit, breakpoint),
  );
  appendDeclaration(
    declarations,
    "object-position",
    getResponsiveStyleValue(styles.objectPosition, breakpoint),
  );
  appendDeclaration(
    declarations,
    "border-width",
    withPx(getResponsiveStyleValue(styles.borderWidth, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "border-style",
    getResponsiveStyleValue(styles.borderStyle, breakpoint),
  );
  appendDeclaration(
    declarations,
    "border-color",
    getResponsiveStyleValue(styles.borderColor, breakpoint),
  );
  appendDeclaration(
    declarations,
    "border-radius",
    withPx(getResponsiveStyleValue(styles.borderRadius, breakpoint)),
  );
  appendDeclaration(
    declarations,
    "box-shadow",
    getResponsiveStyleValue(styles.boxShadow, breakpoint),
  );
  appendDeclaration(
    declarations,
    "opacity",
    getResponsiveStyleValue(styles.opacity, breakpoint),
  );
  appendDeclaration(
    declarations,
    "transform",
    getResponsiveStyleValue(styles.transform, breakpoint),
  );

  return declarations;
}

/**
 * Generate utility classes for production builds
 * Reduces inline styles by 90%+
 */
export function generateStylesheet(dsl: PageDSL): {
  css: string;
  classMap: Map<string, string>;
} {
  const classMap = new Map<string, string>();
  const seenStyles = new Map<string, string>();
  let classCounter = 0;

  function processNode(node: BuilderNode, parent: BuilderNode | null) {
    const resolvedStyles = mergeSizingResolutionAcrossBreakpoints(
      node.styles,
      parent,
      DEFAULT_BREAKPOINTS,
    );

    if (Object.keys(resolvedStyles).length > 0) {
      const styleKey = JSON.stringify(resolvedStyles);

      if (!seenStyles.has(styleKey)) {
        const className = `aria-s${classCounter++}`;
        seenStyles.set(styleKey, className);
        classMap.set(node.id, className);
      } else {
        classMap.set(node.id, seenStyles.get(styleKey)!);
      }
    }

    if (node.children) {
      node.children.forEach((child) => processNode(child, node));
    }
  }

  // Process all nodes in the DSL
  dsl.nodes.forEach((node) => processNode(node, null));

  // Generate CSS from unique styles
  let css = "/* Aria Generated Styles */\n";
  css += "@layer user-styles {\n";

  for (const [styleKey, className] of seenStyles) {
    const styles: StyleMap = JSON.parse(styleKey);
    css += generateClassCSS(className, styles);
  }

  css += "}\n";

  return { css, classMap };
}

function generateClassCSS(className: string, styles: StyleMap): string {
  const baseDeclarations = collectDeclarations(styles, "base");
  let css = `  .${className} {\n`;

  if (baseDeclarations.length > 0) {
    css += `${baseDeclarations.join("\n")}\n`;
  }

  css += `  }\n\n`;

  for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
    const declarations = collectDeclarations(styles, breakpoint.name);

    if (declarations.length === 0) {
      continue;
    }

    css += `  @media (max-width: ${breakpoint.maxWidth}) {\n`;
    css += `    .${className} {\n`;
    css += `${declarations.join("\n")}\n`;
    css += `    }\n`;
    css += `  }\n\n`;
  }

  return css;
}

/**
 * Generate global CSS layer structure
 */
export function generateGlobalLayers(): string {
  return `
/* CSS Cascade Layers for Specificity Control */
@layer reset, base, components, utilities, user-styles;

@layer reset {
  /* CSS reset (normalize.css, etc.) */
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
}

@layer base {
  /* Typography, colors, etc. */
  body {
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.6;
  }
  
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    line-height: 1.2;
  }
}

@layer components {
  /* Astro component defaults */
  .button {
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
  }
}

@layer utilities {
  /* Tailwind utilities (if used) */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
}

/* user-styles layer is added by generateStylesheet() */
`.trim();
}

/**
 * Calculate reduction percentage for analytics
 */
export function calculateOptimizationStats(
  originalInlineStyles: number,
  generatedCSS: string,
): {
  reduction: number;
  cssSize: number;
  estimatedSavings: number;
} {
  const cssSize = new Blob([generatedCSS]).size;
  const estimatedInlineSize = originalInlineStyles * 200; // ~200 bytes per inline style
  const reduction = Math.round(
    ((estimatedInlineSize - cssSize) / estimatedInlineSize) * 100,
  );

  return {
    reduction,
    cssSize,
    estimatedSavings: estimatedInlineSize - cssSize,
  };
}
