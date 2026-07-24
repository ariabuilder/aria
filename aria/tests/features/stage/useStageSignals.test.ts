/**
 * useStageSignals tests
 *
 * @vitest-environment jsdom
 */

import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BuilderNode } from "../../../lib/types/nodes";
import { useStageSignals } from "../../../admin/features/Stage/composables/useStageSignals";

const callbacks = vi.hoisted(() => ({
  unoConfigChanged: null as
    | ((payload: {
        nodeId: string;
        configJSON: string;
        timestamp: number;
      }) => Promise<void> | void)
    | null,
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

vi.mock("../../../admin/features/Core", () => ({
  useCanvasInteractionBridge: () => ({
    onScrollToNode: vi.fn(),
    onHighlightNode: vi.fn(),
  }),
  useStageSignalBridge: () => ({
    onNodeSelected: vi.fn(),
    onDeleteBlock: vi.fn(),
    onAddBlock: vi.fn(),
    onConvertComponent: vi.fn(),
    onUnoConfigChanged: vi.fn((callback) => {
      callbacks.unoConfigChanged = callback;
    }),
  }),
}));

function createNode(id = "section-1"): BuilderNode {
  return {
    id,
    type: "section",
    props: {},
    styles: {},
    children: [],
  };
}

describe("useStageSignals", () => {
  beforeEach(() => {
    callbacks.unoConfigChanged = null;
    vi.clearAllMocks();
  });

  it("does not throw when uno-config-changed arrives before the iframe document is ready", async () => {
    useStageSignals({
      emit: vi.fn(),
      iframeRef: ref(null),
      getBlocks: () => [createNode()],
      findNodeWithParent: () => null,
      findNodeLocation: () => null,
      conversion: {
        openDialog: vi.fn(),
      } as never,
      canvasReorder: {
        initializeDragButton: vi.fn(),
      },
      canvasOverlays: {
        showHover: vi.fn(),
        showSelection: vi.fn(),
        hideHover: vi.fn(),
      },
      syncSelectionToolbar: vi.fn(),
      scrollBehavior: "smooth",
      scrollBlock: "center",
    });

    expect(callbacks.unoConfigChanged).not.toBeNull();

    await expect(
      callbacks.unoConfigChanged?.({
        nodeId: "section-1",
        configJSON: JSON.stringify({ theme: { colors: {} } }),
        timestamp: Date.now(),
      }),
    ).resolves.toBeUndefined();

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[StageFrame] uno-config-changed: document not ready",
    );
  });
});
