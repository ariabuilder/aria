import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  broadcastSelectNodeMock,
  signalClearInsertionContextMock,
  illuminateMock,
  illuminateByIdMock,
  clearSelectionMock,
} = vi.hoisted(() => ({
  broadcastSelectNodeMock: vi.fn(),
  signalClearInsertionContextMock: vi.fn(),
  illuminateMock: vi.fn(),
  illuminateByIdMock: vi.fn(),
  clearSelectionMock: vi.fn(),
}));

vi.mock("../../../admin/features/Core", () => ({
  useCanvasInteractionBridge: () => ({
    broadcastSelectNode: broadcastSelectNodeMock,
    signalClearInsertionContext: signalClearInsertionContextMock,
  }),
}));

vi.mock("../../../admin/features/Beacon", () => ({
  useBeacon: () => ({
    focusedNodeId: ref<string | null>(null),
    illuminate: illuminateMock,
    illuminateById: illuminateByIdMock,
    clearSelection: clearSelectionMock,
  }),
}));

describe("useStageSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears selection and insertion context when requested", async () => {
    const { useStageSelection } =
      await import("../../../admin/features/Stage/composables/useStageSelection");

    const selection = useStageSelection({
      pageBlocks: ref([]),
      selectedLayoutRegion: ref<string | null>(null),
      openLayersEditorTab: vi.fn(),
      handleAddBlock: vi.fn(),
    });

    selection.handleClearSelection();

    expect(clearSelectionMock).toHaveBeenCalledTimes(1);
    expect(broadcastSelectNodeMock).toHaveBeenCalledWith({ nodeId: null });
    expect(signalClearInsertionContextMock).toHaveBeenCalledTimes(1);
  });

  it("treats structured stage click payloads as already-applied selection and only opens Layers", async () => {
    const openLayersEditorTab = vi.fn();
    const { useStageSelection } =
      await import("../../../admin/features/Stage/composables/useStageSelection");

    const selection = useStageSelection({
      pageBlocks: ref([]),
      selectedLayoutRegion: ref<string | null>(null),
      openLayersEditorTab,
      handleAddBlock: vi.fn(),
    });

    selection.handleStageSelectBlock({
      nodeId: "node-2",
      triggerGesture: {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    expect(openLayersEditorTab).toHaveBeenCalledTimes(1);
    expect(illuminateByIdMock).not.toHaveBeenCalled();
    expect(clearSelectionMock).not.toHaveBeenCalled();
  });

  it("clears selection when stage emits null (background click / escape)", async () => {
    const openLayersEditorTab = vi.fn();
    const { useStageSelection } =
      await import("../../../admin/features/Stage/composables/useStageSelection");

    const selection = useStageSelection({
      pageBlocks: ref([]),
      selectedLayoutRegion: ref<string | null>(null),
      openLayersEditorTab,
      handleAddBlock: vi.fn(),
    });

    selection.handleStageSelectBlock(null);

    expect(clearSelectionMock).toHaveBeenCalledTimes(1);
    expect(openLayersEditorTab).not.toHaveBeenCalled();
    expect(illuminateByIdMock).not.toHaveBeenCalled();
  });

  it("still resolves raw select-block ids through Beacon for non-overlay callers", async () => {
    const openLayersEditorTab = vi.fn();
    const { useStageSelection } =
      await import("../../../admin/features/Stage/composables/useStageSelection");

    const blocks = [
      {
        id: "node-1",
        type: "text",
        props: {},
        styles: {},
        children: [],
      },
    ];

    const selection = useStageSelection({
      pageBlocks: ref(blocks),
      selectedLayoutRegion: ref<string | null>(null),
      openLayersEditorTab,
      handleAddBlock: vi.fn(),
    });

    selection.handleStageSelectBlock("node-1");

    expect(illuminateByIdMock).toHaveBeenCalledWith("node-1", blocks);
    expect(openLayersEditorTab).toHaveBeenCalledTimes(1);
  });
});
