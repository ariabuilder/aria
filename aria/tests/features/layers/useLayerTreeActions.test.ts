import { describe, expect, it, vi } from "vitest";
import { computed, ref, type Ref } from "vue";
import type { LayerStateChangeRecord } from "../../../admin/features/Layers/composables/useLayerHistory";
import type { LayerLayoutInfo } from "../../../admin/features/Layers/composables/useLayerTreeActions";
import type { BuilderNode, LayoutDSL } from "../../../lib/types/nodes";
import type {
  LayerDragEvent,
  LayerListChangeEvent,
} from "../../../admin/features/Layers/types";
import { useLayerTreeActions } from "../../../admin/features/Layers/composables/useLayerTreeActions";
import { useEditorNodeRegistry } from "../../../admin/features/Core/composables/useEditorNodeRegistry";

const VIRTUAL_SLOT_NAMES = {
  PAGE_CONTENT: "page-content",
  COMPONENT_CONTENT: "component-content",
} as const;

function createNode(
  id: string,
  type: string,
  options: {
    slot?: string;
    children?: BuilderNode[];
  } = {},
): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    slot: options.slot,
    children: options.children ?? [],
  };
}

function createDragEvent(node: BuilderNode): LayerDragEvent {
  return {
    item: {
      __draggable_context: {
        element: node,
      },
    } as HTMLElement & {
      __draggable_context: { element: BuilderNode };
    },
  };
}

function blocksRef(nodes: BuilderNode[] | undefined): Ref<BuilderNode[] | undefined> {
  return ref(nodes as unknown) as Ref<BuilderNode[] | undefined>;
}

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function layoutInfoRef(layout: LayerLayoutInfo | undefined): Ref<LayerLayoutInfo | undefined> {
  return ref(layout as unknown) as Ref<LayerLayoutInfo | undefined>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function layerLayoutRef(layout: Ref<LayoutDSL | null>): Ref<LayerLayoutInfo | undefined> {
  return layout as unknown as Ref<LayerLayoutInfo | undefined>;
}

function createHarness(
  initialBlocks: BuilderNode[],
  currentLayout?: { slots?: Array<{ name: string; isDefault?: boolean }> },
) {
  const blocks = blocksRef(initialBlocks);
  const expandedNodes = ref(new Set<string>());
  const collapseState = ref(
    new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
  );
  const updates: Array<{ newBlocks: BuilderNode[]; description: string }> = [];

  const actions = useLayerTreeActions({
    blocks,
    currentLayout: layoutInfoRef(currentLayout),
    currentItemType: ref("page"),
    virtualSlotNames: VIRTUAL_SLOT_NAMES,
    hasChildren: (node) => Array.isArray(node.children),
    expandedNodes,
    collapseState,
    updateBlocksWithHistory: (newBlocks, description) => {
      blocks.value = newBlocks;
      updates.push({ newBlocks, description });
    },
  });

  return {
    actions,
    blocks,
    expandedNodes,
    collapseState,
    updates,
  };
}

describe("useLayerTreeActions", () => {
  it("rejects invalid inside drops onto leaf nodes", () => {
    const dragged = createNode("dragged", "Text");
    const leafTarget = createNode("leaf", "Image");
    const harness = createHarness([dragged, leafTarget]);

    harness.actions.handleDragStart(createDragEvent(dragged));
    harness.actions.handleDropOnNode(leafTarget, "inside");

    expect(harness.updates).toHaveLength(0);
    expect(harness.blocks.value?.map((node) => node.id)).toEqual([
      "dragged",
      "leaf",
    ]);
  });

  it("nests a root node through the validated executor and clears root slot metadata", () => {
    const target = createNode("target", "Container");
    const dragged = createNode("dragged", "Text", { slot: "hero" });
    const harness = createHarness([target, dragged]);

    harness.actions.handleDragStart(createDragEvent(dragged));
    harness.actions.handleDropOnNode(target, "inside");

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0].description).toBe("Nest node into Container");
    expect(harness.blocks.value).toHaveLength(1);
    expect(harness.blocks.value?.[0].children?.map((node) => node.id)).toEqual([
      "dragged",
    ]);
    expect(harness.blocks.value?.[0].children?.[0].slot).toBeUndefined();
    expect(harness.expandedNodes.value.has("target")).toBe(true);
    expect(harness.collapseState.value.get("target")).toBe("expanded");
  });

  it("commits a gesture once when row drop and Sortable change both fire", () => {
    const dragged = createNode("dragged", "Text");
    const target = createNode("target", "Text");
    const harness = createHarness([dragged, target]);

    harness.actions.handleDragStart(createDragEvent(dragged));
    harness.actions.handleDropOnNode(target, "after");
    harness.actions.handleSlotChange(
      {
        moved: { element: dragged, oldIndex: 0, newIndex: 1 },
      },
      VIRTUAL_SLOT_NAMES.PAGE_CONTENT,
    );

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value?.map((node) => node.id)).toEqual([
      "target",
      "dragged",
    ]);
  });

  it("ignores a late row drop after Sortable already committed the gesture", () => {
    const dragged = createNode("dragged", "Text");
    const target = createNode("target", "Text");
    const harness = createHarness([dragged, target]);

    harness.actions.handleDragStart(createDragEvent(dragged));
    harness.actions.handleSlotChange(
      {
        moved: { element: dragged, oldIndex: 0, newIndex: 1 },
      },
      VIRTUAL_SLOT_NAMES.PAGE_CONTENT,
    );
    harness.actions.handleDropOnNode(target, "before");
    harness.actions.handleDragEnd();

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value?.map((node) => node.id)).toEqual([
      "target",
      "dragged",
    ]);
  });

  it("defers sortable list commits until drag end", () => {
    const dragged = createNode("dragged", "Text");
    const target = createNode("target", "Text");
    const harness = createHarness([dragged, target]);

    harness.actions.handleDragStart(createDragEvent(dragged));
    harness.actions.handleSlotChange(
      {
        moved: { element: dragged, oldIndex: 0, newIndex: 1 },
      },
      VIRTUAL_SLOT_NAMES.PAGE_CONTENT,
    );

    expect(harness.updates).toHaveLength(0);

    harness.actions.handleDragEnd();

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value?.map((node) => node.id)).toEqual([
      "target",
      "dragged",
    ]);
  });

  it("routes nested sibling reorders through the shared executor", () => {
    const childA = createNode("a", "Text");
    const childB = createNode("b", "Text");
    const childC = createNode("c", "Text");
    const parent = createNode("parent", "Container", {
      children: [childA, childB, childC],
    });
    const harness = createHarness([parent]);

    const changeEvent: LayerListChangeEvent = {
      moved: {
        element: childC,
        oldIndex: 2,
        newIndex: 0,
      },
    };

    harness.actions.handleChildrenUpdate(parent, changeEvent);

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0].description).toBe("Reordered layer");
    expect(harness.blocks.value?.[0].children?.map((node) => node.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("handles adding a node into an empty container children list", () => {
    const parent = createNode("parent", "Container");
    const dragged = createNode("dragged", "Text", { slot: "hero" });
    const harness = createHarness([parent, dragged]);

    const changeEvent: LayerListChangeEvent = {
      added: {
        element: dragged,
        newIndex: 0,
      },
    };

    harness.actions.handleChildrenUpdate(parent, changeEvent);

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value).toHaveLength(1);
    expect(harness.blocks.value?.[0].children?.map((node) => node.id)).toEqual([
      "dragged",
    ]);
    expect(harness.blocks.value?.[0].children?.[0].slot).toBeUndefined();
    expect(harness.expandedNodes.value.has("parent")).toBe(true);
  });

  it("moves a node into an empty root slot with typed slot normalization", () => {
    const dragged = createNode("dragged", "Text");
    const harness = createHarness([dragged], {
      slots: [{ name: "hero" }],
    });

    const changeEvent: LayerListChangeEvent = {
      added: {
        element: dragged,
        newIndex: 0,
      },
    };

    harness.actions.handleSlotChange(changeEvent, "hero");

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0].description).toBe("Move node to hero slot");
    expect(harness.blocks.value?.[0].slot).toBe("hero");
  });

  it("includes unassigned nodes in the configured default slot", () => {
    const header = createNode("header", "Container", { slot: "header" });
    const mainContent = createNode("main-content", "Text");
    const legacyDefault = createNode("legacy-default", "Text", {
      slot: "default",
    });
    const footer = createNode("footer", "Container", { slot: "footer" });
    const harness = createHarness(
      [header, mainContent, legacyDefault, footer],
      {
        slots: [
          { name: "header" },
          { name: "main", isDefault: true },
          { name: "footer" },
        ],
      },
    );

    expect(
      harness.actions.getNodesInSlot("main").map((node) => node.id),
    ).toEqual(["main-content", "legacy-default"]);
    expect(
      harness.actions.getNodesInSlot("header").map((node) => node.id),
    ).toEqual(["header"]);
    expect(
      harness.actions.getNodesInSlot("footer").map((node) => node.id),
    ).toEqual(["footer"]);
  });

  it("moves a node before a target through the explicit drop handler", () => {
    const first = createNode("first", "Text");
    const second = createNode("second", "Text");
    const third = createNode("third", "Text");
    const harness = createHarness([first, second, third]);

    harness.actions.handleDragStart(createDragEvent(third));
    harness.actions.handleDropOnNode(first, "before");

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value?.map((node) => node.id)).toEqual([
      "third",
      "first",
      "second",
    ]);
  });

  it("auto-wraps direct inside drops into lists as list items", () => {
    const list = createNode("list", "list");
    const dragged = createNode("dragged", "Text", { slot: "hero" });
    const harness = createHarness([list, dragged]);

    harness.actions.handleDragStart(createDragEvent(dragged));
    harness.actions.handleDropOnNode(list, "inside");

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value).toHaveLength(1);
    expect(harness.blocks.value?.[0].children).toHaveLength(1);
    expect(harness.blocks.value?.[0].children?.[0]?.type).toBe("listitem");
    expect(harness.blocks.value?.[0].children?.[0]?.slot).toBeUndefined();
    expect(harness.blocks.value?.[0].children?.[0]?.children?.[0]?.id).toBe(
      "dragged",
    );
    expect(
      harness.blocks.value?.[0].children?.[0]?.children?.[0]?.slot,
    ).toBeUndefined();
  });

  it("auto-wraps sibling insertions into populated lists as list items", () => {
    const existingItem = createNode("existing-item", "listitem", {
      children: [createNode("existing-text", "Text")],
    });
    const list = createNode("list", "list", {
      children: [existingItem],
    });
    const dragged = createNode("dragged", "Text");
    const harness = createHarness([list, dragged]);

    const changeEvent: LayerListChangeEvent = {
      added: {
        element: dragged,
        newIndex: 0,
      },
    };

    harness.actions.handleChildrenUpdate(list, changeEvent);

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value).toHaveLength(1);
    expect(harness.blocks.value?.[0].children).toHaveLength(2);
    expect(
      harness.blocks.value?.[0].children?.map((node) => node.type),
    ).toEqual(["listitem", "listitem"]);
    expect(harness.blocks.value?.[0].children?.[0]?.children?.[0]?.id).toBe(
      "dragged",
    );
  });

  it("rejects moving list items outside of lists", () => {
    const listItem = createNode("list-item", "listitem", {
      children: [createNode("item-text", "Text")],
    });
    const list = createNode("list", "list", {
      children: [listItem],
    });
    const target = createNode("target", "Container");
    const harness = createHarness([list, target]);

    harness.actions.handleDragStart(createDragEvent(listItem));
    harness.actions.handleDropOnNode(target, "inside");

    expect(harness.updates).toHaveLength(0);
    expect(harness.blocks.value?.[0].children?.[0]?.id).toBe("list-item");
  });

  it("moves a node after a target through the explicit drop handler", () => {
    const first = createNode("first", "Text");
    const second = createNode("second", "Text");
    const third = createNode("third", "Text");
    const harness = createHarness([first, second, third]);

    harness.actions.handleDragStart(createDragEvent(first));
    harness.actions.handleDropOnNode(second, "after");

    expect(harness.updates).toHaveLength(1);
    expect(harness.blocks.value?.map((node) => node.id)).toEqual([
      "second",
      "first",
      "third",
    ]);
  });

  it("moves a root section from main to header via node registry", () => {
    const mainSection = createNode("main-section", "Section");
    const pageBlocks = pageBlocksRef([mainSection]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });
    const stateChanges: Array<{ description: string }> = [];

    const actions = useLayerTreeActions({
      blocks: pageBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: (node) => Array.isArray(node.children),
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      recordStateChange: (input) => {
        stateChanges.push({ description: input.description });
      },
      nodeRegistry: registry,
    });

    const changeEvent: LayerListChangeEvent = {
      added: {
        element: mainSection,
        newIndex: 0,
      },
    };

    actions.handleSlotChange(changeEvent, "header");

    expect(pageBlocks.value.some((node) => node.id === "main-section")).toBe(
      false,
    );
    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent?.some((node) => node.id === "main-section"),
    ).toBe(true);
    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0]?.description).toContain("header");
  });

  it("moves a root section from header to main via node registry", () => {
    const mainSection = createNode("main-section", "Section");
    const headerSection = createNode("header-section", "Section");
    const pageBlocks = pageBlocksRef([mainSection]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [headerSection],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });

    const actions = useLayerTreeActions({
      blocks: pageBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: (node) => Array.isArray(node.children),
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      nodeRegistry: registry,
    });

    actions.handleSlotChange(
      {
        added: {
          element: headerSection,
          newIndex: 0,
        },
      },
      "main",
    );

    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent?.length ?? 0,
    ).toBe(0);
    expect(
      pageBlocks.value.some((node) => node.id === "header-section"),
    ).toBe(true);
    expect(pageBlocks.value.map((node) => node.id)).toEqual([
      "header-section",
      "main-section",
    ]);
  });

  it("moves a root section from header to main when dropping inside a main node", () => {
    const mainSection = createNode("main-section", "Section");
    const headerSection = createNode("header-section", "Section");
    const pageBlocks = pageBlocksRef([mainSection]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [headerSection],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });

    const actions = useLayerTreeActions({
      blocks: pageBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: (node) => Array.isArray(node.children),
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      nodeRegistry: registry,
    });

    actions.handleDragStart(createDragEvent(headerSection));
    actions.handleDropOnNode(mainSection, "inside");

    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent?.length ?? 0,
    ).toBe(0);
    expect(
      pageBlocks.value.some((node) => node.id === "header-section"),
    ).toBe(true);
  });

  it("moves a nested node from main to header via handleSlotChange", () => {
    const nestedChild = createNode("nested-child", "Text");
    const mainParent = createNode("main-parent", "Section", {
      children: [nestedChild],
    });
    const pageBlocks = pageBlocksRef([mainParent]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        { name: "header", defaultContent: [] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });

    const actions = useLayerTreeActions({
      blocks: pageBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: (node) => Boolean(node.children?.length),
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      nodeRegistry: registry,
    });

    actions.handleSlotChange(
      {
        added: {
          element: nestedChild,
          newIndex: 0,
        },
      },
      "header",
    );

    expect(
      pageBlocks.value.some((node) =>
        node.children?.some((child) => child.id === "nested-child"),
      ),
    ).toBe(false);
    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent?.some((node) => node.id === "nested-child"),
    ).toBe(true);
  });

  it("calls onTreeStructureChanged when cross-slot move fails", () => {
    const mainSection = createNode("main-section", "Section");
    const pageBlocks = pageBlocksRef([mainSection]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        { name: "header", defaultContent: [] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });
    const onTreeStructureChanged = vi.fn();

    const moveSpy = vi
      .spyOn(registry, "moveNodeBetweenSlots")
      .mockReturnValue({ success: false, error: "Invalid placement" });

    const actions = useLayerTreeActions({
      blocks: pageBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: () => false,
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      nodeRegistry: registry,
      onTreeStructureChanged,
    });

    actions.handleSlotChange(
      {
        added: {
          element: mainSection,
          newIndex: 0,
        },
      },
      "header",
    );

    expect(moveSpy).toHaveBeenCalled();
    expect(onTreeStructureChanged).toHaveBeenCalled();
    expect(
      pageBlocks.value.some((node) => node.id === "main-section"),
    ).toBe(true);

    moveSpy.mockRestore();
  });

  it("records shared layout slot metadata after a main-to-footer drag", () => {
    const footerSection = createNode("footer-section", "Footer");
    const pageBlocks = pageBlocksRef([footerSection]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        { name: "footer", defaultContent: [] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });
    const stateChanges: LayerStateChangeRecord[] = [];

    const actions = useLayerTreeActions({
      blocks: pageBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: () => false,
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      recordStateChange: (input) => {
        stateChanges.push(input);
      },
      nodeRegistry: registry,
    });

    actions.handleSlotChange(
      {
        added: {
          element: footerSection,
          newIndex: 0,
        },
      },
      "footer",
    );

    expect(pageBlocks.value.some((node) => node.id === "footer-section")).toBe(
      false,
    );
    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "footer")
        ?.defaultContent?.some((node) => node.id === "footer-section"),
    ).toBe(true);
    expect(stateChanges).toHaveLength(1);
    expect(
      stateChanges[0]?.nextBlocks.some((node) => node.id === "footer-section"),
    ).toBe(false);
  });

  it("captures stale nextBlocks when blocks read from lagging props instead of pageBlocks ref", () => {
    const footerSection = createNode("footer-section", "Footer");
    const pageBlocks = pageBlocksRef([footerSection]);
    const stalePropsBlocks = pageBlocksRef([footerSection]);
    const laggingPropsBlocks = computed(() => stalePropsBlocks.value);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        { name: "footer", defaultContent: [] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
    });
    const stateChanges: LayerStateChangeRecord[] = [];

    const actions = useLayerTreeActions({
      blocks: laggingPropsBlocks,
      currentLayout: layerLayoutRef(currentLayout),
      currentItemType: ref("page"),
      virtualSlotNames: VIRTUAL_SLOT_NAMES,
      hasChildren: () => false,
      expandedNodes: ref(new Set<string>()),
      collapseState: ref(
        new Map<string, "expanded" | "soft-collapsed" | "full-collapsed">(),
      ),
      updateBlocksWithHistory: () => {},
      recordStateChange: (input) => {
        stateChanges.push(input);
      },
      nodeRegistry: registry,
    });

    actions.handleSlotChange(
      {
        added: {
          element: footerSection,
          newIndex: 0,
        },
      },
      "footer",
    );

    expect(pageBlocks.value.some((node) => node.id === "footer-section")).toBe(
      false,
    );
    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "footer")
        ?.defaultContent?.some((node) => node.id === "footer-section"),
    ).toBe(true);
    expect(stateChanges).toHaveLength(1);
    expect(
      stateChanges[0]?.nextBlocks.some((node) => node.id === "footer-section"),
    ).toBe(true);
  });
});
