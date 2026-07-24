import { describe, expect, it } from "vitest";

import {
  mergeUserPreferences,
  parseUserPreferences,
  serializeUserPreferences,
  sessionPreferencesFromStorage,
} from "../../../lib/schemas/userPreferences";
import { SessionUserSchema } from "../../../lib/auth/types";

describe("userPreferences schema", () => {
  it("parseUserPreferences recovers partial appearance", () => {
    expect(
      parseUserPreferences({
        appearance: { themeMode: "astro", uiZoom: "bad" },
      }),
    ).toEqual({
      appearance: {
        themeId: "astro",
        colorScheme: "dark",
        fontFamily: "Outfit",
        uiZoom: 1,
      },
    });
  });

  it("parseUserPreferences returns empty object for invalid JSON string", () => {
    expect(parseUserPreferences("{not-json")).toEqual({});
  });

  it("sessionPreferencesFromStorage omits empty preferences", () => {
    expect(sessionPreferencesFromStorage(null)).toBeUndefined();
    expect(sessionPreferencesFromStorage({ foo: "bar" })).toBeUndefined();
  });

  it("SessionUserSchema accepts legacy stored preferences on the user payload", () => {
    const parsed = SessionUserSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      preferences: {
        appearance: {
          themeMode: "dark",
          uiZoom: "100",
          primaryColor: "#336699",
        },
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.preferences?.appearance).toEqual({
      themeId: "aria",
      colorScheme: "dark",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("mergeUserPreferences replaces appearance without themeMode", () => {
    const merged = mergeUserPreferences(
      { appearance: { themeId: "aria", colorScheme: "system", fontFamily: "Outfit", uiZoom: 1 } },
      {
        appearance: {
          themeId: "astro",
          colorScheme: "light",
          fontFamily: "Inter",
          uiZoom: 1.2,
        },
      },
    );

    expect(merged.appearance).toEqual({
      themeId: "astro",
      colorScheme: "light",
      fontFamily: "Inter",
      uiZoom: 1.2,
    });

    const serialized = serializeUserPreferences(merged);
    expect(serialized.includes("themeMode")).toBe(false);
  });

  it("parses and serializes content editing preferences", () => {
    const parsed = parseUserPreferences({
      contentEditing: { hideLockedContentFields: true },
    });

    expect(parsed.contentEditing).toEqual({ hideLockedContentFields: true });
    expect(serializeUserPreferences(parsed)).toBe(
      JSON.stringify({
        contentEditing: { hideLockedContentFields: true },
      }),
    );
  });

  it("merges content editing preferences without dropping appearance", () => {
    const merged = mergeUserPreferences(
      {
        appearance: {
          themeId: "aria",
          colorScheme: "system",
          fontFamily: "Outfit",
          uiZoom: 1,
        },
      },
      { contentEditing: { hideLockedContentFields: true } },
    );

    expect(merged).toEqual({
      appearance: {
        themeId: "aria",
        colorScheme: "system",
        fontFamily: "Outfit",
        uiZoom: 1,
      },
      contentEditing: { hideLockedContentFields: true },
    });
  });

  it("persists a personal Studio language independently from appearance", () => {
    const merged = mergeUserPreferences(
      { contentEditing: { hideLockedContentFields: true } },
      { studio: { locale: "fr" } },
    );

    expect(merged).toEqual({
      contentEditing: { hideLockedContentFields: true },
      studio: { locale: "fr" },
    });
    expect(parseUserPreferences(serializeUserPreferences(merged))).toEqual(merged);
  });
});
