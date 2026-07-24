import { VARIABLE_REFERENCE_PATTERN } from "./variableReferences";

const SIMPLE_CSS_LENGTH_PATTERN =
  /^(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)?$/;

const CALC_FUNCTION_PATTERN = /^calc\(/i;

/**
 * True for values safe to scrub with pointer drag (numeric + optional unit only).
 */
export function isScrubbableCssLength(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (
    trimmed.startsWith("var(") ||
    CALC_FUNCTION_PATTERN.test(trimmed) ||
    trimmed === "auto"
  ) {
    return false;
  }

  return SIMPLE_CSS_LENGTH_PATTERN.test(trimmed);
}

export function extractScrubNumericAndUnit(
  value: string,
): { numeric: number; unit: string } | null {
  const trimmed = value.trim();
  const matched = trimmed.match(SIMPLE_CSS_LENGTH_PATTERN);
  if (!matched) {
    return null;
  }

  const numeric = Number.parseFloat(matched[1]);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return {
    numeric,
    unit: matched[2] ?? "px",
  };
}

/**
 * Validates inspector margin/padding length tokens before persisting.
 */
export function isValidSpacingCssValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === "0" || trimmed === "auto") {
    return true;
  }

  if (VARIABLE_REFERENCE_PATTERN.test(trimmed)) {
    return true;
  }

  if (CALC_FUNCTION_PATTERN.test(trimmed)) {
    return trimmed.endsWith(")");
  }

  return SIMPLE_CSS_LENGTH_PATTERN.test(trimmed);
}

export function formatPropertySaveError(message: string): string {
  const stripped = message.replace(
    /^(?:mutate|savePage):[\w-]+(?::[\w-]+)? failed:\s*/i,
    "",
  );
  return stripped.trim() || message;
}
