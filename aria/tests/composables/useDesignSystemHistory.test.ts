import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { recordStateSnapshotMock, undoMock, redoMock } = vi.hoisted(() => ({
  recordStateSnapshotMock: vi.fn(),
  undoMock: vi.fn(),
  redoMock: vi.fn(),
}));

vi.mock("../../admin/features/History", () => ({
  recordStateSnapshot: recordStateSnapshotMock,
  useHistory: () => ({
    canUndo: { value: false },
    canRedo: { value: true },
    undo: undoMock,
    redo: redoMock,
  }),
}));

describe("useDesignSystemHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordStateSnapshotMock.mockImplementation(
      async ({ action }) => await action(),
    );
  });

  it("records validated design-system snapshot changes through history", async () => {
    const { useDesignSystemHistory } =
      await import("../../admin/features/Design/composables/useDesignSystemHistory");

    const snapshotSchema = z
      .object({
        templateId: z.string().optional(),
        palettes: z.array(z.object({ name: z.string() })),
      })
      .strict();

    const applySnapshot = vi.fn();
    const { recordDesignSystemChange, canUndo, canRedo, undo, redo } =
      useDesignSystemHistory({
        snapshotSchema,
        captureSnapshot: () => ({
          templateId: "custom",
          palettes: [{ name: "primary" }],
        }),
        applySnapshot,
      });

    const result = await recordDesignSystemChange(
      "add-palette",
      "Add primary palette",
      async () => "ok",
    );

    expect(result).toBe("ok");
    expect(recordStateSnapshotMock).toHaveBeenCalledTimes(1);
    expect(recordStateSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-palette",
        description: "Add primary palette",
        captureState: expect.any(Function),
        applySnapshot: expect.any(Function),
        action: expect.any(Function),
      }),
    );
    expect(canUndo.value).toBe(false);
    expect(canRedo.value).toBe(true);

    await undo();
    await redo();

    expect(undoMock).toHaveBeenCalledTimes(1);
    expect(redoMock).toHaveBeenCalledTimes(1);

    const applyHistorySnapshot = recordStateSnapshotMock.mock.calls[0]?.[0]
      ?.applySnapshot as (snapshot: Record<string, unknown>) => Promise<void>;
    await applyHistorySnapshot({
      templateId: "custom",
      palettes: [{ name: "secondary" }],
    });

    expect(applySnapshot).toHaveBeenCalledWith({
      templateId: "custom",
      palettes: [{ name: "secondary" }],
    });
  });

  it("rejects invalid design-system history metadata before recording", async () => {
    const { useDesignSystemHistory } =
      await import("../../admin/features/Design/composables/useDesignSystemHistory");

    const onSnapshotError = vi.fn();
    const { recordDesignSystemChange } = useDesignSystemHistory({
      snapshotSchema: z.object({}).strict(),
      captureSnapshot: () => ({}),
      applySnapshot: vi.fn(),
      onSnapshotError,
    });

    await expect(
      recordDesignSystemChange("add-palette", "", async () => undefined),
    ).rejects.toThrow("Too small: expected string to have >=1 characters");

    expect(recordStateSnapshotMock).not.toHaveBeenCalled();
    expect(onSnapshotError).toHaveBeenCalledWith(
      "Too small: expected string to have >=1 characters",
    );
  });
});
