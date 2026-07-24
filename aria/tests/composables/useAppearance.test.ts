import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const updatePreferencesMock = vi.fn();
const getMeMock = vi.fn();

vi.mock("astro:actions", () => ({
  actions: {
    init: (...args: unknown[]) => initMock(...args),
    auth: {
      updatePreferences: (...args: unknown[]) => updatePreferencesMock(...args),
      getMe: (...args: unknown[]) => getMeMock(...args),
    },
    settings: {
      get: vi.fn(),
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const userRef = {
  value: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    username: "admin",
    email: "admin@example.com",
    role: "administrator" as const,
    totpEnabled: false,
    preferences: {
      appearance: {
        themeId: "astro" as const,
        colorScheme: "dark" as const,
        fontFamily: "Outfit" as const,
        uiZoom: 1,
      },
    },
  },
};

vi.mock("../../admin/features/Auth/composables/useUser", () => ({
  useUser: () => ({
    user: userRef,
    fetchUser: vi.fn(async () => undefined),
  }),
}));

function createMatchMediaMock(matches = false) {
  return vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

async function waitForAppearanceLoad(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("useAppearance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    userRef.value = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      preferences: {
        appearance: {
          themeId: "astro",
          colorScheme: "dark",
          fontFamily: "Outfit",
          uiZoom: 1,
        },
      },
    };

    Object.defineProperty(window, "matchMedia", {
      value: createMatchMediaMock(false),
      writable: true,
    });

    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.cssText = "";
    window.localStorage.clear();

    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: {
          appearance: { themeMode: "light" },
        },
        userPreferences: null,
      },
      error: null,
    });

    updatePreferencesMock.mockResolvedValue({
      data: {
        success: true,
        preferences: {
          appearance: {
            themeId: "astro",
            colorScheme: "light",
            fontFamily: "Outfit",
            uiZoom: 1,
          },
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads user preferences over legacy site appearance", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: {
          appearance: { themeMode: "light" },
        },
        userPreferences: {
          appearance: {
            themeId: "astro",
            colorScheme: "dark",
            fontFamily: "Outfit",
            uiZoom: 1,
          },
        },
      },
      error: null,
    });

    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    expect(appearance.settings.value.themeId).toBe("astro");
    expect(appearance.settings.value.colorScheme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-astro")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps Inter when it is saved as the interface font", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: { appearance: { themeMode: "light" } },
        userPreferences: {
          appearance: {
            themeId: "aria",
            colorScheme: "light",
            fontFamily: "Inter",
            uiZoom: 1,
          },
        },
      },
      error: null,
    });

    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    expect(appearance.settings.value.fontFamily).toBe("Inter");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain(
      '"Inter"',
    );
  });

  it("preserves astro when legacy payload has bad uiZoom", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: {
          appearance: {
            themeMode: "astro",
            uiZoom: "bad",
          },
        },
        userPreferences: null,
      },
      error: null,
    });

    userRef.value = {
      ...userRef.value,
      preferences: undefined as unknown as typeof userRef.value.preferences,
    };

    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    expect(appearance.settings.value).toEqual({
      themeId: "astro",
      colorScheme: "dark",
      fontFamily: "Outfit",
      uiZoom: 1,
    });
  });

  it("applies aria theme classes on html", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: { appearance: { themeMode: "light" } },
        userPreferences: {
          appearance: {
            themeId: "aria",
            colorScheme: "dark",
            fontFamily: "Outfit",
            uiZoom: 1,
          },
        },
      },
      error: null,
    });

    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    expect(appearance.settings.value.themeId).toBe("aria");
    expect(document.documentElement.classList.contains("theme-aria")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("aria");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.ariaInitialTheme).toBe("aria");
  });

  it("mirrors theme to localStorage immediately when switching to aria", async () => {
    const { getFoucAppearanceStorageKey } = await import(
      "../../lib/schemas/appearance"
    );
    const foucKey = getFoucAppearanceStorageKey(userRef.value.id);

    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: { appearance: { themeMode: "light" } },
        userPreferences: {
          appearance: {
            themeId: "cloudflare",
            colorScheme: "light",
            fontFamily: "Outfit",
            uiZoom: 1,
          },
        },
      },
      error: null,
    });

    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    await appearance.updateAppearance(
      { themeId: "aria" },
      { animate: false },
    );

    const stored = JSON.parse(
      window.localStorage.getItem(foucKey) ?? "{}",
    ) as { themeId?: string };

    expect(stored.themeId).toBe("aria");
    expect(document.documentElement.classList.contains("theme-aria")).toBe(
      true,
    );
    expect(document.documentElement.classList.contains("theme-cloudflare")).toBe(
      false,
    );
  });

  it("applies cloudflare theme classes on html", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
        siteSettings: { appearance: { themeMode: "light" } },
        userPreferences: {
          appearance: {
            themeId: "cloudflare",
            colorScheme: "light",
            fontFamily: "Outfit",
            uiZoom: 1,
          },
        },
      },
      error: null,
    });

    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    expect(appearance.settings.value.themeId).toBe("cloudflare");
    expect(document.documentElement.classList.contains("theme-cloudflare")).toBe(
      true,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "cloudflare",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("saves via auth.updatePreferences with valid payload", async () => {
    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    await appearance.updateAppearance(
      { colorScheme: "light" },
      { animate: false },
    );
    await new Promise((resolve) => setTimeout(resolve, 550));

    expect(updatePreferencesMock).toHaveBeenCalledWith({
      appearance: {
        themeId: "astro",
        colorScheme: "light",
        fontFamily: "Outfit",
        uiZoom: 1,
      },
    });
  });

  it("reverts and toasts when save fails", async () => {
    updatePreferencesMock.mockResolvedValue({
      data: null,
      error: new Error("save failed"),
    });

    const { toast } = await import("vue-sonner");
    const { useAppearance } =
      await import("../../admin/features/Design/composables/useAppearance");

    const appearance = useAppearance();
    await waitForAppearanceLoad();

    const before = { ...appearance.settings.value };

    await appearance.updateAppearance(
      { colorScheme: "light" },
      { animate: false },
    );
    await new Promise((resolve) => setTimeout(resolve, 550));

    expect(appearance.settings.value).toEqual(before);
    expect(toast.error).toHaveBeenCalledWith("Could not save appearance settings");
  });
});
