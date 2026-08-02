import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { LayerNodeRecursive } from "../../../admin/features/Layers/components/LayerNodeRecursive";
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

const contextMenuStubs = {
  ContextMenu: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  ContextMenuTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  ContextMenuContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  ContextMenuItem: defineComponent({
    setup(_, { slots, attrs }) {
      return () => h("button", attrs, slots.default?.());
    },
  }),
  ContextMenuSeparator: defineComponent({
    setup() {
      return () => h("div");
    },
  }),
  ContextMenuLabel: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
};

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

function createNode(
  id: string,
  type: string,
  children: BuilderNode[] = [],
): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    children,
  };
}

function mountRecursive(options: {
  childCount?: number;
  indicatorClass?: "" | "drop-after";
  activeDragListId?: string | null;
  isDragging?: boolean;
}) {
  const children =
    options.childCount === 0 ? [] : [createNode("child", "Text")];
  const node = createNode("parent", "Container", children);
  const hasChildNodes = (candidate: BuilderNode) =>
    (candidate.children?.length ?? 0) > 0;
  const canAcceptChildren = (candidate: BuilderNode) =>
    candidate.type === "Container" || hasChildNodes(candidate);

  return mount(LayerNodeRecursive, {
    props: {
      node,
      depth: 0,
      selectedNodeId: undefined,
      selectedNodePath: undefined,
      hoveredNodeId: undefined,
      editingNodeId: null,
      activeDragListId: options.activeDragListId ?? null,
      isDragging: options.isDragging ?? false,
      isExpanded: (nodeId: string) => nodeId === "parent",
      hasChildren: hasChildNodes,
      canAcceptChildren,
      getCollapseState: () => "expanded",
      nodeActions: nodeActionsStub,
      getDropIndicatorClass: (nodeId: string) =>
        nodeId === "children:parent" ? (options.indicatorClass ?? "") : "",
    },
    global: {
      stubs: {
        draggable: draggableStub,
        ...contextMenuStubs,
      },
    },
  });
}

describe("LayerNodeRecursive", () => {
  it("recreates only the child draggable when child order changes", async () => {
    const firstChild = createNode("child-1", "Text");
    const secondChild = createNode("child-2", "Text");
    const wrapper = mountRecursive({});

    await wrapper.setProps({
      node: createNode("parent", "Container", [firstChild, secondChild]),
    });
    const initialKey = wrapper.findComponent(draggableStub).vm.$.vnode.key;

    await wrapper.setProps({
      node: createNode("parent", "Container", [secondChild, firstChild]),
    });

    await vi.waitFor(() => {
      expect(wrapper.findComponent(draggableStub).vm.$.vnode.key).not.toBe(
        initialKey,
      );
    });
  });

  it("does not render an empty child list for expanded containers with no children", () => {
    const wrapper = mountRecursive({ childCount: 0 });

    expect(wrapper.find('[data-layer-children-list="parent"]').exists()).toBe(
      false,
    );
  });

  it("emits a nested child-list tail target and renders its indicator", async () => {
    const wrapper = mountRecursive({ indicatorClass: "drop-after" });
    const childList = wrapper.get('[data-layer-children-list="parent"]');

    Object.defineProperty(childList.element, "getBoundingClientRect", {
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

    expect(
      wrapper.find('[data-layer-children-indicator="parent"]').exists(),
    ).toBe(true);

    await childList.trigger("dragover", {
      clientY: 196,
      dataTransfer: { dropEffect: "none" },
    });
    await childList.trigger("drop");

    expect(wrapper.emitted("children-drop-target-change")).toEqual([
      [
        {
          parentNodeId: "parent",
          position: "after",
        },
      ],
    ]);
    expect(wrapper.emitted("children-drop-target-leave")).toHaveLength(1);
  });

  it("does not emit a nested child-list tail target while hovering a layer row", async () => {
    const wrapper = mountRecursive({});
    const rows = wrapper.findAll("[data-layer-item]");
    const childRow = rows[1];

    Object.defineProperty(childRow.element, "getBoundingClientRect", {
      value: () => ({
        top: 140,
        bottom: 176,
        left: 0,
        right: 240,
        width: 240,
        height: 36,
        x: 0,
        y: 140,
        toJSON: () => ({}),
      }),
    });

    await childRow.trigger("dragover", {
      clientY: 196,
      dataTransfer: { dropEffect: "none" },
    });

    expect(wrapper.emitted("children-drop-target-change")).toBeUndefined();
  });

  it("reserves nested child-list tail space throughout a drag", () => {
    const idleWrapper = mountRecursive({ activeDragListId: null });
    const draggingWrapper = mountRecursive({
      activeDragListId: "slot:main",
      isDragging: true,
    });

    expect(
      idleWrapper.get('[data-layer-children-list="parent"]').classes(),
    ).not.toContain("pb-3");
    expect(
      draggingWrapper.get('[data-layer-children-list="parent"]').classes(),
    ).toContain("pb-3");
  });

  it("keeps a previously expanded child branch mounted when collapsed", async () => {
    const isExpanded = vi.fn((nodeId: string) => nodeId === "parent");

    const wrapper = mount(LayerNodeRecursive, {
      props: {
        node: createNode("parent", "Container", [createNode("child", "Text")]),
        depth: 0,
        selectedNodeId: undefined,
        selectedNodePath: undefined,
        hoveredNodeId: undefined,
        editingNodeId: null,
        activeDragListId: null,
        isExpanded,
        hasChildren: (candidate: BuilderNode) =>
          (candidate.children?.length ?? 0) > 0,
        canAcceptChildren: (candidate: BuilderNode) =>
          candidate.type === "Container" ||
          (candidate.children?.length ?? 0) > 0,
        getCollapseState: () => "expanded",
        nodeActions: nodeActionsStub,
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          ...contextMenuStubs,
        },
      },
    });

    expect(wrapper.find('[data-layer-children-list="parent"]').exists()).toBe(
      true,
    );

    await wrapper.setProps({
      isExpanded: () => false,
      getCollapseState: () => "soft-collapsed",
    });

    const childBranch = wrapper.find('[data-layer-children-list="parent"]');
    expect(childBranch.exists()).toBe(true);
    expect(
      (childBranch.element.parentElement as HTMLElement).style.display,
    ).toBe("none");
  });

  it("applies child branch background styling without painting the outer wrapper", () => {
    const wrapper = mount(LayerNodeRecursive, {
      props: {
        node: createNode("parent", "Container", [createNode("child", "Text")]),
        depth: 0,
        selectedNodeId: "parent",
        selectedNodePath: ["parent"],
        hoveredNodeId: undefined,
        editingNodeId: null,
        activeDragListId: null,
        isExpanded: (nodeId: string) => nodeId === "parent",
        hasChildren: (candidate: BuilderNode) =>
          (candidate.children?.length ?? 0) > 0,
        canAcceptChildren: (candidate: BuilderNode) =>
          candidate.type === "Container" ||
          (candidate.children?.length ?? 0) > 0,
        getCollapseState: () => "expanded",
        nodeActions: nodeActionsStub,
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          ...contextMenuStubs,
        },
      },
    });

    expect(
      wrapper.get('[data-layer-children-list="parent"]').classes(),
    ).toContain("bg-card/30");
    expect((wrapper.element as HTMLElement).className).not.toContain(
      "bg-sidebar/70",
    );
  });

  it("mounts large expanded child branches progressively", async () => {
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
      const children = Array.from({ length: 205 }, (_, index) =>
        createNode(`child-${index}`, "Text"),
      );

      const wrapper = mount(LayerNodeRecursive, {
        props: {
          node: createNode("parent", "Container", children),
          depth: 0,
          selectedNodeId: undefined,
          selectedNodePath: undefined,
          hoveredNodeId: undefined,
          editingNodeId: null,
          activeDragListId: null,
          isExpanded: (nodeId: string) => nodeId === "parent",
          hasChildren: (candidate: BuilderNode) =>
            (candidate.children?.length ?? 0) > 0,
          canAcceptChildren: (candidate: BuilderNode) =>
            candidate.type === "Container" ||
            (candidate.children?.length ?? 0) > 0,
          getCollapseState: () => "expanded",
          nodeActions: nodeActionsStub,
          getDropIndicatorClass: () => "",
        },
        global: {
          stubs: {
            draggable: draggableStub,
            ...contextMenuStubs,
          },
        },
      });

      expect(wrapper.findAll("[data-layer-item]")).toHaveLength(25);

      while (frameCallbacks.length > 0) {
        frameCallbacks.shift()?.();
        await wrapper.vm.$nextTick();
      }

      expect(wrapper.findAll("[data-layer-item]")).toHaveLength(206);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
    }
  });

  it("reopens a warmed large child branch without replaying the render budget", async () => {
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
      const children = Array.from({ length: 205 }, (_, index) =>
        createNode(`child-${index}`, "Text"),
      );
      let expanded = true;

      const wrapper = mount(LayerNodeRecursive, {
        props: {
          node: createNode("parent", "Container", children),
          depth: 0,
          selectedNodeId: undefined,
          selectedNodePath: undefined,
          hoveredNodeId: undefined,
          editingNodeId: null,
          activeDragListId: null,
          isExpanded: (nodeId: string) => nodeId === "parent" && expanded,
          hasChildren: (candidate: BuilderNode) =>
            (candidate.children?.length ?? 0) > 0,
          canAcceptChildren: (candidate: BuilderNode) =>
            candidate.type === "Container" ||
            (candidate.children?.length ?? 0) > 0,
          getCollapseState: () => "expanded",
          nodeActions: nodeActionsStub,
          getDropIndicatorClass: () => "",
        },
        global: {
          stubs: {
            draggable: draggableStub,
            ...contextMenuStubs,
          },
        },
      });

      while (frameCallbacks.length > 0) {
        frameCallbacks.shift()?.();
        await wrapper.vm.$nextTick();
      }

      expect(wrapper.findAll("[data-layer-item]")).toHaveLength(206);

      expanded = false;
      await wrapper.setProps({
        isExpanded: (nodeId: string) => nodeId === "parent" && expanded,
      });

      expanded = true;
      frameCallbacks.length = 0;
      await wrapper.setProps({
        isExpanded: (nodeId: string) => nodeId === "parent" && expanded,
      });

      expect(frameCallbacks).toHaveLength(0);
      expect(wrapper.findAll("[data-layer-item]")).toHaveLength(206);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
    }
  });

  it("resets a warmed branch when the render cache key changes", async () => {
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
      const children = Array.from({ length: 205 }, (_, index) =>
        createNode(`child-${index}`, "Text"),
      );

      const wrapper = mount(LayerNodeRecursive, {
        props: {
          node: createNode("parent", "Container", children),
          depth: 0,
          renderCacheKey: "slot:one",
          selectedNodeId: undefined,
          selectedNodePath: undefined,
          hoveredNodeId: undefined,
          editingNodeId: null,
          activeDragListId: null,
          isExpanded: (nodeId: string) => nodeId === "parent",
          hasChildren: (candidate: BuilderNode) =>
            (candidate.children?.length ?? 0) > 0,
          canAcceptChildren: (candidate: BuilderNode) =>
            candidate.type === "Container" ||
            (candidate.children?.length ?? 0) > 0,
          getCollapseState: () => "expanded",
          nodeActions: nodeActionsStub,
          getDropIndicatorClass: () => "",
        },
        global: {
          stubs: {
            draggable: draggableStub,
            ...contextMenuStubs,
          },
        },
      });

      while (frameCallbacks.length > 0) {
        frameCallbacks.shift()?.();
        await wrapper.vm.$nextTick();
      }

      expect(wrapper.findAll("[data-layer-item]")).toHaveLength(206);

      await wrapper.setProps({ renderCacheKey: "slot:two" });

      expect(wrapper.findAll("[data-layer-item]")).toHaveLength(25);
      expect(frameCallbacks.length).toBeGreaterThan(0);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
    }
  });

  it("renders the full child model immediately while dragging", () => {
    const children = Array.from({ length: 205 }, (_, index) =>
      createNode(`child-${index}`, "Text"),
    );

    const wrapper = mount(LayerNodeRecursive, {
      props: {
        node: createNode("parent", "Container", children),
        depth: 0,
        selectedNodeId: undefined,
        selectedNodePath: undefined,
        hoveredNodeId: undefined,
        editingNodeId: null,
        activeDragListId: "slot:main",
        isDragging: true,
        isExpanded: (nodeId: string) => nodeId === "parent",
        hasChildren: (candidate: BuilderNode) =>
          (candidate.children?.length ?? 0) > 0,
        canAcceptChildren: (candidate: BuilderNode) =>
          candidate.type === "Container" ||
          (candidate.children?.length ?? 0) > 0,
        getCollapseState: () => "expanded",
        nodeActions: nodeActionsStub,
        getDropIndicatorClass: () => "",
      },
      global: {
        stubs: {
          draggable: draggableStub,
          ...contextMenuStubs,
        },
      },
    });

    expect(wrapper.findAll("[data-layer-item]")).toHaveLength(206);
  });
});
