/**
 * Heuristic detection for Tailwind / UnoCSS utility class tokens.
 * Used by HTML import and the design-system utility parser.
 */

const KNOWN_VARIANT_PREFIX_REGEX =
  /^(?:sm|md|lg|xl|2xl|hover|focus|focus-within|focus-visible|active|disabled|visited|first|last|odd|even|before|after|dark|light|motion-safe|motion-reduce|print|portrait|landscape|open|selection|marker|file|backdrop|supports|aria-[^:]+|data-[^:]+):/;

/** Utilities that are a single token without a value suffix (e.g. `border`, not `border-2`). */
const STANDALONE_UTILITY_PATTERN =
  /^(?:border|ring|outline|flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|container|group|peer|truncate|italic|not-italic|underline|line-through|no-underline|uppercase|lowercase|capitalize|normal-case|antialiased|subpixel-antialiased|sr-only|not-sr-only|table-auto|table-fixed|border-collapse|border-separate|box-border|box-content|aspect-auto|aspect-square|object-contain|object-cover|object-fill|object-none|object-scale-down|isolate|isolation-auto)$/;

export const LIKELY_UTILITY_CLASS_PATTERNS: readonly RegExp[] = [
  /^(?:m|p)(?:[trblxyse])?-.+$/,
  /^(?:ms|me)-.+$/,
  /^(?:w|h|min-w|min-h|max-w|max-h)-.+$/,
  /^size-.+$/,
  /^gap(?:[xy])?-.+$/,
  /^space-[xy]-.+$/,
  /^grid(?:-.+)?$/,
  /^grid-cols-.+$/,
  /^grid-rows-.+$/,
  /^col(?:-span)?-.+$/,
  /^row(?:-span)?-.+$/,
  /^flex(?:-.+)?$/,
  /^(?:grow|shrink|basis)(?:-.+)?$/,
  /^(?:justify|items|content|self|place)-.+$/,
  /^(?:text|bg|border|ring|stroke|fill|outline|decoration|divide|accent|caret|placeholder|from|via|to)-.+$/,
  /^font-.+$/,
  /^leading-.+$/,
  /^tracking-.+$/,
  /^rounded(?:-.+)?$/,
  /^shadow(?:-.+)?$/,
  /^opacity-.+$/,
  /^transition(?:-.+)?$/,
  /^duration-.+$/,
  /^ease-.+$/,
  /^delay-.+$/,
  /^animate-.+$/,
  /^(?:absolute|relative|fixed|sticky|static|isolate)$/,
  /^(?:top|right|bottom|left|inset|start|end)-.+$/,
  /^-?z-.+$/,
  /^object-.+$/,
  /^overflow(?:-[xy])?-.+$/,
  /^overscroll(?:-[xy])?-.+$/,
  /^cursor-.+$/,
  /^pointer-events-.+$/,
  /^select-.+$/,
  /^whitespace-.+$/,
  /^break-.+$/,
  /^list-.+$/,
  /^(?:block|inline|inline-block|inline-flex|inline-grid|hidden)$/,
  /^bg-(?:linear|gradient|clip)-.+$/,
  /^(?:translate|scale|rotate|skew|origin)-.+$/,
  /^mx-auto$/,
  /^my-auto$/,
  /^container$/,
  /^aspect-.+$/,
  /^columns-.+$/,
  /^order-.+$/,
  /^float-.+$/,
  /^clear-.+$/,
  /^box-(?:border|content)$/,
  /^align-.+$/,
  /^scroll-(?:m[trblxy]?|p[trblxy]?)-.+$/,
  /^scroll-(?:snap|behavior)-.+$/,
  /^snap-.+$/,
  /^touch-.+$/,
  /^will-change-.+$/,
  /^line-clamp-.+$/,
  /^content-.+$/,
  /^file-.+$/,
  /^backdrop-.+$/,
  /^drop-shadow(?:-.+)?$/,
  /^blur(?:-.+)?$/,
  /^brightness-.+$/,
  /^contrast-.+$/,
  /^grayscale(?:-.+)?$/,
  /^hue-rotate-.+$/,
  /^invert(?:-.+)?$/,
  /^saturate-.+$/,
  /^sepia(?:-.+)?$/,
  STANDALONE_UTILITY_PATTERN,
];

export function stripUtilityVariantPrefixes(className: string): string {
  let working = className.trim();

  while (KNOWN_VARIANT_PREFIX_REGEX.test(working)) {
    working = working.replace(KNOWN_VARIANT_PREFIX_REGEX, "");
  }

  return working;
}

/**
 * Test a token (after variant strip) against utility shape patterns.
 * Negative utilities (`-mt-4`) are matched by stripping one leading `-` and re-testing.
 */
export function matchesUtilityPattern(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }

  if (
    LIKELY_UTILITY_CLASS_PATTERNS.some((pattern) => pattern.test(trimmed))
  ) {
    return true;
  }

  if (trimmed.startsWith("-") && trimmed.length > 1) {
    const withoutNegation = trimmed.slice(1);
    return LIKELY_UTILITY_CLASS_PATTERNS.some((pattern) =>
      pattern.test(withoutNegation),
    );
  }

  return false;
}

/**
 * Returns true when a class token looks like a Tailwind / Uno utility rather than
 * a semantic design-system class (e.g. `hero-shell`).
 */
export function isLikelyUtilityClassName(className: string): boolean {
  const trimmed = className.trim();
  if (!trimmed) {
    return false;
  }

  if (
    trimmed.includes(":") ||
    trimmed.includes("[") ||
    trimmed.includes("]") ||
    trimmed.includes("/") ||
    trimmed.startsWith("!")
  ) {
    return true;
  }

  const normalized = stripUtilityVariantPrefixes(trimmed);
  if (!normalized) {
    return false;
  }

  return matchesUtilityPattern(normalized);
}
