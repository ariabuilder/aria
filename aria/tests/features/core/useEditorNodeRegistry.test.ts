import { describe, expect, it } from "vitest";
import { ref, type Ref } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../lib/types/nodes";
import { useEditorNodeRegistry } from "../../../admin/features/Core/composables/useEditorNodeRegistry";

function section(id: string, slot?: string): BuilderNode {
  return {
    id,
    type: "Section",
    props: {},
    styles: {},
    slot,
    children: [],
  };
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

describe("useEditorNodeRegistry", () => {
  it("moves page roots between named slots without mutating layout defaults", () => {
    const layout = layoutRef({
      id: "full-width",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [section("header-section", "header")],
        },
        { name: "main", isDefault: true },
        { name: "footer", defaultContent: [] },
      ],
    } as LayoutDSL);

    const pageBlocks = pageBlocksRef([section("main-section")]);
    const activeSlot = ref({ name: "main", scope: "page" as const });

    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot,
    });

    const result = registry.moveRootNodeBetweenSlots("main-section", "header", {
      kind: "end",
    });

    expect(result.success).toBe(true);
    expect(pageBlocks.value.some((node) => node.id === "main-section")).toBe(false);
    expect(
      layout.value?.slots?.find((slot) => slot.name === "header")
        ?.defaultContent?.some((node) => node.id === "main-section"),
    ).toBe(true);
  });

  it("moves shared header layout content back to the default page slot", () => {
    const layout = layoutRef({
      id: "full-width",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [section("header-section", "header")],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const pageBlocks = pageBlocksRef([section("main-section")]);
    const activeSlot = ref({ name: "header", scope: "layout" as const });

    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot,
    });

    const result = registry.moveRootNodeBetweenSlots(
      "header-section",
      "main",
      { kind: "before", targetNodeId: "main-section" },
    );

    expect(result.success).toBe(true);
    expect(layout.value?.slots?.[0]?.defaultContent ?? []).toHaveLength(0);
    expect(pageBlocks.value.map((node) => node.id)).toEqual([
      "header-section",
      "main-section",
    ]);
  });

  it("promotes a nested page node into a shared layout slot", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        { name: "header", defaultContent: [] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const pageBlocks = pageBlocksRef([
      {
        id: "parent",
        type: "Section",
        props: {},
        styles: {},
        children: [section("nested-child")],
      },
    ]);
    const activeSlot = ref({ name: "main", scope: "page" as const });

    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot,
    });

    const result = registry.moveNodeBetweenSlots("nested-child", "header", {
      kind: "end",
    });

    expect(result.success).toBe(true);
    expect(registry.findNode("nested-child")).not.toBeNull();
    expect(
      layout.value?.slots
        ?.find((slot) => slot.name === "header")
        ?.defaultContent?.some((node) => node.id === "nested-child"),
    ).toBe(true);
    expect(
      pageBlocks.value.some((node) =>
        node.children?.some((child) => child.id === "nested-child"),
      ),
    ).toBe(false);
  });

  it("moves nested shared-slot content back to main", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        {
          name: "header",
          defaultContent: [
            {
              id: "header-parent",
              type: "Section",
              props: {},
              styles: {},
              slot: "header",
              children: [section("nested-in-header")],
            },
          ],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const pageBlocks = pageBlocksRef([section("main-section")]);
    const activeSlot = ref({ name: "header", scope: "layout" as const });

    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot,
    });

    const result = registry.moveNodeBetweenSlots(
      "nested-in-header",
      "main",
      { kind: "end" },
    );

    expect(result.success).toBe(true);
    expect(layout.value?.slots?.[0]?.defaultContent?.[0]?.children).toHaveLength(0);
    expect(
      pageBlocks.value.some((node) => node.id === "nested-in-header"),
    ).toBe(true);
  });

  it("includes layout slot display roots in the selection tree while editing a page", () => {
    const layout = layoutRef({
      id: "full-width",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [section("header-section", "header")],
        },
        { name: "main", isDefault: true },
        {
          name: "footer",
          defaultContent: [section("footer-section", "footer")],
        },
      ],
    } as LayoutDSL);

    const pageBlocks = pageBlocksRef([section("main-section")]);
    const activeSlot = ref({ name: "main", scope: "page" as const });

    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot,
      currentItemType: ref("page"),
    });

    const roots = registry.getSelectionTreeRoots();
    const rootIds = roots.map((node) => node.id);

    expect(rootIds).toContain("main-section");
    expect(rootIds).toContain("header-section");
    expect(rootIds).toContain("footer-section");
    expect(registry.findNode("header-section")?.id).toBe("header-section");
    expect(registry.locateNode("header-section")?.store).toEqual({
      kind: "layout-slot",
      slotName: "header",
    });
  });

  it("does not duplicate shared slot content in the selection tree", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        {
          name: "header",
          defaultContent: [section("layout-header", "header")],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const registry = useEditorNodeRegistry({
      pageBlocks: pageBlocksRef([
        section("main-section"),
        section("page-header", "header"),
      ]),
      currentLayout: layout,
      activeSlot: ref({ name: "main", scope: "page" as const }),
      currentItemType: ref("page"),
    });

    const headerRoots = registry
      .getSelectionTreeRoots()
      .filter((node) => node.id === "page-header" || node.id === "layout-header");

    expect(headerRoots).toHaveLength(1);
    expect(headerRoots[0]?.id).toBe("layout-header");
  });

  it("patches layout-default slot nodes via patchNodeInRegistry on page editing", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        {
          name: "header",
          defaultContent: [
            {
              id: "starter-header-navigation",
              type: "navigation",
              props: { ariaLabel: "Main navigation" },
              styles: {},
              classNames: { base: [] },
              children: [],
            },
          ],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const pageBlocks = pageBlocksRef([section("main-section")]);
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot: ref({ name: "main", scope: "page" as const }),
      currentItemType: ref("page"),
    });

    const patched = registry.patchNodeInRegistry(
      "starter-header-navigation",
      (node) => {
        node.props = {
          ...node.props,
          ariaLabel: "Site navigation",
        };
      },
    );

    expect(patched?.props?.ariaLabel).toBe("Site navigation");
    const headerDefault =
      layout.value?.slots?.find((slot) => slot.name === "header")
        ?.defaultContent ?? [];
    expect(
      headerDefault.some(
        (node) =>
          node.id === "starter-header-navigation" &&
          node.props?.ariaLabel === "Site navigation",
      ),
    ).toBe(true);
  });

  it("shows layout-default header/footer via getDisplayNodesForSlot on page editing", () => {
    const layout = layoutRef({
      id: "full-width",
      name: "Full Width",
      slots: [
        {
          name: "header",
          defaultContent: [section("header-section", "header")],
        },
        { name: "main", isDefault: true },
        {
          name: "footer",
          defaultContent: [section("footer-section", "footer")],
        },
      ],
    } as LayoutDSL);

    const pageBlocks = pageBlocksRef([section("main-section")]);
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot: ref({ name: "main", scope: "page" as const }),
      currentItemType: ref("page"),
    });

    expect(registry.getDisplayNodesForSlot("header").map((node) => node.id)).toEqual([
      "header-section",
    ]);
    expect(registry.getDisplayNodesForSlot("footer").map((node) => node.id)).toEqual([
      "footer-section",
    ]);
    expect(registry.getDisplayNodesForSlot("main").map((node) => node.id)).toEqual([
      "main-section",
    ]);
  });

  it("returns editable layout header when only layout default exists", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        {
          name: "header",
          defaultContent: [section("header-section", "header")],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const registry = useEditorNodeRegistry({
      pageBlocks: pageBlocksRef([section("main-section")]),
      currentLayout: layout,
      activeSlot: ref({ name: "main", scope: "page" as const }),
    });

    expect(registry.getEditableNodesForSlot("header").map((node) => node.id)).toEqual([
      "header-section",
    ]);
  });

  it("shows layout defaultContent for shared slots regardless of page overrides", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        {
          name: "header",
          defaultContent: [section("layout-header", "header")],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const registry = useEditorNodeRegistry({
      pageBlocks: pageBlocksRef([
        section("main-section"),
        section("page-header", "header"),
      ]),
      currentLayout: layout,
      activeSlot: ref({ name: "main", scope: "page" as const }),
    });

    expect(registry.getDisplayNodesForSlot("header").map((node) => node.id)).toEqual([
      "layout-header",
    ]);
  });

  it("promotes layout-inherited header node when moving to main", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        {
          name: "header",
          defaultContent: [section("header-section", "header")],
        },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const pageBlocks = pageBlocksRef([section("main-section")]);
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layout,
      activeSlot: ref({ name: "header", scope: "layout" as const }),
    });

    const result = registry.moveNodeBetweenSlots("header-section", "main", {
      kind: "end",
    });

    expect(result.success).toBe(true);
    expect(pageBlocks.value.some((node) => node.id === "header-section")).toBe(
      true,
    );
    expect(
      registry.getEditableNodesForSlot("main").some(
        (node) => node.id === "header-section",
      ),
    ).toBe(true);
  });

  it("reads and writes layout defaultContent while editing a layout", () => {
    const layout = layoutRef({
      id: "full-width",
      slots: [
        { name: "header", defaultContent: [section("header-section", "header")] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const registry = useEditorNodeRegistry({
      pageBlocks: pageBlocksRef([]),
      currentLayout: layout,
      activeSlot: ref({ name: "header", scope: "layout" as const }),
      currentItemType: ref("layout"),
    });

    registry.insertIntoActiveTree(null, section("layout-added", "header"), 1);

    expect(registry.getDisplayNodesForSlot("header").map((node) => node.id)).toEqual([
      "header-section",
      "layout-added",
    ]);
  });

  it("getSelectionTreeRoots returns page blocks only when layout has no slots", () => {
    const pageBlocks = pageBlocksRef([section("only-section")]);
    const activeSlot = ref({ name: "main", scope: "page" as const });

    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout: layoutRef(null),
      activeSlot,
    });

    expect(registry.getSelectionTreeRoots().map((node) => node.id)).toEqual([
      "only-section",
    ]);
  });
});
