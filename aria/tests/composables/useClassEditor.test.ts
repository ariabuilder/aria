import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

const selectedNodeRef = ref<Record<string, unknown> | null>(null);
const selectedNodeIdRef = ref<string | null>(null);
const viewportRef = ref("desktop");
const activeBreakpointsRef = ref<Array<{ name: string }>>([]);

const {
  getClassesMock,
  updateClassRuleMock,
  getGeneratedCSSMock,
  addUtilityClassMock,
  removeUtilityClassMock,
  recordNodeCustomClassChangeMock,
  recordReplaceClassStylesMock,
  recordStateSnapshotAdvancedMock,
  loggerMock,
  broadcastClassUpdateMock,
  broadcastCssUpdatedMock,
  updateSelectedNodeClassNamesMock,
  updateSelectedNodeCustomClassesMock,
} = vi.hoisted(() => ({
  getClassesMock: vi.fn(),
  updateClassRuleMock: vi.fn(),
  getGeneratedCSSMock: vi.fn(),
  addUtilityClassMock: vi.fn(),
  removeUtilityClassMock: vi.fn(),
  recordNodeCustomClassChangeMock: vi.fn(),
  recordReplaceClassStylesMock: vi.fn(),
  recordStateSnapshotAdvancedMock: vi.fn(),
  loggerMock: vi.fn(),
  broadcastClassUpdateMock: vi.fn(),
  broadcastCssUpdatedMock: vi.fn(),
  updateSelectedNodeClassNamesMock: vi.fn(),
  updateSelectedNodeCustomClassesMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    styles: {
      getClasses: getClassesMock,
      updateClassRule: updateClassRuleMock,
      getGeneratedCSS: getGeneratedCSSMock,
    },
    nodes: {
      addUtilityClass: addUtilityClassMock,
      removeUtilityClass: removeUtilityClassMock,
    },
  },
}));

vi.mock("../../admin/composables/useViewport", () => ({
  useViewport: () => ({
    viewport: viewportRef,
  }),
}));

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: activeBreakpointsRef,
  }),
}));

vi.mock("../../admin/features/Core", () => ({
  cloneDeep: <T>(value: T) => JSON.parse(JSON.stringify(value)) as T,
  useCanvasSignalBridge: () => ({
    broadcastClassUpdate: broadcastClassUpdateMock,
  }),
  useSelectedNodeState: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    updateSelectedNodeClassNames: updateSelectedNodeClassNamesMock,
    updateSelectedNodeCustomClasses: updateSelectedNodeCustomClassesMock,
  }),
}));

vi.mock("../../admin/features/History", () => ({
  recordStateSnapshotAdvanced: recordStateSnapshotAdvancedMock,
}));

vi.mock(
  "../../admin/features/Inspector/composables/useClassEditorHistory",
  () => ({
    useClassEditorHistory: () => ({
      recordCreateClass: vi.fn(),
      recordDeleteClass: vi.fn(),
      recordRenameClass: vi.fn(),
      recordDuplicateClass: vi.fn(),
      recordReplaceClassStyles: recordReplaceClassStylesMock,
      recordAuthoringModeChange: vi.fn(),
      recordNodeCustomClassChange: recordNodeCustomClassChangeMock,
    }),
  }),
);

vi.mock(
  "../../admin/features/Inspector/composables/useClassEditorSignals",
  () => ({
    useClassEditorSignals: () => ({
      broadcastCssUpdated: broadcastCssUpdatedMock,
      broadcastActiveChanged: vi.fn(),
      broadcastClassRenamed: vi.fn(),
      broadcastModeChanged: vi.fn(),
      broadcastAuthoringModeChanged: vi.fn(),
      broadcastNodeClassAdded: vi.fn(),
      broadcastNodeClassRemoved: vi.fn(),
      broadcastNodeCustomClassAdded: vi.fn(),
      broadcastNodeCustomClassRemoved: vi.fn(),
    }),
  }),
);

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("useClassEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    selectedNodeRef.value = null;
    selectedNodeIdRef.value = null;
    viewportRef.value = "desktop";
    activeBreakpointsRef.value = [];
    updateSelectedNodeClassNamesMock.mockReset();
    updateSelectedNodeCustomClassesMock.mockReset();
    recordNodeCustomClassChangeMock.mockReset();
    recordReplaceClassStylesMock.mockReset();

    recordStateSnapshotAdvancedMock.mockImplementation(async ({ action }) => {
      return await action();
    });

    recordNodeCustomClassChangeMock.mockImplementation(
      async (_operation, payload, callbacks) => {
        callbacks.onRedo(payload);
        return { success: true };
      },
    );

    recordReplaceClassStylesMock.mockImplementation(
      async (payload, _previousTargetClass, callbacks) => {
        const updatedClass = {
          id: payload.targetName,
          name: payload.targetName,
          variants: payload.variants ?? [],
          pseudoVariants: payload.pseudoVariants ?? [],
          usageCount: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        };
        callbacks.onRedo({
          targetName: payload.targetName,
          updatedClass,
          css: `.${payload.targetName} { color: red; }`,
        });
        return { success: true };
      },
    );
  });

  it("rejects malformed getClasses payloads before mutating class state", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: 42,
          authoringMode: "utility",
          css: ".btn-primary {}",
        },
      },
      error: null,
    });

    const editor = useClassEditor();
    await editor.loadClasses();

    expect(editor.error.value).toBe("Failed to load classes");
    expect(editor.customClasses.value).toEqual({});
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[useClassEditor] Invalid style action response",
      expect.objectContaining({
        source: "useClassEditor.loadClasses",
        issues: expect.any(Array),
      }),
    );
  });

  it("records rule-update failure when updateClassRule returns an invalid payload", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    const initialClass = {
      id: "btn-primary",
      name: "btn-primary",
      variants: [],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: { "btn-primary": initialClass },
          authoringMode: "utility",
          css: ".btn-primary {}",
        },
      },
      error: null,
    });

    updateClassRuleMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          class: 42,
          css: ".btn-primary { color: red; }",
        },
      },
      error: null,
    });

    const editor = useClassEditor();
    await editor.loadClasses();
    editor.setActiveClass("btn-primary");

    const result = await editor.setClassRule("color", "red");

    expect(result).toBe(false);
    expect(editor.error.value).toBe("Failed to update rule");
    expect(editor.customClasses.value["btn-primary"]).toEqual(initialClass);
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[useClassEditor] Invalid style action response",
      expect.objectContaining({
        source: "useClassEditor.setClassRule",
        className: "btn-primary",
        property: "color",
        issues: expect.any(Array),
      }),
    );
  });

  it("records one history snapshot when updating multiple class rules at once", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    const initialClass = {
      id: "btn-primary",
      name: "btn-primary",
      variants: [],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const updatedClass = {
      ...initialClass,
      variants: [
        {
          breakpoint: "base",
          rules: [
            { property: "transform", value: "rotate(45deg)", important: false },
            {
              property: "transformOrigin",
              value: "center center",
              important: false,
            },
          ],
        },
      ],
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: { "btn-primary": initialClass },
          authoringMode: "utility",
          css: ".btn-primary {}",
        },
      },
      error: null,
    });

    updateClassRuleMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          class: updatedClass,
          css: ".btn-primary { transform: rotate(45deg); transform-origin: center center; }",
        },
      },
      error: null,
    });

    const editor = useClassEditor();
    await editor.loadClasses();
    editor.setActiveClass("btn-primary");

    const result = await editor.setClassRules({
      transform: "rotate(45deg)",
      transformOrigin: "center center",
    });

    expect(result).toBe(true);
    expect(recordStateSnapshotAdvancedMock).toHaveBeenCalledTimes(1);
    expect(recordStateSnapshotAdvancedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Update btn-primary: transform, transformOrigin",
      }),
    );
    expect(updateClassRuleMock).toHaveBeenCalledTimes(2);
    expect(updateClassRuleMock).toHaveBeenNthCalledWith(1, {
      className: "btn-primary",
      breakpoint: "base",
      property: "transform",
      value: "rotate(45deg)",
      important: false,
    });
    expect(updateClassRuleMock).toHaveBeenNthCalledWith(2, {
      className: "btn-primary",
      breakpoint: "base",
      property: "transformOrigin",
      value: "center center",
      important: false,
    });
  });

  it("stages utility classes locally without calling the server", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    addUtilityClassMock.mockResolvedValue({
      data: {
        version: 42,
      },
      error: null,
    });

    selectedNodeRef.value = {
      id: "hero-node",
      classNames: { base: [] },
      customClasses: [],
    };

    const editor = useClassEditor();
    const result = await editor.addUtilityClass(
      "pages",
      "home",
      "hero-node",
      "text-xl",
    );

    expect(result).toBe(true);
    expect(editor.error.value).toBeNull();
    expect(updateSelectedNodeClassNamesMock).toHaveBeenCalledWith("hero-node", {
      base: ["text-xl"],
    });
    expect(addUtilityClassMock).not.toHaveBeenCalled();
  });

  it("ignores malformed generated CSS payloads without mutating css state", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: {},
          authoringMode: "utility",
          css: ".existing {}",
        },
      },
      error: null,
    });

    getGeneratedCSSMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          css: 42,
        },
      },
      error: null,
    });

    const editor = useClassEditor();
    await editor.loadClasses();
    await editor.refreshCSS();

    expect(editor.generatedCSS.value).toBe(".existing {}");
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[useClassEditor] Invalid style action response",
      expect.objectContaining({
        source: "useClassEditor.refreshCSS",
        issues: expect.any(Array),
      }),
    );
  });

  it("broadcasts custom class references for live canvas updates", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    selectedNodeRef.value = {
      id: "hero-node",
      classNames: { base: ["relative"] },
      customClasses: [],
    };
    selectedNodeIdRef.value = "hero-node";

    updateSelectedNodeCustomClassesMock.mockImplementation(
      (_nodeId: string, customClasses: string[]) => {
        selectedNodeRef.value = {
          ...(selectedNodeRef.value ?? {}),
          id: "hero-node",
          classNames: { base: ["relative"] },
          customClasses,
        };

        return selectedNodeRef.value;
      },
    );

    const editor = useClassEditor();
    const result = await editor.addCustomClassToNode(
      "pages",
      "home",
      "hero-node",
      "test-bg-blue",
    );

    expect(result).toBe(true);
    expect(updateSelectedNodeCustomClassesMock).toHaveBeenCalledWith(
      "hero-node",
      ["test-bg-blue"],
    );
    expect(broadcastClassUpdateMock).toHaveBeenCalledWith({
      nodeId: "hero-node",
      classNames: { base: ["relative"] },
      customClasses: ["test-bg-blue"],
    });
  });

  it("clears the active class when the selected node is deselected", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: {
            "btn-primary": {
              id: "btn-primary",
              name: "btn-primary",
              variants: [],
              pseudoVariants: [],
        compoundVariants: [],
              usageCount: 0,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          authoringMode: "utility",
          css: ".btn-primary {}",
        },
      },
      error: null,
    });

    selectedNodeRef.value = {
      id: "hero-node",
      classNames: { base: ["relative"] },
      customClasses: ["btn-primary"],
    };
    selectedNodeIdRef.value = "hero-node";

    const editor = useClassEditor();
    await editor.loadClasses();
    editor.setActiveClass("btn-primary");

    expect(editor.activeClassName.value).toBe("btn-primary");
    expect(editor.editingMode.value).toBe("class");

    selectedNodeIdRef.value = null;
    await nextTick();

    expect(editor.activeClassName.value).toBeNull();
    expect(editor.editingMode.value).toBe("element");
  });

  it("replaces class styles from explicit copied rule snapshots", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: {
            "btn-primary": {
              id: "btn-primary",
              name: "btn-primary",
              variants: [],
              pseudoVariants: [],
        compoundVariants: [],
              usageCount: 0,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          authoringMode: "utility",
          css: ".btn-primary {}",
        },
      },
      error: null,
    });

    const variants = [
      {
        breakpoint: "base",
        rules: [{ property: "color", value: "red", important: false }],
      },
    ];

    const editor = useClassEditor();
    await editor.loadClasses();
    editor.setActiveClass("btn-primary");

    const result = await editor.replaceClassStyles("btn-primary", variants, []);

    expect(result).toBe(true);
    expect(recordReplaceClassStylesMock).toHaveBeenCalledWith(
      {
        targetName: "btn-primary",
        variants,
        pseudoVariants: [],
      },
      expect.objectContaining({ name: "btn-primary" }),
      expect.any(Object),
    );
    expect(editor.customClasses.value["btn-primary"]?.variants).toEqual(
      variants,
    );
    expect(broadcastCssUpdatedMock).toHaveBeenCalled();
  });

  it("clears the active class when selection moves to another node", async () => {
    const { useClassEditor } =
      await import("../../admin/features/Inspector/composables/useClassEditor");

    getClassesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          classes: {
            "btn-primary": {
              id: "btn-primary",
              name: "btn-primary",
              variants: [],
              pseudoVariants: [],
        compoundVariants: [],
              usageCount: 0,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          authoringMode: "utility",
          css: ".btn-primary {}",
        },
      },
      error: null,
    });

    selectedNodeRef.value = {
      id: "hero-node",
      classNames: { base: ["relative"] },
      customClasses: ["btn-primary"],
    };
    selectedNodeIdRef.value = "hero-node";

    const editor = useClassEditor();
    await editor.loadClasses();
    editor.setActiveClass("btn-primary");

    selectedNodeRef.value = {
      id: "feature-node",
      classNames: { base: [] },
      customClasses: [],
    };
    selectedNodeIdRef.value = "feature-node";
    await nextTick();

    expect(editor.activeClassName.value).toBeNull();
    expect(editor.editingMode.value).toBe("element");
  });
});
