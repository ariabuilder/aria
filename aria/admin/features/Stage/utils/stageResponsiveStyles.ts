import { normalizeResponsiveStyleMap } from "../../../../lib/blocks/normalizeResponsiveStyleMap";
import { mergeNodeStylesWithLiveOverrides } from "./liveResponsiveStyles";
import {
  createResponsiveMediaQuery,
  DESKTOP_BASE_BREAKPOINT,
  getDesktopFirstOverrideBreakpoints,
  getOrderedResponsiveMediaQueries,
} from "../../../../lib/styles/responsiveBreakpoints";
import type {
  BreakpointDefinition,
  BuilderNode,
  StyleMap,
} from "../../../../lib/types/nodes";
import {
  getContentStyleTargetSelector,
  getTypographyStyleTargetSelector,
  isContentStyleProperty,
  isTypographyStyleProperty,
} from "./nodeStyleRuntime";
import {
  classNamesToString,
  createEmptyClassNames,
} from "../../../../lib/schemas/classEditor";
import { mergeSizingResolutionAcrossBreakpoints } from "../../../../lib/layout/resolveSizingCss";
import { stripUtilityVariantPrefixes } from "../../../../lib/styles/utilityClassDetection";

const SIZING_METADATA_PROPERTIES = new Set(["widthSizing", "heightSizing"]);

const DISPLAY_UTILITY_CLASSES = new Set([
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "hidden",
  "table",
  "inline-table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row",
  "table-row-group",
  "flow-root",
  "contents",
  "list-item",
]);

function isDisplayUtilityClass(className: string): boolean {
  const normalized = stripUtilityVariantPrefixes(className.trim());
  return DISPLAY_UTILITY_CLASSES.has(normalized);
}

function nodeHasDisplayUtilityClass(
  node: Pick<BuilderNode, "classNames" | "customClasses">,
  breakpoints: readonly BreakpointDefinition[],
): boolean {
  const tokens = [
    classNamesToString(node.classNames ?? createEmptyClassNames(), breakpoints),
    ...(node.customClasses ?? []),
  ].flatMap((value) => String(value).split(/\s+/));

  return tokens.some((token) => token && isDisplayUtilityClass(token));
}

export function toStylePropertyName(property: string): string {
  return property.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function stylesToResponsiveCSS(
  styles: StyleMap = {},
  nodeId: string,
  nodeType = "",
  breakpoints: readonly BreakpointDefinition[],
  options: { omitDisplay?: boolean } = {},
): string {
  const cssRules: string[] = [];
  const containerSelector = `[data-aria-id="${nodeId}"]`;
  const typographySelector = getTypographyStyleTargetSelector(nodeId, nodeType);
  const contentSelector = getContentStyleTargetSelector(nodeId, nodeType);
  const baseContainerRules: string[] = [];
  const baseTypographyRules: string[] = [];
  const baseContentRules: string[] = [];

  for (const [property, value] of Object.entries(styles)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const responsiveValue = normalizeResponsiveStyleMap(value);
    const baseValue = responsiveValue[DESKTOP_BASE_BREAKPOINT];
    if (!baseValue) {
      continue;
    }

    if (options.omitDisplay && property === "display") {
      continue;
    }

    if (SIZING_METADATA_PROPERTIES.has(property)) {
      continue;
    }

    if (isTypographyStyleProperty(property) && typographySelector) {
      baseTypographyRules.push(`${toStylePropertyName(property)}: ${baseValue}`);
    } else {
      baseContainerRules.push(`${toStylePropertyName(property)}: ${baseValue}`);
    }

    if (contentSelector && isContentStyleProperty(property, nodeType)) {
      baseContentRules.push(`${toStylePropertyName(property)}: ${baseValue}`);
    }
  }

  if (baseContainerRules.length > 0) {
    cssRules.push(`${containerSelector} { ${baseContainerRules.join("; ")}; }`);
  }

  if (typographySelector && baseTypographyRules.length > 0) {
    cssRules.push(
      `${typographySelector} { ${baseTypographyRules.join("; ")}; }`,
    );
  }

  if (contentSelector && baseContentRules.length > 0) {
    cssRules.push(`${contentSelector} { ${baseContentRules.join("; ")}; }`);
  }

  const mediaRulesByQuery = new Map<string, string[]>();

  for (const breakpoint of getDesktopFirstOverrideBreakpoints(breakpoints)) {
    const mediaQuery = createResponsiveMediaQuery(breakpoints, breakpoint.name);

    if (!mediaQuery) {
      continue;
    }

    const breakpointContainerRules: string[] = [];
    const breakpointTypographyRules: string[] = [];
    const breakpointContentRules: string[] = [];

    for (const [property, value] of Object.entries(styles)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const responsiveValue = normalizeResponsiveStyleMap(value);
      const breakpointValue = responsiveValue[breakpoint.name];
      if (!breakpointValue) {
        continue;
      }

      if (options.omitDisplay && property === "display") {
        continue;
      }

      if (isTypographyStyleProperty(property) && typographySelector) {
        breakpointTypographyRules.push(
          `${toStylePropertyName(property)}: ${breakpointValue}`,
        );
      } else {
        breakpointContainerRules.push(
          `${toStylePropertyName(property)}: ${breakpointValue}`,
        );
      }

      if (contentSelector && isContentStyleProperty(property, nodeType)) {
        breakpointContentRules.push(
          `${toStylePropertyName(property)}: ${breakpointValue}`,
        );
      }
    }

    const queryRules = mediaRulesByQuery.get(mediaQuery) ?? [];

    if (breakpointContainerRules.length > 0) {
      queryRules.push(
        `${containerSelector} { ${breakpointContainerRules.join("; ")}; }`,
      );
    }

    if (typographySelector && breakpointTypographyRules.length > 0) {
      queryRules.push(
        `${typographySelector} { ${breakpointTypographyRules.join("; ")}; }`,
      );
    }

    if (contentSelector && breakpointContentRules.length > 0) {
      queryRules.push(
        `${contentSelector} { ${breakpointContentRules.join("; ")}; }`,
      );
    }

    if (queryRules.length > 0) {
      mediaRulesByQuery.set(mediaQuery, queryRules);
    }
  }

  for (const mediaQuery of getOrderedResponsiveMediaQueries(breakpoints)) {
    const queryRules = mediaRulesByQuery.get(mediaQuery);
    if (!queryRules || queryRules.length === 0) {
      continue;
    }

    cssRules.push(`@media ${mediaQuery} { ${queryRules.join(" ")} }`);
  }

  return cssRules.join("\n");
}

export interface LiveResponsiveStyleOverrideEntry {
  nodeType: string;
  styles: StyleMap;
}

export function collectResponsiveStyleCSS(
  blocks: readonly BuilderNode[],
  breakpoints: readonly BreakpointDefinition[],
  liveOverrides?: ReadonlyMap<string, LiveResponsiveStyleOverrideEntry>,
): string {
  const cssRules: string[] = [];

  const visit = (block: BuilderNode, parent: BuilderNode | null): void => {
    const liveEntry = liveOverrides?.get(block.id);
    const styles = liveEntry
      ? mergeNodeStylesWithLiveOverrides(block.styles, liveEntry.styles)
      : block.styles;

    if (styles) {
      const resolvedStyles = mergeSizingResolutionAcrossBreakpoints(
        styles,
        parent,
        breakpoints,
      );
      const css = stylesToResponsiveCSS(
        resolvedStyles,
        block.id,
        block.type ?? "",
        breakpoints,
        { omitDisplay: nodeHasDisplayUtilityClass(block, breakpoints) },
      );

      if (css) {
        cssRules.push(css);
      }
    }

    if (block.children?.length) {
      block.children.forEach((child) => visit(child, block));
    }
  };

  blocks.forEach((block) => visit(block, null));
  return cssRules.join("\n");
}
