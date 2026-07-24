import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";

const { getVariableManagerBootstrapMock, loggerMock, toastErrorMock } =
  vi.hoisted(() => ({
    getVariableManagerBootstrapMock: vi.fn(),
    loggerMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("astro:actions", () => ({
  actions: {
    designSystem: {
      getVariableManagerBootstrap: getVariableManagerBootstrapMock,
      getGlobalStyles: vi.fn(),
      getColors: vi.fn(),
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

describe("useVariableManagerBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("hydrates global styles and color tokens from one bootstrap action", async () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.custom.accent = {
      label: "Accent",
      value: "#ff00aa",
      category: "color",
    };

    getVariableManagerBootstrapMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          globalStyles,
          colors: {
            activeTemplateId: "modern",
            palettes: {
              primary: {
                25: "#fafafa",
                50: "#f5f5f5",
                100: "#ebebeb",
                200: "#d6d6d6",
                300: "#c2c2c2",
                400: "#adadad",
                500: "#2d49b7",
                600: "#243a92",
                700: "#1b2c6d",
                800: "#121d49",
                900: "#090f24",
                950: "#050811",
                DEFAULT: "#2d49b7",
              },
            },
            paletteAliases: {},
            semantic: {
              success: "#16a34a",
              warning: "#f59e0b",
              error: "#dc2626",
              info: "#2563eb",
            },
            customPalettes: [],
          },
        },
      },
    });

    const { useVariableManagerBootstrap } = await import(
      "../../../admin/features/Design/composables/useVariableManagerBootstrap"
    );
    const { useGlobalStyles } = await import(
      "../../../admin/features/Design/composables/useGlobalStyles"
    );
    const { useDesignSystem } = await import(
      "../../../admin/features/Design/composables/useDesignSystem"
    );

    const bootstrap = useVariableManagerBootstrap();
    await bootstrap.loadVariableManagerBootstrap();

    const { globalStyles: loadedGlobalStyles, hasLoaded } = useGlobalStyles();
    const { palettes } = useDesignSystem();

    expect(getVariableManagerBootstrapMock).toHaveBeenCalledTimes(1);
    expect(hasLoaded.value).toBe(true);
    expect(loadedGlobalStyles.value.variables.custom.accent?.value).toBe(
      "#ff00aa",
    );
    expect(palettes.value.some((palette) => palette.name === "primary")).toBe(
      true,
    );
    expect(bootstrap.isVariablesLoading.value).toBe(false);
    expect(bootstrap.isTokenInventoryLoading.value).toBe(false);
  });
});
