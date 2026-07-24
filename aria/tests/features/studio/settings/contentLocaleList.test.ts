import { describe, expect, it } from "vitest";
import { addContentLocaleIfMissing } from "../../../../admin/features/Studio/settings/lib/contentLocaleList";

describe("addContentLocaleIfMissing", () => {
  it("ignores a repeated picker selection for the same locale", () => {
    const locales = [
      {
        code: "en",
        label: "English",
        enabled: true,
        fallbacks: [],
      },
    ];
    const french = {
      code: "fr",
      label: "French",
      enabled: true,
      fallbacks: ["en"],
      direction: "ltr" as const,
    };

    expect(addContentLocaleIfMissing(locales, french)).toBe(true);
    expect(addContentLocaleIfMissing(locales, french)).toBe(false);
    expect(locales.map((locale) => locale.code)).toEqual(["en", "fr"]);
  });
});
