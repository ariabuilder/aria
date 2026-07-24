/**
 * Tests the useTreeSorting composable for drag-drop reordering operations.
 */

import { describe, it, expect } from "vitest";
import type { BuilderNode, JsonObject } from "../../../lib/types/nodes";
import { useTreeSorting } from "../../../admin/features/Layers/composables/useTreeSorting";

describe("useTreeSorting", () => {
  const createNode = (
    id: string,
    type: string,
    props: JsonObject = {},
    children: BuilderNode[] = [],
  ): BuilderNode => ({
    id,
    type,
    props,
    styles: {},
    children,
  });

  describe("calculateInsertionIndex", () => {
    const { calculateInsertionIndex } = useTreeSorting();

    it("should calculate before index", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Container"),
        createNode("3", "Container"),
      ];

      expect(calculateInsertionIndex(nodes, "1", "before")).toBe(0);
    });

    it("should calculate after index", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Container"),
        createNode("3", "Container"),
      ];

      expect(calculateInsertionIndex(nodes, "1", "after")).toBe(1);
    });

    it("should append to end when target not found", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Container"),
      ];

      expect(calculateInsertionIndex(nodes, "non-existent", "before")).toBe(2);
    });
  });

  describe("extractNode", () => {
    const { extractNode } = useTreeSorting();

    it("should extract node from tree", () => {
      const tree = [
        createNode("1", "Container", {}, [
          createNode("2", "Text"),
          createNode("3", "Container"),
        ]),
      ];

      const { node, tree: nextTree } = extractNode(tree, "2");

      expect(node?.id).toBe("2");
      expect(nextTree[0].children.map((n) => n.id)).toEqual(["3"]);
    });

    it("should return null node when not found", () => {
      const tree = [createNode("1", "Container")];

      const { node } = extractNode(tree, "non-existent");

      expect(node).toBeNull();
    });

    it("should extract from nested tree", () => {
      const tree = [
        createNode("1", "Container", {}, [
          createNode("2", "Container", {}, [createNode("3", "Text")]),
        ]),
      ];

      const { node, tree: nextTree } = extractNode(tree, "3");

      expect(node?.id).toBe("3");
      expect(nextTree[0].children[0].children.map((n) => n.id)).toEqual([]);
    });

    it("should remove root node", () => {
      const tree = [createNode("1", "Container")];

      const { tree: nextTree } = extractNode(tree, "1");

      expect(nextTree).toHaveLength(0);
    });
  });

  describe("insertNode", () => {
    const { insertNode } = useTreeSorting();

    it("should insert at root level", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("3", "Container"),
      ];
      const nodeToInsert = createNode("2", "Text");

      const result = insertNode(nodes, nodeToInsert, null, 1);

      expect(result.map((n) => n.id)).toEqual(["1", "2", "3"]);
    });

    it("should insert as child of parent", () => {
      const parent = createNode("1", "Container", {}, [
        createNode("2", "Text"),
      ]);
      const nodeToInsert = createNode("3", "Heading");

      const result = insertNode([parent], nodeToInsert, "1", 1);

      expect(result[0].children?.map((n) => n.id)).toEqual(["2", "3"]);
    });

    it("should insert into nested parent", () => {
      const tree = [
        createNode("1", "Container", {}, [
          createNode("2", "Container", {}, [createNode("3", "Text")]),
        ]),
      ];
      const nodeToInsert = createNode("4", "Heading");

      const result = insertNode(tree, nodeToInsert, "2", 0);

      expect(
        (result[0].children?.[0] as BuilderNode).children?.map((n) => n.id),
      ).toEqual(["4", "3"]);
    });

    it("should append to end when parent not found", () => {
      const nodes = [createNode("1", "Container")];
      const nodeToInsert = createNode("2", "Text");

      const result = insertNode(nodes, nodeToInsert, "non-existent", 0);

      expect(result.map((n) => n.id)).toEqual(["1"]);
    });
  });

  describe("reorderNodes", () => {
    const { reorderNodes } = useTreeSorting();

    it("should reorder within same level", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Text"),
        createNode("3", "Heading"),
      ];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "3",
        targetNodeId: "1",
        position: "after",
      });

      expect(result.success).toBe(true);
      expect(result.newTree.map((n) => n.id)).toEqual(["1", "3", "2"]);
    });

    it("should move node before target", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Text"),
        createNode("3", "Heading"),
      ];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "3",
        targetNodeId: "1",
        position: "before",
      });

      expect(result.success).toBe(true);
      expect(result.newTree.map((n) => n.id)).toEqual(["3", "1", "2"]);
    });

    it("should nest node inside target", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Container"),
      ];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "inside",
      });

      expect(result.success).toBe(true);
      expect(result.newTree).toHaveLength(1);
      expect(result.newTree[0].id).toBe("2");
      expect(result.newTree[0].children?.map((n) => n.id)).toEqual(["1"]);
    });

    it("should fail when dragged node not found", () => {
      const nodes = [createNode("1", "Container")];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "non-existent",
        targetNodeId: "1",
        position: "before",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Dragged node not found");
    });

    it("should fail when target node not found", () => {
      const nodes = [createNode("1", "Container")];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "1",
        targetNodeId: "non-existent",
        position: "before",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Target node not found");
    });

    it("should handle nested reordering", () => {
      let current: BuilderNode = createNode("leaf", "Text");
      for (let i = 1; i <= 4; i++) {
        current = createNode(String(i), "Container", {}, [current]);
      }
      const nodes = [current];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "leaf",
        targetNodeId: "1",
        position: "inside",
      });

      expect(result.success).toBe(true);
      expect(
        result.newTree[0].children?.[0].children?.[0].children?.[0]
          .children?.[0].id,
      ).toBe("leaf");
    });
  });

  describe("createDragOperation", () => {
    const { createDragOperation } = useTreeSorting();

    it("should create drag operation object", () => {
      const operation = createDragOperation({
        draggedNodeId: "1",
        sourceParentId: null,
        sourceIndex: 0,
        targetNodeId: "1",
        targetParentId: null,
        targetIndex: 0,
        position: "before",
      });

      expect(operation.draggedNodeId).toBe("1");
      expect(operation.targetSiblingId).toBe("1");
      expect(operation.position).toBe("before");
    });

    it("should handle null parent IDs", () => {
      const operation = createDragOperation({
        draggedNodeId: "1",
        targetNodeId: "1",
        position: "before",
        sourceParentId: null,
        sourceIndex: 0,
        targetParentId: null,
        targetIndex: 0,
      });

      expect(operation.sourceParentId).toBeNull();
    });
  });

  describe("edge cases", () => {
    const { reorderNodes } = useTreeSorting();

    it("should handle empty tree", () => {
      const result = reorderNodes({
        nodes: [],
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "before",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Dragged node not found");
    });

    it("should handle single node tree", () => {
      const nodes = [createNode("1", "Container")];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "1",
        targetNodeId: "1",
        position: "before",
      });

      expect(result.success).toBe(false);
    });

    it("should handle deep nesting", () => {
      let current: BuilderNode = createNode("leaf", "Text");
      for (let i = 4; i >= 1; i--) {
        current = createNode(String(i), "Container", {}, [current]);
      }
      const nodes = [current];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "leaf",
        targetNodeId: "1",
        position: "inside",
      });

      expect(result.success).toBe(true);
      // leaf should now be child of 1
      expect(result.newTree[0].children).toHaveLength(2);
      expect(result.newTree[0].children?.[1].id).toBe("leaf");
    });

    it("should preserve node data during move", () => {
      const nodes = [
        createNode("1", "Container"),
        createNode("2", "Text", { content: "Hello" }),
      ];

      const result = reorderNodes({
        nodes,
        draggedNodeId: "2",
        targetNodeId: "1",
        position: "after",
      });

      expect(result.success).toBe(true);
      // After reordering, 2 should be after 1
      expect(result.newTree[0].id).toBe("1");
      expect(result.newTree[1].id).toBe("2");
      // Verify the node data is preserved
      const movedNode = result.newTree.find((n) => n.id === "2");
      expect(movedNode?.props).toEqual({ content: "Hello" });
    });
  });
});
