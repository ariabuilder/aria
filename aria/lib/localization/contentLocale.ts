import { z } from "zod";

const LOCALE_CODE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function canonicalLocaleCode(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}

export const LocaleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .superRefine((value, context) => {
    if (!LOCALE_CODE_PATTERN.test(value) || !canonicalLocaleCode(value)) {
      context.addIssue({
        code: "custom",
        message: "Locale must be a valid BCP 47 language tag",
      });
    }
  })
  .transform((value) => canonicalLocaleCode(value) ?? value);

export const ContentLocaleDirectionSchema = z.enum(["ltr", "rtl"]);
export type ContentLocaleDirection = z.infer<
  typeof ContentLocaleDirectionSchema
>;

const RTL_LANGUAGE_CODES = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "ku",
  "nqo",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);

export const ContentLocaleDefinitionSchema = z
  .object({
    code: LocaleCodeSchema,
    label: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    fallbacks: z.array(LocaleCodeSchema).max(12),
    /** Optional for backwards-compatible settings; resolved before rendering. */
    direction: ContentLocaleDirectionSchema.optional(),
  })
  .strict();

export const ContentLocalizationSettingsSchema = z
  .object({
    defaultLocale: LocaleCodeSchema,
    locales: z.array(ContentLocaleDefinitionSchema).min(1).max(32),
  })
  .strict()
  .superRefine((value, context) => {
    const locales = new Map(value.locales.map((locale) => [locale.code, locale]));
    const seen = new Set<string>();

    for (const locale of value.locales) {
      if (seen.has(locale.code)) {
        context.addIssue({
          code: "custom",
          message: `Locale ${locale.code} is configured more than once`,
          path: ["locales"],
        });
      }
      seen.add(locale.code);

      for (const fallback of locale.fallbacks) {
        if (fallback === locale.code) {
          context.addIssue({
            code: "custom",
            message: `Locale ${locale.code} cannot fall back to itself`,
            path: ["locales"],
          });
          continue;
        }
        const fallbackLocale = locales.get(fallback);
        if (!fallbackLocale) {
          context.addIssue({
            code: "custom",
            message: `Fallback locale ${fallback} is not configured`,
            path: ["locales"],
          });
        } else if (!fallbackLocale.enabled) {
          context.addIssue({
            code: "custom",
            message: `Fallback locale ${fallback} must be enabled`,
            path: ["locales"],
          });
        }
      }
    }

    const defaultLocale = locales.get(value.defaultLocale);
    if (!defaultLocale) {
      context.addIssue({
        code: "custom",
        message: "Default locale must be configured",
        path: ["defaultLocale"],
      });
    } else if (!defaultLocale.enabled) {
      context.addIssue({
        code: "custom",
        message: "Default locale must be enabled",
        path: ["defaultLocale"],
      });
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (code: string): boolean => {
      if (visited.has(code)) return false;
      if (visiting.has(code)) return true;
      visiting.add(code);
      const locale = locales.get(code);
      const hasCycle = locale?.fallbacks.some(visit) ?? false;
      visiting.delete(code);
      visited.add(code);
      return hasCycle;
    };

    for (const locale of value.locales) {
      if (visit(locale.code)) {
        context.addIssue({
          code: "custom",
          message: "Locale fallback chains cannot contain cycles",
          path: ["locales"],
        });
        break;
      }
    }
  });

export type ContentLocaleDefinition = z.infer<
  typeof ContentLocaleDefinitionSchema
>;
export type ContentLocalizationSettings = z.infer<
  typeof ContentLocalizationSettingsSchema
>;

export const DEFAULT_CONTENT_LOCALIZATION: ContentLocalizationSettings =
  ContentLocalizationSettingsSchema.parse({
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English", enabled: true, fallbacks: [] },
    ],
  });

export function normalizeContentLocalization(
  value: unknown,
): ContentLocalizationSettings {
  const parsed = ContentLocalizationSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CONTENT_LOCALIZATION;
}

/** Resolve the explicit locale policy direction or a safe language default. */
export function resolveContentLocaleDirection(
  locale: Pick<ContentLocaleDefinition, "code" | "direction">,
): ContentLocaleDirection {
  if (locale.direction) return locale.direction;
  const language = locale.code.split("-", 1)[0]?.toLowerCase();
  return language && RTL_LANGUAGE_CODES.has(language) ? "rtl" : "ltr";
}

export function resolveContentLocaleChain(
  settings: ContentLocalizationSettings,
  requestedLocale?: string,
): string[] {
  const parsedRequested = requestedLocale
    ? LocaleCodeSchema.safeParse(requestedLocale)
    : null;
  const requested = parsedRequested?.success ? parsedRequested.data : undefined;
  const configured = new Map(settings.locales.map((locale) => [locale.code, locale]));
  const result: string[] = [];
  const add = (code: string | undefined): void => {
    if (!code || result.includes(code)) return;
    const locale = configured.get(code);
    if (!locale?.enabled) return;
    result.push(code);
    for (const fallback of locale.fallbacks) add(fallback);
  };

  add(requested);
  add(settings.defaultLocale);
  return result;
}

export function resolveContentLocale<T extends { locale: string; isSource: boolean }>(
  locales: readonly T[],
  settings: ContentLocalizationSettings,
  requestedLocale?: string,
): { locale: T; requestedLocale: string; resolvedLocale: string; fallbackUsed: boolean } | null {
  const requested = LocaleCodeSchema.safeParse(requestedLocale ?? settings.defaultLocale);
  const requestedCode = requested.success ? requested.data : settings.defaultLocale;
  const chain = resolveContentLocaleChain(settings, requestedCode);
  const resolved = chain
    .map((code) => locales.find((locale) => locale.locale === code))
    .find((locale): locale is T => locale !== undefined);
  const source = locales.find((locale) => locale.isSource);
  const locale = resolved ?? source ?? locales[0] ?? null;

  if (!locale) return null;
  return {
    locale,
    requestedLocale: requestedCode,
    resolvedLocale: locale.locale,
    fallbackUsed: locale.locale !== requestedCode,
  };
}
