import { describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import { useLayerExpansion } from "../../../admin/features/Layers/composables/useLayerExpansion";
import type { BuilderNode } from "../../../lib/types/nodes";
import { VIRTUAL_SLOT_NAMES } from "../../../admin/features/Layers/types";

function createNode(
  id: string,
  children: BuilderNode[] = [],
): BuilderNode {
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

  it("expandAll includes nested nodes from layout slot trees", () => {
    const headerRoot = createNode("header-root", [
      createNode("header-nested", [createNode("header-leaf")]),
    ]);
    const pageNodes = nodeListRef([
      createNode("main-root", [createNode("main-child")]),
    ]);
    const blocks = nodeListRef(pageNodes.value);

    const { expandedNodes, toggleAll } = useLayerExpansion({
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

    expect(expandedNodes.value.has("header")).toBe(true);
    expect(expandedNodes.value.has("header-root")).toBe(true);
    expect(expandedNodes.value.has("header-nested")).toBe(true);
    expect(expandedNodes.value.has("header-leaf")).toBe(true);
    expect(expandedNodes.value.has("main-root")).toBe(true);
    expect(expandedNodes.value.has("main-child")).toBe(true);
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
});
