import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import LayerItem from "../../../admin/features/Layers/components/LayerItem.vue";
import type { BuilderNode } from "../../../lib/types/nodes";
import type { NodeEventHandlers } from "../../../admin/features/Layers/composables/useLayerNodeActions";

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

function mountLayerItem(options: {
  expanded?: boolean;
  hasChildren?: boolean;
  canAcceptChildren?: boolean;
  selected?: boolean;
  expanding?: boolean;
  dropIndicatorClass?: "" | "drop-before" | "drop-after" | "drop-inside";
}) {
  return mount(LayerItem, {
    props: {
      node: createNode("node-1", "Container"),
      selected: options.selected ?? false,
      expanded: options.expanded ?? false,
      expanding: options.expanding ?? false,
      hasChildren: options.hasChildren ?? true,
      canAcceptChildren: options.canAcceptChildren ?? true,
      depth: 0,
      editingNodeId: null,
      hovered: false,
      nodeActions: nodeActionsStub,
      dropIndicatorClass: options.dropIndicatorClass ?? "",
    },
    global: {
      stubs: contextMenuStubs,
    },
  });
}

function installBounds(wrapper: ReturnType<typeof mountLayerItem>) {
  const row = wrapper.get("[data-layer-item]");
  Object.defineProperty(row.element, "getBoundingClientRect", {
    value: () => ({
      top: 100,
      bottom: 140,
      left: 0,
      right: 200,
      width: 200,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }),
  });

  return row;
}

describe("LayerItem", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits before, inside, and after drop-target changes from pointer position", async () => {
    const wrapper = mountLayerItem({ expanded: true, hasChildren: true });
    const row = installBounds(wrapper);
    const dataTransfer = { dropEffect: "none" } as DataTransfer;

    await row.trigger("dragover", { clientY: 111, dataTransfer });
    await row.trigger("dragover", { clientY: 120, dataTransfer });
    await row.trigger("dragover", { clientY: 129, dataTransfer });

    expect(wrapper.emitted("drop-target-change")).toEqual([
      [
        {
          targetNode: expect.objectContaining({ id: "node-1" }),
          position: "before",
        },
      ],
      [
        {
          targetNode: expect.objectContaining({ id: "node-1" }),
          position: "inside",
        },
      ],
      [
        {
          targetNode: expect.objectContaining({ id: "node-1" }),
          position: "after",
        },
      ],
    ]);
  });

  it("auto-expands only for inside previews on collapsed containers", async () => {
    vi.useFakeTimers();

    const wrapper = mountLayerItem({ expanded: false, hasChildren: true });
    const row = installBounds(wrapper);
    const dataTransfer = { dropEffect: "none" } as DataTransfer;

    await row.trigger("dragover", { clientY: 102, dataTransfer });
    vi.advanceTimersByTime(650);
    expect(wrapper.emitted("toggle-expand")).toBeUndefined();

    await row.trigger("dragover", { clientY: 120, dataTransfer });
    vi.advanceTimersByTime(650);
    expect(wrapper.emitted("toggle-expand")).toHaveLength(1);
  });

  it("keeps expansion visibly busy and exposes its state accessibly", () => {
    const wrapper = mountLayerItem({
      expanded: false,
      expanding: true,
      hasChildren: true,
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

  it("cancels pending auto-expand when the pointer moves to an edge zone", async () => {
    vi.useFakeTimers();

    const wrapper = mountLayerItem({ expanded: false, hasChildren: true });
    const row = installBounds(wrapper);
    const dataTransfer = { dropEffect: "none" } as DataTransfer;

    await row.trigger("dragover", { clientY: 120, dataTransfer });
    await row.trigger("dragover", { clientY: 102, dataTransfer });
    vi.advanceTimersByTime(650);

    expect(wrapper.emitted("toggle-expand")).toBeUndefined();
  });

  it("keeps the previewed target when layout shifts before drop", async () => {
    const wrapper = mountLayerItem({ expanded: true, hasChildren: true });
    const row = installBounds(wrapper);

    await row.trigger("dragover", {
      clientY: 102,
      dataTransfer: { dropEffect: "move" },
    });
    await row.trigger("drop", {
      clientY: 138,
      dataTransfer: { dropEffect: "move" },
    });

    expect(wrapper.emitted("drop-node")?.[0]?.[0]).toMatchObject({
      position: "before",
    });
  });

  it("does not clear targeting when dragleave enters a row descendant", async () => {
    const wrapper = mountLayerItem({ expanded: true, hasChildren: true });
    const row = installBounds(wrapper);
    const child = row.element.querySelector("span");
    expect(child).not.toBeNull();

    await row.trigger("dragover", {
      clientY: 120,
      dataTransfer: { dropEffect: "move" },
    });
    await row.trigger("dragleave", { relatedTarget: child });

    expect(wrapper.emitted("drop-target-leave")).toBeUndefined();
  });

  it("emits explicit drop payloads and renders row indicators", async () => {
    const wrapper = mountLayerItem({
      expanded: true,
      hasChildren: true,
      dropIndicatorClass: "drop-before",
    });
    const row = installBounds(wrapper);

    expect(wrapper.find(".layer-drop-indicator--before").exists()).toBe(true);

    await row.trigger("drop", {
      clientY: 138,
      dataTransfer: { dropEffect: "move" },
    });

    expect(wrapper.emitted("drop-node")).toEqual([
      [
        {
          targetNode: expect.objectContaining({ id: "node-1" }),
          position: "after",
        },
      ],
    ]);
    expect(wrapper.emitted("drop-target-leave")).toHaveLength(1);
  });

  it("uses dedicated icons for icon lists and icon list items", () => {
    const iconListItem = createNode("item-1", "listitem", [
      createNode("icon-1", "icon"),
      createNode("text-1", "text"),
    ]);
    const iconList = createNode("list-1", "list", [iconListItem]);

    const listWrapper = mount(LayerItem, {
      props: {
        node: iconList,
        selected: false,
        expanded: false,
        hasChildren: true,
        depth: 0,
        editingNodeId: null,
        hovered: false,
        nodeActions: nodeActionsStub,
        dropIndicatorClass: "",
      },
      global: {
        stubs: contextMenuStubs,
      },
    });

    const itemWrapper = mount(LayerItem, {
      props: {
        node: iconListItem,
        selected: false,
        expanded: false,
        hasChildren: true,
        depth: 1,
        editingNodeId: null,
        hovered: false,
        nodeActions: nodeActionsStub,
        dropIndicatorClass: "",
      },
      global: {
        stubs: contextMenuStubs,
      },
    });

    expect(
      listWrapper
        .findAll("div")
        .some((node) => node.classes().includes("i-hugeicons:task-01")),
    ).toBe(true);
    expect(
      itemWrapper
        .findAll("div")
        .some((node) =>
          node.classes().includes("i-hugeicons:checkmark-circle-02"),
        ),
    ).toBe(true);
  });

  it("shows the current icon name for standalone icon nodes", () => {
    const wrapper = mount(LayerItem, {
      props: {
        node: {
          id: "icon-1",
          type: "icon",
          props: {
            icon: {
              id: "lucide:star",
              pack: "lucide",
              name: "star",
              source: "iconify",
              version: "test",
            },
          },
          styles: {},
          children: [],
        },
        selected: false,
        expanded: false,
        hasChildren: false,
        depth: 0,
        editingNodeId: null,
        hovered: false,
        nodeActions: nodeActionsStub,
        dropIndicatorClass: "",
      },
      global: {
        stubs: contextMenuStubs,
      },
    });

    expect(wrapper.text()).toContain("Star");
  });

  it("falls back to the node type when its content is blank", () => {
    const wrapper = mount(LayerItem, {
      props: {
        node: {
          ...createNode("text-1", "Text"),
          props: { content: "   " },
        },
        selected: false,
        expanded: false,
        hasChildren: false,
        depth: 0,
        editingNodeId: null,
        hovered: false,
        nodeActions: nodeActionsStub,
        dropIndicatorClass: "",
      },
      global: {
        stubs: contextMenuStubs,
      },
    });

    expect(wrapper.get("span.truncate").text()).toBe("Text");
  });

  it("uses a prominent primary treatment for selected rows", () => {
    const wrapper = mountLayerItem({ selected: true, hasChildren: true });
    const classes = wrapper.get("[data-layer-item]").classes();

    expect(classes).toContain("bg-primary/10");
    expect(classes).toContain("border-primary/20");
    expect(classes).toContain("text-foreground");
    expect(classes).toContain("rounded-sm");
    expect(classes).toContain("shadow-none");
  });

  it("uses non-animated scroll when a layer becomes selected", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    mountLayerItem({ selected: true, hasChildren: false });
    await flushPromises();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
    });

    scrollIntoView.mockClear();

    const wrapper = mountLayerItem({ expanded: false, hasChildren: false });

    await wrapper.setProps({ selected: true });
    await flushPromises();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
    });
  });

  it("does not enter rename mode when the node was only just selected", async () => {
    vi.useFakeTimers();

    const wrapper = mountLayerItem({ selected: false, hasChildren: true });
    await wrapper.setProps({ selected: true });

    const label = wrapper.get("span.truncate");
    await label.trigger("pointerdown");
    await label.trigger("dblclick");

    expect(wrapper.emitted("edit-start")).toBeUndefined();
  });

  it("enters rename mode after the row has been selected deliberately", async () => {
    vi.useFakeTimers();

    const wrapper = mountLayerItem({ selected: true, hasChildren: true });
    vi.advanceTimersByTime(300);

    const label = wrapper.get("span.truncate");
    await label.trigger("pointerdown");
    await label.trigger("dblclick");

    expect(wrapper.emitted("edit-start")).toEqual([["node-1"]]);
  });

  it("starts renaming from the context menu without requiring a selected label", async () => {
    const wrapper = mountLayerItem({ selected: false, hasChildren: true });
    const renameItem = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Rename");

    expect(renameItem).toBeDefined();
    await renameItem?.trigger("select");

    expect(wrapper.emitted("edit-start")).toEqual([["node-1"]]);
  });

  it("converts a regular layer into a component from the context menu", async () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    const wrapper = mountLayerItem({ selected: false, hasChildren: true });
    const createComponentItem = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Create component");

    expect(createComponentItem).toBeDefined();
    await createComponentItem?.trigger("select");

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "convert-component",
        payload: "node-1",
      },
      window.location.origin,
    );
  });

  it("does not offer component conversion for component instances", () => {
    const wrapper = mount(LayerItem, {
      props: {
        node: {
          ...createNode("component-1", "Component"),
          componentRef: "hero-banner",
        },
        selected: false,
        expanded: false,
        hasChildren: false,
        canAcceptChildren: false,
        depth: 0,
        editingNodeId: null,
        hovered: false,
        nodeActions: nodeActionsStub,
        dropIndicatorClass: "",
      },
      global: {
        stubs: contextMenuStubs,
      },
    });

    expect(wrapper.text()).not.toContain("Create component");
  });
});
