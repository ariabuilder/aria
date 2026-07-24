import { z } from "zod";

export const STUDIO_LOCALES = ["en", "fr"] as const;
export const StudioLocaleSchema = z.enum(STUDIO_LOCALES);
export const StudioLocalePreferenceSchema = z.union([
  z.literal("system"),
  StudioLocaleSchema,
]);

export type StudioLocale = z.infer<typeof StudioLocaleSchema>;
export type StudioLocalePreference = z.infer<typeof StudioLocalePreferenceSchema>;

export function resolveStudioLocale(input: {
  preference?: StudioLocalePreference | null;
  acceptedLanguages?: readonly string[] | null;
}): StudioLocale {
  if (input.preference && input.preference !== "system") {
    return input.preference;
  }

  for (const language of input.acceptedLanguages ?? []) {
    const normalized = language.trim().toLowerCase().split("-")[0];
    if (normalized === "fr") return "fr";
    if (normalized === "en") return "en";
  }
  return "en";
}

export function parseAcceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => part.trim().split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part));
}
