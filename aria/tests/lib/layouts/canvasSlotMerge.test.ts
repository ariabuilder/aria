import { describe, expect, it } from "vitest";
import {
  mergePageBlocksWithLayoutSlots,
  resolveSlotRootsForDisplay,
} from "../../../lib/layouts/canvasSlotMerge";
import { type LayoutWithSlotsLike } from "../../../lib/layouts/slotEditing";
import type { BuilderNode } from "../../../lib/types/nodes";
import { createNode } from "../../fixtures/testDataGenerator";

const layout: LayoutWithSlotsLike = {
  id: "full-width",
  slots: [
    {
      name: "header",
      isDefault: false,
      defaultContent: [
        createNode({
          id: "header-node",
          type: "Component",
          props: { componentId: "header-01" },
          reference: { type: "instance", masterId: "header-01" },
        }),
      ],
    },
    { name: "main", isDefault: true },
    {
      name: "footer",
      isDefault: false,
      defaultContent: [
        createNode({
          id: "footer-node",
          type: "Component",
          props: { componentId: "footer" },
          reference: { type: "instance", masterId: "footer" },
        }),
      ],
    },
  ],
};

describe("mergePageBlocksWithLayoutSlots (canvas display)", () => {
  it("includes layout defaultContent when page has no slot roots", () => {
    const pageNodes: BuilderNode[] = [
      {
        id: "main-section",
        type: "Section",
        slot: "main",
        props: {},
        styles: {},
        children: [],
      },
    ];

    const merged = mergePageBlocksWithLayoutSlots(
      pageNodes,
      layout,
      resolveSlotRootsForDisplay,
    );
    const ids = merged.map((node) => node.id);

    expect(ids).toContain("header-node");
    expect(ids).toContain("main-section");
    expect(ids).toContain("footer-node");
  });

  it("uses layout defaultContent for shared slots even when page has slot roots", () => {
    const pageNodes: BuilderNode[] = [
      {
        id: "page-header",
        type: "Text",
        slot: "header",
        props: { text: "Page header" },
        styles: {},
        children: [],
      },
    ];

    const merged = mergePageBlocksWithLayoutSlots(
      pageNodes,
      layout,
      resolveSlotRootsForDisplay,
    );
    expect(merged.some((node) => node.id === "page-header")).toBe(false);
    expect(merged.some((node) => node.id === "header-node")).toBe(true);
  });

  it("keeps a default-slot CMS list body root when header and footer defaults exist", () => {
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

    const merged = mergePageBlocksWithLayoutSlots(
      [cmsBodyRoot],
      layout,
      resolveSlotRootsForDisplay,
    );
    const ids = merged.map((node) => node.id);

    expect(ids).toEqual(["header-node", "cms-body-loop", "footer-node"]);
    expect(
      merged.find((node) => node.id === "cms-body-loop")?.dataSource,
    ).toEqual(cmsBodyRoot.dataSource);
  });
});
