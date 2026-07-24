import { describe, expect, it } from "vitest";

describe("settingsActionResults", () => {
  it("unwraps valid settings action payloads", async () => {
    const { unwrapSettingsActionResult } =
      await import("../../admin/composables/settingsActionResults");

    expect(
      unwrapSettingsActionResult({
        success: true,
        data: {
          breakpoints: [
            {
              id: "base",
              label: "Mobile",
              icon: "Monitor",
              width: 375,
              enabled: true,
              isDefault: true,
              order: 0,
            },
          ],
          appearance: {
            themeMode: "astro",
            primaryColor: "#05668d",
            fontFamily: "Outfit",
          uiZoom: 1,
        },
      },
    }),
  ).toEqual({
    breakpoints: [
      {
        id: "base",
        label: "Mobile",
        icon: "Monitor",
        width: 375,
        enabled: true,
        isDefault: true,
        order: 0,
      },
    ],
    appearance: {
      themeMode: "astro",
      primaryColor: "#05668d",
      fontFamily: "Outfit",
      uiZoom: 1,
    },
  });
  });

  it("parses discovery settings from settings payloads", async () => {
    const { unwrapSettingsActionResult } =
      await import("../../admin/composables/settingsActionResults");

    expect(
      unwrapSettingsActionResult({
        success: true,
        data: {
          discovery: {
            discourageSearchEngines: true,
            sitemapMode: "off",
          },
        },
      }).discovery,
    ).toEqual({
      discourageSearchEngines: true,
      sitemapMode: "off",
      robotsMode: "auto",
      llmsMode: "auto",
      includeSitemapInRobots: true,
      sitemapPingOnPublish: false,
      trailingSlashPolicy: "strip",
    });
  });

  it("parses site-owned content localization settings", async () => {
    const { unwrapSettingsActionResult } =
      await import("../../admin/composables/settingsActionResults");

    expect(
      unwrapSettingsActionResult({
        success: true,
        data: {
          localization: {
            content: {
              defaultLocale: "en",
              locales: [
                { code: "en", label: "English", enabled: true, fallbacks: [] },
                { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
              ],
            },
          },
        },
      }).localization?.content,
    ).toMatchObject({
      defaultLocale: "en",
      locales: expect.arrayContaining([
        expect.objectContaining({ code: "fr", fallbacks: ["en"] }),
      ]),
    });
  });

  it("accepts legacy Satoshi appearance settings so they can be migrated", async () => {
    const { unwrapSettingsActionResult } =
      await import("../../admin/composables/settingsActionResults");

    expect(
      unwrapSettingsActionResult({
        success: true,
        data: {
          appearance: {
            themeId: "aria",
            colorScheme: "light",
            fontFamily: "Satoshi",
            uiZoom: 1,
          },
          agent: { enabled: true, mcpEnabled: true },
        },
      }),
    ).toMatchObject({
      appearance: { fontFamily: "Satoshi" },
      agent: { enabled: true, mcpEnabled: true },
    });
  });

  it("rejects malformed or embedded-failure settings action payloads", async () => {
    const {
      parseSiteSettingsPayload,
      unwrapSettingsActionResult,
      coerceSettingsActionData,
    } = await import("../../admin/composables/settingsActionResults");

    expect(() =>
      parseSiteSettingsPayload({
        utilityEngine: "invalid",
      }),
    ).toThrow("Invalid settings payload");

    expect(() =>
      unwrapSettingsActionResult({
        success: false,
        error: {
          code: "GET_SETTINGS_FAILED",
          message: "Settings unavailable",
        },
      }),
    ).toThrow("Settings unavailable");

    expect(
      coerceSettingsActionData({
        agent: {
          enabled: true,
          inference: {
            default: {
              provider: "opencode",
              modelId: "opencode/big-pickle",
            },
          },
        },
      }).agent,
    ).toMatchObject({
      enabled: true,
      inference: {
        default: {
          provider: "opencode",
          modelId: "opencode/big-pickle",
        },
      },
    });
  });
});
