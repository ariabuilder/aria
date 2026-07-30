import { describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import { useLayerExpansion } from "../../../admin/features/Layers/composables/useLayerExpansion";
import type { BuilderNode } from "../../../lib/types/nodes";
import { VIRTUAL_SLOT_NAMES } from "../../../admin/features/Layers/types";

function createNode(id: string, children: BuilderNode[] = []): BuilderNode {
  return {
    id,
    type: "Container",
    props: {},
    styles: {},
    children,
  };
}

function nodeListRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

describe("useLayerExpansion.expandAncestors", () => {
  it("expands layout slot group and ancestors for nodes in slot defaultContent", () => {
    const headerRoot = createNode("header-root", [createNode("header-child")]);
    const pageNodes = nodeListRef([createNode("main-root")]);
    const blocks = nodeListRef(pageNodes.value);

    const { expandedNodes, expandAncestors } = useLayerExpansion({
      blocks,
      currentPageNodes: pageNodes,
      currentLayout: ref({
        slots: [{ name: "header" }, { name: "main", isDefault: true }],
      }),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentVirtualSlot: ref(VIRTUAL_SLOT_NAMES.PAGE_CONTENT),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      resolveSlotRoots: (slotName) =>
        slotName === "header" ? [headerRoot] : [],
    });

    expandAncestors("header-child");

    expect(expandedNodes.value.has("header")).toBe(true);
    expect(expandedNodes.value.has("header-root")).toBe(true);
  });

  it("expandAll progressively expands only containers from known slot trees", () => {
    vi.useFakeTimers();
    const frameCallbacks: Array<() => void> = [];
    const requestFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(() => callback(performance.now()));
        return frameCallbacks.length;
      });
    const cancelFrame = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const headerRoot = createNode("header-root", [
      createNode("header-nested", [createNode("header-leaf")]),
    ]);
    const pageNodes = nodeListRef([
      createNode("main-root", [createNode("main-child")]),
    ]);
    const blocks = nodeListRef(pageNodes.value);

    try {
      const {
        expandedNodes,
        isAllExpanded,
        isLayerTreeBusy,
        layerTreeOperation,
        toggleAll,
      } = useLayerExpansion({
        blocks,
        currentPageNodes: pageNodes,
        currentLayout: ref({
          slots: [{ name: "header" }, { name: "main", isDefault: true }],
        }),
        currentItemSlug: ref("home"),
        currentItemType: ref("page"),
        currentVirtualSlot: ref(VIRTUAL_SLOT_NAMES.PAGE_CONTENT),
        virtualSlotNames: VIRTUAL_SLOT_NAMES,
        resolveSlotRoots: (slotName) =>
          slotName === "header" ? [headerRoot] : [],
      });

      toggleAll();

      expect(isLayerTreeBusy.value).toBe(true);
      expect(layerTreeOperation.value).toBe("expanding");
      expect(expandedNodes.value.has("header-root")).toBe(false);

      frameCallbacks.shift()?.();
      vi.advanceTimersByTime(0);

      expect(expandedNodes.value.has("header")).toBe(true);
      expect(expandedNodes.value.has("header-root")).toBe(true);
      expect(expandedNodes.value.has("header-nested")).toBe(true);
      expect(expandedNodes.value.has("header-leaf")).toBe(false);
      expect(expandedNodes.value.has("main-root")).toBe(true);
      expect(expandedNodes.value.has("main-child")).toBe(false);
      expect(isAllExpanded.value).toBe(true);
      expect(isLayerTreeBusy.value).toBe(false);
      expect(layerTreeOperation.value).toBeNull();
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the global busy state active between small expansion batches", () => {
    vi.useFakeTimers();
    const frameCallbacks: Array<() => void> = [];
    const requestFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(() => callback(performance.now()));
        return frameCallbacks.length;
      });
    const cancelFrame = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const pageNodes = nodeListRef(
      Array.from({ length: 12 }, (_, index) =>
        createNode(`root-${index}`, [createNode(`leaf-${index}`)]),
      ),
    );

    try {
      const { expandedNodes, isLayerTreeBusy, layerTreeOperation, toggleAll } =
        useLayerExpansion({
          blocks: nodeListRef(pageNodes.value),
          currentPageNodes: pageNodes,
          currentLayout: ref(undefined),
          currentItemSlug: ref("home"),
          currentItemType: ref("page"),
          currentVirtualSlot: ref(VIRTUAL_SLOT_NAMES.PAGE_CONTENT),
          virtualSlotNames: VIRTUAL_SLOT_NAMES,
        });

      toggleAll();
      frameCallbacks.shift()?.();
      vi.advanceTimersByTime(0);

      expect(isLayerTreeBusy.value).toBe(true);
      expect(layerTreeOperation.value).toBe("expanding");
      expect(expandedNodes.value.has("root-6")).toBe(true);
      expect(expandedNodes.value.has("root-7")).toBe(false);

      frameCallbacks.shift()?.();

      expect(isLayerTreeBusy.value).toBe(false);
      expect(layerTreeOperation.value).toBeNull();
      expect(expandedNodes.value.has("root-11")).toBe(true);

      toggleAll();

      expect(isLayerTreeBusy.value).toBe(true);
      expect(layerTreeOperation.value).toBe("collapsing");
      expect(expandedNodes.value.has(VIRTUAL_SLOT_NAMES.PAGE_CONTENT)).toBe(
        true,
      );
      expect(expandedNodes.value.has("root-0")).toBe(true);

      frameCallbacks.shift()?.();
      vi.advanceTimersByTime(0);

      expect(isLayerTreeBusy.value).toBe(true);
      expect(expandedNodes.value.has("root-11")).toBe(false);
      expect(expandedNodes.value.has("root-0")).toBe(true);
      expect(expandedNodes.value.has(VIRTUAL_SLOT_NAMES.PAGE_CONTENT)).toBe(
        true,
      );

      frameCallbacks.shift()?.();

      expect(isLayerTreeBusy.value).toBe(false);
      expect(layerTreeOperation.value).toBeNull();
      expect(expandedNodes.value.size).toBe(0);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not collect layout slot roots for single-node expansion", () => {
    const pageNodes = nodeListRef([
      createNode("main-root", [createNode("main-child")]),
    ]);
    const blocks = nodeListRef(pageNodes.value);
    const resolveSlotRoots = vi.fn(() => [createNode("header-root")]);

    const { expandedNodes, toggleExpand } = useLayerExpansion({
      blocks,
      currentPageNodes: pageNodes,
      currentLayout: ref({
        slots: [{ name: "header" }, { name: "main", isDefault: true }],
      }),
      currentItemSlug: ref("home"),
      currentItemType: ref("page"),
      currentVirtualSlot: ref(VIRTUAL_SLOT_NAMES.PAGE_CONTENT),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      resolveSlotRoots,
    });

    toggleExpand("main-root");

    expect(expandedNodes.value.has("main-root")).toBe(true);
    expect(resolveSlotRoots).not.toHaveBeenCalled();
  });

  it("paints a busy state before mounting a requested branch", () => {
    vi.useFakeTimers();
    const frameCallbacks: Array<() => void> = [];
    const requestFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(() => callback(performance.now()));
        return frameCallbacks.length;
      });
    const cancelFrame = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});

    try {
      const pageNodes = nodeListRef([
        createNode("main-root", [createNode("main-child")]),
      ]);

      const { isExpanded, isExpanding, requestToggleExpand } =
        useLayerExpansion({
          blocks: nodeListRef(pageNodes.value),
          currentPageNodes: pageNodes,
          currentLayout: ref(undefined),
          currentItemSlug: ref("home"),
          currentItemType: ref("page"),
          currentVirtualSlot: ref(VIRTUAL_SLOT_NAMES.PAGE_CONTENT),
          virtualSlotNames: VIRTUAL_SLOT_NAMES,
        });

      requestToggleExpand("main-root");

      expect(isExpanding("main-root")).toBe(true);
      expect(isExpanded("main-root")).toBe(false);

      frameCallbacks.shift()?.();
      vi.advanceTimersByTime(0);

      expect(isExpanding("main-root")).toBe(true);
      expect(isExpanded("main-root")).toBe(true);

      vi.advanceTimersByTime(240);

      expect(isExpanding("main-root")).toBe(false);

      requestToggleExpand("main-root");

      expect(isExpanded("main-root")).toBe(false);
      expect(frameCallbacks).toHaveLength(0);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      vi.useRealTimers();
    }
  });
});
