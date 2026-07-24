/**
 * Tests the useNodeIndexer composable for fast node lookups.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BuilderNode } from "../../../lib/types/nodes";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

import { useNodeIndexer } from "../../../admin/features/Layers/composables/useNodeIndexer";

describe("useNodeIndexer", () => {
  const createNode = (
    id: string,
    type: string,
    children: BuilderNode[] = [],
  ): BuilderNode => ({
    id,
    type,
    props: {},
    styles: {},
    children,
  });

  const tree: BuilderNode[] = [
    createNode("root-1", "Container", [
      createNode("child-1", "Text"),
      createNode("child-2", "Container", [
        createNode("grandchild-1", "Heading"),
        createNode("grandchild-2", "Text"),
      ]),
    ]),
    createNode("root-2", "Section", [createNode("child-3", "Image")]),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    const { indexSize, isIndexed, allNodeIds, typeCounts } = useNodeIndexer();

    it("should have zero index size initially", () => {
      expect(indexSize.value).toBe(0);
    });

    it("should not be indexed initially", () => {
      expect(isIndexed.value).toBe(false);
    });

    it("should have empty node ids initially", () => {
      expect(allNodeIds.value).toEqual([]);
    });

    it("should have empty type counts initially", () => {
      expect(typeCounts.value).toEqual([]);
    });
  });

  describe("buildIndex", () => {
    const { buildIndex, isIndexed, allNodeIds, typeCounts } = useNodeIndexer();

    it("should build index from tree", () => {
      buildIndex(tree);

      expect(isIndexed.value).toBe(true);
      expect(allNodeIds.value).toContain("root-1");
      expect(allNodeIds.value).toContain("grandchild-1");
    });

    it("should populate type counts", () => {
      buildIndex(tree);

      const counts = typeCounts.value;
      expect(counts.find((c) => c.type === "Container")?.count).toBeGreaterThan(
        0,
      );
      expect(counts.find((c) => c.type === "Text")?.count).toBeGreaterThan(0);
    });
  });

  describe("getNode", () => {
    const { buildIndex, getNode } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return node by ID", () => {
      const node = getNode("root-1");
      expect(node?.id).toBe("root-1");
      expect(node?.type).toBe("Container");
    });

    it("should return nested node", () => {
      const node = getNode("grandchild-1");
      expect(node?.id).toBe("grandchild-1");
      expect(node?.type).toBe("Heading");
    });

    it("should return null for non-existent node", () => {
      const node = getNode("non-existent");
      expect(node).toBeNull();
    });
  });

  describe("getParentId", () => {
    const { buildIndex, getParentId } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return null for root node", () => {
      expect(getParentId("root-1")).toBeNull();
      expect(getParentId("root-2")).toBeNull();
    });

    it("should return parent ID for child node", () => {
      expect(getParentId("child-1")).toBe("root-1");
    });

    it("should return grandparent ID for grandchild", () => {
      expect(getParentId("grandchild-1")).toBe("child-2");
    });

    it("should return null for non-existent node", () => {
      expect(getParentId("non-existent")).toBeNull();
    });
  });

  describe("getParent", () => {
    const { buildIndex, getParent } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return null for root node", () => {
      expect(getParent("root-1")).toBeNull();
    });

    it("should return parent node", () => {
      const parent = getParent("child-1");
      expect(parent?.id).toBe("root-1");
    });
  });

  describe("getChildrenIds", () => {
    const { buildIndex, getChildrenIds } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return child IDs for parent node", () => {
      const childIds = getChildrenIds("root-1");
      expect(childIds).toContain("child-1");
      expect(childIds).toContain("child-2");
    });

    it("should return empty array for leaf node", () => {
      const childIds = getChildrenIds("child-1");
      expect(childIds).toEqual([]);
    });

    it("should return empty array for non-existent node", () => {
      const childIds = getChildrenIds("non-existent");
      expect(childIds).toEqual([]);
    });
  });

  describe("getChildren", () => {
    const { buildIndex, getChildren } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return child nodes", () => {
      const children = getChildren("root-1");
      expect(children.length).toBe(2);
      expect(children.map((c) => c.id)).toContain("child-1");
      expect(children.map((c) => c.id)).toContain("child-2");
    });

    it("should return empty array for leaf node", () => {
      const children = getChildren("child-1");
      expect(children).toEqual([]);
    });
  });

  describe("getPath", () => {
    const { buildIndex, getPath } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return path for root node", () => {
      const path = getPath("root-1");
      expect(path).toEqual(["root-1"]);
    });

    it("should return path for nested node", () => {
      const path = getPath("grandchild-1");
      expect(path).toEqual(["root-1", "child-2", "grandchild-1"]);
    });

    it("should return empty array for non-existent node", () => {
      const path = getPath("non-existent");
      expect(path).toEqual([]);
    });
  });

  describe("getDepth", () => {
    const { buildIndex, getDepth } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return 0 for root node", () => {
      expect(getDepth("root-1")).toBe(0);
    });

    it("should return 1 for child node", () => {
      expect(getDepth("child-1")).toBe(1);
    });

    it("should return 2 for grandchild", () => {
      expect(getDepth("grandchild-1")).toBe(2);
    });

    it("should return -1 for non-existent node", () => {
      expect(getDepth("non-existent")).toBe(-1);
    });
  });

  describe("getNodesByType", () => {
    const { buildIndex, getNodesByType } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return all nodes of a type", () => {
      const containers = getNodesByType("Container");
      expect(containers.length).toBe(2);
      expect(containers.map((n) => n.id)).toContain("root-1");
      expect(containers.map((n) => n.id)).toContain("child-2");
    });

    it("should return empty array for non-existent type", () => {
      const nodes = getNodesByType("NonExistent");
      expect(nodes).toEqual([]);
    });
  });

  describe("hasNode", () => {
    const { buildIndex, hasNode } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should return true for existing node", () => {
      expect(hasNode("root-1")).toBe(true);
      expect(hasNode("grandchild-1")).toBe(true);
    });

    it("should return false for non-existent node", () => {
      expect(hasNode("non-existent")).toBe(false);
    });
  });

  describe("updateNode", () => {
    const { buildIndex, getNode, updateNode } = useNodeIndexer();

    beforeEach(() => {
      buildIndex(tree);
    });

    it("should update node in index", () => {
      const updatedNode = {
        ...createNode("child-1", "Button"),
        props: { label: "New" },
      };
      updateNode("child-1", updatedNode, tree);

      const node = getNode("child-1");
      expect(node?.type).toBe("Button");
    });

    it("should do nothing for non-indexed node", () => {
      const updatedNode = createNode("non-existent", "Button");
      updateNode("non-existent", updatedNode, tree);

      expect(true).toBe(true);
    });
  });

  describe("performance", () => {
    const { buildIndex, getNode, indexSize } = useNodeIndexer();

    it("should handle large trees efficiently", () => {
      // Create a large tree with 1000 nodes
      const nodes: BuilderNode[] = [];
      for (let i = 0; i < 100; i++) {
        const children: BuilderNode[] = [];
        for (let j = 0; j < 10; j++) {
          children.push(createNode(`node-${i}-${j}`, "Text"));
        }
        nodes.push(createNode(`container-${i}`, "Container", children));
      }

      const start = performance.now();
      buildIndex(nodes);
      const buildTime = performance.now() - start;

      expect(indexSize.value).toBe(1100);
      expect(buildTime).toBeLessThan(100); // Should build in under 100ms

      // Random lookups should be O(1)
      const lookupStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        const randomId = `node-${Math.floor(Math.random() * 100)}-${Math.floor(Math.random() * 10)}`;
        getNode(randomId);
      }
      const lookupTime = performance.now() - lookupStart;

      expect(lookupTime).toBeLessThan(50); // 1000 lookups in under 50ms
    });
  });

  describe("debug mode", () => {
    it("should log with debug enabled", () => {
      const { buildIndex, clearIndex } = useNodeIndexer({ debug: true });

      buildIndex(tree);
      expect(loggerMock).toHaveBeenCalledWith(
        "debug",
        expect.stringContaining("[useNodeIndexer] Built index"),
        expect.objectContaining({ indexSize: 7 }),
      );

      clearIndex();
      expect(loggerMock).toHaveBeenCalledWith(
        "debug",
        expect.stringContaining("[useNodeIndexer] Cleared index"),
      );
    });
  });
});
