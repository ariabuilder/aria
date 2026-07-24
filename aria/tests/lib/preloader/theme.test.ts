import { describe, expect, it } from "vitest";

import { THEME_IDS } from "../../../lib/schemas/appearance";
import {
  getPreloaderColors,
  readPreloaderThemeFromDocument,
  resolvePreloaderThemeState,
  THEME_PRIMARY_COLORS,
} from "../../../lib/preloader/theme";

describe("preloader theme", () => {
  it("resolves aria system theme from OS preference", () => {
    expect(
      resolvePreloaderThemeState({
        themeId: "aria",
        colorScheme: "system",
        systemDark: true,
      }),
    ).toEqual({ themeId: "aria", isDark: true });

    expect(
      resolvePreloaderThemeState({
        themeId: "aria",
        colorScheme: "system",
        systemDark: false,
      }),
    ).toEqual({ themeId: "aria", isDark: false });
  });

  it("resolves astro light and dark explicitly", () => {
    expect(
      resolvePreloaderThemeState({
        themeId: "astro",
        colorScheme: "light",
      }),
    ).toEqual({ themeId: "astro", isDark: false });

    expect(
      resolvePreloaderThemeState({
        themeId: "astro",
        colorScheme: "dark",
      }),
    ).toEqual({ themeId: "astro", isDark: true });
  });

  it("uses purple fill for astro themes", () => {
    expect(getPreloaderColors("astro", true).fill).toBe("#bc52ee");
    expect(getPreloaderColors("astro", false).fill).toBe("#bc52ee");
  });

  it("uses aria primary fill for aria themes", () => {
    expect(getPreloaderColors("aria", true).fill).toBe(
      "oklch(0.6 0.118 184.704)",
    );
    expect(getPreloaderColors("aria", false).fill).toBe(
      "oklch(0.66 0.12 216.53)",
    );
  });

  it("derives preloader fill from THEME_PRIMARY_COLORS for every theme", () => {
    for (const themeId of THEME_IDS) {
      expect(getPreloaderColors(themeId, true).fill).toBe(
        THEME_PRIMARY_COLORS[themeId].dark,
      );
      expect(getPreloaderColors(themeId, false).fill).toBe(
        THEME_PRIMARY_COLORS[themeId].light,
      );
    }
  });

  it("resolves cloudflare light and dark explicitly", () => {
    expect(
      resolvePreloaderThemeState({
        themeId: "cloudflare",
        colorScheme: "light",
      }),
    ).toEqual({ themeId: "cloudflare", isDark: false });

    expect(
      resolvePreloaderThemeState({
        themeId: "cloudflare",
        colorScheme: "dark",
      }),
    ).toEqual({ themeId: "cloudflare", isDark: true });
  });

  it("uses CF brand primary fill for cloudflare themes", () => {
    expect(getPreloaderColors("cloudflare", true).fill).toBe(
      "oklch(0.687 0.2074 38.66)",
    );
    expect(getPreloaderColors("cloudflare", false).fill).toBe(
      "oklch(0.687 0.2074 38.66)",
    );
  });

  it("reads cloudflare theme from document classes", () => {
    const html = document.createElement("html");
    html.classList.add("theme-cloudflare", "dark");
    html.setAttribute("data-theme", "cloudflare");

    expect(readPreloaderThemeFromDocument({ documentElement: html })).toEqual({
      themeId: "cloudflare",
      isDark: true,
    });
  });

  it("prefers live theme-aria over stale ariaInitialTheme", () => {
    const html = document.createElement("html");
    html.classList.add("theme-aria");
    html.setAttribute("data-theme", "aria");
    html.dataset.ariaInitialTheme = "cloudflare";

    expect(readPreloaderThemeFromDocument({ documentElement: html })).toEqual({
      themeId: "aria",
      isDark: false,
    });
  });

  it("uses classList dark for isDark instead of stale ariaInitialDark", () => {
    const html = document.createElement("html");
    html.classList.add("theme-aria", "dark");
    html.setAttribute("data-theme", "aria");
    html.dataset.ariaInitialDark = "0";

    expect(readPreloaderThemeFromDocument({ documentElement: html }).isDark).toBe(
      true,
    );
  });
});
