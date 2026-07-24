import { generateNaturalShades } from "../../../../../../lib/design/shades";
import type { ColorPaletteShades } from "../../../../../../lib/design/types";
import { isValidHexColor } from "../../../../../../lib/design/export";

const NAMED_COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  black: "#171717",
  white: "#ffffff",
  gray: "#737373",
  grey: "#737373",
};

const REQUIRED_SHADE_KEYS = [
  "25",
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

export type NormalizedPaletteInput = {
  name: string;
  label?: string;
  shades: ColorPaletteShades;
};

export function resolveColorToken(color: string): string | null {
  const trimmed = color.trim();
  if (!trimmed) {
    return null;
  }

  if (isValidHexColor(trimmed)) {
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }

  const named = NAMED_COLORS[trimmed.toLowerCase()];
  if (named) {
    return named;
  }

  return null;
}

function normalizeShadesInput(shades: unknown): ColorPaletteShades | null {
  if (!shades || typeof shades !== "object" || Array.isArray(shades)) {
    return null;
  }

  const record = shades as Record<string, unknown>;
  const hasAllKeys = REQUIRED_SHADE_KEYS.every(
    (key) => typeof record[key] === "string" && record[key].length > 0,
  );

  if (hasAllKeys) {
    const normalized = {} as ColorPaletteShades;
    for (const key of REQUIRED_SHADE_KEYS) {
      normalized[Number(key) as keyof ColorPaletteShades] = record[
        key
      ] as string;
    }
    normalized.DEFAULT =
      (typeof record.DEFAULT === "string" && record.DEFAULT) ||
      (record["500"] as string);
    return normalized;
  }

  const base =
    (typeof record["500"] === "string" && record["500"]) ||
    (typeof record.DEFAULT === "string" && record.DEFAULT) ||
    (typeof record.default === "string" && record.default) ||
    null;

  if (!base) {
    return null;
  }

  return generateNaturalShades(base);
}

export function normalizePalettesInput(
  palettes: unknown,
): NormalizedPaletteInput[] | null {
  if (Array.isArray(palettes)) {
    const normalized: NormalizedPaletteInput[] = [];
    for (const palette of palettes) {
      if (!palette || typeof palette !== "object") {
        return null;
      }
      const entry = palette as {
        name?: unknown;
        label?: unknown;
        shades?: unknown;
      };
      if (typeof entry.name !== "string" || entry.name.length === 0) {
        return null;
      }
      const shades = normalizeShadesInput(entry.shades);
      if (!shades) {
        return null;
      }
      normalized.push({
        name: entry.name,
        label: typeof entry.label === "string" ? entry.label : undefined,
        shades,
      });
    }
    return normalized;
  }

  if (palettes && typeof palettes === "object") {
    const normalized: NormalizedPaletteInput[] = [];
    for (const [name, shadesValue] of Object.entries(
      palettes as Record<string, unknown>,
    )) {
      const shades = normalizeShadesInput(shadesValue);
      if (!shades) {
        return null;
      }
      normalized.push({ name, shades });
    }
    return normalized;
  }

  return null;
}

export function normalizeSaveColorsInput(input: {
  templateId?: string;
  palettes: unknown;
  paletteAliases?: unknown;
  semantic: unknown;
}): {
  templateId?: string;
  palettes: NormalizedPaletteInput[];
  paletteAliases?: Record<string, string>;
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
} | null {
  const palettes = normalizePalettesInput(input.palettes);
  if (!palettes) {
    return null;
  }

  if (!input.semantic || typeof input.semantic !== "object") {
    return null;
  }

  const paletteAliases = input.paletteAliases;
  if (
    paletteAliases !== undefined &&
    (!paletteAliases ||
      typeof paletteAliases !== "object" ||
      Array.isArray(paletteAliases) ||
      Object.values(paletteAliases as Record<string, unknown>).some(
        (value) => typeof value !== "string",
      ))
  ) {
    return null;
  }

  const semantic = input.semantic as Record<string, unknown>;
  if (
    typeof semantic.success !== "string" ||
    typeof semantic.warning !== "string" ||
    typeof semantic.error !== "string" ||
    typeof semantic.info !== "string"
  ) {
    return null;
  }

  return {
    templateId:
      typeof input.templateId === "string" ? input.templateId : undefined,
    palettes,
    paletteAliases: paletteAliases
      ? { ...(paletteAliases as Record<string, string>) }
      : undefined,
    semantic: {
      success: semantic.success,
      warning: semantic.warning,
      error: semantic.error,
      info: semantic.info,
    },
  };
}

export function patchPrimaryPaletteColor(
  palettes: NormalizedPaletteInput[],
  color: string,
): NormalizedPaletteInput[] {
  const hex = resolveColorToken(color);
  if (!hex) {
    throw new Error(`Invalid color: ${color}`);
  }

  const primaryShades = generateNaturalShades(hex);
  let foundPrimary = false;

  const next = palettes.map((palette) => {
    if (palette.name !== "primary") {
      return palette;
    }
    foundPrimary = true;
    return { ...palette, shades: primaryShades };
  });

  if (!foundPrimary) {
    next.unshift({ name: "primary", shades: primaryShades });
  }

  return next;
}
