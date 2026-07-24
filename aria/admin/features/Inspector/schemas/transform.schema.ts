/**
 * Transform Schema
 *
 * Zod validation and helpers for CSS transform and transform-origin values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

const ORIGIN_KEYWORD_VALUES = [
  "left",
  "center",
  "right",
  "top",
  "bottom",
] as const;

const KNOWN_TRANSFORM_FUNCTIONS = new Set([
  "translate",
  "translatex",
  "translatey",
  "rotate",
  "scale",
  "scalex",
  "scaley",
  "skew",
  "skewx",
  "skewy",
]);

export const TransformValueSchema = z.object({
  transform: ResponsiveStringSchema,
  transformOrigin: ResponsiveStringSchema,
});

export type TransformValue = z.infer<typeof TransformValueSchema>;

export interface TransformState {
  translateX: string;
  translateY: string;
  rotate: string;
  scaleX: string;
  scaleY: string;
  skewX: string;
  skewY: string;
  originX: string;
  originY: string;
}

export const DEFAULT_TRANSFORM: TransformValue = {
  transform: createDefaultResponsive("none"),
  transformOrigin: createDefaultResponsive("center center"),
};

export const TRANSFORM_DEFAULTS: TransformState = {
  translateX: "0px",
  translateY: "0px",
  rotate: "0deg",
  scaleX: "1",
  scaleY: "1",
  skewX: "0deg",
  skewY: "0deg",
  originX: "center",
  originY: "center",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function splitTopLevelComma(value: string): string[] {
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

    if (char === "," && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function extractFunctionArgument(
  css: string,
  functionName: string,
): string | null {
  const pattern = new RegExp(`${escapeRegExp(functionName)}\\(`, "i");
  const match = pattern.exec(css);
  if (!match) {
    return null;
  }

  const argumentStart = (match.index ?? 0) + match[0].length;
  let depth = 0;

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

function normalizeNumberishValue(
  value: string,
  unit: string,
  fallback: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (
    trimmed.startsWith("var(") ||
    trimmed.startsWith("calc(") ||
    trimmed.startsWith("clamp(")
  ) {
    return trimmed;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${Number(trimmed)}${unit}`;
  }

  return trimmed;
}

function normalizeScaleValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return TRANSFORM_DEFAULTS.scaleX;
  }

  if (
    trimmed.startsWith("var(") ||
    trimmed.startsWith("calc(") ||
    trimmed.startsWith("clamp(")
  ) {
    return trimmed;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return String(Number(trimmed));
  }

  return trimmed;
}

function normalizeOriginValue(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }

  if (
    trimmed.startsWith("var(") ||
    trimmed.startsWith("calc(") ||
    trimmed.startsWith("clamp(")
  ) {
    return trimmed;
  }

  if ((ORIGIN_KEYWORD_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${Number(trimmed)}px`;
  }

  return trimmed;
}

export function defaultTransformState(): TransformState {
  return { ...TRANSFORM_DEFAULTS };
}

export function transformStateToCSS(state: TransformState): string {
  const translateX = normalizeNumberishValue(
    state.translateX,
    "px",
    TRANSFORM_DEFAULTS.translateX,
  );
  const translateY = normalizeNumberishValue(
    state.translateY,
    "px",
    TRANSFORM_DEFAULTS.translateY,
  );
  const rotate = normalizeNumberishValue(
    state.rotate,
    "deg",
    TRANSFORM_DEFAULTS.rotate,
  );
  const scaleX = normalizeScaleValue(state.scaleX);
  const scaleY = normalizeScaleValue(state.scaleY);
  const skewX = normalizeNumberishValue(
    state.skewX,
    "deg",
    TRANSFORM_DEFAULTS.skewX,
  );
  const skewY = normalizeNumberishValue(
    state.skewY,
    "deg",
    TRANSFORM_DEFAULTS.skewY,
  );

  const parts: string[] = [];

  if (
    translateX !== TRANSFORM_DEFAULTS.translateX ||
    translateY !== TRANSFORM_DEFAULTS.translateY
  ) {
    parts.push(`translate(${translateX}, ${translateY})`);
  }

  if (rotate !== TRANSFORM_DEFAULTS.rotate) {
    parts.push(`rotate(${rotate})`);
  }

  if (
    scaleX !== TRANSFORM_DEFAULTS.scaleX ||
    scaleY !== TRANSFORM_DEFAULTS.scaleY
  ) {
    parts.push(`scale(${scaleX}, ${scaleY})`);
  }

  if (
    skewX !== TRANSFORM_DEFAULTS.skewX ||
    skewY !== TRANSFORM_DEFAULTS.skewY
  ) {
    parts.push(`skew(${skewX}, ${skewY})`);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

export function transformOriginStateToCSS(state: TransformState): string {
  const originX = normalizeOriginValue(
    state.originX,
    TRANSFORM_DEFAULTS.originX,
  );
  const originY = normalizeOriginValue(
    state.originY,
    TRANSFORM_DEFAULTS.originY,
  );
  return `${originX} ${originY}`;
}

export function cssToTransformState(
  transform: string | null | undefined,
  transformOrigin: string | null | undefined,
): TransformState {
  const state = defaultTransformState();
  const normalizedTransform =
    typeof transform === "string" ? transform.trim() : "";

  if (normalizedTransform && normalizedTransform.toLowerCase() !== "none") {
    const translateArgument = extractFunctionArgument(
      normalizedTransform,
      "translate",
    );
    if (translateArgument) {
      const parts = splitTopLevelComma(translateArgument);
      const values =
        parts.length > 1 ? parts : splitTopLevelWhitespace(translateArgument);
      state.translateX = values[0] ?? state.translateX;
      state.translateY = values[1] ?? state.translateY;
    }

    const rotateArgument = extractFunctionArgument(
      normalizedTransform,
      "rotate",
    );
    if (rotateArgument) {
      state.rotate = rotateArgument;
    }

    const scaleArgument = extractFunctionArgument(normalizedTransform, "scale");
    if (scaleArgument) {
      const parts = splitTopLevelComma(scaleArgument);
      const values =
        parts.length > 1 ? parts : splitTopLevelWhitespace(scaleArgument);
      state.scaleX = values[0] ?? state.scaleX;
      state.scaleY = values[1] ?? values[0] ?? state.scaleY;
    }

    const skewArgument = extractFunctionArgument(normalizedTransform, "skew");
    if (skewArgument) {
      const parts = splitTopLevelComma(skewArgument);
      const values =
        parts.length > 1 ? parts : splitTopLevelWhitespace(skewArgument);
      state.skewX = values[0] ?? state.skewX;
      state.skewY = values[1] ?? state.skewY;
    }
  }

  const originTokens = splitTopLevelWhitespace(transformOrigin ?? "");
  if (originTokens[0]) {
    state.originX = originTokens[0];
  }
  if (originTokens[1]) {
    state.originY = originTokens[1];
  }

  return state;
}

export function hasUnsupportedTransformFunctions(
  transform: string | null | undefined,
): boolean {
  const normalized = typeof transform === "string" ? transform.trim() : "";
  if (!normalized || normalized.toLowerCase() === "none") {
    return false;
  }

  const matches = normalized.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)\s*\(/g);
  for (const match of matches) {
    const functionName = (match[1] ?? "").toLowerCase();
    if (!KNOWN_TRANSFORM_FUNCTIONS.has(functionName)) {
      return true;
    }
  }

  return false;
}
