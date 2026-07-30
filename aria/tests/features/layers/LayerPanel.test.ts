import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LayerPanel from "../../../admin/features/Layers/components/LayerPanel.vue";
import { APP_INJECTION_KEYS } from "../../../admin/features/Core/types/injectionKeys";
import type { BuilderNode } from "../../../lib/types/nodes";
import type { DropPosition } from "../../../admin/features/Layers/types";

const {
  mockFocusNode,
  mockClearSelection,
  mockToggleSelection,
  mockHandleDropOnNode,
  mockHandleDragStart,
  mockHandleDragEnd,
  mockHandleSlotChange,
  mockHandleChildrenUpdate,
  mockRunInitialExpansion,
  mockTreeActionsHarness,
} = vi.hoisted(() => ({
  mockFocusNode: vi.fn(),
  mockClearSelection: vi.fn(),
  mockToggleSelection: vi.fn(),
  mockHandleDropOnNode: vi.fn(),
  mockHandleDragStart: vi.fn(),
  mockHandleDragEnd: vi.fn(),
  mockHandleSlotChange: vi.fn(),
  mockHandleChildrenUpdate: vi.fn(),
  mockRunInitialExpansion: vi.fn(),
  mockTreeActionsHarness: {
    onTreeStructureChanged: null as null | (() => void),
  },
}));

vi.mock("../../../admin/features/Beacon", () => ({
  useBeacon: () => ({
    focusedNodeId: { value: null },
    selectedNodeIds: { value: [] },
    illuminate: mockFocusNode,
    toggleSelection: mockToggleSelection,
    clearSelection: mockClearSelection,
  }),
  onNodeFocused: () => () => {},
  requestFocus: vi.fn(),
}));

vi.mock("../../../admin/features/Layers/composables/useLayerHistory", () => ({
  useLayerHistory: () => ({
    updateBlocksWithHistory: vi.fn(),
  }),
}));

vi.mock(
  "../../../admin/features/Layers/composables/useLayerPanelState",
  () => ({
    useLayerPanelState: (options: { blocks: { value: BuilderNode[] } }) => ({
      currentPageNodes: options.blocks,
      currentVirtualSlot: "PAGE_CONTENT",
      showSlots: false,
      hasLayers: true,
      hasChildren: (node: BuilderNode) =>
        node.type === "Container" || (node.children?.length ?? 0) > 0,
      canAcceptChildren: () => true,
    }),
  }),
);

vi.mock("../../../admin/features/Layers/composables/useLayerExpansion", () => ({
  useLayerExpansion: () => ({
    expandedNodes: ref(new Set<string>()),
    collapseState: ref(new Map<string, string>()),
    isAllExpanded: { __v_isRef: true, value: false },
    isLayerTreeBusy: ref(false),
    layerTreeOperation: ref(null),
    isExpanded: () => true,
    isExpanding: () => false,
    getCollapseState: () => "expanded",
    toggleExpand: vi.fn(),
    requestToggleExpand: vi.fn(),
    toggleAll: vi.fn(),
    expandAncestors: vi.fn(),
    runInitialExpansion: mockRunInitialExpansion,
  }),
}));

vi.mock("../../../admin/features/Layers/composables/useLayerUiActions", () => ({
  useLayerUiActions: () => ({
    handleSelectNode: vi.fn(),
    handleNodeHover: vi.fn(),
    handleNodeLeave: vi.fn(),
    handleRenameNode: vi.fn(),
    handleOpenPicker: vi.fn(),
    handleEditStart: vi.fn(),
    handleEditCancel: vi.fn(),
  }),
}));

vi.mock(
  "../../../admin/features/Layers/composables/useLayerTreeActions",
  () => ({
    useLayerTreeActions: (options: { onTreeStructureChanged?: () => void }) => {
      mockTreeActionsHarness.onTreeStructureChanged =
        options.onTreeStructureChanged ?? null;

      return {
        getNodesInSlot: vi.fn(() => []),
        handleDragStart: mockHandleDragStart,
        handleDragEnd: mockHandleDragEnd,
        handleDropOnNode: mockHandleDropOnNode,
        handleSlotChange: mockHandleSlotChange,
        handleChildrenUpdate: mockHandleChildrenUpdate,
      };
    },
  }),
);

vi.mock(
  "../../../admin/features/Layers/composables/useLayerNodeActions",
  () => ({
    useLayerNodeActions: () => ({
      nodeEventHandlers: {
        handleCopyBlock: vi.fn(),
        handlePasteBlock: vi.fn(),
        handleDuplicateBlock: vi.fn(),
        handleDeleteBlock: vi.fn(),
        handleWrapInContainer: vi.fn(),
        handleWrapInSection: vi.fn(),
        handleDetachComponent: vi.fn(),
      },
    }),
  }),
);

vi.mock(
  "../../../admin/features/Layers/composables/useLayerKeyboardNavigation",
  () => ({
    useLayerKeyboardNavigation: () => ({
      handleTreeKeydown: vi.fn(),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Layers/composables/useLayerCanvasSignals",
  () => ({
    useLayerCanvasSignals: vi.fn(),
  }),
);

const LayerSlotsViewStub = defineComponent({
  name: "LayerSlotsView",
  inheritAttrs: false,
  props: {
    getDropIndicatorClass: {
      type: Function,
      required: true,
    },
    onDropTargetChange: {
      type: Function,
      required: true,
    },
    onDropTargetLeave: {
      type: Function,
      required: true,
    },
    onSlotDropTargetChange: {
      type: Function,
      required: true,
    },
    onSlotDropTargetLeave: {
      type: Function,
      required: true,
    },
    onChildrenDropTargetChange: {
      type: Function,
      required: true,
    },
    onChildrenDropTargetLeave: {
      type: Function,
      required: true,
    },
    onDropNode: {
      type: Function,
      required: true,
    },
    isDragging: {
      type: Boolean,
      default: false,
    },
    activeDragListId: {
      type: String,
      default: null,
    },
    draggableKey: {
      type: Number,
      default: 0,
    },
    treeRevision: {
      type: Number,
      default: 0,
    },
    renderCacheKey: {
      type: [String, Number],
      default: 0,
    },
    getSlotRenderCacheKey: {
      type: Function,
      required: true,
    },
    visibleNodeIds: {
      type: Object,
      default: null,
    },
    onDragStart: {
      type: Function,
      required: true,
    },
    onDragEnd: {
      type: Function,
      required: true,
    },
  },
  setup() {
    return () => h("div", { "data-layer-slots-view": "true" });
  },
});

function createNode(id: string, type: string): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    children: [],
  };
}

function callIndicatorHandler(
  handler: ((payload: unknown) => void) | undefined,
  payload: unknown,
) {
  expect(handler).toBeTypeOf("function");
  handler?.(payload);
}

const nodeEventHandlersStub = {
  handleCopyBlock: vi.fn(),
  handlePasteBlock: vi.fn(),
  handleDuplicateBlock: vi.fn(),
  handleDeleteBlock: vi.fn(),
  handleWrapInContainer: vi.fn(),
  handleWrapInSection: vi.fn(),
  handleDetachComponent: vi.fn(),
};

const layerPanelMountOptions = {
  global: {
    provide: {
      [APP_INJECTION_KEYS.nodeEventHandlers]: nodeEventHandlersStub,
    },
    stubs: {
      LayerSlotsView: LayerSlotsViewStub,
    },
  },
};

function mountLayerPanel(blocks: BuilderNode[]) {
  return mount(LayerPanel, {
    props: {
      blocks,
      currentItemType: "page" as const,
      currentItemSlug: "home",
    },
    ...layerPanelMountOptions,
  });
}

describe("LayerPanel", () => {
  it("routes row, slot, and child-list drop targets through the shared drop-zone state", async () => {
    const targetNode = createNode("node-1", "Text");
    const wrapper = mountLayerPanel([targetNode]);

    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);
    const getDropIndicatorClass = layerSlotsView.props(
      "getDropIndicatorClass",
    ) as (nodeId: string) => string;

    callIndicatorHandler(
      layerSlotsView.props("onDropTargetChange") as
        | ((payload: unknown) => void)
        | undefined,
      {
        targetNode,
        position: "before" as DropPosition,
      },
    );
    expect(getDropIndicatorClass("node-1")).toBe("drop-before");

    (layerSlotsView.props("onDropTargetLeave") as () => void)();
    await Promise.resolve();
    expect(getDropIndicatorClass("node-1")).toBe("");

    callIndicatorHandler(
      layerSlotsView.props("onSlotDropTargetChange") as
        | ((payload: unknown) => void)
        | undefined,
      {
        slotName: "hero",
        position: "after" as DropPosition,
      },
    );
    expect(getDropIndicatorClass("slot:hero")).toBe("drop-after");

    (layerSlotsView.props("onSlotDropTargetLeave") as () => void)();
    await Promise.resolve();
    expect(getDropIndicatorClass("slot:hero")).toBe("");

    callIndicatorHandler(
      layerSlotsView.props("onChildrenDropTargetChange") as
        | ((payload: unknown) => void)
        | undefined,
      {
        parentNodeId: "parent-1",
        position: "inside" as DropPosition,
      },
    );
    expect(getDropIndicatorClass("children:parent-1")).toBe("drop-inside");

    (layerSlotsView.props("onChildrenDropTargetLeave") as () => void)();
    await Promise.resolve();
    expect(getDropIndicatorClass("children:parent-1")).toBe("");

    callIndicatorHandler(
      layerSlotsView.props("onDropNode") as
        | ((payload: unknown) => void)
        | undefined,
      {
        targetNode,
        position: "after" as DropPosition,
      },
    );

    expect(mockHandleDropOnNode).toHaveBeenCalledWith(targetNode, "after");
    expect(mockRunInitialExpansion).toHaveBeenCalledTimes(1);
  });

  it("only marks slot views as drag-active during an active drag", async () => {
    const targetNode = createNode("node-1", "Text");
    const wrapper = mountLayerPanel([targetNode]);

    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);
    const initialDraggableKey = layerSlotsView.props("draggableKey");

    expect(layerSlotsView.props("isDragging")).toBe(false);

    callIndicatorHandler(
      layerSlotsView.props("onDragStart") as
        | ((payload: unknown) => void)
        | undefined,
      {
        item: { __draggable_context: { element: targetNode, index: 0 } },
      },
    );
    await wrapper.vm.$nextTick();

    expect(layerSlotsView.props("isDragging")).toBe(true);
    expect(layerSlotsView.props("activeDragListId")).toBeNull();

    (layerSlotsView.props("onDragEnd") as () => void)();
    await wrapper.vm.$nextTick();

    expect(layerSlotsView.props("isDragging")).toBe(false);
    expect(layerSlotsView.props("activeDragListId")).toBeNull();
    expect(layerSlotsView.props("draggableKey")).toBe(initialDraggableKey);
  });

  it("refreshes cached layer order when editor blocks commit", async () => {
    const targetNode = createNode("node-1", "Text");
    const nextNode = createNode("node-2", "Text");
    const wrapper = mountLayerPanel([targetNode]);
    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);
    const initialDraggableKey = layerSlotsView.props("draggableKey");
    const initialTreeRevision = layerSlotsView.props("treeRevision") as number;

    await wrapper.setProps({ blocks: [nextNode, targetNode] });

    expect(layerSlotsView.props("treeRevision")).toBe(initialTreeRevision + 1);
    expect(layerSlotsView.props("draggableKey")).toBe(initialDraggableKey);
  });

  it("refreshes drag lists only when a cross-tree move requests it", async () => {
    const targetNode = createNode("node-1", "Text");
    const wrapper = mountLayerPanel([targetNode]);
    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);
    const initialDraggableKey = layerSlotsView.props("draggableKey") as number;
    const initialTreeRevision = layerSlotsView.props("treeRevision") as number;

    callIndicatorHandler(
      layerSlotsView.props("onDragStart") as
        | ((payload: unknown) => void)
        | undefined,
      {
        item: { __draggable_context: { element: targetNode, index: 0 } },
      },
    );
    mockTreeActionsHarness.onTreeStructureChanged?.();
    (layerSlotsView.props("onDragEnd") as () => void)();
    await wrapper.vm.$nextTick();

    expect(layerSlotsView.props("draggableKey")).toBe(initialDraggableKey + 1);
    expect(layerSlotsView.props("treeRevision")).toBe(initialTreeRevision);
  });

  it("tracks the active drag list from the dragged row element", async () => {
    const targetNode = createNode("node-1", "Text");
    const wrapper = mountLayerPanel([targetNode]);
    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);

    const slotGroup = document.createElement("div");
    slotGroup.setAttribute("data-layer-slot-group", "");
    slotGroup.setAttribute("data-layer-slot-name", "hero");

    const slotList = document.createElement("div");
    slotList.setAttribute("data-layer-slot-list", "");
    slotGroup.appendChild(slotList);

    const item = document.createElement("div");
    slotList.appendChild(item);
    document.body.appendChild(slotGroup);

    callIndicatorHandler(
      layerSlotsView.props("onDragStart") as
        | ((payload: unknown) => void)
        | undefined,
      { item },
    );
    await wrapper.vm.$nextTick();

    expect(layerSlotsView.props("activeDragListId")).toBe("slot:hero");

    (layerSlotsView.props("onDragEnd") as () => void)();
    document.body.removeChild(slotGroup);
  });

  it("keeps slot render cache keys stable across tree reorders", async () => {
    const targetNode = createNode("node-1", "Text");
    const wrapper = mountLayerPanel([targetNode]);
    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);
    const getSlotRenderCacheKey = layerSlotsView.props(
      "getSlotRenderCacheKey",
    ) as (slotName: string, nodes: BuilderNode[]) => string;

    const initialKey = getSlotRenderCacheKey("PAGE_CONTENT", [targetNode]);

    await wrapper.setProps({
      blocks: [
        {
          ...targetNode,
          props: { content: "Updated" },
        },
      ],
    });

    expect(
      getSlotRenderCacheKey("PAGE_CONTENT", [
        {
          ...targetNode,
          props: { content: "Updated" },
        },
      ]),
    ).toBe(initialKey);

    const nextNode = createNode("node-2", "Text");
    await wrapper.setProps({
      blocks: [targetNode, nextNode],
    });

    expect(getSlotRenderCacheKey("PAGE_CONTENT", [targetNode, nextNode])).toBe(
      initialKey,
    );

    await wrapper.setProps({ currentItemSlug: "about" });

    expect(
      getSlotRenderCacheKey("PAGE_CONTENT", [targetNode, nextNode]),
    ).not.toBe(initialKey);
  });

  it("filters by visible layer labels and reports an empty result", async () => {
    const targetNode = createNode("node-1", "Text");
    const wrapper = mountLayerPanel([targetNode]);

    await wrapper.setProps({ searchQuery: "text" });
    const layerSlotsView = wrapper.getComponent(LayerSlotsViewStub);
    const visibleIds = layerSlotsView.props("visibleNodeIds") as Set<string>;
    expect(visibleIds).toEqual(new Set(["node-1"]));

    await wrapper.setProps({ searchQuery: "does not exist" });
    expect(wrapper.text()).toContain("No matching layers");
  });
});
