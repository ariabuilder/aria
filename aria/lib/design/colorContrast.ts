import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";
import mixPlugin from "colord/plugins/mix";
import { z } from "zod";

extend([mixPlugin, a11yPlugin]);

const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3;
const WCAG_AAA_NORMAL = 7;
const WCAG_AAA_LARGE = 4.5;

export const ContrastPairInputSchema = z
  .object({
    foreground: z.string().trim().min(1),
    background: z.string().trim().min(1),
  })
  .strict();

export const ContrastEvaluationSchema = z
  .object({
    ratio: z.number().positive(),
    aaNormal: z.boolean(),
    aaLarge: z.boolean(),
    aaaNormal: z.boolean(),
    aaaLarge: z.boolean(),
  })
  .strict();

export type ContrastPairInput = z.infer<typeof ContrastPairInputSchema>;
export type ContrastEvaluation = z.infer<typeof ContrastEvaluationSchema>;

/**
 * WCAG relative luminance for a parseable CSS color.
 */
export function getRelativeLuminance(color: string): number | null {
  const parsed = colord(color.trim());
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.luminance();
}

/**
 * WCAG contrast ratio between two colors (1–21).
 */
export function getContrastRatio(
  foreground: string,
  background: string,
): number | null {
  const lumForeground = getRelativeLuminance(foreground);
  const lumBackground = getRelativeLuminance(background);
  if (lumForeground === null || lumBackground === null) {
    return null;
  }

  const lighter = Math.max(lumForeground, lumBackground);
  const darker = Math.min(lumForeground, lumBackground);

  return (lighter + 0.05) / (darker + 0.05);
}

function meetsThreshold(ratio: number, threshold: number): boolean {
  return ratio >= threshold;
}

/**
 * Evaluates a foreground/background pair against WCAG contrast thresholds.
 */
export function evaluateContrastPair(
  input: ContrastPairInput,
): ContrastEvaluation | null {
  const validated = ContrastPairInputSchema.safeParse(input);
  if (!validated.success) {
    return null;
  }

  const ratio = getContrastRatio(
    validated.data.foreground,
    validated.data.background,
  );
  if (ratio === null) {
    return null;
  }

  const evaluation: ContrastEvaluation = {
    ratio,
    aaNormal: meetsThreshold(ratio, WCAG_AA_NORMAL),
    aaLarge: meetsThreshold(ratio, WCAG_AA_LARGE),
    aaaNormal: meetsThreshold(ratio, WCAG_AAA_NORMAL),
    aaaLarge: meetsThreshold(ratio, WCAG_AAA_LARGE),
  };

  const output = ContrastEvaluationSchema.safeParse(evaluation);
  return output.success ? output.data : null;
}

/**
 * Formats a contrast ratio for display (e.g. "4.52:1").
 */
export function formatContrastRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "";
  }
  return `${ratio.toFixed(2)}:1`;
}

const DEFAULT_CHECKERBOARD_BACKDROP = "#555555";
const READABLE_TEXT_DARK = "#000000";
const READABLE_TEXT_LIGHT = "#ffffff";

export type ReadableTextColor = typeof READABLE_TEXT_DARK | typeof READABLE_TEXT_LIGHT;

export interface PickReadableTextColorOptions {
  /** Backdrop for alpha compositing (color picker checkerboard). */
  backdrop?: string;
}

/**
 * Resolves a paint color to an opaque background (compositing alpha over backdrop).
 */
export function resolveEffectiveBackgroundColor(
  background: string,
  options?: PickReadableTextColorOptions,
): string | null {
  const parsed = colord(background.trim());
  if (!parsed.isValid()) {
    return null;
  }

  const alpha = parsed.alpha();
  if (alpha <= 0) {
    return null;
  }

  if (alpha >= 1) {
    return parsed.toHex();
  }

  const backdrop = colord(options?.backdrop ?? DEFAULT_CHECKERBOARD_BACKDROP);
  if (!backdrop.isValid()) {
    return parsed.toHex();
  }

  return parsed.mix(backdrop, 1 - alpha).toHex();
}

/**
 * Picks black or white text for a background using WCAG contrast ratios.
 */
export function pickReadableTextColor(
  background: string,
  options?: PickReadableTextColorOptions,
): ReadableTextColor | null {
  const effective = resolveEffectiveBackgroundColor(background, options);
  if (!effective) {
    return null;
  }

  const bg = colord(effective);
  const blackContrast = bg.contrast(READABLE_TEXT_DARK);
  const whiteContrast = bg.contrast(READABLE_TEXT_LIGHT);

  return blackContrast >= whiteContrast
    ? READABLE_TEXT_DARK
    : READABLE_TEXT_LIGHT;
}
