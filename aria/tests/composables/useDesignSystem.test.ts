import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  saveColorsMock,
  getColorsMock,
  applyTemplateMock,
  executeHistoryMock,
  recordStateSnapshotMock,
  undoMock,
  redoMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  saveColorsMock: vi.fn(),
  getColorsMock: vi.fn(),
  applyTemplateMock: vi.fn(),
  executeHistoryMock: vi.fn(),
  recordStateSnapshotMock: vi.fn(async ({ action }) => await action()),
  undoMock: vi.fn(),
  redoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("../../admin/features/History", () => ({
  recordStateSnapshot: recordStateSnapshotMock,
  useHistory: () => ({
    execute: executeHistoryMock,
    canUndo: { value: false },
    canRedo: { value: false },
    undo: undoMock,
    redo: redoMock,
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    designSystem: {
      saveColors: saveColorsMock,
      getColors: getColorsMock,
      applyTemplate: applyTemplateMock,
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("useDesignSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getColorsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          colors: {
            activeTemplateId: "custom",
            palettes: {},
            semantic: {
              success: "#22c55e",
              warning: "#f59e0b",
              error: "#ef4444",
              info: "#3b82f6",
            },
          },
        },
      },
      error: null,
    });
    saveColorsMock.mockResolvedValue({ data: { success: true }, error: null });
    applyTemplateMock.mockResolvedValue({
      data: { success: true },
      error: null,
    });
  });

  it("shares palette state across consumers when saving", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const editorInstance = useDesignSystem();
    const headerInstance = useDesignSystem();

    editorInstance.addPalette("Brand Blue", "#3b82f6");

    const didSave = await headerInstance.save();

    expect(didSave).toBe(true);
    expect(saveColorsMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Color system saved", {
      description: "Design tokens and global CSS are now in sync.",
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(saveColorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({
          palettes: expect.arrayContaining([
            expect.objectContaining({
              name: "brand-blue",
              label: "Brand Blue",
              shades: expect.objectContaining({
                DEFAULT: "#3b82f6",
                500: expect.any(String),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("surfaces a warning when server-side style refresh fails after saving", async () => {
    saveColorsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          styleRefresh: {
            success: false,
            framework: "custom",
            error: "Write failed",
          },
        },
      },
      error: null,
    });

    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    const didSave = await designSystem.save();

    expect(didSave).toBe(true);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Color system saved with warnings",
      {
        description: "Write failed",
      },
    );
  });

  it("surfaces handler-level save failures from the design-system action", async () => {
    saveColorsMock.mockResolvedValue({
      data: {
        success: false,
        error: {
          message: "Palette write failed",
        },
      },
      error: null,
    });

    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    const didSave = await designSystem.save();

    expect(didSave).toBe(false);
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to save color system", {
      description: "Palette write failed",
    });
  });

  it("surfaces handler-level get-colors failures from the design-system action", async () => {
    getColorsMock.mockResolvedValue({
      data: {
        success: false,
        error: {
          message: "Color store unavailable",
        },
      },
      error: null,
    });

    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    await designSystem.load();

    expect(designSystem.lastError.value).toBe("Color store unavailable");
  });

  it("loads palettes from the design-system action", async () => {
    getColorsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          colors: {
            activeTemplateId: "custom",
            palettes: {
              primary: {
                25: "#fcfdfe",
                50: "#f8fafc",
                100: "#f1f5f9",
                200: "#e2e8f0",
                300: "#cbd5e1",
                400: "#94a3b8",
                500: "#64748b",
                600: "#475569",
                700: "#334155",
                800: "#1e293b",
                900: "#0f172a",
                950: "#020617",
                DEFAULT: "#64748b",
              },
            },
            semantic: {
              success: "#10b981",
              warning: "#f59e0b",
              error: "#ef4444",
              info: "#3b82f6",
            },
            customPalettes: [
              {
                id: "primary",
                name: "Brand Primary",
                shades: {
                  25: "#fcfdfe",
                  50: "#f8fafc",
                  100: "#f1f5f9",
                  200: "#e2e8f0",
                  300: "#cbd5e1",
                  400: "#94a3b8",
                  500: "#64748b",
                  600: "#475569",
                  700: "#334155",
                  800: "#1e293b",
                  900: "#0f172a",
                  950: "#020617",
                  DEFAULT: "#64748b",
                },
                isCustom: true,
              },
            ],
          },
        },
      },
      error: null,
    });

    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    await designSystem.load();

    expect(getColorsMock).toHaveBeenCalledTimes(1);
    expect(designSystem.palettes.value).toEqual([
      expect.objectContaining({
        name: "primary",
        label: "Brand Primary",
        shades: expect.objectContaining({
          500: "#64748b",
          DEFAULT: "#64748b",
        }),
      }),
    ]);
    expect(designSystem.semanticColors.value.success).toBe("#10b981");
  });

  it("renames palette labels without changing token keys", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    designSystem.addPalette("brand-blue", "#3b82f6", "Brand Blue");
    designSystem.renamePalette("brand-blue", "brand-blue", "Product Blue");

    expect(designSystem.palettes.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "brand-blue",
          label: "Product Blue",
        }),
      ]),
    );
  });

  it("keeps aliases when palette variable keys are renamed", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    designSystem.addPalette("rename-blue", "#3b82f6", "Rename Blue");
    designSystem.renamePalette("rename-blue", "product-blue", "Rename Blue");

    const didSave = await designSystem.save();

    expect(didSave).toBe(true);
    expect(saveColorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({
          paletteAliases: expect.objectContaining({
            "rename-blue": "var(--product-blue)",
            "rename-blue-500": "var(--product-blue-500)",
          }),
        }),
      }),
    );
  });

  it("keeps fallback aliases when palettes are removed", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    designSystem.addPalette("remove-blue", "#3b82f6", "Remove Blue");
    const removedPalette = designSystem.palettes.value.find(
      (palette) => palette.name === "remove-blue",
    );
    designSystem.removePalette("remove-blue");

    const didSave = await designSystem.save();

    expect(didSave).toBe(true);
    expect(saveColorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({
          paletteAliases: expect.objectContaining({
            "remove-blue": "#3b82f6",
            "remove-blue-500": removedPalette?.shades[500],
          }),
        }),
      }),
    );
  });

  it("saves palette labels as color metadata", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    designSystem.addPalette("brand-green", "#22c55e", "Brand Green");

    const didSave = await designSystem.save();

    expect(didSave).toBe(true);
    expect(saveColorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({
          palettes: expect.arrayContaining([
            expect.objectContaining({
              name: "brand-green",
              label: "Brand Green",
            }),
          ]),
        }),
      }),
    );
  });

  it("marks template colors as custom after manual edits", async () => {
    getColorsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          colors: {
            activeTemplateId: "sage",
            palettes: {
              primary: {
                25: "#f5fffb",
                50: "#ecfdf5",
                100: "#d1fae5",
                200: "#a7f3d0",
                300: "#6ee7b7",
                400: "#34d399",
                500: "#10b981",
                600: "#059669",
                700: "#047857",
                800: "#065f46",
                900: "#064e3b",
                950: "#022c22",
                DEFAULT: "#10b981",
              },
            },
            semantic: {
              success: "#10b981",
              warning: "#f59e0b",
              error: "#ef4444",
              info: "#0ea5e9",
            },
          },
        },
      },
      error: null,
    });

    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    await designSystem.load();
    expect(designSystem.currentTemplateId.value).toBe("sage");

    designSystem.updateSemanticColor("info", "#0284c7");

    expect(designSystem.currentTemplateId.value).toBe("custom");
  });

  it("resets colors back to the last loaded state", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    await designSystem.load();
    const initialPaletteNames = designSystem.palettes.value.map(
      (palette) => palette.name,
    );

    expect(designSystem.hasUnsavedChanges.value).toBe(false);

    designSystem.addPalette("Temp", "#111111");

    expect(designSystem.hasUnsavedChanges.value).toBe(true);
    expect(designSystem.palettes.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "temp",
        }),
      ]),
    );

    designSystem.resetToLastSaved();

    expect(designSystem.hasUnsavedChanges.value).toBe(false);
    expect(designSystem.palettes.value.map((palette) => palette.name)).toEqual(
      initialPaletteNames,
    );
  });

  it("resets colors to the default template", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();

    await designSystem.load();
    designSystem.addPalette("Temp", "#111111");

    expect(designSystem.palettes.value.map((palette) => palette.name)).toEqual(
      expect.arrayContaining(["temp"]),
    );

    designSystem.resetToDefaults();

    expect(designSystem.palettes.value.map((palette) => palette.name)).toEqual([
      "primary",
      "secondary",
      "muted",
      "neutral",
    ]);
  });

  it("preserves the exact picked color as DEFAULT while generating numeric shades", async () => {
    const { useDesignSystem } =
      await import("../../admin/features/Design/composables/useDesignSystem");

    const designSystem = useDesignSystem();
    const generated = designSystem.generateShadesFromColor("#000000");

    expect(generated.DEFAULT).toBe("#000000");
    expect(generated[25]).toBeDefined();
    expect(generated[500]).toBeDefined();
    expect(generated[500]).not.toBe("#000000");

    designSystem.addPalette("True Black", "#000000");

    expect(designSystem.palettes.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "true-black",
          label: "True Black",
          shades: expect.objectContaining({
            25: generated[25],
            DEFAULT: "#000000",
            500: generated[500],
            950: generated[950],
          }),
        }),
      ]),
    );
  });
});
