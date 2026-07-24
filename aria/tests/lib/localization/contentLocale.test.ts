import { describe, expect, it } from "vitest";

import {
  ContentLocalizationSettingsSchema,
  DEFAULT_CONTENT_LOCALIZATION,
  resolveContentLocale,
  resolveContentLocaleChain,
} from "../../../lib/localization/contentLocale";
import { resolveStudioLocale } from "../../../lib/localization/studioLocale";

describe("content locale policy", () => {
  it("starts new sites with English as the only content locale", () => {
    expect(DEFAULT_CONTENT_LOCALIZATION).toEqual({
      defaultLocale: "en",
      locales: [{ code: "en", label: "English", enabled: true, fallbacks: [] }],
    });
  });

  const policy = ContentLocalizationSettingsSchema.parse({
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English", enabled: true, fallbacks: [] },
      { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
      {
        code: "fr-ca",
        label: "French (Canada)",
        enabled: true,
        fallbacks: ["fr", "en"],
      },
    ],
  });

  it("canonicalizes Canadian French and resolves its configured chain", () => {
    expect(policy.locales[2]?.code).toBe("fr-CA");
    expect(resolveContentLocaleChain(policy, "fr-ca")).toEqual([
      "fr-CA",
      "fr",
      "en",
    ]);
  });

  it("rejects fallback cycles and disabled fallback targets", () => {
    expect(() =>
      ContentLocalizationSettingsSchema.parse({
        defaultLocale: "en",
        locales: [
          { code: "en", label: "English", enabled: true, fallbacks: ["fr"] },
          { code: "fr", label: "French", enabled: false, fallbacks: ["en"] },
        ],
      }),
    ).toThrow(/fallback/i);
  });

  it("falls back to the source locale only after configured candidates", () => {
    const resolved = resolveContentLocale(
      [
        { locale: "de", isSource: true, title: "Hallo" },
        { locale: "en", isSource: false, title: "Hello" },
      ],
      policy,
      "fr",
    );
    expect(resolved).toMatchObject({
      requestedLocale: "fr",
      resolvedLocale: "en",
      fallbackUsed: true,
    });
  });
});

describe("studio locale resolution", () => {
  it("uses a stored preference before browser language and supports French", () => {
    expect(
      resolveStudioLocale({
        preference: "fr",
        acceptedLanguages: ["en-CA"],
      }),
    ).toBe("fr");
    expect(
      resolveStudioLocale({
        preference: "system",
        acceptedLanguages: ["fr-CA", "en"],
      }),
    ).toBe("fr");
  });
});
