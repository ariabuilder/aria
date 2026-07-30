import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getGlobalStylesMock,
  saveGlobalStylesMock,
  loggerMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  getGlobalStylesMock: vi.fn(),
  saveGlobalStylesMock: vi.fn(),
  loggerMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    designSystem: {
      getGlobalStyles: getGlobalStylesMock,
      saveGlobalStyles: saveGlobalStylesMock,
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

describe("useGlobalStyles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    getGlobalStylesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          globalStyles: {
            defaults: {
              body: {
                backgroundColor: "",
                color: "",
                fontFamily: "",
                fontSize: "",
                lineHeight: "",
                fontWeight: "",
                letterSpacing: "",
              },
              heading: {
                color: "",
                fontFamily: "",
                fontWeight: "",
                lineHeight: "",
                letterSpacing: "",
                textTransform: "",
              },
              subheading: {
                color: "",
                fontFamily: "",
                fontWeight: "",
                lineHeight: "",
                letterSpacing: "",
              },
              paragraph: {
                color: "",
                fontFamily: "",
                fontSize: "",
                lineHeight: "",
                letterSpacing: "",
                maxWidth: "",
              },
              link: {
                color: "",
                hoverColor: "",
                visitedColor: "",
                textDecoration: "",
                underlineOffset: "",
                fontWeight: "",
              },
              button: {
                base: {
                  fontFamily: "",
                  fontSize: "",
                  fontWeight: "",
                  lineHeight: "",
                  letterSpacing: "",
                  borderRadius: "",
                  paddingX: "",
                  paddingY: "",
                  borderWidth: "",
                },
                variants: {
                  primary: {
                    backgroundColor: "",
                    color: "",
                    borderColor: "",
                    hoverBackgroundColor: "",
                    hoverColor: "",
                    hoverBorderColor: "",
                  },
                  secondary: {
                    backgroundColor: "",
                    color: "",
                    borderColor: "",
                    hoverBackgroundColor: "",
                    hoverColor: "",
                    hoverBorderColor: "",
                  },
                  muted: {
                    backgroundColor: "",
                    color: "",
                    borderColor: "",
                    hoverBackgroundColor: "",
                    hoverColor: "",
                    hoverBorderColor: "",
                  },
                  destructive: {
                    backgroundColor: "",
                    color: "",
                    borderColor: "",
                    hoverBackgroundColor: "",
                    hoverColor: "",
                    hoverBorderColor: "",
                  },
                  disabled: {
                    backgroundColor: "",
                    color: "",
                    borderColor: "",
                    hoverBackgroundColor: "",
                    hoverColor: "",
                    hoverBorderColor: "",
                  },
                },
              },
              input: {
                backgroundColor: "",
                color: "",
                placeholderColor: "",
                borderColor: "",
                borderRadius: "",
                fontFamily: "",
                fontSize: "",
                lineHeight: "",
                paddingX: "",
                paddingY: "",
                focusRingColor: "",
              },
              section: {
                contentMaxWidth: "",
                horizontalPadding: "",
                verticalPadding: "",
                sectionGap: "",
              },
            },
            variables: {
              custom: {},
              aliases: {},
            },
          },
        },
      },
      error: null,
    });

    saveGlobalStylesMock.mockImplementation(async ({ globalStyles }) => ({
      data: {
        success: true,
        data: {
          globalStyles,
        },
      },
      error: null,
    }));
  });

  it("sanitizes non-serializable leaked values before saving variables", async () => {
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const globalStylesStore = useGlobalStyles();
    const variableKey = globalStylesStore.addCustomVariable();
    globalStylesStore.globalStyles.value.variables.custom[variableKey].label =
      "Mr Blue";
    globalStylesStore.globalStyles.value.variables.custom[variableKey].value =
      "#2d49b7";
    globalStylesStore.globalStyles.value.variables.custom[
      variableKey
    ].category = "color";
    globalStylesStore.globalStyles.value.variables.custom[
      variableKey
    ].description = window as unknown as string;

    await globalStylesStore.saveGlobalStyles();

    expect(saveGlobalStylesMock).toHaveBeenCalledWith({
      globalStyles: expect.objectContaining({
        variables: {
          custom: {
            [variableKey]: {
              label: "Mr Blue",
              value: "#2d49b7",
              category: "color",
              description: "",
            },
          },
          aliases: {},
        },
      }),
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Global styles saved");
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(loggerMock).not.toHaveBeenCalledWith(
      "error",
      "[useGlobalStyles] Failed to save global styles",
      expect.anything(),
    );
  });

  it("hydrates missing root and container defaults from existing saved styles", async () => {
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const globalStylesStore = useGlobalStyles();
    await globalStylesStore.loadGlobalStyles();

    expect(globalStylesStore.globalStyles.value.defaults.root).toEqual({
      fontSize: "",
      margin: "0",
      padding: "0",
      cursor: "",
      caretColor: "",
      selectionColor: "",
      selectionBackgroundColor: "",
      scrollBehavior: "",
      outlineColor: "",
      outlineWidth: "",
      outlineStyle: "",
      borderColor: "",
      borderRadius: "",
    });
    expect(globalStylesStore.globalStyles.value.defaults.container).toEqual({
      maxWidth: "",
      width: "",
    });
    expect(globalStylesStore.globalStyles.value.defaults.body).toMatchObject({
      maxWidth: "",
      margin: "0",
      padding: "0",
    });
  });

  it("re-links alias sources when a custom variable key changes", async () => {
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const globalStylesStore = useGlobalStyles();
    const customKey = globalStylesStore.addCustomVariable();
    const aliasKey = globalStylesStore.addAlias();

    globalStylesStore.globalStyles.value.variables.aliases[
      aliasKey
    ].sourceType = "custom";
    globalStylesStore.globalStyles.value.variables.aliases[aliasKey].sourceKey =
      customKey;

    globalStylesStore.renameCustomVariableKey(customKey, "brand-primary");

    expect(
      globalStylesStore.globalStyles.value.variables.aliases[aliasKey]
        .sourceKey,
    ).toBe("brand-primary");
  });

  it("clears dependent alias sources when a custom variable is removed", async () => {
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const globalStylesStore = useGlobalStyles();
    const customKey = globalStylesStore.addCustomVariable();
    const aliasKey = globalStylesStore.addAlias();

    globalStylesStore.globalStyles.value.variables.aliases[
      aliasKey
    ].sourceType = "custom";
    globalStylesStore.globalStyles.value.variables.aliases[aliasKey].sourceKey =
      customKey;

    globalStylesStore.removeCustomVariable(customKey);

    expect(
      globalStylesStore.globalStyles.value.variables.aliases[aliasKey]
        .sourceKey,
    ).toBe("");
  });

  it("merges imported variables into the existing store", async () => {
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const globalStylesStore = useGlobalStyles();

    globalStylesStore.importVariables({
      custom: {
        "brand-primary": {
          label: "Brand Primary",
          value: "#2d49b7",
          category: "color",
          description: "",
        },
      },
      aliases: {
        accent: {
          label: "Accent",
          sourceType: "custom",
          sourceKey: "brand-primary",
          fallback: "",
        },
      },
    });

    expect(globalStylesStore.globalStyles.value.variables.custom).toEqual(
      expect.objectContaining({
        "brand-primary": expect.objectContaining({ value: "#2d49b7" }),
      }),
    );
    expect(globalStylesStore.globalStyles.value.variables.aliases).toEqual(
      expect.objectContaining({
        accent: expect.objectContaining({ sourceKey: "brand-primary" }),
      }),
    );
  });

  it("records added variables and aliases in history", async () => {
    const { useHistory } = await import("../../admin/features/History");
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const history = useHistory();
    history.clear();

    const globalStylesStore = useGlobalStyles();

    const customKey = await globalStylesStore.addCustomVariableWithHistory();
    const aliasKey = await globalStylesStore.addAliasWithHistory();

    expect(customKey).toBe("custom-var-1");
    expect(aliasKey).toBe("alias-var-1");
    expect(history.canUndo.value).toBe(true);
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("custom-var-1");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).toHaveProperty("alias-var-1");

    await history.undo();
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).not.toHaveProperty("alias-var-1");

    await history.undo();
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).not.toHaveProperty("custom-var-1");

    await history.redo();
    await history.redo();

    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("custom-var-1");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).toHaveProperty("alias-var-1");
  });

  it("records rename, duplicate, and delete operations for variables and aliases", async () => {
    const { useHistory } = await import("../../admin/features/History");
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const history = useHistory();
    history.clear();

    const globalStylesStore = useGlobalStyles();
    const customKey = globalStylesStore.addCustomVariable();
    globalStylesStore.globalStyles.value.variables.custom[customKey].label =
      "Primary";
    const aliasKey = globalStylesStore.addAlias();
    globalStylesStore.globalStyles.value.variables.aliases[aliasKey].label =
      "Accent";

    const didRenameVariable =
      await globalStylesStore.renameCustomVariableKeyWithHistory(
        customKey,
        "brand-primary",
      );
    const duplicatedVariableKey =
      await globalStylesStore.duplicateCustomVariableWithHistory(
        "brand-primary",
      );
    const didRenameAlias = await globalStylesStore.renameAliasKeyWithHistory(
      aliasKey,
      "accent",
    );
    const duplicatedAliasKey =
      await globalStylesStore.duplicateAliasWithHistory("accent");
    const didDeleteVariable =
      duplicatedVariableKey === null
        ? false
        : await globalStylesStore.removeCustomVariableWithHistory(
            duplicatedVariableKey,
          );
    const didDeleteAlias =
      duplicatedAliasKey === null
        ? false
        : await globalStylesStore.removeAliasWithHistory(duplicatedAliasKey);

    expect(didRenameVariable).toBe(true);
    expect(duplicatedVariableKey).toBe("brand-primary-1");
    expect(didRenameAlias).toBe(true);
    expect(duplicatedAliasKey).toBe("accent-1");
    expect(didDeleteVariable).toBe(true);
    expect(didDeleteAlias).toBe(true);

    await history.undo();
    await history.undo();
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("brand-primary-1");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).toHaveProperty("accent-1");

    await history.undo();
    await history.undo();
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).toHaveProperty("alias-var-1");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).not.toHaveProperty("accent");

    await history.undo();
    await history.undo();

    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("custom-var-1");
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).not.toHaveProperty("brand-primary");

    await history.redo();
    await history.redo();
    await history.redo();
    await history.redo();
    await history.redo();
    await history.redo();

    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).not.toHaveProperty("brand-primary-1");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).not.toHaveProperty("accent-1");
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("brand-primary");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).toHaveProperty("accent");
  });

  it("records variable imports and replacements in history", async () => {
    const { useHistory } = await import("../../admin/features/History");
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const history = useHistory();
    history.clear();

    const globalStylesStore = useGlobalStyles();

    const importSummary = await globalStylesStore.importVariablesWithHistory({
      custom: {
        "brand-primary": {
          label: "Brand Primary",
          value: "#2d49b7",
          category: "color",
          description: "",
        },
      },
      aliases: {
        accent: {
          label: "Accent",
          sourceType: "custom",
          sourceKey: "brand-primary",
          fallback: "",
        },
      },
    });

    const replaceSummary = await globalStylesStore.replaceVariablesWithHistory({
      custom: {
        "surface-base": {
          label: "Surface Base",
          value: "#111111",
          category: "color",
          description: "",
        },
      },
      aliases: {},
    });

    expect(importSummary).toEqual({ customCount: 1, aliasCount: 1 });
    expect(replaceSummary).toEqual({ customCount: 1, aliasCount: 0 });
    expect(globalStylesStore.globalStyles.value.variables.custom).toEqual({
      "surface-base": expect.objectContaining({ label: "Surface Base" }),
    });

    await history.undo();
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("brand-primary");
    expect(
      globalStylesStore.globalStyles.value.variables.aliases,
    ).toHaveProperty("accent");

    await history.undo();
    expect(globalStylesStore.globalStyles.value.variables).toEqual({
      custom: {},
      aliases: {},
    });

    await history.redo();
    await history.redo();
    expect(
      globalStylesStore.globalStyles.value.variables.custom,
    ).toHaveProperty("surface-base");
  });

  it("records variable resets in history and restores them with undo/redo", async () => {
    const { useHistory } = await import("../../admin/features/History");
    const { useGlobalStyles } =
      await import("../../admin/features/Design/composables/useGlobalStyles");

    const history = useHistory();
    history.clear();

    const globalStylesStore = useGlobalStyles();
    const customKey = globalStylesStore.addCustomVariable();
    const aliasKey = globalStylesStore.addAlias();

    globalStylesStore.globalStyles.value.variables.custom[customKey].label =
      "Brand Primary";
    globalStylesStore.globalStyles.value.variables.aliases[aliasKey].label =
      "Accent";

    const didReset = await globalStylesStore.resetVariablesWithHistory();

    expect(didReset).toBe(true);
    expect(globalStylesStore.globalStyles.value.variables).toEqual({
      custom: {},
      aliases: {},
    });
    expect(history.canUndo.value).toBe(true);

    await history.undo();

    expect(globalStylesStore.globalStyles.value.variables.custom).toEqual(
      expect.objectContaining({
        [customKey]: expect.objectContaining({ label: "Brand Primary" }),
      }),
    );
    expect(globalStylesStore.globalStyles.value.variables.aliases).toEqual(
      expect.objectContaining({
        [aliasKey]: expect.objectContaining({ label: "Accent" }),
      }),
    );

    await history.redo();

    expect(globalStylesStore.globalStyles.value.variables).toEqual({
      custom: {},
      aliases: {},
    });
  });
});
