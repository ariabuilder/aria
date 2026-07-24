import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const {
  executeMock,
  recordStateSnapshotMock,
  createClassMock,
  renameClassMock,
  duplicateClassMock,
  replaceClassStylesMock,
  deleteClassMock,
  setAuthoringModeMock,
  addCustomClassMock,
  removeCustomClassMock,
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
  recordStateSnapshotMock: vi.fn(),
  createClassMock: vi.fn(),
  renameClassMock: vi.fn(),
  duplicateClassMock: vi.fn(),
  replaceClassStylesMock: vi.fn(),
  deleteClassMock: vi.fn(),
  setAuthoringModeMock: vi.fn(),
  addCustomClassMock: vi.fn(),
  removeCustomClassMock: vi.fn(),
}));

vi.mock("../../admin/features/History", () => ({
  recordStateSnapshot: recordStateSnapshotMock,
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    styles: {
      createClass: createClassMock,
      renameClass: renameClassMock,
      duplicateClass: duplicateClassMock,
      replaceClassStyles: replaceClassStylesMock,
      deleteClass: deleteClassMock,
      setAuthoringMode: setAuthoringModeMock,
    },
    nodes: {
      addCustomClass: addCustomClassMock,
      removeCustomClass: removeCustomClassMock,
    },
  },
}));

describe("useClassEditorHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    recordStateSnapshotMock.mockImplementation(async ({ action }) => {
      return await action();
    });

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;
      try {
        await operation.redo();
        return { success: true, error: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });
  });

  it("records class creation through validated snapshot history", async () => {
    createClassMock.mockResolvedValue({
      error: null,
      data: {
        success: true,
        data: {
          class: {
            id: "btn-primary",
            name: "btn-primary",
            variants: [],
            pseudoVariants: [],
            usageCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          css: ".btn-primary {}",
        },
      },
    });

    const onApplied = vi.fn();
    const applySnapshot = vi.fn();

    const { useClassEditorHistory } =
      await import("../../admin/features/Inspector/composables/useClassEditorHistory");

    const { recordCreateClass } = useClassEditorHistory();
    const result = await recordCreateClass(
      {
        name: "btn-primary",
        description: "Primary button",
      },
      {
        snapshotSchema: z
          .object({
            customClasses: z.record(z.string(), z.unknown()),
            generatedCSS: z.string(),
            activeClassName: z.string().nullable(),
          })
          .strict(),
        captureSnapshot: () => ({
          customClasses: {},
          generatedCSS: "",
          activeClassName: null,
        }),
        applySnapshot,
        onApplied,
      },
    );

    expect(result).toEqual({ success: true });
    expect(recordStateSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "create-custom-class",
        description: "Create class: btn-primary",
      }),
    );
    expect(createClassMock).toHaveBeenCalledWith({
      name: "btn-primary",
      description: "Primary button",
    });
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        className: "btn-primary",
        css: ".btn-primary {}",
      }),
    );
  });

  it("records class rename through history and supports undo", async () => {
    renameClassMock
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            class: {
              id: "btn-primary-renamed",
              name: "btn-primary-renamed",
              variants: [],
              pseudoVariants: [],
              usageCount: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            css: ".btn-primary-renamed {}",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            class: {
              id: "btn-primary",
              name: "btn-primary",
              variants: [],
              pseudoVariants: [],
              usageCount: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            css: ".btn-primary {}",
          },
        },
      });

    const onRedo = vi.fn();
    const onUndo = vi.fn();

    const { useClassEditorHistory } =
      await import("../../admin/features/Inspector/composables/useClassEditorHistory");

    const { recordRenameClass } = useClassEditorHistory();
    const result = await recordRenameClass(
      {
        oldName: "btn-primary",
        newName: "btn-primary-renamed",
      },
      {
        onRedo,
        onUndo,
      },
    );

    expect(result.success).toBe(true);
    expect(renameClassMock).toHaveBeenCalledWith({
      oldName: "btn-primary",
      newName: "btn-primary-renamed",
    });
    expect(onRedo).toHaveBeenCalledWith(
      expect.objectContaining({
        previousName: "btn-primary",
        nextName: "btn-primary-renamed",
        css: ".btn-primary-renamed {}",
      }),
    );

    await lastOperation?.undo();

    expect(renameClassMock).toHaveBeenLastCalledWith({
      oldName: "btn-primary-renamed",
      newName: "btn-primary",
    });
    expect(onUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        previousName: "btn-primary-renamed",
        nextName: "btn-primary",
        css: ".btn-primary {}",
      }),
    );
  });

  it("fails class creation when the style action returns malformed data", async () => {
    createClassMock.mockResolvedValue({
      error: null,
      data: {
        success: true,
        data: {
          css: ".btn-primary {}",
        },
      },
    });

    const onApplied = vi.fn();

    const { useClassEditorHistory } =
      await import("../../admin/features/Inspector/composables/useClassEditorHistory");

    const { recordCreateClass } = useClassEditorHistory();
    const result = await recordCreateClass(
      {
        name: "btn-primary",
      },
      {
        snapshotSchema: z
          .object({
            customClasses: z.record(z.string(), z.unknown()),
            generatedCSS: z.string(),
            activeClassName: z.string().nullable(),
          })
          .strict(),
        captureSnapshot: () => ({
          customClasses: {},
          generatedCSS: "",
          activeClassName: null,
        }),
        applySnapshot: vi.fn(),
        onApplied,
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to create class",
    });
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("rejects invalid node custom-class input before history executes", async () => {
    const onRedo = vi.fn();
    const onUndo = vi.fn();

    const { useClassEditorHistory } =
      await import("../../admin/features/Inspector/composables/useClassEditorHistory");

    const { recordNodeCustomClassChange } = useClassEditorHistory();
    const result = await recordNodeCustomClassChange(
      "add-custom-class",
      {
        collection: "pages",
        id: "home",
        nodeId: "",
        className: "",
      },
      {
        onRedo,
        onUndo,
      },
    );

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
    expect(addCustomClassMock).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("fails node custom-class history when the action response is malformed", async () => {
    addCustomClassMock.mockResolvedValue({
      error: null,
      data: {},
    });

    const onRedo = vi.fn();
    const onUndo = vi.fn();

    const { useClassEditorHistory } =
      await import("../../admin/features/Inspector/composables/useClassEditorHistory");

    const { recordNodeCustomClassChange } = useClassEditorHistory();
    const result = await recordNodeCustomClassChange(
      "add-custom-class",
      {
        collection: "pages",
        id: "home",
        nodeId: "node-1",
        className: "btn-primary",
      },
      {
        onRedo,
        onUndo,
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to add custom class",
    });
    expect(onRedo).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });
});
