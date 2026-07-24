import type { BreakpointDefinition } from "../types/nodes";

export const DESKTOP_BASE_BREAKPOINT = "base";
export const DESKTOP_BASE_LABEL = "Desktop";
export const DEFAULT_DESKTOP_MIN_WIDTH = 1280;
export const DEFAULT_DESKTOP_CANVAS_WIDTH = 1440;
export const DEFAULT_TABLET_MIN_WIDTH = 768;
export const DEFAULT_MOBILE_MIN_WIDTH = 0;
export const DEFAULT_MOBILE_CANVAS_WIDTH = 375;

export type BreakpointWidthInput = {
  name: string;
  minWidth?: string | number | null;
  canvasWidth?: number | null;
  order?: number;
};

export type ResponsiveMediaQueryKind = "max-width" | "min-width";

function clampBreakpointWidth(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, value);
}

export function parseBreakpointMinWidth(
  value: string | number | null | undefined,
  fallback = 0,
): number {
  if (typeof value === "number") {
    return clampBreakpointWidth(value, fallback);
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)/);
  if (!match) {
    return fallback;
  }

  return clampBreakpointWidth(Number.parseFloat(match[1]), fallback);
}

export function formatBreakpointWidth(value: number): string {
  const normalized = Math.max(0, value);
  const rounded = Number.isInteger(normalized)
    ? String(normalized)
    : normalized
        .toFixed(2)
        .replace(/\.0+$/, "")
        .replace(/(\.\d*[1-9])0+$/, "$1");

  return `${rounded}px`;
}

export function resolveEffectiveBreakpointWidth(
  breakpoint: BreakpointWidthInput,
): number {
  if (
    typeof breakpoint.canvasWidth === "number" &&
    breakpoint.canvasWidth > 0
  ) {
    return breakpoint.canvasWidth;
  }

  return parseBreakpointMinWidth(breakpoint.minWidth);
}

export function compareBreakpointsLargestFirst(
  left: BreakpointWidthInput,
  right: BreakpointWidthInput,
): number {
  const leftWidth = resolveEffectiveBreakpointWidth(left);
  const rightWidth = resolveEffectiveBreakpointWidth(right);

  if (leftWidth !== rightWidth) {
    return rightWidth - leftWidth;
  }

  if (
    typeof left.order === "number" &&
    typeof right.order === "number" &&
    left.order !== right.order
  ) {
    return left.order - right.order;
  }

  return left.name.localeCompare(right.name);
}

export function sortBreakpointsByEffectiveWidthDesc(
  breakpoints: readonly BreakpointDefinition[],
): BreakpointDefinition[] {
  return [...breakpoints].sort((left, right) =>
    compareBreakpointsLargestFirst(
      {
        name: left.name,
        minWidth: left.minWidth,
        canvasWidth: left.canvasWidth,
        order: left.order,
      },
      {
        name: right.name,
        minWidth: right.minWidth,
        canvasWidth: right.canvasWidth,
        order: right.order,
      },
    ),
  );
}

export function compareDesktopFirstBreakpointOrder(
  leftId: string,
  leftMinWidth: number,
  rightId: string,
  rightMinWidth: number,
): number {
  if (leftId === DESKTOP_BASE_BREAKPOINT) return -1;
  if (rightId === DESKTOP_BASE_BREAKPOINT) return 1;

  if (leftMinWidth !== rightMinWidth) {
    return rightMinWidth - leftMinWidth;
  }

  return leftId.localeCompare(rightId);
}

export function sortBreakpointDefinitionsDesktopFirst(
  breakpoints: readonly BreakpointDefinition[],
): BreakpointDefinition[] {
  return sortBreakpointsByEffectiveWidthDesc(breakpoints);
}

export function getDesktopBaseBreakpointDefinition(
  breakpoints: readonly BreakpointDefinition[],
): BreakpointDefinition {
  const fromList = breakpoints.find(
    (breakpoint) => breakpoint.name === DESKTOP_BASE_BREAKPOINT,
  );

  if (fromList) {
    return fromList;
  }

  return {
    name: DESKTOP_BASE_BREAKPOINT,
    minWidth: formatBreakpointWidth(DEFAULT_DESKTOP_MIN_WIDTH),
    canvasWidth: DEFAULT_DESKTOP_CANVAS_WIDTH,
    label: DESKTOP_BASE_LABEL,
  };
}

export function createDesktopFirstFallbackBreakpoints(): BreakpointDefinition[] {
  return [
    {
      name: DESKTOP_BASE_BREAKPOINT,
      minWidth: formatBreakpointWidth(DEFAULT_DESKTOP_MIN_WIDTH),
      canvasWidth: DEFAULT_DESKTOP_CANVAS_WIDTH,
      label: DESKTOP_BASE_LABEL,
    },
    {
      name: "tablet",
      minWidth: formatBreakpointWidth(DEFAULT_TABLET_MIN_WIDTH),
      canvasWidth: DEFAULT_TABLET_MIN_WIDTH,
      label: "Tablet",
    },
    {
      name: "mobile",
      minWidth: formatBreakpointWidth(DEFAULT_MOBILE_MIN_WIDTH),
      canvasWidth: DEFAULT_MOBILE_CANVAS_WIDTH,
      label: "Mobile",
    },
  ];
}

export function getDesktopFirstOverrideBreakpoints(
  breakpoints: readonly BreakpointDefinition[],
): BreakpointDefinition[] {
  return sortBreakpointsByEffectiveWidthDesc(breakpoints).filter(
    (breakpoint) => breakpoint.name !== DESKTOP_BASE_BREAKPOINT,
  );
}

export function getDownstreamBreakpointNames(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): string[] {
  const sorted = sortBreakpointDefinitionsDesktopFirst(breakpoints);
  const currentIndex = sorted.findIndex(
    (breakpoint) => breakpoint.name === breakpointName,
  );

  if (currentIndex === -1) {
    return [];
  }

  return sorted.slice(currentIndex + 1).map((breakpoint) => breakpoint.name);
}

export function isUpstreamOfDesktopBase(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): boolean {
  if (breakpointName === DESKTOP_BASE_BREAKPOINT) {
    return false;
  }

  const sorted = sortBreakpointDefinitionsDesktopFirst(breakpoints);
  const baseIndex = sorted.findIndex(
    (breakpoint) => breakpoint.name === DESKTOP_BASE_BREAKPOINT,
  );
  const currentIndex = sorted.findIndex(
    (breakpoint) => breakpoint.name === breakpointName,
  );

  if (baseIndex === -1 || currentIndex === -1) {
    return false;
  }

  return currentIndex < baseIndex;
}

export function buildDesktopFirstCascadeStyleValues(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
  value: string,
  authoredBreakpointNames: readonly string[],
): Record<string, string | undefined> | null {
  const downstreamBreakpointNames = getDownstreamBreakpointNames(
    breakpoints,
    breakpointName,
  );
  const isUpstream = isUpstreamOfDesktopBase(breakpoints, breakpointName);
  const authoredBreakpoints = new Set(authoredBreakpointNames);
  const breakpointsToClear = downstreamBreakpointNames.filter((breakpoint) =>
    authoredBreakpoints.has(breakpoint),
  );

  if (!isUpstream && breakpointsToClear.length === 0) {
    return null;
  }

  const breakpointValues: Record<string, string | undefined> = {
    [breakpointName]: value,
  };

  if (isUpstream) {
    breakpointValues[DESKTOP_BASE_BREAKPOINT] = value;
  }

  for (const breakpoint of breakpointsToClear) {
    if (isUpstream && breakpoint === DESKTOP_BASE_BREAKPOINT) {
      continue;
    }

    breakpointValues[breakpoint] = undefined;
  }

  return breakpointValues;
}

export function getNextLargerBreakpointByEffectiveWidth(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): BreakpointDefinition | null {
  const sorted = sortBreakpointsByEffectiveWidthDesc(breakpoints);
  const currentIndex = sorted.findIndex(
    (breakpoint) => breakpoint.name === breakpointName,
  );

  if (currentIndex <= 0) {
    return null;
  }

  return sorted[currentIndex - 1] ?? null;
}

export function getResponsiveMediaQueryKind(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): ResponsiveMediaQueryKind | null {
  if (breakpointName === DESKTOP_BASE_BREAKPOINT) {
    return null;
  }

  const breakpoint = breakpoints.find((entry) => entry.name === breakpointName);
  if (!breakpoint) {
    return null;
  }

  const baseEffective = resolveEffectiveBreakpointWidth(
    getDesktopBaseBreakpointDefinition(breakpoints),
  );
  const effective = resolveEffectiveBreakpointWidth(breakpoint);

  return effective > baseEffective ? "min-width" : "max-width";
}

export function computeBreakpointRangeLabel(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): string {
  const sorted = sortBreakpointsByEffectiveWidthDesc(breakpoints);
  const currentIndex = sorted.findIndex(
    (breakpoint) => breakpoint.name === breakpointName,
  );

  if (currentIndex === -1) {
    return "";
  }

  const width = resolveEffectiveBreakpointWidth(sorted[currentIndex]);
  const nextLarger =
    currentIndex > 0 ? sorted[currentIndex - 1] ?? null : null;

  if (!nextLarger) {
    return `${width}px+`;
  }

  const nextLargerWidth = resolveEffectiveBreakpointWidth(nextLarger);
  return `${width}px \u2014 ${nextLargerWidth - 1}px`;
}

export function createResponsiveMediaQuery(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): string | null {
  if (breakpointName === DESKTOP_BASE_BREAKPOINT) {
    return null;
  }

  const breakpoint = breakpoints.find((entry) => entry.name === breakpointName);
  if (!breakpoint) {
    return null;
  }

  const baseEffective = resolveEffectiveBreakpointWidth(
    getDesktopBaseBreakpointDefinition(breakpoints),
  );
  const effective = resolveEffectiveBreakpointWidth(breakpoint);

  if (effective > baseEffective) {
    return `(min-width: ${formatBreakpointWidth(effective)})`;
  }

  const nextLarger = getNextLargerBreakpointByEffectiveWidth(
    breakpoints,
    breakpointName,
  );
  if (!nextLarger) {
    return null;
  }

  const maxWidth = resolveEffectiveBreakpointWidth(nextLarger) - 0.02;
  return maxWidth >= 0
    ? `(max-width: ${formatBreakpointWidth(maxWidth)})`
    : null;
}

export function getDesktopFirstMaxWidthForBreakpoint(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): number | null {
  const mediaQuery = createResponsiveMediaQuery(breakpoints, breakpointName);
  if (!mediaQuery) {
    return null;
  }

  const maxMatch = mediaQuery.match(/max-width:\s*([\d.]+)px/);
  if (!maxMatch) {
    return null;
  }

  return Number.parseFloat(maxMatch[1]);
}

export function createDesktopFirstMaxWidthMediaQuery(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
): string | null {
  const kind = getResponsiveMediaQueryKind(breakpoints, breakpointName);
  if (kind !== "max-width") {
    return null;
  }

  return createResponsiveMediaQuery(breakpoints, breakpointName);
}

export function compareResponsiveMediaQueryOutputOrder(
  leftQuery: string,
  rightQuery: string,
): number {
  const leftKind = leftQuery.includes("min-width") ? "min-width" : "max-width";
  const rightKind = rightQuery.includes("min-width")
    ? "min-width"
    : "max-width";

  if (leftKind !== rightKind) {
    return leftKind === "max-width" ? -1 : 1;
  }

  const leftMatch = leftQuery.match(/(?:max|min)-width:\s*([\d.]+)px/);
  const rightMatch = rightQuery.match(/(?:max|min)-width:\s*([\d.]+)px/);
  const leftValue = leftMatch ? Number.parseFloat(leftMatch[1]) : 0;
  const rightValue = rightMatch ? Number.parseFloat(rightMatch[1]) : 0;

  if (leftKind === "max-width") {
    return rightValue - leftValue;
  }

  return leftValue - rightValue;
}

export function getOrderedResponsiveMediaQueries(
  breakpoints: readonly BreakpointDefinition[],
): string[] {
  const queries = getDesktopFirstOverrideBreakpoints(breakpoints)
    .map((breakpoint) => createResponsiveMediaQuery(breakpoints, breakpoint.name))
    .filter((query): query is string => Boolean(query));

  return [...new Set(queries)].sort(compareResponsiveMediaQueryOutputOrder);
}
