import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { BuilderNode } from "../../../lib/types/nodes";

const { onSelectNodeMock, selectHandler } = vi.hoisted(() => {
  const handlers: Array<(payload: unknown) => void> = [];
  return {
    onSelectNodeMock: vi.fn((handler: (payload: unknown) => void) => {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    }),
    selectHandler: (payload: unknown) => {
      handlers.forEach((handler) => handler(payload));
    },
  };
});

vi.mock("../../../admin/features/Core", () => ({
  useCanvasInteractionBridge: () => ({
    onHoverNode: vi.fn(() => () => {}),
    onSelectNode: onSelectNodeMock,
    signalGetComponentWrapper: vi.fn(),
  }),
  useCanvasSignalBridge: () => ({
    onComponentWrapperResponse: vi.fn(() => () => {}),
  }),
  syncLayoutSlotOnNodeSelect: vi.fn(),
}));

import { syncLayoutSlotOnNodeSelect } from "../../../admin/features/Core";
import { useLayerCanvasSignals } from "../../../admin/features/Layers/composables/useLayerCanvasSignals";

function createNode(id: string): BuilderNode {
  return { id, type: "Text", props: {}, styles: {}, children: [] };
}

describe("useLayerCanvasSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("focuses nodes resolved from editor registry outside page roots", () => {
    const headerNode = createNode("header-text");
    const focusNode = vi.fn();
    const expandAncestors = vi.fn();
    const registry = {
      findNode: vi.fn((nodeId: string) =>
        nodeId === "header-text" ? headerNode : null,
      ),
      locateNode: vi.fn(),
    };

    useLayerCanvasSignals({
      blocks: ref([]),
      currentPageNodes: ref([]),
      currentLayout: ref(null),
      hoveredNodeId: ref(null),
      findNodeById: () => null,
      expandAncestors,
      focusNode,
      toggleSelection: vi.fn(),
      clearSelection: vi.fn(),
      editorNodeRegistry: registry as never,
      activeLayoutSlot: null,
    });

    selectHandler({ nodeId: "header-text" });

    expect(syncLayoutSlotOnNodeSelect).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "header-text" }),
    );
    expect(expandAncestors).toHaveBeenCalledWith("header-text");
    expect(focusNode).toHaveBeenCalledWith("header-text");
  });
});
