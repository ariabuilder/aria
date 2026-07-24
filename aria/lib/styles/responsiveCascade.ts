import { normalizeResponsiveStyleMap } from "../blocks/normalizeResponsiveStyleMap";
import type { BreakpointDefinition } from "../types/nodes";
import {
  buildDesktopFirstCascadeStyleValues,
  getDownstreamBreakpointNames,
} from "./responsiveBreakpoints";

export type ResponsiveStyleBreakpointValues = Record<
  string,
  string | undefined
>;

export type CascadeStyleMutation = Record<
  string,
  ResponsiveStyleBreakpointValues
>;

export function getAuthoredBreakpointNamesFromStyleValue(
  styleValue: unknown,
): string[] {
  const responsiveMap = normalizeResponsiveStyleMap(styleValue);

  return Object.entries(responsiveMap)
    .filter(([, value]) => value !== undefined)
    .map(([breakpoint]) => breakpoint);
}

export function buildDesktopFirstCascadeClearValues(
  breakpoints: readonly BreakpointDefinition[],
  breakpointName: string,
  authoredBreakpointNames: readonly string[],
): ResponsiveStyleBreakpointValues | null {
  const downstreamBreakpointNames = getDownstreamBreakpointNames(
    breakpoints,
    breakpointName,
  );
  const authoredBreakpoints = new Set(authoredBreakpointNames);
  const breakpointsToClear = [
    breakpointName,
    ...downstreamBreakpointNames,
  ].filter((breakpoint) => authoredBreakpoints.has(breakpoint));

  if (breakpointsToClear.length === 0) {
    return null;
  }

  return Object.fromEntries(
    breakpointsToClear.map((breakpoint) => [breakpoint, undefined]),
  );
}

export function buildDesktopFirstCascadeStyleMutation(
  breakpoints: readonly BreakpointDefinition[],
  propertyName: string,
  breakpointName: string,
  value: string | undefined,
  styleValue: unknown,
): CascadeStyleMutation | null {
  const authoredBreakpointNames =
    getAuthoredBreakpointNamesFromStyleValue(styleValue);

  if (value === undefined) {
    const clearValues = buildDesktopFirstCascadeClearValues(
      breakpoints,
      breakpointName,
      authoredBreakpointNames,
    );

    if (!clearValues) {
      return null;
    }

    return {
      [propertyName]: clearValues,
    };
  }

  const cascadeValues = buildDesktopFirstCascadeStyleValues(
    breakpoints,
    breakpointName,
    value,
    authoredBreakpointNames,
  );

  if (!cascadeValues) {
    return null;
  }

  return {
    [propertyName]: cascadeValues,
  };
}

export function mergeCascadeStyleMutations(
  mutations: Array<CascadeStyleMutation | null>,
): CascadeStyleMutation {
  const merged: CascadeStyleMutation = {};

  for (const mutation of mutations) {
    if (!mutation) {
      continue;
    }

    for (const [propertyName, breakpointValues] of Object.entries(mutation)) {
      merged[propertyName] = {
        ...(merged[propertyName] ?? {}),
        ...breakpointValues,
      };
    }
  }

  return merged;
}

export function cascadeMutationToCanvasStyles(
  mutation: CascadeStyleMutation,
): Record<string, Record<string, string | undefined>> {
  const canvasStyles: Record<string, Record<string, string | undefined>> = {};

  for (const [propertyName, breakpointValues] of Object.entries(mutation)) {
    for (const [breakpoint, value] of Object.entries(breakpointValues)) {
      canvasStyles[breakpoint] = {
        ...(canvasStyles[breakpoint] ?? {}),
        [propertyName]: value,
      };
    }
  }

  return canvasStyles;
}

export function getCascadeTouchedBreakpointNames(
  mutation: CascadeStyleMutation,
): string[] {
  const touched = new Set<string>();

  for (const breakpointValues of Object.values(mutation)) {
    for (const breakpoint of Object.keys(breakpointValues)) {
      touched.add(breakpoint);
    }
  }

  return Array.from(touched);
}
