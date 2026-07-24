/**
 * Background Schema
 *
 * Zod validation for background-related values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

export const BackgroundTypeSchema = z.enum([
  "color",
  "gradient",
  "image",
  "none",
]);

export const GradientTypeSchema = z.enum(["linear", "radial"]);

export const BackgroundSizeSchema = z.enum(["cover", "contain", "auto"]);

export const BackgroundRepeatSchema = z.enum([
  "no-repeat",
  "repeat",
  "repeat-x",
  "repeat-y",
]);

export const BackgroundAttachmentSchema = z.enum(["scroll", "fixed", "local"]);

export const BackgroundBlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

export const GradientStopSchema = z.object({
  color: z.string(),
  position: z.number().min(0).max(100),
});

/**
 * Gradient configuration
 */
export const GradientConfigSchema = z.object({
  type: GradientTypeSchema,
  angle: z.number().optional(),
  stops: z.array(GradientStopSchema).min(2),
});

/**
 * Background image configuration
 */
export const BackgroundImageConfigSchema = z.object({
  url: z.string(),
  size: z.union([BackgroundSizeSchema, z.string()]).default("cover"),
  position: z.string().default("center"),
  repeat: BackgroundRepeatSchema.default("no-repeat"),
  attachment: BackgroundAttachmentSchema.default("scroll"),
  blendMode: BackgroundBlendModeSchema.default("normal"),
});

export const BackgroundValueSchema = z.object({
  type: BackgroundTypeSchema,
  color: ResponsiveStringSchema.optional(),
  gradient: GradientConfigSchema.optional(),
  image: BackgroundImageConfigSchema.optional(),
});

export type BackgroundValue = z.infer<typeof BackgroundValueSchema>;
export type BackgroundType = z.infer<typeof BackgroundTypeSchema>;
export type BackgroundRepeat = z.infer<typeof BackgroundRepeatSchema>;
export type BackgroundAttachment = z.infer<typeof BackgroundAttachmentSchema>;
export type BackgroundBlendMode = z.infer<typeof BackgroundBlendModeSchema>;
export type GradientStop = z.infer<typeof GradientStopSchema>;
export type GradientConfig = z.infer<typeof GradientConfigSchema>;

export const DEFAULT_BACKGROUND: BackgroundValue = {
  type: "none",
  color: createDefaultResponsive("transparent"),
};

export const DEFAULT_GRADIENT: GradientConfig = {
  type: "linear",
  angle: 90,
  stops: [
    { color: "#000000", position: 0 },
    { color: "#ffffff", position: 100 },
  ],
};

/**
 * Generate CSS gradient string from config
 */
export function gradientToCSS(gradient: GradientConfig): string {
  const stops = gradient.stops
    .map((s) => `${s.color} ${s.position}%`)
    .join(", ");

  if (gradient.type === "linear") {
    return `linear-gradient(${gradient.angle ?? 90}deg, ${stops})`;
  }

  return `radial-gradient(circle, ${stops})`;
}

export function cssToGradient(css: string): GradientConfig | null {
  const trimmed = css.trim();

  const linearPrefix = "linear-gradient(";
  if (trimmed.toLowerCase().startsWith(linearPrefix)) {
    const body = trimmed.slice(linearPrefix.length, -1);
    const parts = splitGradientArguments(body);
    if (parts.length < 2) {
      return null;
    }

    const angleMatch = parts[0]?.trim().match(/^(-?\d+(?:\.\d+)?)deg$/i);
    const angle = angleMatch ? Number.parseFloat(angleMatch[1] ?? "90") : 90;
    const stops = parseGradientStops(parts.slice(angleMatch ? 1 : 0));
    return { type: "linear", angle, stops };
  }

  const radialPrefix = "radial-gradient(";
  if (trimmed.toLowerCase().startsWith(radialPrefix)) {
    const body = trimmed.slice(radialPrefix.length, -1);
    const parts = splitGradientArguments(body);
    const hasShapePrefix = parts[0]?.trim().toLowerCase() === "circle";
    const stops = parseGradientStops(parts.slice(hasShapePrefix ? 1 : 0));
    return { type: "radial", stops };
  }

  return null;
}

function splitGradientArguments(value: string): string[] {
  const segments: string[] = [];
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
        segments.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

function parseGradientStops(stopParts: string[]): GradientStop[] {
  const stops: GradientStop[] = [];

  for (const part of stopParts) {
    const trimmed = part.trim();
    const positionMatch = trimmed.match(/(-?\d+(?:\.\d+)?)%\s*$/);
    const position = positionMatch
      ? Number.parseFloat(positionMatch[1] ?? "0")
      : undefined;
    const resolvedPosition =
      typeof position === "number" && Number.isFinite(position)
        ? position
        : inferStopPosition(stops.length, stopParts.length);
    const color = positionMatch
      ? trimmed.slice(0, positionMatch.index).trim()
      : trimmed;

    if (!color) {
      continue;
    }

    stops.push({
      color,
      position: resolvedPosition,
    });
  }

  return stops.length >= 2 ? stops : DEFAULT_GRADIENT.stops;
}

function inferStopPosition(index: number, total: number): number {
  if (total <= 1) {
    return 0;
  }

  return Math.round((index / (total - 1)) * 100);
}
