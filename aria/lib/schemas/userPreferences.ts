import { z } from "zod";

import {
  AppearanceSettingsSchema,
  AppearanceUpdateSchema,
  parseAppearanceSettings,
  toAppearanceWritePayload,
  type AppearanceSettings,
} from "./appearance";
import {
  StudioLocalePreferenceSchema,
  type StudioLocalePreference,
} from "../localization/studioLocale";

export const ContentEditingPreferencesSchema = z
  .object({
    hideLockedContentFields: z.boolean().optional(),
  })
  .strict();

export const ContentEditingPreferencesUpdateSchema =
  ContentEditingPreferencesSchema;

export type ContentEditingPreferences = z.infer<
  typeof ContentEditingPreferencesSchema
>;

export const StudioPreferencesSchema = z
  .object({
    locale: StudioLocalePreferenceSchema.optional(),
  })
  .strict();

export type StudioPreferences = {
  locale?: StudioLocalePreference;
};

export const UserPreferencesSchema = z
  .object({
    appearance: AppearanceSettingsSchema.optional(),
    contentEditing: ContentEditingPreferencesSchema.optional(),
    studio: StudioPreferencesSchema.optional(),
  })
  .strict();

export const UserPreferencesUpdateSchema = z
  .object({
    appearance: AppearanceUpdateSchema.optional(),
    contentEditing: ContentEditingPreferencesUpdateSchema.optional(),
    studio: StudioPreferencesSchema.optional(),
  })
  .strict();

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type UserPreferencesUpdate = z.infer<typeof UserPreferencesUpdateSchema>;

function parseAppearanceFromStorage(input: unknown): AppearanceSettings | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  return parseAppearanceSettings(input);
}

function parseContentEditingFromStorage(
  input: unknown,
): ContentEditingPreferences | undefined {
  const parsed = ContentEditingPreferencesSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function parseStudioFromStorage(input: unknown): StudioPreferences | undefined {
  const parsed = StudioPreferencesSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

export function parseUserPreferences(input: unknown): UserPreferences {
  if (input === undefined || input === null || input === "") {
    return {};
  }

  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return {};
    }
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }

  const objectParsed = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!objectParsed.success) {
    return {};
  }

  const appearance = parseAppearanceFromStorage(objectParsed.data.appearance);
  const contentEditing = parseContentEditingFromStorage(
    objectParsed.data.contentEditing,
  );
  const studio = parseStudioFromStorage(objectParsed.data.studio);

  const result: UserPreferences = {};
  if (appearance) {
    result.appearance = appearance;
  }
  if (contentEditing) {
    result.contentEditing = contentEditing;
  }
  if (studio) {
    result.studio = studio;
  }

  const validated = UserPreferencesSchema.safeParse(result);
  return validated.success ? validated.data : {};
}

/** Normalize stored preferences for session/API payloads (omit when empty). */
export function sessionPreferencesFromStorage(
  input: unknown,
): UserPreferences | undefined {
  const parsed = parseUserPreferences(input);
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

/** Zod preprocess for user/session payloads with legacy stored shapes. */
export const StoredUserPreferencesSchema = z.preprocess(
  sessionPreferencesFromStorage,
  UserPreferencesSchema.optional(),
);

export function mergeUserPreferences(
  current: UserPreferences,
  patch: UserPreferencesUpdate,
): UserPreferences {
  const merged: UserPreferences = { ...current };

  if (patch.appearance !== undefined) {
    merged.appearance = AppearanceUpdateSchema.parse(patch.appearance);
  }
  if (patch.contentEditing !== undefined) {
    merged.contentEditing = ContentEditingPreferencesUpdateSchema.parse(
      patch.contentEditing,
    );
  }
  if (patch.studio !== undefined) {
    merged.studio = StudioPreferencesSchema.parse(patch.studio);
  }

  return UserPreferencesSchema.parse(merged);
}

export function serializeUserPreferences(preferences: UserPreferences): string {
  const normalized = UserPreferencesSchema.parse(preferences);
  if (normalized.appearance) {
    return JSON.stringify({
      ...normalized,
      appearance: toAppearanceWritePayload(normalized.appearance),
    });
  }
  return JSON.stringify(normalized);
}
