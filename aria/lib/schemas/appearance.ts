import { z } from "zod";

/** Canonical theme IDs — extend this tuple when adding themes */
export const THEME_IDS = ["aria", "astro", "cloudflare"] as const;

export const ThemeIdSchema = z.enum(THEME_IDS);
export const ColorSchemeSchema = z.enum(["light", "dark", "system"]);
export const FontFamilySchema = z.enum([
  "Outfit",
  "Inter",
  "System",
  "Monospace",
]);
const StoredFontFamilySchema = z.union([
  FontFamilySchema,
  z.literal("Satoshi"),
]);

/** Legacy field — read-only for migration */
export const LegacyThemeModeSchema = z.enum(["light", "dark", "system", "astro"]);

/** Stored shape (partial updates allowed on write) */
export const AppearanceStorageSchema = z
  .object({
    themeId: ThemeIdSchema.optional(),
    colorScheme: ColorSchemeSchema.optional(),
    themeMode: LegacyThemeModeSchema.optional(),
    fontFamily: StoredFontFamilySchema.optional(),
    uiZoom: z.number().min(0.75).max(1.5).optional(),
    primaryColor: z.string().optional(),
    uiDensity: z.number().optional(),
  })
  .strip();

/** Write payload — strict, no legacy keys emitted */
export const AppearanceUpdateSchema = z
  .object({
    themeId: ThemeIdSchema,
    colorScheme: ColorSchemeSchema,
    fontFamily: FontFamilySchema,
    uiZoom: z.number().min(0.75).max(1.5),
  })
  .strict();

/** Resolved runtime shape (always complete after sanitize) */
export const AppearanceSettingsSchema = z
  .object({
    themeId: ThemeIdSchema,
    colorScheme: ColorSchemeSchema,
    fontFamily: FontFamilySchema,
    uiZoom: z.number().min(0.75).max(1.5),
  })
  .strict();

export type ThemeId = z.infer<typeof ThemeIdSchema>;
export type ColorScheme = z.infer<typeof ColorSchemeSchema>;
export type FontFamily = z.infer<typeof FontFamilySchema>;
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>;
export type AppearanceUpdate = z.infer<typeof AppearanceUpdateSchema>;

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings =
  AppearanceSettingsSchema.parse({
    themeId: "aria",
    colorScheme: "system",
    fontFamily: "Outfit",
    uiZoom: 1,
  });

const LEGACY_THEME_MODE_MIGRATION: Record<
  z.infer<typeof LegacyThemeModeSchema>,
  Pick<AppearanceSettings, "themeId" | "colorScheme">
> = {
  light: { themeId: "aria", colorScheme: "light" },
  dark: { themeId: "aria", colorScheme: "dark" },
  system: { themeId: "aria", colorScheme: "system" },
  astro: { themeId: "astro", colorScheme: "dark" },
};

let unknownThemeIdLogged = false;

function parseUiZoom(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0.75 && value <= 1.5) {
      return value;
    }
    // Legacy site settings stored uiZoom as percentage (e.g. 100)
    if (value > 1.5 && value <= 150) {
      const normalized = value / 100;
      if (normalized >= 0.75 && normalized <= 1.5) {
        return normalized;
      }
    }
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parseUiZoom(parsed);
    }
  }

  return DEFAULT_APPEARANCE_SETTINGS.uiZoom;
}

function parseThemeId(value: unknown): ThemeId {
  const parsed = ThemeIdSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  if (value !== undefined && !unknownThemeIdLogged) {
    unknownThemeIdLogged = true;
    console.warn(
      "[appearance] Unknown themeId in storage; falling back to aria",
      value,
    );
  }

  return DEFAULT_APPEARANCE_SETTINGS.themeId;
}

function parseColorScheme(value: unknown): ColorScheme {
  const parsed = ColorSchemeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE_SETTINGS.colorScheme;
}

function parseFontFamily(value: unknown): FontFamily {
  if (value === "Satoshi") {
    return "Outfit";
  }
  const parsed = FontFamilySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE_SETTINGS.fontFamily;
}

function migrateLegacyThemeMode(
  themeMode: z.infer<typeof LegacyThemeModeSchema>,
): Pick<AppearanceSettings, "themeId" | "colorScheme"> {
  return LEGACY_THEME_MODE_MIGRATION[themeMode];
}

function extractStorageCandidate(
  input: unknown,
): Partial<z.infer<typeof AppearanceStorageSchema>> {
  const objectParsed = z.record(z.string(), z.unknown()).safeParse(input);
  if (!objectParsed.success) {
    return {};
  }

  const raw = objectParsed.data;
  const candidate: Partial<z.infer<typeof AppearanceStorageSchema>> = {};

  const themeId = ThemeIdSchema.safeParse(raw.themeId);
  if (themeId.success) {
    candidate.themeId = themeId.data;
  }

  const colorScheme = ColorSchemeSchema.safeParse(raw.colorScheme);
  if (colorScheme.success) {
    candidate.colorScheme = colorScheme.data;
  }

  const themeMode = LegacyThemeModeSchema.safeParse(raw.themeMode);
  if (themeMode.success) {
    candidate.themeMode = themeMode.data;
  }

  const fontFamily = StoredFontFamilySchema.safeParse(raw.fontFamily);
  if (fontFamily.success) {
    candidate.fontFamily = fontFamily.data;
  }

  if (raw.uiZoom !== undefined) {
    candidate.uiZoom = parseUiZoom(raw.uiZoom);
  }

  return candidate;
}

/** Pure migration: storage blob → validated AppearanceSettings (field-level recovery) */
export function parseAppearanceSettings(input: unknown): AppearanceSettings {
  const objectParsed = z.record(z.string(), z.unknown()).safeParse(input);
  const raw = objectParsed.success ? objectParsed.data : {};
  const candidate = extractStorageCandidate(input);

  let themeId = parseThemeId(raw.themeId);
  let colorScheme = parseColorScheme(raw.colorScheme);

  const hasExplicitThemeId = ThemeIdSchema.safeParse(raw.themeId).success;
  const hasExplicitColorScheme = ColorSchemeSchema.safeParse(raw.colorScheme).success;

  if (!hasExplicitThemeId || !hasExplicitColorScheme) {
    const legacyMode = LegacyThemeModeSchema.safeParse(candidate.themeMode);
    if (legacyMode.success) {
      const migrated = migrateLegacyThemeMode(legacyMode.data);
      if (!hasExplicitThemeId) {
        themeId = migrated.themeId;
      }
      if (!hasExplicitColorScheme) {
        colorScheme = migrated.colorScheme;
      }
    }
  }

  if (hasExplicitThemeId && !hasExplicitColorScheme) {
    colorScheme = DEFAULT_APPEARANCE_SETTINGS.colorScheme;
  }

  return AppearanceSettingsSchema.parse({
    themeId,
    colorScheme,
    fontFamily: parseFontFamily(candidate.fontFamily),
    uiZoom: parseUiZoom(candidate.uiZoom),
  });
}

export function hasStoredAppearance(input: unknown): boolean {
  const objectParsed = z.record(z.string(), z.unknown()).safeParse(input);
  if (!objectParsed.success) {
    return false;
  }

  const raw = objectParsed.data;
  return (
    raw.themeId !== undefined ||
    raw.colorScheme !== undefined ||
    raw.themeMode !== undefined ||
    raw.fontFamily !== undefined ||
    raw.uiZoom !== undefined
  );
}

export interface ResolveAppearanceInput {
  userAppearance?: unknown;
  legacySiteAppearance?: unknown;
}

/** Load precedence: user pref → legacy site (migration) → defaults */
export function resolveAppearance(
  input: ResolveAppearanceInput,
): AppearanceSettings {
  if (
    input.userAppearance !== undefined &&
    input.userAppearance !== null &&
    hasStoredAppearance(input.userAppearance)
  ) {
    return parseAppearanceSettings(input.userAppearance);
  }

  if (
    input.legacySiteAppearance !== undefined &&
    input.legacySiteAppearance !== null
  ) {
    return parseAppearanceSettings(input.legacySiteAppearance);
  }

  return DEFAULT_APPEARANCE_SETTINGS;
}

/** Server-side: normalize write payload and explicitly omit deprecated keys */
export function toAppearanceWritePayload(
  settings: AppearanceSettings,
): AppearanceUpdate {
  return AppearanceUpdateSchema.parse(settings);
}

export const FOUC_APPEARANCE_KEY_PREFIX = "aria-appearance:";

export function getFoucAppearanceStorageKey(userId: string): string {
  return `${FOUC_APPEARANCE_KEY_PREFIX}${userId}`;
}
