import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  focusedNodeIdMock,
  primarySelectedNodeIdMock,
  selectedNodeIdsMock,
  selectionAnchorNodeIdMock,
} = vi.hoisted(() => ({
  focusedNodeIdMock: { value: "node-1" as string | null },
  primarySelectedNodeIdMock: { value: "node-1" as string | null },
  selectedNodeIdsMock: { value: ["node-1"] as string[] },
  selectionAnchorNodeIdMock: { value: "node-1" as string | null },
}));

vi.mock("../../admin/features/Beacon", () => ({
  useBeacon: () => ({
    focusedNodeId: focusedNodeIdMock,
    primarySelectedNodeId: primarySelectedNodeIdMock,
    selectedNodeIds: selectedNodeIdsMock,
    selectionAnchorNodeId: selectionAnchorNodeIdMock,
  }),
}));

function createSecondaryTextNode() {
  return {
    id: "node-2",
    type: "text",
    props: {},
    styles: {},
    children: [],
  };
}

function createTextNode() {
  return {
    id: "node-1",
    type: "text",
    props: {},
    styles: {
      fontFamily: {
        base: "Inter",
        tablet: "Roboto",
      },
    },
    children: [],
  };
}

describe("useSelectedNodeState", () => {
  beforeEach(() => {
    vi.resetModules();
    focusedNodeIdMock.value = "node-1";
    primarySelectedNodeIdMock.value = "node-1";
    selectedNodeIdsMock.value = ["node-1"];
    selectionAnchorNodeIdMock.value = "node-1";
  });

  it("removes cleared responsive style breakpoints instead of storing undefined", async () => {
    const { useSelectionTreeState } =
      await import("../../admin/features/Core/composables/useSelectionTreeState");
    const { useSelectedNodeState } =
      await import("../../admin/features/Core/composables/useSelectedNodeState");

    const nodes = [createTextNode()];
    useSelectionTreeState().setSelectionTreeRootNodes(nodes as never);

    const { selectedNode, updateSelectedNodeStyles } = useSelectedNodeState();

    updateSelectedNodeStyles("node-1", {
      fontFamily: {
        tablet: undefined,
      },
    });

    expect(selectedNode.value?.styles?.fontFamily).toEqual({
      base: "Inter",
    });

    updateSelectedNodeStyles("node-1", {
      fontFamily: {
        base: undefined,
      },
    });

    expect(selectedNode.value?.styles?.fontFamily).toBeUndefined();
  });

  it("derives multi-selection state from Beacon while keeping selectedNode on the primary selection", async () => {
    const { useSelectionTreeState } =
      await import("../../admin/features/Core/composables/useSelectionTreeState");
    const { useSelectedNodeState } =
      await import("../../admin/features/Core/composables/useSelectedNodeState");

    const nodes = [createTextNode(), createSecondaryTextNode()];
    useSelectionTreeState().setSelectionTreeRootNodes(nodes as never);

    primarySelectedNodeIdMock.value = "node-2";
    focusedNodeIdMock.value = "node-2";
    selectedNodeIdsMock.value = ["node-1", "node-2"];
    selectionAnchorNodeIdMock.value = "node-1";

    const {
      selectedNode,
      primarySelectedNode,
      selectedNodes,
      selectionCount,
      isMultiSelect,
      selectionAnchorNodeId,
    } = useSelectedNodeState();

    expect(selectedNode.value?.id).toBe("node-2");
    expect(primarySelectedNode.value?.id).toBe("node-2");
    expect(selectedNodes.value.map((node) => node.id)).toEqual([
      "node-1",
      "node-2",
    ]);
    expect(selectionCount.value).toBe(2);
    expect(isMultiSelect.value).toBe(true);
    expect(selectionAnchorNodeId.value).toBe("node-1");
  });

  it("resolves layout-default slot nodes when included in selection tree roots", async () => {
    const { useSelectionTreeState } =
      await import("../../admin/features/Core/composables/useSelectionTreeState");
    const { useSelectedNodeState } =
      await import("../../admin/features/Core/composables/useSelectedNodeState");

    const slotNavigationNode = {
      id: "starter-header-navigation",
      type: "navigation",
      props: { ariaLabel: "Main navigation" },
      styles: {},
      classNames: { base: [] },
      children: [],
    };

    useSelectionTreeState().setSelectionTreeRootNodes([
      createTextNode(),
      slotNavigationNode,
    ] as never);
    primarySelectedNodeIdMock.value = "starter-header-navigation";
    focusedNodeIdMock.value = "starter-header-navigation";
    selectedNodeIdsMock.value = ["starter-header-navigation"];

    const { selectedNode, updateSelectedNodeProps } = useSelectedNodeState();

    expect(selectedNode.value?.id).toBe("starter-header-navigation");

    updateSelectedNodeProps("starter-header-navigation", {
      ariaLabel: "Site navigation",
    });

    expect(slotNavigationNode.props.ariaLabel).toBe("Site navigation");
  });

  it("replaces a selected node's full structure for structural history operations", async () => {
    const { useSelectionTreeState } =
      await import("../../admin/features/Core/composables/useSelectionTreeState");
    const { useSelectedNodeState } =
      await import("../../admin/features/Core/composables/useSelectedNodeState");

    useSelectionTreeState().setSelectionTreeRootNodes([
      {
        id: "navigation-1",
        type: "navigation",
        props: { sourceMode: "static" },
        styles: {},
        children: [createSecondaryTextNode()],
      },
    ] as never);
    primarySelectedNodeIdMock.value = "navigation-1";
    focusedNodeIdMock.value = "navigation-1";
    selectedNodeIdsMock.value = ["navigation-1"];

    const { selectedNode, replaceSelectedNode } = useSelectedNodeState();
    replaceSelectedNode("navigation-1", {
      id: "navigation-1",
      type: "navigation",
      props: { sourceMode: "cms" },
      styles: {},
      children: [],
      dataSource: {
        type: "collection",
        collection: "menus",
        mode: "single",
      },
    });

    expect(selectedNode.value).toMatchObject({
      props: { sourceMode: "cms" },
      dataSource: { collection: "menus" },
      children: [],
    });
  });
});
