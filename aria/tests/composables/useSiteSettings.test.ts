import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, updateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    settings: {
      get: (...args: unknown[]) => getMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      updateIcons: vi.fn(),
    },
  },
}));

function createSuccessfulSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      data: {
        siteName: "Aria",
        seoTitle: "Updated SEO",
        ...overrides,
      },
    },
    error: null,
  };
}

describe("useSiteSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips loadSettings when settings are already hydrated", async () => {
    getMock.mockResolvedValue(createSuccessfulSettingsResponse());

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    expect(getMock).toHaveBeenCalledTimes(1);

    await siteSettings.loadSettings();

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("forces loadSettings when force option is true", async () => {
    getMock.mockResolvedValue(createSuccessfulSettingsResponse());

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();
    await siteSettings.loadSettings({ force: true });

    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("strips legacy utilityLibraries from loaded settings", async () => {
    getMock.mockResolvedValue(
      createSuccessfulSettingsResponse({
        utilityLibraries: { animejs: true },
      }),
    );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    expect(siteSettings.generalSettings.value.siteName).toBe("Aria");
    expect(siteSettings.generalSettings.value.timeZone).toBe("UTC");
    expect(siteSettings.settings.value as Record<string, unknown>).not.toHaveProperty(
      "utilityLibraries",
    );
  });

  it("saves the site timezone with general settings", async () => {
    getMock.mockResolvedValue(createSuccessfulSettingsResponse());
    updateMock.mockResolvedValue(
      createSuccessfulSettingsResponse({ timeZone: "America/Toronto" }),
    );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");
    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    await siteSettings.updateGeneralSettings({
      siteName: "Aria",
      timeZone: "America/Toronto",
    });

    expect(updateMock).toHaveBeenCalledWith({
      siteName: "Aria",
      timeZone: "America/Toronto",
      siteDescription: undefined,
      siteUrl: undefined,
      favicon: undefined,
    });
  });

  it("does not drop forced loadSettings while another load is in flight", async () => {
    let resolveFirstLoad:
      | ((value: ReturnType<typeof createSuccessfulSettingsResponse>) => void)
      | undefined;
    getMock
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof createSuccessfulSettingsResponse>>(
            (resolve) => {
              resolveFirstLoad = resolve;
            },
          ),
      )
      .mockResolvedValueOnce(
        createSuccessfulSettingsResponse({ siteName: "Fresh Aria" }),
      );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    const firstLoad = siteSettings.loadSettings();
    const forcedLoad = siteSettings.loadSettings({ force: true });

    expect(getMock).toHaveBeenCalledTimes(1);

    resolveFirstLoad?.(createSuccessfulSettingsResponse({ siteName: "Old Aria" }));
    await firstLoad;
    await forcedLoad;

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(siteSettings.generalSettings.value.siteName).toBe("Fresh Aria");
  });

  it("saveSettings sends partial updates to actions.settings.update", async () => {
    getMock.mockResolvedValue(createSuccessfulSettingsResponse());
    updateMock.mockResolvedValue(
      createSuccessfulSettingsResponse({ seoTitle: "New title" }),
    );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    await siteSettings.updateSeoDefaults({
      seoTitle: "New title",
      seoDescription: "New description",
      ogImage: "https://example.com/og.jpg",
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      seoTitle: "New title",
      seoDescription: "New description",
      ogImage: "https://example.com/og.jpg",
    });

    const updatePayload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload).not.toHaveProperty("siteName");
    expect(updatePayload).not.toHaveProperty("analytics");
  });

  it("tracks save state separately from load state", async () => {
    getMock.mockResolvedValue(createSuccessfulSettingsResponse());

    let resolveUpdate: ((value: unknown) => void) | undefined;
    updateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    expect(siteSettings.isLoading.value).toBe(false);
    expect(siteSettings.isSaving.value).toBe(false);

    const savePromise = siteSettings.updateSeoDefaults({
      seoTitle: "Saving",
    });

    expect(siteSettings.isSaving.value).toBe(true);
    expect(siteSettings.isLoading.value).toBe(false);

    resolveUpdate?.(createSuccessfulSettingsResponse({ seoTitle: "Saving" }));
    await savePromise;

    expect(siteSettings.isSaving.value).toBe(false);
    expect(siteSettings.isLoading.value).toBe(false);
  });

  it("hydrates discovery settings from forced server reload", async () => {
    getMock
      .mockResolvedValueOnce(
        createSuccessfulSettingsResponse({
          discovery: { discourageSearchEngines: false },
        }),
      )
      .mockResolvedValueOnce(
        createSuccessfulSettingsResponse({
          discovery: { discourageSearchEngines: true },
        }),
      );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    expect(siteSettings.discoverySettings.value.discourageSearchEngines).toBe(
      false,
    );

    await siteSettings.loadSettings({ force: true });

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(siteSettings.discoverySettings.value.discourageSearchEngines).toBe(
      true,
    );
  });

  it("replaceDiscoverySettingsLocal updates singleton without save", async () => {
    getMock.mockResolvedValue(
      createSuccessfulSettingsResponse({
        discovery: { discourageSearchEngines: false },
      }),
    );

    const { useSiteSettings } =
      await import("../../admin/composables/useSiteSettings");
    const { DiscoverySettingsSchema } =
      await import("../../lib/crawl/schemas");

    const siteSettings = useSiteSettings();
    await siteSettings.loadSettings();

    const next = DiscoverySettingsSchema.parse({
      discourageSearchEngines: true,
      sitemapMode: "off",
    });
    siteSettings.replaceDiscoverySettingsLocal(next);

    expect(siteSettings.discoverySettings.value.discourageSearchEngines).toBe(
      true,
    );
    expect(siteSettings.discoverySettings.value.sitemapMode).toBe("off");
  });
});
