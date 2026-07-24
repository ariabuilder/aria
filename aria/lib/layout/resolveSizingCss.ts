import { normalizeResponsiveStyleMap } from "../blocks/normalizeResponsiveStyleMap";
import {
  classNamesToString,
  createEmptyClassNames,
} from "../schemas/classEditor";
import {
  DESKTOP_BASE_BREAKPOINT,
  sortBreakpointsByEffectiveWidthDesc,
} from "../styles/responsiveBreakpoints";
import { stripUtilityVariantPrefixes } from "../styles/utilityClassDetection";
import type {
  BreakpointDefinition,
  BuilderNode,
  Responsive,
  StyleMap,
} from "../types/nodes";

export type SizeMode = "hug" | "fill" | "exact";

export interface ParentLayoutContext {
  display: string;
  flexDirection: string;
  alignItems: string;
}

const DISPLAY_UTILITY_TO_VALUE: Record<string, string> = {
  block: "block",
  "inline-block": "inline-block",
  inline: "inline",
  flex: "flex",
  "inline-flex": "inline-flex",
  grid: "grid",
  "inline-grid": "inline-grid",
  hidden: "none",
  table: "table",
  "inline-table": "inline-table",
  "flow-root": "flow-root",
  contents: "contents",
  "list-item": "list-item",
};

const SIZING_METADATA_KEYS = new Set(["widthSizing", "heightSizing"]);

const RESOLVED_SIZING_KEYS = new Set([
  "width",
  "height",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "justifySelf",
]);

function getResponsiveStyleValue(
  value: Responsive<string> | undefined,
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  const responsive = normalizeResponsiveStyleMap(value);
  if (typeof responsive[breakpoint] === "string") {
    return responsive[breakpoint];
  }

  const ordered = sortBreakpointsByEffectiveWidthDesc([...breakpoints]);
  const currentIndex = ordered.findIndex((entry) => entry.name === breakpoint);

  if (currentIndex === -1) {
    return responsive[DESKTOP_BASE_BREAKPOINT];
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = ordered[index]?.name;
    if (candidate && typeof responsive[candidate] === "string") {
      return responsive[candidate];
    }
  }

  return responsive[DESKTOP_BASE_BREAKPOINT];
}

export function inferSizeModeFromCSSValue(value: string | undefined): SizeMode {
  if (!value) {
    return "hug";
  }

  const trimmed = value.trim();
  if (trimmed === "100%") {
    return "fill";
  }

  if (
    trimmed === "auto" ||
    trimmed === "fit-content" ||
    trimmed === "min-content" ||
    trimmed === "max-content"
  ) {
    return "hug";
  }

  return "exact";
}

export function resolveSizeMode(
  styles: StyleMap | undefined,
  axis: "width" | "height",
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): SizeMode {
  const sizingKey = axis === "width" ? "widthSizing" : "heightSizing";
  const stored = getResponsiveStyleValue(styles?.[sizingKey], breakpoint, breakpoints);

  if (stored === "hug" || stored === "fill" || stored === "exact") {
    return stored;
  }

  return inferSizeModeFromCSSValue(
    getResponsiveStyleValue(styles?.[axis], breakpoint, breakpoints),
  );
}

export function nodeHasExplicitSizing(styles: StyleMap | undefined): boolean {
  if (!styles) {
    return false;
  }

  return Boolean(
    styles.widthSizing ||
      styles.heightSizing ||
      styles.width ||
      styles.height,
  );
}

function resolveDisplayFromUtilityClasses(
  node: Pick<BuilderNode, "classNames" | "customClasses">,
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): string | undefined {
  const tokens = [
    classNamesToString(node.classNames ?? createEmptyClassNames(), breakpoints),
    ...(node.customClasses ?? []),
  ].flatMap((value) => String(value).split(/\s+/));

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    const normalized = stripUtilityVariantPrefixes(token.trim());
    const displayValue = DISPLAY_UTILITY_TO_VALUE[normalized];
    if (displayValue) {
      return displayValue;
    }
  }

  void breakpoint;
  return undefined;
}

export function resolveParentLayoutContext(
  parent: BuilderNode | null | undefined,
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): ParentLayoutContext | null {
  if (!parent) {
    return null;
  }

  const displayFromStyles = getResponsiveStyleValue(
    parent.styles?.display,
    breakpoint,
    breakpoints,
  );
  const displayFromClasses = resolveDisplayFromUtilityClasses(
    parent,
    breakpoint,
    breakpoints,
  );
  const display = displayFromStyles ?? displayFromClasses ?? "block";

  const flexDirection =
    getResponsiveStyleValue(
      parent.styles?.flexDirection,
      breakpoint,
      breakpoints,
    ) ?? "row";

  const alignItems =
    getResponsiveStyleValue(parent.styles?.alignItems, breakpoint, breakpoints) ??
    "stretch";

  return {
    display,
    flexDirection,
    alignItems,
  };
}

function isFlexDisplay(display: string): boolean {
  return display === "flex" || display === "inline-flex";
}

function isGridDisplay(display: string): boolean {
  return display === "grid" || display === "inline-grid";
}

function isColumnFlexDirection(flexDirection: string): boolean {
  return flexDirection.startsWith("column");
}

function resolveAxisMode(
  styles: StyleMap | undefined,
  axis: "width" | "height",
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): { mode: SizeMode; exactValue?: string } {
  const mode = resolveSizeMode(styles, axis, breakpoint, breakpoints);

  if (mode !== "exact") {
    return { mode };
  }

  return {
    mode,
    exactValue: getResponsiveStyleValue(styles?.[axis], breakpoint, breakpoints),
  };
}

function applyFlexPrimaryFill(
  declarations: Record<string, string>,
  _axis: "width" | "height",
): void {
  declarations.flexGrow = "1";
  declarations.flexShrink = "1";
  declarations.flexBasis = "0";
}

function applyFlexPrimaryHug(declarations: Record<string, string>): void {
  declarations.flexGrow = "0";
  declarations.flexShrink = "1";
  declarations.flexBasis = "auto";
}

function applyFlexCrossFill(
  declarations: Record<string, string>,
  axis: "width" | "height",
): void {
  declarations.alignSelf = "stretch";

  if (axis === "width") {
    declarations.width = "auto";
  } else {
    declarations.height = "auto";
  }
}

function applyFlexCrossHug(
  declarations: Record<string, string>,
  axis: "width" | "height",
): void {
  declarations.alignSelf = "flex-start";

  if (axis === "width") {
    declarations.width = "fit-content";
  } else {
    declarations.height = "fit-content";
  }
}

function applyBlockAxis(
  declarations: Record<string, string>,
  axis: "width" | "height",
  mode: SizeMode,
  exactValue?: string,
): void {
  if (mode === "exact") {
    if (exactValue) {
      declarations[axis] = exactValue;
    }
    return;
  }

  if (mode === "fill") {
    declarations[axis] = "100%";
    return;
  }

  declarations[axis] = "fit-content";
}

function resolveAxisDeclarations(
  styles: StyleMap | undefined,
  parent: ParentLayoutContext | null,
  axis: "width" | "height",
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): Record<string, string> {
  const { mode, exactValue } = resolveAxisMode(
    styles,
    axis,
    breakpoint,
    breakpoints,
  );
  const declarations: Record<string, string> = {};

  if (mode === "exact") {
    applyBlockAxis(declarations, axis, mode, exactValue);
    return declarations;
  }

  if (parent && isFlexDisplay(parent.display)) {
    const columnFlex = isColumnFlexDirection(parent.flexDirection);
    const isPrimaryAxis =
      (axis === "width" && !columnFlex) || (axis === "height" && columnFlex);

    if (isPrimaryAxis) {
      if (mode === "fill") {
        applyFlexPrimaryFill(declarations, axis);
      } else {
        applyFlexPrimaryHug(declarations);
      }
      return declarations;
    }

    if (mode === "fill") {
      applyFlexCrossFill(declarations, axis);
    } else {
      applyFlexCrossHug(declarations, axis);
    }
    return declarations;
  }

  if (parent && isGridDisplay(parent.display)) {
    if (mode === "fill") {
      declarations[axis] = "100%";
      declarations.justifySelf = "stretch";
    } else {
      declarations[axis] = "fit-content";
    }
    return declarations;
  }

  applyBlockAxis(declarations, axis, mode, exactValue);
  return declarations;
}

export function resolveSizingCssForBreakpoint(
  styles: StyleMap | undefined,
  parent: ParentLayoutContext | null,
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): Record<string, string> {
  const widthDeclarations = resolveAxisDeclarations(
    styles,
    parent,
    "width",
    breakpoint,
    breakpoints,
  );
  const heightDeclarations = resolveAxisDeclarations(
    styles,
    parent,
    "height",
    breakpoint,
    breakpoints,
  );

  return {
    ...widthDeclarations,
    ...heightDeclarations,
  };
}

function toResponsiveValue(value: string): Responsive<string> {
  return { [DESKTOP_BASE_BREAKPOINT]: value };
}

export function applySizingResolutionToStyles(
  styles: StyleMap | undefined,
  parent: ParentLayoutContext | null,
  breakpoint: string,
  breakpoints: readonly BreakpointDefinition[],
): StyleMap {
  const source = styles ?? {};
  const resolved = resolveSizingCssForBreakpoint(
    source,
    parent,
    breakpoint,
    breakpoints,
  );
  const next: StyleMap = { ...source };

  for (const key of SIZING_METADATA_KEYS) {
    delete next[key as keyof StyleMap];
  }

  for (const key of RESOLVED_SIZING_KEYS) {
    delete next[key as keyof StyleMap];
  }

  const widthMode = resolveSizeMode(source, "width", breakpoint, breakpoints);
  const heightMode = resolveSizeMode(source, "height", breakpoint, breakpoints);

  if (widthMode === "exact") {
    const exactWidth = getResponsiveStyleValue(
      source.width,
      breakpoint,
      breakpoints,
    );
    if (exactWidth) {
      next.width = toResponsiveValue(exactWidth);
    }
  }

  if (heightMode === "exact") {
    const exactHeight = getResponsiveStyleValue(
      source.height,
      breakpoint,
      breakpoints,
    );
    if (exactHeight) {
      next.height = toResponsiveValue(exactHeight);
    }
  }

  for (const [property, value] of Object.entries(resolved)) {
    next[property as keyof StyleMap] = toResponsiveValue(value);
  }

  return next;
}

export function mergeSizingResolutionAcrossBreakpoints(
  styles: StyleMap | undefined,
  parent: BuilderNode | null | undefined,
  breakpoints: readonly BreakpointDefinition[],
): StyleMap {
  const source = styles ?? {};

  if (!nodeHasExplicitSizing(source)) {
    return { ...source };
  }

  const merged: StyleMap = { ...source };

  for (const key of SIZING_METADATA_KEYS) {
    delete merged[key as keyof StyleMap];
  }

  for (const key of RESOLVED_SIZING_KEYS) {
    delete merged[key as keyof StyleMap];
  }

  const widthMode = resolveSizeMode(
    source,
    "width",
    DESKTOP_BASE_BREAKPOINT,
    breakpoints,
  );
  const heightMode = resolveSizeMode(
    source,
    "height",
    DESKTOP_BASE_BREAKPOINT,
    breakpoints,
  );

  if (widthMode === "exact" && source.width) {
    merged.width = source.width;
  } else {
    delete merged.width;
  }

  if (heightMode === "exact" && source.height) {
    merged.height = source.height;
  } else {
    delete merged.height;
  }

  for (const breakpoint of breakpoints) {
    const parentContext = resolveParentLayoutContext(
      parent,
      breakpoint.name,
      breakpoints,
    );
    const resolved = resolveSizingCssForBreakpoint(
      source,
      parentContext,
      breakpoint.name,
      breakpoints,
    );

    for (const [property, value] of Object.entries(resolved)) {
      const current = merged[property as keyof StyleMap];
      const responsive =
        current && typeof current === "object"
          ? { ...normalizeResponsiveStyleMap(current) }
          : {};

      responsive[breakpoint.name] = value;
      merged[property as keyof StyleMap] = responsive;
    }
  }

  return merged;
}
