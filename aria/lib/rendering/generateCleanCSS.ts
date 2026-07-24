import type { BuilderNode, Responsive, StyleMap } from "../types/nodes";
import {
  createDesktopFirstFallbackBreakpoints,
  createDesktopFirstMaxWidthMediaQuery,
  DESKTOP_BASE_BREAKPOINT,
  getDesktopFirstOverrideBreakpoints,
  sortBreakpointDefinitionsDesktopFirst,
} from "../styles/responsiveBreakpoints";
import { serializeFontFamilyValue } from "../styles/fontFamily";

type StyleScalar = string | number;

/**
 * Generate Clean CSS from StyleMap
 *
 * Converts StyleMap objects to human-readable CSS with media queries.
 * Produces output that looks like manually-written CSS.
 */

interface BreakpointQuery {
  name: string;
  minWidth: string;
  label?: string;
}

const DEFAULT_BREAKPOINTS: BreakpointQuery[] =
  createDesktopFirstFallbackBreakpoints();

/**
 * Convert a style property name and value to CSS string
 */
function styleToCSS(property: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const scalarValue: StyleScalar = value;

  const cssMap: Record<string, string> = {
    fontSize: `font-size: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    fontWeight: `font-weight: ${scalarValue};`,
    fontFamily: `font-family: ${serializeFontFamilyValue(String(scalarValue))};`,
    lineHeight: `line-height: ${scalarValue};`,
    textAlign: `text-align: ${scalarValue};`,
    letterSpacing: `letter-spacing: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    color: `color: ${scalarValue};`,

    display: `display: ${scalarValue};`,
    position: `position: ${scalarValue};`,
    overflow: `overflow: ${scalarValue};`,

    padding: `padding: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    margin: `margin: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    paddingTop: `padding-top: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    paddingRight: `padding-right: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    paddingBottom: `padding-bottom: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    paddingLeft: `padding-left: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    marginTop: `margin-top: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    marginRight: `margin-right: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    marginBottom: `margin-bottom: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    marginLeft: `margin-left: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    gap: `gap: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    flowTolerance: `flow-tolerance: ${scalarValue};`,
    gridColumn: `grid-column: ${scalarValue};`,

    width: `width: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    height: `height: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    minWidth: `min-width: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    minHeight: `min-height: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    maxWidth: `max-width: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    maxHeight: `max-height: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,

    flexDirection: `flex-direction: ${scalarValue};`,
    justifyContent: `justify-content: ${scalarValue};`,
    alignItems: `align-items: ${scalarValue};`,
    alignContent: `align-content: ${scalarValue};`,
    flexWrap: `flex-wrap: ${scalarValue};`,
    flex: `flex: ${scalarValue};`,
    flexGrow: `flex-grow: ${scalarValue};`,
    flexShrink: `flex-shrink: ${scalarValue};`,

    gridTemplate: `grid-template: ${scalarValue};`,
    gridTemplateColumns: `grid-template-columns: ${scalarValue};`,
    gridTemplateRows: `grid-template-rows: ${scalarValue};`,
    justifyItems: `justify-items: ${scalarValue};`,

    background: `background: ${scalarValue};`,
    backgroundColor: `background-color: ${scalarValue};`,
    backgroundImage: `background-image: ${scalarValue};`,
    backgroundSize: `background-size: ${scalarValue};`,
    backgroundPosition: `background-position: ${scalarValue};`,
    backgroundRepeat: `background-repeat: ${scalarValue};`,

    border: `border: ${scalarValue};`,
    borderTop: `border-top: ${scalarValue};`,
    borderRight: `border-right: ${scalarValue};`,
    borderBottom: `border-bottom: ${scalarValue};`,
    borderLeft: `border-left: ${scalarValue};`,
    borderRadius: `border-radius: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,
    borderColor: `border-color: ${scalarValue};`,
    borderWidth: `border-width: ${typeof scalarValue === "string" ? scalarValue : `${scalarValue}px`};`,

    boxShadow: `box-shadow: ${scalarValue};`,
    textShadow: `text-shadow: ${scalarValue};`,

    opacity: `opacity: ${scalarValue};`,
    transform: `transform: ${scalarValue};`,
    transition: `transition: ${scalarValue};`,

    objectFit: `object-fit: ${scalarValue};`,
    objectPosition: `object-position: ${scalarValue};`,
  };

  return cssMap[property] || null;
}

function getResponsiveValue(
  styles: StyleMap,
  property: string,
  breakpoint: string,
): unknown {
  if (!styles[property]) return undefined;
  const propStyles = styles[property];
  if (typeof propStyles === "object" && propStyles !== null) {
    return (propStyles as Responsive<string>)[breakpoint];
  }
  return propStyles;
}

function generateBreakpointCSS(
  styles: StyleMap,
  className: string,
  breakpoint: BreakpointQuery,
): string | null {
  const cssLines: string[] = [];

  // Iterate through all properties in styles
  for (const [property] of Object.entries(styles)) {
    const breakpointValue = getResponsiveValue(
      styles,
      property,
      breakpoint.name,
    );
    if (breakpointValue === undefined || breakpointValue === null) continue;

    const cssDeclaration = styleToCSS(property, breakpointValue);
    if (cssDeclaration) {
      cssLines.push(`  ${cssDeclaration}`);
    }
  }

  if (cssLines.length === 0) return null;

  return `${className} {\n${cssLines.join("\n")}\n}`;
}

/**
 * Generate media query for desktop-first override breakpoints.
 */
function generateMediaQuery(
  styles: StyleMap,
  className: string,
  breakpoint: BreakpointQuery,
  breakpoints: BreakpointQuery[],
): string | null {
  if (breakpoint.name === "base") return null; // Base styles are outside media queries
  const mediaQuery = createDesktopFirstMaxWidthMediaQuery(
    breakpoints,
    breakpoint.name,
  );
  if (!mediaQuery) return null;

  const cssLines: string[] = [];

  for (const [property] of Object.entries(styles)) {
    const breakpointValue = getResponsiveValue(
      styles,
      property,
      breakpoint.name,
    );
    if (breakpointValue === undefined || breakpointValue === null) continue;

    const cssDeclaration = styleToCSS(property, breakpointValue);
    if (cssDeclaration) {
      cssLines.push(`  ${cssDeclaration}`);
    }
  }

  if (cssLines.length === 0) return null;

  return `@media ${mediaQuery} {\n  ${className} {\n${cssLines.join("\n  ")}\n  }\n}`;
}

export function generateNodeCSS(
  node: BuilderNode,
  breakpoints: BreakpointQuery[] = DEFAULT_BREAKPOINTS,
): string {
  if (!node.styles || Object.keys(node.styles).length === 0) {
    return "";
  }

  // Generate semantic class selector from customClasses or fallback to data-attribute
  const selector = node.customClasses?.length
    ? `.${node.customClasses[0]}`
    : `[data-aria-id="${node.id}"]`;

  const resolvedBreakpoints =
    sortBreakpointDefinitionsDesktopFirst(breakpoints);
  const cssBlocks: string[] = [];

  const baseCSS = generateBreakpointCSS(node.styles, selector, {
    name: DESKTOP_BASE_BREAKPOINT,
    minWidth: "0px",
    label: "Desktop",
  });
  if (baseCSS) {
    cssBlocks.push(baseCSS);
  }

  // Generate media queries for each breakpoint
  for (const breakpoint of getDesktopFirstOverrideBreakpoints(
    resolvedBreakpoints,
  )) {
    const mediaCSS = generateMediaQuery(
      node.styles,
      selector,
      breakpoint,
      resolvedBreakpoints,
    );
    if (mediaCSS) {
      cssBlocks.push(mediaCSS);
    }
  }

  return cssBlocks.join("\n\n");
}

/**
 * Generate complete stylesheet for all nodes in a tree
 */
export function generateStylesheet(
  nodes: BuilderNode[],
  breakpoints: BreakpointQuery[] = DEFAULT_BREAKPOINTS,
): string {
  const cssBlocks: string[] = [];

  function processNode(node: BuilderNode) {
    const nodeCSS = generateNodeCSS(node, breakpoints);
    if (nodeCSS) {
      cssBlocks.push(nodeCSS);
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(processNode);
    }
  }

  nodes.forEach(processNode);

  if (cssBlocks.length === 0) {
    return "";
  }

  // Add header comment and layer directive
  const css = `/* Aria Generated Styles */
@layer user-styles {
${cssBlocks.join("\n\n")}
}`;

  return css;
}
