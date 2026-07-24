/**
 * Filter Schema
 *
 * Zod validation for CSS filter and backdrop-filter values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

/**
 * Drop shadow sub-definition (used within filter/backdrop-filter)
 */
export const FilterDropShadowSchema = z.object({
  x: z.string().default("0"),
  y: z.string().default("0"),
  blur: z.string().default("0"),
  color: z.string().default("transparent"),
});

export const FilterValueSchema = z.object({
  filter: ResponsiveStringSchema,
  backdropFilter: ResponsiveStringSchema,
});

export type FilterValue = z.infer<typeof FilterValueSchema>;
export type FilterDropShadow = z.infer<typeof FilterDropShadowSchema>;

export const DEFAULT_FILTER: FilterValue = {
  filter: createDefaultResponsive("none"),
  backdropFilter: createDefaultResponsive("none"),
};

/** Default (identity) values — omit from output when at these values */
export const FILTER_DEFAULTS = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0,
} as const;

export interface FilterState {
  blur: string;
  brightness: string;
  contrast: string;
  grayscale: string;
  hueRotate: string;
  invert: string;
  saturate: string;
  sepia: string;
  dropShadowX: string;
  dropShadowY: string;
  dropShadowBlur: string;
  dropShadowColor: string;
}

export function defaultFilterState(): FilterState {
  return {
    blur: "0",
    brightness: "100",
    contrast: "100",
    grayscale: "0",
    hueRotate: "0",
    invert: "0",
    saturate: "100",
    sepia: "0",
    dropShadowX: "0",
    dropShadowY: "0",
    dropShadowBlur: "0",
    dropShadowColor: "transparent",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumberishValue(
  value: string,
  expectedUnit?: string,
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const pattern = expectedUnit
    ? new RegExp(
        `^(-?\\d+(?:\\.\\d+)?)(?:${escapeRegExp(expectedUnit)})?$`,
        "i",
      )
    : /^(-?\d+(?:\.\d+)?)$/;
  const match = trimmed.match(pattern);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1] ?? "0");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeParsedValue(value: string, expectedUnit?: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const numeric = parseNumberishValue(trimmed, expectedUnit);
  if (numeric === null) {
    return trimmed;
  }

  return String(Math.round(numeric));
}

function serializeFilterValue(
  value: string,
  defaultValue: number,
  unit: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = parseNumberishValue(trimmed, unit);
  if (numeric !== null) {
    if (numeric === defaultValue) {
      return null;
    }

    return `${Math.round(numeric)}${unit}`;
  }

  return trimmed;
}

function extractFunctionArgument(
  css: string,
  functionName: string,
): string | null {
  const start = css.indexOf(`${functionName}(`);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  const argumentStart = start + functionName.length + 1;

  for (let index = argumentStart; index < css.length; index += 1) {
    const char = css[index];

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char !== ")") {
      continue;
    }

    if (depth === 0) {
      return css.slice(argumentStart, index).trim();
    }

    depth -= 1;
  }

  return null;
}

function splitTopLevelWhitespace(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Build a CSS filter string from state, omitting identity values.
 */
export function filterStateToCSS(state: FilterState): string {
  const parts: string[] = [];

  const blur = serializeFilterValue(state.blur, FILTER_DEFAULTS.blur, "px");
  if (blur !== null) {
    parts.push(`blur(${blur})`);
  }

  const brightness = serializeFilterValue(
    state.brightness,
    FILTER_DEFAULTS.brightness,
    "%",
  );
  if (brightness !== null) {
    parts.push(`brightness(${brightness})`);
  }

  const contrast = serializeFilterValue(
    state.contrast,
    FILTER_DEFAULTS.contrast,
    "%",
  );
  if (contrast !== null) {
    parts.push(`contrast(${contrast})`);
  }

  const grayscale = serializeFilterValue(
    state.grayscale,
    FILTER_DEFAULTS.grayscale,
    "%",
  );
  if (grayscale !== null) {
    parts.push(`grayscale(${grayscale})`);
  }

  const hueRotate = serializeFilterValue(
    state.hueRotate,
    FILTER_DEFAULTS.hueRotate,
    "deg",
  );
  if (hueRotate !== null) {
    parts.push(`hue-rotate(${hueRotate})`);
  }

  const invert = serializeFilterValue(
    state.invert,
    FILTER_DEFAULTS.invert,
    "%",
  );
  if (invert !== null) {
    parts.push(`invert(${invert})`);
  }

  const saturate = serializeFilterValue(
    state.saturate,
    FILTER_DEFAULTS.saturate,
    "%",
  );
  if (saturate !== null) {
    parts.push(`saturate(${saturate})`);
  }

  const sepia = serializeFilterValue(state.sepia, FILTER_DEFAULTS.sepia, "%");
  if (sepia !== null) {
    parts.push(`sepia(${sepia})`);
  }

  const dsX = serializeFilterValue(state.dropShadowX, 0, "px");
  const dsY = serializeFilterValue(state.dropShadowY, 0, "px");
  const dsBlur = serializeFilterValue(state.dropShadowBlur, 0, "px");
  const dsColor = state.dropShadowColor.trim();
  const dsActive =
    dsX !== null ||
    dsY !== null ||
    dsBlur !== null ||
    (dsColor !== "" && dsColor !== "transparent");

  if (dsActive) {
    const x = dsX ?? "0px";
    const y = dsY ?? "0px";
    const b = dsBlur ?? "0px";
    const c = dsColor || "transparent";
    parts.push(`drop-shadow(${x} ${y} ${b} ${c})`);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

/**
 * Parse a CSS filter string back to FilterState.
 */
export function cssToFilterState(css: string): FilterState {
  const state = defaultFilterState();
  if (!css || css === "none") return state;

  const blur = extractFunctionArgument(css, "blur");
  if (blur !== null) state.blur = normalizeParsedValue(blur, "px");

  const brightness = extractFunctionArgument(css, "brightness");
  if (brightness !== null)
    state.brightness = normalizeParsedValue(brightness, "%");

  const contrast = extractFunctionArgument(css, "contrast");
  if (contrast !== null) state.contrast = normalizeParsedValue(contrast, "%");

  const grayscale = extractFunctionArgument(css, "grayscale");
  if (grayscale !== null)
    state.grayscale = normalizeParsedValue(grayscale, "%");

  const hueRotate = extractFunctionArgument(css, "hue-rotate");
  if (hueRotate !== null)
    state.hueRotate = normalizeParsedValue(hueRotate, "deg");

  const invert = extractFunctionArgument(css, "invert");
  if (invert !== null) state.invert = normalizeParsedValue(invert, "%");

  const saturate = extractFunctionArgument(css, "saturate");
  if (saturate !== null) state.saturate = normalizeParsedValue(saturate, "%");

  const sepia = extractFunctionArgument(css, "sepia");
  if (sepia !== null) state.sepia = normalizeParsedValue(sepia, "%");

  const dropShadow = extractFunctionArgument(css, "drop-shadow");
  if (dropShadow !== null) {
    const parts = splitTopLevelWhitespace(dropShadow);
    if (parts[0]) state.dropShadowX = normalizeParsedValue(parts[0], "px");
    if (parts[1]) state.dropShadowY = normalizeParsedValue(parts[1], "px");
    if (parts[2]) state.dropShadowBlur = normalizeParsedValue(parts[2], "px");
    if (parts.length > 3) state.dropShadowColor = parts.slice(3).join(" ");
  }

  return state;
}
