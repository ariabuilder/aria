import {
  DEFAULT_DESKTOP_CANVAS_WIDTH,
  DEFAULT_MOBILE_CANVAS_WIDTH,
  DEFAULT_TABLET_MIN_WIDTH,
} from "@/lib/styles/responsiveBreakpoints";
import type { UniversalBreakpointItem } from "@/lib/styles/universalDesignSystem";

export type PreviewViewportPreset = "desktop" | "tablet" | "mobile";

export const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  "desktop",
  "tablet",
  "mobile",
];

/** Maps the three Studio preview presets to canonical design-system breakpoint ids. */
export const PRESET_BREAKPOINT_IDS: Record<PreviewViewportPreset, string> = {
  desktop: "base",
  tablet: "tablet",
  mobile: "mobile",
};

const PRESET_FALLBACK_WIDTHS: Record<PreviewViewportPreset, number> = {
  desktop: DEFAULT_DESKTOP_CANVAS_WIDTH,
  tablet: DEFAULT_TABLET_MIN_WIDTH,
  mobile: DEFAULT_MOBILE_CANVAS_WIDTH,
};

export interface PreviewViewportPresetOption {
  preset: PreviewViewportPreset;
  breakpointId: string;
  label: string;
  width: number;
  tooltip: string;
}

function isEnabledBreakpoint(
  breakpoint: UniversalBreakpointItem,
): boolean {
  return breakpoint.id === "base" || breakpoint.enabled;
}

function resolveCanvasWidth(
  breakpoint: UniversalBreakpointItem,
  fallback: number,
): number {
  if (typeof breakpoint.canvasWidth === "number" && breakpoint.canvasWidth > 0) {
    return breakpoint.canvasWidth;
  }

  if (breakpoint.minWidth > 0) {
    return breakpoint.minWidth;
  }

  return fallback;
}

function findEnabledBreakpoint(
  breakpoints: readonly UniversalBreakpointItem[],
  id: string,
): UniversalBreakpointItem | undefined {
  return breakpoints.find(
    (breakpoint) => breakpoint.id === id && isEnabledBreakpoint(breakpoint),
  );
}

function findLargestNonBaseBreakpoint(
  breakpoints: readonly UniversalBreakpointItem[],
): UniversalBreakpointItem | undefined {
  return breakpoints
    .filter(isEnabledBreakpoint)
    .filter((breakpoint) => breakpoint.id !== "base")
    .sort((left, right) => right.minWidth - left.minWidth)[0];
}

function findSmallestNonBaseBreakpoint(
  breakpoints: readonly UniversalBreakpointItem[],
): UniversalBreakpointItem | undefined {
  return breakpoints
    .filter(isEnabledBreakpoint)
    .filter((breakpoint) => breakpoint.id !== "base")
    .sort((left, right) => left.minWidth - right.minWidth)[0];
}

export function resolvePreviewPresetBreakpoint(
  preset: PreviewViewportPreset,
  breakpoints: readonly UniversalBreakpointItem[],
): UniversalBreakpointItem | undefined {
  const primaryId = PRESET_BREAKPOINT_IDS[preset];
  const primary = findEnabledBreakpoint(breakpoints, primaryId);
  if (primary) {
    return primary;
  }

  if (preset === "desktop") {
    return findEnabledBreakpoint(breakpoints, "base");
  }

  if (preset === "tablet") {
    return (
      findEnabledBreakpoint(breakpoints, "laptop") ??
      findLargestNonBaseBreakpoint(breakpoints)
    );
  }

  return findSmallestNonBaseBreakpoint(breakpoints);
}

export function resolvePreviewPresetCanvasWidth(
  preset: PreviewViewportPreset,
  breakpoints: readonly UniversalBreakpointItem[],
): number {
  const breakpoint = resolvePreviewPresetBreakpoint(preset, breakpoints);
  if (!breakpoint) {
    return PRESET_FALLBACK_WIDTHS[preset];
  }

  return resolveCanvasWidth(breakpoint, PRESET_FALLBACK_WIDTHS[preset]);
}

export function buildPreviewViewportPresetOptions(
  breakpoints: readonly UniversalBreakpointItem[],
): PreviewViewportPresetOption[] {
  return PREVIEW_VIEWPORT_PRESETS.map((preset) => {
    const breakpoint = resolvePreviewPresetBreakpoint(preset, breakpoints);
    const width = resolvePreviewPresetCanvasWidth(preset, breakpoints);
    const label =
      preset === "desktop"
        ? "Desktop"
        : preset === "tablet"
          ? "Tablet"
          : "Mobile";

    const breakpointLabel = breakpoint?.label?.trim();
    const tooltipLabel =
      breakpoint && breakpointLabel && breakpointLabel !== label
        ? `${label} (${breakpointLabel})`
        : label;

    return {
      preset,
      breakpointId: breakpoint?.id ?? PRESET_BREAKPOINT_IDS[preset],
      label,
      width,
      tooltip: `${tooltipLabel} · ${width}px`,
    };
  });
}
