import { describe, expect, it } from "vitest";
import {
  createDefaultActiveSlot,
  getEditorSlotScope,
  getSlotDefaultContent,
  getSlotScope,
  replaceRootNodesForSlot,
  resolvePublishSlotContent,
  setSlotDefaultContent,
  normalizeRootNodeForSlot,
  restoreLayoutSlotsFromSnapshot,
  snapshotLayoutSlots,
  stripOrphanPageSlotRoots,
  type LayoutWithSlotsLike,
} from "../../../lib/layouts/slotEditing";
import type { BuilderNode } from "../../../lib/types/nodes";
import { createNode } from "../../fixtures/testDataGenerator";

const layout: LayoutWithSlotsLike = {
  id: "layout-1",
  slots: [
    {
      name: "header",
      isDefault: false,
      defaultContent: [
        createNode({ id: "h1", type: "Text", props: { text: "H" } }),
      ],
    },
    { name: "main", isDefault: true },
    { name: "footer", isDefault: false },
  ],
};

describe("slotEditing", () => {
  it("maps default slot to page scope", () => {
    expect(getSlotScope("main", layout)).toBe("page");
    expect(createDefaultActiveSlot(layout)).toEqual({ name: "main", scope: "page" });
  });

  it("uses layout scope for shared slots while editing a page", () => {
    expect(getSlotScope("footer", layout)).toBe("layout");
    expect(getEditorSlotScope("page", "footer", layout)).toBe("layout");
    expect(getEditorSlotScope("page", "main", layout)).toBe("page");
  });

  it("edits slot defaultContent only while editing the layout", () => {
    expect(getEditorSlotScope("layout", "footer", layout)).toBe("layout");
    expect(getEditorSlotScope("layout", "unknown", layout)).toBe("page");
  });

  it("reads and writes defaultContent on layout slots", () => {
    const footerNodes: BuilderNode[] = [
      createNode({ id: "f1", type: "Text", props: { text: "Footer" } }),
    ];
    const next = setSlotDefaultContent(layout, "footer", footerNodes);
    expect(getSlotDefaultContent(next, "footer")).toHaveLength(1);
  });

  it("replaces page roots per slot without touching other slots", () => {
    const pageNodes: BuilderNode[] = [
      createNode({
        id: "p-main",
        type: "Text",
        props: { text: "Main" },
        slot: "main",
      }),
      createNode({
        id: "p-footer",
        type: "Text",
        props: { text: "Old" },
        slot: "footer",
      }),
    ];
    const next = replaceRootNodesForSlot(pageNodes, layout, "footer", [
      createNode({
        id: "p-footer-new",
        type: "Text",
        props: { text: "New" },
        slot: "footer",
      }),
    ]);
    expect(next.find((node) => node.id === "p-main")).toBeTruthy();
    expect(next.find((node) => node.id === "p-footer-new")).toBeTruthy();
    expect(next.find((node) => node.id === "p-footer")).toBeFalsy();
  });

  it("preserves an unslotted CMS list body root when header and footer roots change", () => {
    const cmsBodyRoot = createNode({
      id: "cms-body-loop",
      type: "Container",
      dataSource: {
        type: "cms",
        collection: "posts",
        mode: "list",
      },
      children: [
        createNode({
          id: "cms-body-title",
          type: "Text",
          props: { text: "Post title" },
          dataSource: {
            type: "cms",
            collection: "posts",
            bindings: { text: "posts.title" },
          },
        }),
      ],
    });

    const withHeader = replaceRootNodesForSlot(
      [cmsBodyRoot],
      layout,
      "header",
      [
        createNode({
          id: "page-header",
          type: "Text",
          props: { text: "Header" },
        }),
      ],
    );
    const withFooter = replaceRootNodesForSlot(withHeader, layout, "footer", [
      createNode({
        id: "page-footer",
        type: "Text",
        props: { text: "Footer" },
      }),
    ]);

    expect(withFooter.map((node) => node.id)).toEqual([
      "page-header",
      "cms-body-loop",
      "page-footer",
    ]);
    expect(
      withFooter.find((node) => node.id === "cms-body-loop")?.dataSource,
    ).toEqual(cmsBodyRoot.dataSource);
  });

  it("prefers page slot content over layout defaultContent when publishing main slot", () => {
    const pageNodes: BuilderNode[] = [
      createNode({
        id: "page-main",
        type: "Text",
        props: { text: "Page main" },
        slot: "main",
      }),
    ];
    const published = resolvePublishSlotContent(pageNodes, layout, "main");
    expect(published[0]?.id).toBe("page-main");
  });

  it("ignores page roots in shared slots when publishing", () => {
    const pageNodes: BuilderNode[] = [
      createNode({
        id: "page-footer",
        type: "Text",
        props: { text: "Page footer" },
        slot: "footer",
      }),
    ];
    const published = resolvePublishSlotContent(pageNodes, layout, "footer");
    expect(published).toEqual([]);
  });

  it("falls back to layout defaultContent when page has no slot nodes", () => {
    const published = resolvePublishSlotContent([], layout, "header");
    expect(published[0]?.id).toBe("h1");
  });

  it("strips orphan page roots assigned to shared layout slots", () => {
    const pageNodes: BuilderNode[] = [
      createNode({
        id: "page-header",
        type: "Text",
        props: { text: "Orphan header" },
        slot: "header",
      }),
      createNode({
        id: "page-main",
        type: "Text",
        props: { text: "Main" },
      }),
    ];

    expect(stripOrphanPageSlotRoots(pageNodes, layout).map((node) => node.id)).toEqual([
      "page-main",
    ]);
  });

  it("snapshots layout slots for dirty detection", () => {
    const first = snapshotLayoutSlots(layout);
    const second = snapshotLayoutSlots(layout);
    expect(first).toBe(second);
  });

  it("normalizes root slot metadata when moving between slots", () => {
    const node: BuilderNode = createNode({
      id: "section-1",
      type: "Section",
      slot: "main",
    });
    const headerNode = normalizeRootNodeForSlot(node, "header", layout);
    expect(headerNode.slot).toBe("header");

    const mainNode = normalizeRootNodeForSlot(headerNode, "main", layout);
    expect(mainNode.slot).toBeUndefined();
  });

  it("restores layout slot snapshots for undo", () => {
    const snapshot = snapshotLayoutSlots(layout);
    const mutated = setSlotDefaultContent(layout, "footer", [
      createNode({ id: "f-new", type: "Text", props: { text: "New" } }),
    ]);
    const restored = restoreLayoutSlotsFromSnapshot(mutated, snapshot);
    expect(getSlotDefaultContent(restored, "footer")).toHaveLength(0);
    expect(getSlotDefaultContent(restored, "header")[0]?.id).toBe("h1");
  });
});
