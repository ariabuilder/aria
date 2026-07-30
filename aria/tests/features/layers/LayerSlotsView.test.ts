import { defineComponent, h, nextTick, ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LayerSlotsView from "../../../admin/features/Layers/components/LayerSlotsView.vue";
import type { NodeEventHandlers } from "../../../admin/features/Layers/composables/useLayerNodeActions";
import type { BuilderNode } from "../../../lib/types/nodes";

const LayerSlotGroupStub = defineComponent({
  name: "LayerSlotGroup",
  props: {
    slotLabel: String,
    nodes: {
      type: Array,
      default: () => [],
    },
    showEmptyHint: Boolean,
    emptyHintText: String,
    forceMinHeight: Boolean,
    isActiveSlot: Boolean,
  },
  emits: ["activate-slot"],
  setup(props, { emit }) {
    return () =>
      h("div", {
        "data-slot-label": props.slotLabel,
        "data-active-slot": String(props.isActiveSlot ?? false),
        onClick: () => emit("activate-slot", "main"),
      });
  },
});

describe("LayerSlotsView", () => {
  it("always exposes an empty page root as the Content drop target", () => {
    const noop = () => undefined;
    const nodeActions: NodeEventHandlers = {
      handleCopyBlock: vi.fn(),
      handlePasteBlock: vi.fn(async () => undefined),
      handleDuplicateBlock: vi.fn(),
      handleDeleteBlock: vi.fn(),
      handleDeleteBlocks: vi.fn(),
      handleWrapInContainer: vi.fn(),
      handleWrapInSection: vi.fn(),
      handleDetachComponent: vi.fn(),
      getSwapOptionsForNode: vi.fn(() => []),
      getSwapOptionsForNodes: vi.fn(() => []),
      swapNode: vi.fn(async () => undefined),
    };
    const wrapper = shallowMount(LayerSlotsView, {
      props: {
        showSlots: false,
        currentPageNodes: [],
        currentItemType: "page",
        currentVirtualSlot: "PAGE_CONTENT",
        editingNodeId: null,
        draggableKey: 0,
        isDragging: false,
        activeDragListId: null,
        dropTargetId: null,
        dropTargetPosition: "inside",
        nodeActions,
        getNodesInSlot: () => [],
        isExpanded: () => true,
        hasChildren: () => false,
        canAcceptChildren: () => true,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
        onToggleExpand: noop,
        onOpenPicker: noop,
        onDragStart: noop,
        onDragEnd: noop,
        onSlotChange: noop,
        onSelectNode: noop,
        onHoverNode: noop,
        onLeaveNode: noop,
        onUpdateChildren: noop,
        onRenameNode: noop,
        onEditStart: noop,
        onEditCancel: noop,
        onSlotDropTargetChange: noop,
        onSlotDropTargetLeave: noop,
        onChildrenDropTargetChange: noop,
        onChildrenDropTargetLeave: noop,
        onDropTargetChange: noop,
        onDropTargetLeave: noop,
        onDropNode: noop,
        onEditComponent: noop,
        onActivateSlot: noop,
        onExpandSlotOnDrag: noop,
      },
      global: {
        stubs: { LayerSlotGroup: LayerSlotGroupStub },
      },
    });

    const root = wrapper.getComponent(LayerSlotGroupStub);
    expect(root.props()).toMatchObject({
      slotLabel: "Content",
      showEmptyHint: true,
      emptyHintText: "Drop elements here",
      forceMinHeight: true,
    });
  });

  it("wires flat Content slot activation and active state", async () => {
    const noop = () => undefined;
    const onActivateSlot = vi.fn();
    const nodeActions: NodeEventHandlers = {
      handleCopyBlock: vi.fn(),
      handlePasteBlock: vi.fn(async () => undefined),
      handleDuplicateBlock: vi.fn(),
      handleDeleteBlock: vi.fn(),
      handleDeleteBlocks: vi.fn(),
      handleWrapInContainer: vi.fn(),
      handleWrapInSection: vi.fn(),
      handleDetachComponent: vi.fn(),
      getSwapOptionsForNode: vi.fn(() => []),
      getSwapOptionsForNodes: vi.fn(() => []),
      swapNode: vi.fn(async () => undefined),
    };
    const wrapper = shallowMount(LayerSlotsView, {
      props: {
        showSlots: false,
        currentPageNodes: [],
        currentItemType: "page",
        currentVirtualSlot: "main",
        activeSlotName: "main",
        editingNodeId: null,
        draggableKey: 0,
        isDragging: false,
        activeDragListId: null,
        dropTargetId: null,
        dropTargetPosition: "inside",
        nodeActions,
        getNodesInSlot: () => [],
        isExpanded: () => true,
        hasChildren: () => false,
        canAcceptChildren: () => true,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
        onToggleExpand: noop,
        onOpenPicker: noop,
        onDragStart: noop,
        onDragEnd: noop,
        onSlotChange: noop,
        onSelectNode: noop,
        onHoverNode: noop,
        onLeaveNode: noop,
        onUpdateChildren: noop,
        onRenameNode: noop,
        onEditStart: noop,
        onEditCancel: noop,
        onSlotDropTargetChange: noop,
        onSlotDropTargetLeave: noop,
        onChildrenDropTargetChange: noop,
        onChildrenDropTargetLeave: noop,
        onDropTargetChange: noop,
        onDropTargetLeave: noop,
        onDropNode: noop,
        onEditComponent: noop,
        onActivateSlot,
        onExpandSlotOnDrag: noop,
      },
      global: {
        stubs: { LayerSlotGroup: LayerSlotGroupStub },
      },
    });

    const root = wrapper.getComponent(LayerSlotGroupStub);
    expect(root.props("isActiveSlot")).toBe(true);

    await root.trigger("click");
    expect(onActivateSlot).toHaveBeenCalledWith("main");
  });

  it("does not resolve or rescan slot nodes when only expansion changes", async () => {
    const noop = () => undefined;
    const expanded = ref(false);
    let slotNodes: BuilderNode[] = [
      {
        id: "first",
        type: "Text",
        props: {},
        styles: {},
        children: [],
      },
      {
        id: "second",
        type: "Text",
        props: {},
        styles: {},
        children: [],
      },
    ];
    const getNodesInSlot = vi.fn(() => slotNodes);
    const getSlotRenderCacheKey = vi.fn(() => "main:structure");
    const nodeActions: NodeEventHandlers = {
      handleCopyBlock: vi.fn(),
      handlePasteBlock: vi.fn(async () => undefined),
      handleDuplicateBlock: vi.fn(),
      handleDeleteBlock: vi.fn(),
      handleDeleteBlocks: vi.fn(),
      handleWrapInContainer: vi.fn(),
      handleWrapInSection: vi.fn(),
      handleDetachComponent: vi.fn(),
      getSwapOptionsForNode: vi.fn(() => []),
      getSwapOptionsForNodes: vi.fn(() => []),
      swapNode: vi.fn(async () => undefined),
    };

    const wrapper = shallowMount(LayerSlotsView, {
      props: {
        showSlots: false,
        currentPageNodes: [],
        currentItemType: "page",
        currentVirtualSlot: "main",
        editingNodeId: null,
        draggableKey: 0,
        isDragging: false,
        activeDragListId: null,
        dropTargetId: null,
        dropTargetPosition: "inside",
        nodeActions,
        getNodesInSlot,
        getSlotRenderCacheKey,
        isExpanded: () => expanded.value,
        isExpanding: () => false,
        hasChildren: () => false,
        canAcceptChildren: () => true,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
        onToggleExpand: noop,
        onOpenPicker: noop,
        onDragStart: noop,
        onDragEnd: noop,
        onSlotChange: noop,
        onSelectNode: noop,
        onHoverNode: noop,
        onLeaveNode: noop,
        onUpdateChildren: noop,
        onRenameNode: noop,
        onEditStart: noop,
        onEditCancel: noop,
        onSlotDropTargetChange: noop,
        onSlotDropTargetLeave: noop,
        onChildrenDropTargetChange: noop,
        onChildrenDropTargetLeave: noop,
        onDropTargetChange: noop,
        onDropTargetLeave: noop,
        onDropNode: noop,
        onEditComponent: noop,
        onActivateSlot: noop,
        onExpandSlotOnDrag: noop,
      },
      global: {
        stubs: { LayerSlotGroup: LayerSlotGroupStub },
      },
    });

    expect(getNodesInSlot).toHaveBeenCalledTimes(1);
    expect(getSlotRenderCacheKey).toHaveBeenCalledTimes(1);

    expanded.value = true;
    await nextTick();

    expect(getNodesInSlot).toHaveBeenCalledTimes(1);
    expect(getSlotRenderCacheKey).toHaveBeenCalledTimes(1);

    slotNodes = [slotNodes[1]!, slotNodes[0]!];
    await wrapper.setProps({ treeRevision: 1 });

    expect(getNodesInSlot).toHaveBeenCalledTimes(2);
    expect(getSlotRenderCacheKey).toHaveBeenCalledTimes(2);
    expect(
      (
        wrapper.getComponent(LayerSlotGroupStub).props("nodes") as Array<{
          id: string;
        }>
      ).map((node) => node.id),
    ).toEqual(["second", "first"]);
  });
});
