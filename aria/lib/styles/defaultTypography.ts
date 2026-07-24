export const DEFAULT_TYPOGRAPHY_FAMILIES = {
  body: "Outfit, -apple-system, BlinkMacSystemFont, sans-serif",
  heading: "Outfit, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "ui-monospace, monospace",
} as const;

export const DEFAULT_TYPOGRAPHY_SCALE = [
  { id: "xs", label: "XS", size: 12, lineHeight: 16, letterSpacing: 0.01 },
  { id: "sm", label: "SM", size: 14, lineHeight: 20, letterSpacing: 0.005 },
  {
    id: "base",
    label: "Base",
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  { id: "lg", label: "LG", size: 18, lineHeight: 28, letterSpacing: -0.005 },
  { id: "xl", label: "XL", size: 20, lineHeight: 28, letterSpacing: -0.01 },
  {
    id: "2xl",
    label: "2XL",
    size: 24,
    lineHeight: 32,
    letterSpacing: -0.015,
  },
  {
    id: "3xl",
    label: "3XL",
    size: 30,
    lineHeight: 36,
    letterSpacing: -0.02,
  },
  {
    id: "4xl",
    label: "4XL",
    size: 36,
    lineHeight: 40,
    letterSpacing: -0.025,
  },
  {
    id: "5xl",
    label: "5XL",
    size: 48,
    lineHeight: 48,
    letterSpacing: -0.03,
  },
  {
    id: "6xl",
    label: "6XL",
    size: 60,
    lineHeight: 60,
    letterSpacing: -0.035,
  },
  {
    id: "7xl",
    label: "7XL",
    size: 72,
    lineHeight: 72,
    letterSpacing: -0.04,
  },
  {
    id: "8xl",
    label: "8XL",
    size: 96,
    lineHeight: 96,
    letterSpacing: -0.045,
  },
  {
    id: "9xl",
    label: "9XL",
    size: 128,
    lineHeight: 128,
    letterSpacing: -0.05,
  },
] as const;

const LEGACY_DEFAULT_TYPOGRAPHY_LETTER_SPACING = Object.fromEntries([
  ["xs", "0em"],
  ["sm", "0em"],
  ["base", "0em"],
  ["lg", "0em"],
  ["xl", "0em"],
  ["2xl", "-0.01em"],
  ["3xl", "-0.015em"],
  ["4xl", "-0.02em"],
  ["5xl", "-0.025em"],
  ["6xl", "-0.03em"],
  ["7xl", "-0.035em"],
  ["8xl", "-0.04em"],
  ["9xl", "-0.045em"],
]) as Record<string, string>;

export const DEFAULT_TYPOGRAPHY_LETTER_SPACING = Object.fromEntries(
  DEFAULT_TYPOGRAPHY_SCALE.map((step) => [
    step.id,
    formatEm(step.letterSpacing),
  ]),
) as Record<string, string>;

export function normalizeLegacyDefaultTypographyLetterSpacing(
  letterSpacing: Record<string, string>,
): Record<string, string> {
  const tokens = Object.keys(DEFAULT_TYPOGRAPHY_LETTER_SPACING);
  const hasLegacyDefaults = tokens.every((token) => {
    const value = letterSpacing[token];

    return !value || value === LEGACY_DEFAULT_TYPOGRAPHY_LETTER_SPACING[token];
  });

  if (!hasLegacyDefaults) {
    return letterSpacing;
  }

  return {
    ...letterSpacing,
    ...DEFAULT_TYPOGRAPHY_LETTER_SPACING,
  };
}

function formatEm(value: number): string {
  return `${value
    .toFixed(4)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")}em`;
}
