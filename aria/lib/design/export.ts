/**
 * JSON export and import functionality for design system
 * configurations with Zod validation for type safety.
 */

import {
  type DesignSystemExport,
  type DesignSystemColors,
  type ColorPaletteShades,
  DesignSystemExportSchema,
} from "./types";
import { log } from "../utils/logger";

export const EXPORT_VERSION = "1.0.0";

export const EXPORT_FILE_EXTENSION = ".json";

export const EXPORT_MIME_TYPE = "application/json";

/**
 * Create an export object from design system colors
 */
export function createExport(
  colors: DesignSystemColors,
  name?: string,
): DesignSystemExport {
  return {
    name: name || "Aria Design System",
    exportedAt: new Date().toISOString(),
    colors,
  };
}

/**
 * Serialize design system to JSON string
 */
export function exportToJSON(
  colors: DesignSystemColors,
  options?: {
    name?: string;
    description?: string;
    pretty?: boolean;
  },
): string {
  const exportData = createExport(colors, options?.name);
  return JSON.stringify(exportData, null, options?.pretty !== false ? 2 : 0);
}

/**
 * Create a downloadable blob from design system
 */
export function exportToBlob(
  colors: DesignSystemColors,
  options?: {
    name?: string;
  },
): Blob {
  const json = exportToJSON(colors, { ...options, pretty: true });
  return new Blob([json], { type: EXPORT_MIME_TYPE });
}

/**
 * Trigger browser download of design system
 */
export function downloadExport(
  colors: DesignSystemColors,
  filename?: string,
  options?: {
    name?: string;
  },
): void {
  const blob = exportToBlob(colors, options);
  const url = URL.createObjectURL(blob);

  const sanitizedFilename = (filename || options?.name || "design-system")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-");

  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizedFilename}${EXPORT_FILE_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/**
 * Copy design system JSON to clipboard
 * Returns true on success, false on failure
 */
export async function copyToClipboard(
  colors: DesignSystemColors,
  options?: {
    name?: string;
  },
): Promise<boolean> {
  try {
    const json = exportToJSON(colors, { ...options, pretty: true });
    await navigator.clipboard.writeText(json);
    return true;
  } catch (error) {
    log("error", "[Design Export] Failed to copy to clipboard", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export type ImportResult =
  | { success: true; data: DesignSystemExport }
  | { success: false; error: string; details?: unknown };

/**
 * Parse and validate design system from JSON string
 */
export function importFromJSON(json: string): ImportResult {
  try {
    const parsed = JSON.parse(json);
    const validated = DesignSystemExportSchema.safeParse(parsed);

    if (!validated.success) {
      return {
        success: false,
        error: "Invalid design system format",
        details: validated.error.issues,
      };
    }

    return { success: true, data: validated.data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SyntaxError
          ? "Invalid JSON syntax"
          : "Failed to parse design system",
      details: error,
    };
  }
}

export async function importFromFile(file: File): Promise<ImportResult> {
  try {
    if (
      !file.name.endsWith(".json") &&
      !file.name.endsWith(EXPORT_FILE_EXTENSION)
    ) {
      return {
        success: false,
        error: "Invalid file type. Please upload a .json file.",
      };
    }

    const text = await file.text();
    return importFromJSON(text);
  } catch (error) {
    return {
      success: false,
      error: "Failed to read file",
      details: error,
    };
  }
}

export async function importFromClipboard(): Promise<ImportResult> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      return {
        success: false,
        error: "Clipboard is empty",
      };
    }
    return importFromJSON(text);
  } catch (error) {
    return {
      success: false,
      error: "Failed to read clipboard. Please paste JSON manually.",
      details: error,
    };
  }
}

/**
 * Convert DesignSystemColors to flat color record for UnoCSS
 */
export function colorsToUnoTheme(
  colors: DesignSystemColors,
): Record<string, Record<string, string> | string> {
  const result: Record<string, Record<string, string> | string> = {};

  for (const [name, shades] of Object.entries(colors.palettes)) {
    result[name] = { ...shades };
  }

  for (const [aliasKey, aliasValue] of Object.entries(
    colors.paletteAliases ?? {},
  )) {
    const shadeMatch = aliasKey.match(
      /^(.*)-(25|50|100|200|300|400|500|600|700|800|900|950)$/,
    );
    if (!shadeMatch) {
      if (result[aliasKey]) {
        continue;
      }
      result[aliasKey] = aliasValue;
      continue;
    }

    const [, paletteName, shade] = shadeMatch;
    const existing =
      result[paletteName] && typeof result[paletteName] === "object"
        ? (result[paletteName] as Record<string, string>)
        : {};
    if (existing[shade]) {
      result[paletteName] = existing;
      continue;
    }
    existing[shade] = aliasValue;
    if (shade === "500") {
      existing.DEFAULT = existing.DEFAULT ?? aliasValue;
    }
    result[paletteName] = existing;
  }

  result.success = colors.semantic.success;
  result.warning = colors.semantic.warning;
  result.error = colors.semantic.error;
  result.info = colors.semantic.info;

  return result;
}

/**
 * Convert flat color record to DesignSystemColors
 */
export function unoThemeToColors(
  theme: Record<string, unknown>,
  templateId?: string,
): DesignSystemColors {
  const palettes: Record<string, ColorPaletteShades> = {};
  let semantic = {
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  };

  for (const [name, value] of Object.entries(theme)) {
    // Skip semantic colors - handle them separately
    if (name === "success" && typeof value === "string") {
      semantic.success = value;
      continue;
    }
    if (name === "warning" && typeof value === "string") {
      semantic.warning = value;
      continue;
    }
    if (name === "error" && typeof value === "string") {
      semantic.error = value;
      continue;
    }
    if (name === "info" && typeof value === "string") {
      semantic.info = value;
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const shades = value as Record<string, string>;
      if (shades["500"] || shades["DEFAULT"]) {
        palettes[name] = {
          25: shades["25"] || shades["50"] || "#ffffff",
          50: shades["50"] || shades["100"] || "#ffffff",
          100: shades["100"] || "#f5f5f5",
          200: shades["200"] || "#e5e5e5",
          300: shades["300"] || "#d4d4d4",
          400: shades["400"] || "#a3a3a3",
          500: shades["500"] || shades["DEFAULT"] || "#737373",
          600: shades["600"] || "#525252",
          700: shades["700"] || "#404040",
          800: shades["800"] || "#262626",
          900: shades["900"] || "#171717",
          950: shades["950"] || "#0a0a0a",
          DEFAULT: shades["DEFAULT"] || shades["500"] || "#737373",
        };
      }
    }
  }

  return {
    activeTemplateId: templateId || "custom",
    palettes,
    semantic,
  };
}

/**
 * Validate hex color string
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color);
}

/**
 * Validate design system export object
 */
export function isValidExport(data: unknown): data is DesignSystemExport {
  return DesignSystemExportSchema.safeParse(data).success;
}

export function getExportValidationErrors(data: unknown): string[] {
  const result = DesignSystemExportSchema.safeParse(data);
  if (result.success) return [];

  return result.error.issues.map(
    (err) => `${err.path.join(".")}: ${err.message}`,
  );
}
