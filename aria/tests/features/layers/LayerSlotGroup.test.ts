import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import LayerSlotGroup from "../../../admin/features/Layers/components/LayerSlotGroup.vue";
import type { BuilderNode } from "../../../lib/types/nodes";
import type { NodeEventHandlers } from "../../../admin/features/Layers/composables/useLayerNodeActions";

const draggableStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        "div",
        attrs,
        props.modelValue.map((element) => slots.item?.({ element })),
      );
  },
});

const layerNodeRecursiveStub = defineComponent({
  props: {
    node: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h("div", {
        "data-layer-node": (props.node as BuilderNode).id,
        "data-layer-item": "true",
      });
  },
});

const nodeActionsStub: NodeEventHandlers = {
  handleCopyBlock: vi.fn(),
  handlePasteBlock: vi.fn().mockResolvedValue(undefined),
  handleDuplicateBlock: vi.fn(),
  handleDeleteBlock: vi.fn(),
  handleDeleteBlocks: vi.fn(),
  handleWrapInContainer: vi.fn(),
  handleWrapInSection: vi.fn(),
  handleDetachComponent: vi.fn(),
  getSwapOptionsForNode: vi.fn(() => []),
  getSwapOptionsForNodes: vi.fn(() => []),
  swapNode: vi.fn().mockResolvedValue(undefined),
};

function mountSlotGroup(options: {
  nodes?: BuilderNode[];
  indicatorClass?: "" | "drop-inside" | "drop-after";
  isDragging?: boolean;
  isActiveDragList?: boolean;
  isExpanded?: boolean;
  isExpanding?: boolean;
}) {
  return mount(LayerSlotGroup, {
    props: {
      slotName: "hero",
      slotLabel: "Hero",
      nodes: options.nodes ?? [],
      isExpanded: options.isExpanded ?? true,
      isExpanding: options.isExpanding ?? false,
      editingNodeId: null,
      draggableKey: 1,
      isDragging: options.isDragging ?? false,
      isActiveDragList: options.isActiveDragList ?? false,
      activeDragListId: options.isActiveDragList ? "slot:hero" : null,
      dropTargetId: null,
      dropTargetPosition: "inside",
      showEmptyHint: true,
      addButtonTitle: "Add",
      nodeActions: nodeActionsStub,
      isNodeExpanded: () => false,
      hasChildren: () => false,
      canAcceptChildren: () => false,
      getCollapseState: () => "expanded",
      getDropIndicatorClass: () => options.indicatorClass ?? "",
    },
    global: {
      stubs: {
        draggable: draggableStub,
        LayerNodeRecursive: layerNodeRecursiveStub,
      },
    },
  });
}

describe("LayerSlotGroup", () => {
  it("recreates only the slot draggable when root order changes", async () => {
    const firstNode = {
      id: "node-1",
      type: "Text",
      props: {},
      styles: {},
      children: [],
    };
    const secondNode = {
      id: "node-2",
      type: "Text",
      props: {},
      styles: {},
      children: [],
    };
    const wrapper = mountSlotGroup({ nodes: [firstNode, secondNode] });
    const initialKey = wrapper.findComponent(draggableStub).vm.$.vnode.key;

    await wrapper.setProps({ nodes: [secondNode, firstNode] });

    await vi.waitFor(() => {
      expect(wrapper.findComponent(draggableStub).vm.$.vnode.key).not.toBe(
        initialKey,
      );
    });
    expect(
      wrapper
        .findAll("[data-layer-node]")
        .map((node) => node.attributes("data-layer-node")),
    ).toEqual(["node-2", "node-1"]);
  });

  it("keeps slot content mounted after collapse and reveals it on reopen", async () => {
    const wrapper = mountSlotGroup({
      nodes: [
        {
          id: "node-1",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
    });

    expect(wrapper.find("[data-layer-slot-list]").exists()).toBe(true);

    await wrapper.setProps({ isExpanded: false });

    const slotList = wrapper.get("[data-layer-slot-list]");
    expect(
      slotList.element.closest("[data-layer-slot-drop-zone]"),
    ).toBeTruthy();

    await wrapper.setProps({ isExpanded: true });

    expect(wrapper.find('[data-layer-node="node-1"]').exists()).toBe(true);
  });

  it("mounts large slot root lists progressively", async () => {
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
      const nodes = Array.from({ length: 90 }, (_, index) => ({
        id: `node-${index}`,
        type: "Text",
        props: {},
        styles: {},
        children: [],
      }));
      const wrapper = mountSlotGroup({ nodes });

      expect(wrapper.findAll("[data-layer-node]")).toHaveLength(24);

      while (frameCallbacks.length > 0) {
        frameCallbacks.shift()?.();
        await wrapper.vm.$nextTick();
      }

      expect(wrapper.findAll("[data-layer-node]")).toHaveLength(90);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
    }
  });

  it("shows a busy slot expander while a cold branch is requested", () => {
    const wrapper = mountSlotGroup({
      isExpanded: false,
      isExpanding: true,
    });
    const button = wrapper.get("button[aria-expanded]");

    expect(button.attributes("aria-busy")).toBe("true");
    expect(button.attributes("aria-label")).toContain("Expanding");
    expect(
      button
        .findAll("div")
        .some((node) => node.classes().includes("i-hugeicons:loading-01")),
    ).toBe(true);
  });

  it("updates mounted slot content across empty and non-empty transitions", async () => {
    const wrapper = mountSlotGroup({
      nodes: [
        {
          id: "node-1",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
    });

    expect(wrapper.find('[data-layer-node="node-1"]').exists()).toBe(true);

    await wrapper.setProps({ nodes: [] });

    expect(wrapper.find('[data-layer-node="node-1"]').exists()).toBe(false);
    expect(wrapper.get("[data-layer-slot-drop-zone]").classes()).toContain(
      "min-h-9",
    );

    await wrapper.setProps({
      nodes: [
        {
          id: "node-2",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
    });

    expect(wrapper.find('[data-layer-node="node-2"]').exists()).toBe(true);
  });

  it("emits empty-slot drop target changes and renders the inside indicator", async () => {
    const wrapper = mountSlotGroup({ indicatorClass: "drop-inside" });
    const dropZone = wrapper.get("[data-layer-slot-drop-zone]");

    expect(dropZone.classes()).toContain("layer-slot-drop-zone--inside");

    await dropZone.trigger("dragover");
    await dropZone.trigger("drop");

    expect(wrapper.emitted("slot-drop-target-change")).toEqual([
      [
        {
          slotName: "hero",
          position: "inside",
        },
      ],
    ]);
    expect(wrapper.emitted("slot-drop-target-leave")).toHaveLength(1);
  });

  it("does not emit empty-slot targeting events when the slot already has nodes", async () => {
    const wrapper = mountSlotGroup({
      nodes: [
        {
          id: "node-1",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
      indicatorClass: "drop-inside",
    });
    const dropZone = wrapper.get("[data-layer-slot-drop-zone]");

    await dropZone.trigger("dragover");
    await dropZone.trigger("dragleave");
    await dropZone.trigger("drop");

    expect(wrapper.emitted("slot-drop-target-change")).toBeUndefined();
    expect(wrapper.emitted("slot-drop-target-leave")).toBeUndefined();
    expect(dropZone.classes()).not.toContain("layer-slot-drop-zone--inside");
  });

  it("emits a bottom-list slot target and renders a trailing indicator for non-empty slots", async () => {
    const wrapper = mountSlotGroup({
      nodes: [
        {
          id: "node-1",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
      indicatorClass: "drop-after",
    });
    const slotList = wrapper.get("[data-layer-slot-list]");

    Object.defineProperty(slotList.element, "getBoundingClientRect", {
      value: () => ({
        top: 100,
        bottom: 200,
        left: 0,
        right: 240,
        width: 240,
        height: 100,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    expect(slotList.classes()).toContain("layer-slot-list--drop-after");

    await slotList.trigger("dragover", {
      clientY: 196,
      dataTransfer: { dropEffect: "none" },
    });
    await slotList.trigger("drop");

    expect(wrapper.emitted("slot-drop-target-change")).toEqual([
      [
        {
          slotName: "hero",
          position: "after",
        },
      ],
    ]);
    expect(wrapper.emitted("slot-drop-target-leave")).toHaveLength(1);
  });

  it("does not emit a bottom-list slot target while hovering a layer row", async () => {
    const wrapper = mountSlotGroup({
      nodes: [
        {
          id: "node-1",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
    });
    const node = wrapper.get("[data-layer-item]");

    await node.trigger("dragover", {
      clientY: 196,
      dataTransfer: { dropEffect: "none" },
    });

    expect(wrapper.emitted("slot-drop-target-change")).toBeUndefined();
  });

  it("activates an inactive slot title and expands when collapsed", async () => {
    const wrapper = mount(LayerSlotGroup, {
      props: {
        slotName: "footer",
        slotLabel: "Footer",
        nodes: [],
        isExpanded: false,
        isActiveSlot: false,
        editingNodeId: null,
        draggableKey: 1,
        showEmptyHint: true,
        addButtonTitle: "Add",
        nodeActions: nodeActionsStub,
        isNodeExpanded: () => false,
        hasChildren: () => false,
        canAcceptChildren: () => false,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          LayerNodeRecursive: layerNodeRecursiveStub,
        },
      },
    });

    await wrapper.get("[data-layer-slot-header]").trigger("click");

    expect(wrapper.emitted("activate-slot")).toEqual([["footer"]]);
    expect(wrapper.emitted("toggle-expand")).toEqual([
      ["footer", expect.any(Event)],
    ]);
  });

  it("activates the slot when clicking the chevron", async () => {
    const wrapper = mount(LayerSlotGroup, {
      props: {
        slotName: "footer",
        slotLabel: "Footer",
        nodes: [],
        isExpanded: true,
        isActiveSlot: false,
        editingNodeId: null,
        draggableKey: 1,
        showEmptyHint: true,
        addButtonTitle: "Add",
        nodeActions: nodeActionsStub,
        isNodeExpanded: () => false,
        hasChildren: () => false,
        canAcceptChildren: () => false,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          LayerNodeRecursive: layerNodeRecursiveStub,
        },
      },
    });

    await wrapper.get("button[aria-expanded]").trigger("click");

    expect(wrapper.emitted("activate-slot")).toEqual([["footer"]]);
    expect(wrapper.emitted("toggle-expand")).toEqual([
      ["footer", expect.any(Event)],
    ]);
  });

  it("activates the slot when clicking the empty hint", async () => {
    const wrapper = mount(LayerSlotGroup, {
      props: {
        slotName: "footer",
        slotLabel: "Footer",
        nodes: [],
        isExpanded: true,
        isActiveSlot: false,
        editingNodeId: null,
        draggableKey: 1,
        showEmptyHint: true,
        addButtonTitle: "Add",
        nodeActions: nodeActionsStub,
        isNodeExpanded: () => false,
        hasChildren: () => false,
        canAcceptChildren: () => false,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          LayerNodeRecursive: layerNodeRecursiveStub,
        },
      },
    });

    await wrapper.get(".text-4xs").trigger("click");

    expect(wrapper.emitted("activate-slot")).toEqual([["footer"]]);
  });

  it("re-activates an active slot title so insertion returns to its root", async () => {
    const wrapper = mount(LayerSlotGroup, {
      props: {
        slotName: "footer",
        slotLabel: "Footer",
        nodes: [],
        isExpanded: true,
        isActiveSlot: true,
        editingNodeId: null,
        draggableKey: 1,
        showEmptyHint: true,
        addButtonTitle: "Add",
        nodeActions: nodeActionsStub,
        isNodeExpanded: () => false,
        hasChildren: () => false,
        canAcceptChildren: () => false,
        getCollapseState: () => "expanded",
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          LayerNodeRecursive: layerNodeRecursiveStub,
        },
      },
    });

    await wrapper.get("[data-layer-slot-header]").trigger("click");

    expect(wrapper.emitted("activate-slot")).toEqual([["footer"]]);
    expect(wrapper.emitted("toggle-expand")).toBeUndefined();
  });

  it("wraps slot content in a single root group element", () => {
    const wrapper = mountSlotGroup({});
    expect(
      wrapper.get("[data-layer-slot-group]").attributes("data-layer-slot-name"),
    ).toBe("hero");
  });

  it("reserves tail space in every slot while dragging", () => {
    const nodes = [
      {
        id: "node-1",
        type: "Text",
        props: {},
        styles: {},
        children: [],
      },
    ];

    const idleWrapper = mountSlotGroup({ nodes, isActiveDragList: false });
    const draggingWrapper = mountSlotGroup({
      nodes,
      isActiveDragList: false,
      isDragging: true,
    });

    expect(idleWrapper.get("[data-layer-slot-list]").classes()).not.toContain(
      "layer-slot-list--dragging",
    );
    expect(draggingWrapper.get("[data-layer-slot-list]").classes()).toContain(
      "layer-slot-list--dragging",
    );
  });
});
