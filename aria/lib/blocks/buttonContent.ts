import { z } from "zod";

import type { JsonObject } from "../types/nodes";

export const DEFAULT_BUTTON_ICON_GAP = "0.5rem";
export const DEFAULT_BUTTON_ICON_SIZE = "1em";
export const DEFAULT_BUTTON_ICON_COLOR_CLASS = "text-foreground/80";
export const DEFAULT_BUTTON_ICON_COLOR =
  "color-mix(in srgb, var(--color-foreground) 80%, transparent)";

const LEGACY_BUTTON_ICON_COLORS = new Set(["currentColor"]);

function isDefaultButtonIconColor(value: string): boolean {
  return (
    value === DEFAULT_BUTTON_ICON_COLOR ||
    LEGACY_BUTTON_ICON_COLORS.has(value)
  );
}

export const ButtonIconPositionSchema = z.enum(["left", "right"]);

export type ButtonIconPosition = z.infer<typeof ButtonIconPositionSchema>;

export const ButtonIconGapSchema = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value.length === 0 || !/[\r\n\t]/.test(value), {
    message: "Icon gap must be a single CSS value.",
  });

export const ButtonIconSizeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => value.length === 0 || !/[\r\n\t]/.test(value), {
    message: "Icon size must be a single CSS length value.",
  });

export type ButtonIconSize = z.infer<typeof ButtonIconSizeSchema>;

export const ButtonIconColorSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => value.length === 0 || !/[\r\n\t]/.test(value), {
    message: "Icon color must be a single CSS color value.",
  });

export type ButtonIconColor = z.infer<typeof ButtonIconColorSchema>;

export function getButtonIconPosition(value: unknown): ButtonIconPosition {
  return value === "right" ? "right" : "left";
}

export function getButtonIconGap(value: unknown): string {
  const parsed = ButtonIconGapSchema.safeParse(value ?? "");
  if (!parsed.success) {
    return DEFAULT_BUTTON_ICON_GAP;
  }

  const trimmed = parsed.data.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_BUTTON_ICON_GAP;
}

export function getPersistedButtonIconGap(value: unknown): string | undefined {
  const parsed = ButtonIconGapSchema.safeParse(value ?? "");
  if (!parsed.success) {
    return undefined;
  }

  const trimmed = parsed.data.trim();
  if (!trimmed || trimmed === DEFAULT_BUTTON_ICON_GAP) {
    return undefined;
  }

  return trimmed;
}

export function getButtonIconSpaceBetween(value: unknown): boolean {
  return value === true;
}

export function getButtonIconSize(value: unknown): string {
  const parsed = ButtonIconSizeSchema.safeParse(value ?? "");
  if (!parsed.success) {
    return DEFAULT_BUTTON_ICON_SIZE;
  }

  const trimmed = parsed.data.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_BUTTON_ICON_SIZE;
}

export function getPersistedButtonIconSize(value: unknown): string | undefined {
  const parsed = ButtonIconSizeSchema.safeParse(value ?? "");
  if (!parsed.success) {
    return undefined;
  }

  const trimmed = parsed.data.trim();
  if (!trimmed || trimmed === DEFAULT_BUTTON_ICON_SIZE) {
    return undefined;
  }

  return trimmed;
}

export function normalizeButtonIconSize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_BUTTON_ICON_SIZE;

  if (trimmed.startsWith("var(")) {
    return trimmed;
  }

  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return `${Math.round(numeric)}px`;
  }

  return trimmed;
}

export function getButtonIconColor(value: unknown): string {
  const parsed = ButtonIconColorSchema.safeParse(value ?? "");
  if (!parsed.success) {
    return DEFAULT_BUTTON_ICON_COLOR;
  }

  const trimmed = parsed.data.trim();
  if (!trimmed || isDefaultButtonIconColor(trimmed)) {
    return DEFAULT_BUTTON_ICON_COLOR;
  }

  return trimmed;
}

export function getPersistedButtonIconColor(
  value: unknown,
): string | undefined {
  const parsed = ButtonIconColorSchema.safeParse(value ?? "");
  if (!parsed.success) {
    return undefined;
  }

  const trimmed = parsed.data.trim();
  if (!trimmed || isDefaultButtonIconColor(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function getButtonIconHostClassName(props: JsonObject): string {
  return getPersistedButtonIconColor(props.iconColor)
    ? ""
    : DEFAULT_BUTTON_ICON_COLOR_CLASS;
}

export function buildButtonContentRowStyle(props: JsonObject): string {
  const declarations = [
    "display: inline-flex",
    "align-items: center",
    `gap: ${getButtonIconGap(props.iconGap)}`,
  ];

  if (getButtonIconSpaceBetween(props.iconSpaceBetween)) {
    declarations.push("justify-content: space-between", "width: 100%");
  }

  return declarations.join("; ");
}

export function buildButtonIconStyle(props: JsonObject): string {
  const size = getButtonIconSize(props.iconSize);
  const persistedColor = getPersistedButtonIconColor(props.iconColor);

  const declarations = [
    "display: inline-flex",
    "align-items: center",
    "flex-shrink: 0",
    `width: ${size}`,
    `height: ${size}`,
  ];

  if (persistedColor) {
    declarations.push(`color: ${persistedColor}`);
  }

  return declarations.join("; ");
}
