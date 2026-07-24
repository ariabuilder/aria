const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

const FONT_FAMILY_IDENTIFIER_RE = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

function splitFontFamilyList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

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
      if (current.trim().length > 0) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

function isQuoted(value: string): boolean {
  return (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  );
}

function isCssFunction(value: string): boolean {
  return /^[a-z-]+\(/i.test(value);
}

function shouldQuoteFontFamilyName(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const lowerValue = value.toLowerCase();
  if (
    GENERIC_FONT_FAMILIES.has(lowerValue) ||
    CSS_WIDE_KEYWORDS.has(lowerValue)
  ) {
    return false;
  }

  if (isQuoted(value) || isCssFunction(value)) {
    return false;
  }

  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  return tokens.some((token) => !FONT_FAMILY_IDENTIFIER_RE.test(token));
}

export function serializeFontFamilyName(value: string): string {
  const trimmed = value.trim();
  if (!shouldQuoteFontFamilyName(trimmed)) {
    return trimmed;
  }

  return `'${trimmed.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function serializeFontFamilyValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return splitFontFamilyList(trimmed)
    .map((part) => serializeFontFamilyName(part))
    .join(", ");
}

export function serializeFontFamilyList(values: string[]): string[] {
  return values
    .map((value) => serializeFontFamilyName(value))
    .filter((value) => value.length > 0);
}
