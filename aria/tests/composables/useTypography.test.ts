import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTypographyMock,
  saveTypographyMock,
  getConfigMock,
  loggerMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  getTypographyMock: vi.fn(),
  saveTypographyMock: vi.fn(),
  getConfigMock: vi.fn(),
  loggerMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    designSystem: {
      getTypography: getTypographyMock,
      saveTypography: saveTypographyMock,
    },
    fonts: {
      getConfig: getConfigMock,
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("useTypography", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    getConfigMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          customFonts: [],
          enabledGoogleFonts: [],
        },
      },
      error: null,
    });
  });

  it("rejects malformed typography payloads before mutating shared state", async () => {
    const { useTypography, DEFAULT_TYPOGRAPHY } =
      await import("../../admin/features/Design/composables/useTypography");

    getTypographyMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          typography: {
            families: {
              body: "Inter",
              heading: "Inter",
              mono: "ui-monospace, monospace",
            },
            scale: 42,
          },
        },
      },
      error: null,
    });

    const typography = useTypography();
    await typography.loadTypography();

    expect(typography.typography.value).toEqual(DEFAULT_TYPOGRAPHY);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to load typography settings",
    );
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Typography] Invalid design-system action response",
      expect.objectContaining({
        source: "useTypography.loadTypography",
        issues: expect.any(Array),
      }),
    );
  });

  it("keeps unsaved changes when saveTypography returns an invalid payload", async () => {
    const { useTypography } =
      await import("../../admin/features/Design/composables/useTypography");

    saveTypographyMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          saved: true,
        },
      },
      error: null,
    });

    const typography = useTypography();
    typography.updateFamily("body", "Playfair Display");

    await typography.saveTypography();

    expect(typography.hasUnsavedChanges.value).toBe(true);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to save typography");
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Typography] Invalid design-system action response",
      expect.objectContaining({
        source: "useTypography.saveTypography",
        issues: expect.any(Array),
      }),
    );
  });

  it("hydrates heading and body overrides from loaded typography config", async () => {
    const { useTypography, DEFAULT_TYPOGRAPHY } =
      await import("../../admin/features/Design/composables/useTypography");

    getTypographyMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          typography: {
            families: {
              body: "Inter",
              heading: "Inter",
              mono: "ui-monospace, monospace",
            },
            scale: DEFAULT_TYPOGRAPHY.scale,
            headingOverrides: {
              "5xl": "Playfair Display",
            },
            bodyOverrides: {
              base: "Merriweather",
            },
          },
        },
      },
      error: null,
    });

    const typography = useTypography();
    await typography.loadTypography();

    expect(typography.typography.value.headingOverrides).toEqual({
      "5xl": "Playfair Display",
    });
    expect(typography.typography.value.bodyOverrides).toEqual({
      base: "Merriweather",
    });
    expect(typography.hasUnsavedChanges.value).toBe(false);
  });

  it("reconstructs shared typography controls from loaded typography scale", async () => {
    const {
      useTypography,
      DEFAULT_TYPOGRAPHY,
      SCALE_RATIOS,
      SPACING_MULTIPLIERS,
    } = await import("../../admin/features/Design/composables/useTypography");

    const ratio = "major-third" as const;
    const spacing = "relaxed" as const;
    const baseSize = 20;
    const baseIndex = DEFAULT_TYPOGRAPHY.scale.findIndex(
      (step) => step.id === "base",
    );

    const loadedScale = DEFAULT_TYPOGRAPHY.scale.map((step, index) => {
      const distance = index - baseIndex;
      const size = Math.round(
        baseSize * Math.pow(SCALE_RATIOS[ratio], distance),
      );
      const defaultLineHeightRatio = step.lineHeight / step.size;

      return {
        ...step,
        size,
        lineHeight: Math.max(
          size,
          Math.round(
            size * defaultLineHeightRatio * SPACING_MULTIPLIERS[spacing],
          ),
        ),
      };
    });

    getTypographyMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          typography: {
            families: {
              body: "Inter",
              heading: "Playfair Display",
              mono: "JetBrains Mono",
            },
            scale: loadedScale,
          },
        },
      },
      error: null,
    });

    const typography = useTypography();
    await typography.loadTypography();

    expect(typography.overallScale.value).toBe(125);
    expect(typography.scaleRatio.value).toBe(ratio);
    expect(typography.spacingStyle.value).toBe(spacing);
    expect(typography.hasUnsavedChanges.value).toBe(false);
  });
});
