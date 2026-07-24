import { describe, expect, it } from "vitest";
import {
  isSelfCanonicalPublicUrl,
  localizePublicPath,
  resolveLocalizedCanonicalUrl,
  resolvePublicLocalePath,
  toAbsolutePublicUrl,
} from "../../../lib/localization/publicRoutes";
import { ContentLocalizationSettingsSchema } from "../../../lib/localization/contentLocale";

const settings = ContentLocalizationSettingsSchema.parse({
  defaultLocale: "en",
  locales: [
    { code: "en", label: "English", enabled: true, fallbacks: [] },
    { code: "fr", label: "Français", enabled: true, fallbacks: ["en"] },
    { code: "de", label: "Deutsch", enabled: false, fallbacks: ["en"] },
  ],
});

describe("public locale paths", () => {
  it("uses prefix-except-default paths", () => {
    expect(resolvePublicLocalePath({ pathname: "/about", settings })).toEqual({
      locale: "en",
      pathname: "/about",
      prefixed: false,
      redirectPathname: null,
    });
    expect(
      resolvePublicLocalePath({ pathname: "/fr/about", settings }),
    ).toEqual({
      locale: "fr",
      pathname: "/about",
      prefixed: true,
      redirectPathname: null,
    });
    expect(
      localizePublicPath({ pathname: "/about", locale: "fr", settings }),
    ).toBe("/fr/about");
  });

  it("canonicalizes a redundant default prefix without redirecting requests itself", () => {
    expect(
      resolvePublicLocalePath({ pathname: "/en/about", settings }),
    ).toEqual({
      locale: "en",
      pathname: "/about",
      prefixed: true,
      redirectPathname: "/about",
    });
  });

  it("does not claim disabled locale prefixes or reserved public routes", () => {
    expect(
      resolvePublicLocalePath({ pathname: "/de/about", settings }).locale,
    ).toBe("en");
    expect(
      resolvePublicLocalePath({ pathname: "/admin", settings }).pathname,
    ).toBe("/admin");
    expect(
      resolvePublicLocalePath({ pathname: "/feed.xml", settings }).pathname,
    ).toBe("/feed.xml");
  });

  it("derives absolute resolver-owned localized canonicals", () => {
    expect(
      resolveLocalizedCanonicalUrl({
        pathname: "/a-propos",
        locale: "fr",
        settings,
        baseUrl: "https://example.com/site/",
      }),
    ).toBe("https://example.com/fr/a-propos");
    expect(toAbsolutePublicUrl("about", "https://example.com")).toBe(
      "https://example.com/about",
    );
  });

  it("only permits self-canonical routes in alternate clusters", () => {
    expect(
      isSelfCanonicalPublicUrl({
        canonical: "/about",
        pathname: "/about",
        baseUrl: "https://example.com",
      }),
    ).toBe(true);
    expect(
      isSelfCanonicalPublicUrl({
        canonical: "https://external.example/about",
        pathname: "/about",
        baseUrl: "https://example.com",
      }),
    ).toBe(false);
    expect(
      isSelfCanonicalPublicUrl({
        canonical: "not a URL",
        pathname: "/about",
        baseUrl: "https://example.com",
      }),
    ).toBe(false);
  });
});
