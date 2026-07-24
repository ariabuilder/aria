/**
 * CSS validation helpers for advanced/custom CSS authoring.
 */

const FORBIDDEN_ADVANCED_CSS_PATTERNS = [
  /@import\b/i,
  /javascript\s*:/i,
  /expression\s*\(/i,
  /\bbehavior\s*:/i,
  /-moz-binding/i,
  /url\s*\(\s*["']?\s*javascript:/i,
] as const;

const FORBIDDEN_CONTEXT_SELECTOR_PATTERNS = [
  /@import\b/i,
  /url\s*\(/i,
  /expression\s*\(/i,
  /\bbehavior\b/i,
  /-moz-binding/i,
  /javascript\s*:/i,
] as const;

export interface CssValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAdvancedCss(css: string): CssValidationResult {
  const trimmed = css.trim();

  if (!trimmed) {
    return { valid: true };
  }

  if (trimmed.length > 4096) {
    return { valid: false, error: "Advanced CSS exceeds 4KB limit" };
  }

  for (const pattern of FORBIDDEN_ADVANCED_CSS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: "Advanced CSS contains forbidden constructs",
      };
    }
  }

  const openBraces = (trimmed.match(/{/g) ?? []).length;
  const closeBraces = (trimmed.match(/}/g) ?? []).length;

  if (openBraces !== closeBraces) {
    return { valid: false, error: "Advanced CSS has unbalanced braces" };
  }

  if (openBraces > 24) {
    return { valid: false, error: "Advanced CSS nesting is too deep" };
  }

  return { valid: true };
}

export function validateContextSelector(
  selector: string,
  semanticClassNames: readonly string[],
): CssValidationResult {
  const trimmed = selector.trim();

  if (!trimmed) {
    return { valid: false, error: "Selector is required" };
  }

  if (trimmed.length > 256) {
    return { valid: false, error: "Selector exceeds 256 characters" };
  }

  for (const pattern of FORBIDDEN_CONTEXT_SELECTOR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: "Selector contains forbidden constructs",
      };
    }
  }

  const referencesSemanticClass = semanticClassNames.some((className) =>
    trimmed.includes(`.${className}`),
  );

  if (!referencesSemanticClass) {
    return {
      valid: false,
      error: "Selector must reference at least one semantic class",
    };
  }

  return { valid: true };
}

export function validateSiteAdvancedCssTotal(
  classes: Record<string, { advancedCss?: string }>,
): CssValidationResult {
  const total = Object.values(classes).reduce(
    (sum, cls) => sum + (cls.advancedCss?.length ?? 0),
    0,
  );

  if (total > 32 * 1024) {
    return {
      valid: false,
      error: "Total advanced CSS across all classes exceeds 32KB",
    };
  }

  return { valid: true };
}
