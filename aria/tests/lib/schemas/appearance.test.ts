import { describe, expect, it, vi } from "vitest";

import {
  AppearanceSettingsSchema,
  AppearanceUpdateSchema,
  DEFAULT_APPEARANCE_SETTINGS,
  parseAppearanceSettings,
  resolveAppearance,
  toAppearanceWritePayload,
} from "../../../lib/schemas/appearance";

describe("appearance schema", () => {
  it("migrates the legacy Satoshi preference to Outfit", () => {
    expect(
      parseAppearanceSettings({
        themeId: "aria",
        colorScheme: "light",
        fontFamily: "Satoshi",
        uiZoom: 1,
      }),
    ).toEqual({
      themeId: "aria",
      colorScheme: "light",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("migrates legacy themeMode astro", () => {
    expect(parseAppearanceSettings({ themeMode: "astro" })).toEqual({
      themeId: "astro",
      colorScheme: "dark",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("preserves astro when uiZoom is invalid", () => {
    expect(
      parseAppearanceSettings({ themeMode: "astro", uiZoom: "bad" }),
    ).toEqual({
      themeId: "astro",
      colorScheme: "dark",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("honors explicit themeId and colorScheme", () => {
    expect(
      parseAppearanceSettings({
        themeId: "astro",
        colorScheme: "light",
      }),
    ).toEqual({
      themeId: "astro",
      colorScheme: "light",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("prefers new fields over legacy themeMode", () => {
    expect(
      parseAppearanceSettings({
        themeMode: "dark",
        themeId: "astro",
        colorScheme: "light",
      }),
    ).toEqual({
      themeId: "astro",
      colorScheme: "light",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("parses cloudflare themeId", () => {
    expect(
      parseAppearanceSettings({
        themeId: "cloudflare",
        colorScheme: "dark",
      }),
    ).toEqual({
      themeId: "cloudflare",
      colorScheme: "dark",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("falls back unknown themeId to aria", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { parseAppearanceSettings: parseFresh } = await import(
      "../../../lib/schemas/appearance"
    );
    expect(
      parseFresh({
        themeId: "nope",
        colorScheme: "dark",
      }),
    ).toEqual({
      themeId: "aria",
      colorScheme: "dark",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("recovers invalid fontFamily independently", () => {
    expect(
      parseAppearanceSettings({
        themeId: "aria",
        colorScheme: "system",
        fontFamily: "nope",
      }),
    ).toEqual({
      themeId: "aria",
      colorScheme: "system",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("resolveAppearance prefers user pref over legacy site", () => {
    const resolved = resolveAppearance({
      userAppearance: { themeId: "astro", colorScheme: "light" },
      legacySiteAppearance: { themeMode: "dark" },
    });

    expect(resolved.themeId).toBe("astro");
    expect(resolved.colorScheme).toBe("light");
  });

  it("resolveAppearance falls back to legacy site then defaults", () => {
    expect(
      resolveAppearance({
        legacySiteAppearance: { themeMode: "astro" },
      }).themeId,
    ).toBe("astro");

    expect(resolveAppearance({})).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });

  it("write payload is strict and omits themeMode", () => {
    const payload = toAppearanceWritePayload(
      AppearanceSettingsSchema.parse({
        themeId: "aria",
        colorScheme: "system",
        fontFamily: "Inter",
        uiZoom: 1.1,
      }),
    );

    expect(AppearanceUpdateSchema.parse(payload)).toEqual(payload);
    expect("themeMode" in payload).toBe(false);
  });
});
