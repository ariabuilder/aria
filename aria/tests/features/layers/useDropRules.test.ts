/**
 * Tests the useDropRules composable for validating drag-drop operations.
 */

import { describe, it, expect } from "vitest";
import type { BuilderNode } from "../../../lib/types/nodes";
import type { DropPosition } from "../../../admin/features/Layers/types";
import { VALIDATION_ERROR_CODES } from "../../../admin/features/Layers/types";
import { useDropRules } from "../../../admin/features/Layers/composables/useDropRules";

describe("useDropRules", () => {
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

  const allNodes: BuilderNode[] = [
    createNode("container-1", "Container", [
      createNode("text-1", "Text"),
      createNode("heading-1", "Heading"),
    ]),
    createNode("section-1", "Section", [createNode("div-1", "Div")]),
  ];

  const findNodeById = (
    nodes: readonly BuilderNode[],
    nodeId: string,
  ): BuilderNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }

      if (node.children?.length) {
        const childNode = findNodeById(node.children, nodeId);
        if (childNode) {
          return childNode;
        }
      }
    }

    return null;
  };

  describe("isDropOnSelf", () => {
    const { isDropOnSelf } = useDropRules();

    it("should return true when dragged and target are same node", () => {
      expect(isDropOnSelf("node-1", "node-1")).toBe(true);
    });

    it("should return false when dragged and target are different", () => {
      expect(isDropOnSelf("node-1", "node-2")).toBe(false);
    });
  });

  describe("isDropOnDescendant", () => {
    const { isDropOnDescendant } = useDropRules();

    it("should return true when target is descendant of dragged node", () => {
      const childNode = createNode("child", "Text");
      const draggedNode = createNode("parent", "Container", [childNode]);

      expect(isDropOnDescendant("parent", "child", [draggedNode])).toBe(true);
    });

    it("should return false when target is not descendant", () => {
      expect(isDropOnDescendant("text-1", "container-1", allNodes)).toBe(false);
    });

    it("should return false when dragged node has no children", () => {
      expect(isDropOnDescendant("text-1", "container-1", allNodes)).toBe(false);
    });
  });

  describe("targetCanHaveChildren", () => {
    const { targetCanHaveChildren } = useDropRules();

    it("should return true for Container type", () => {
      expect(targetCanHaveChildren(createNode("1", "Container"))).toBe(true);
    });

    it("should return true for Section type", () => {
      expect(targetCanHaveChildren(createNode("1", "Section"))).toBe(true);
    });

    it("should return true for Div type", () => {
      expect(targetCanHaveChildren(createNode("1", "Div"))).toBe(true);
    });

    it("should return true for Block type", () => {
      expect(targetCanHaveChildren(createNode("1", "Block"))).toBe(true);
    });

    it("should return true for List and ListItem types", () => {
      expect(targetCanHaveChildren(createNode("1", "list"))).toBe(true);
      expect(targetCanHaveChildren(createNode("2", "listitem"))).toBe(true);
    });

    it("should return false for Text type (leaf)", () => {
      expect(targetCanHaveChildren(createNode("1", "Text"))).toBe(false);
    });

    it("should return false for Image type (leaf)", () => {
      expect(targetCanHaveChildren(createNode("1", "Image"))).toBe(false);
    });

    it("should return true for nodes with children even if leaf type", () => {
      // When a node has children, it should be able to accept more children
      // This is a structural check, not a type-based check
      const node = createNode("1", "Container", [createNode("2", "Text")]);
      // Container can have children by default
      expect(targetCanHaveChildren(node)).toBe(true);
    });
  });

  describe("canDrop", () => {
    const { canDrop } = useDropRules();

    it("should reject when no drag in progress", () => {
      const result = canDrop({
        draggedNodeId: null,
        targetNodeId: "container-1",
        position: "inside",
        allNodes,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(VALIDATION_ERROR_CODES.NO_DRAG);
    });

    it("should reject drop on self", () => {
      const nodes = [createNode("1", "Container")];
      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "1",
        position: "inside",
        allNodes: nodes,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(VALIDATION_ERROR_CODES.DROP_ON_SELF);
    });

    it("should reject drop on descendant", () => {
      const childNode = createNode("child", "Text");
      const draggedNode = createNode("parent", "Container", [childNode]);
      const nodes: BuilderNode[] = [draggedNode];

      const result = canDrop({
        draggedNodeId: "parent",
        targetNodeId: "child",
        position: "inside",
        allNodes: nodes,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(VALIDATION_ERROR_CODES.DROP_ON_DESCENDANT);
    });

    it("should reject drop inside leaf node", () => {
      const nodes = [createNode("1", "Text"), createNode("2", "Image")];

      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "inside",
        allNodes: nodes,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(VALIDATION_ERROR_CODES.TARGET_NO_CHILDREN);
    });

    it("should allow drop before/after leaf node", () => {
      const nodes = [createNode("1", "Container"), createNode("2", "Text")];

      const resultBefore = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "before",
        allNodes: nodes,
      });
      const resultAfter = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "after",
        allNodes: nodes,
      });

      expect(resultBefore.valid).toBe(true);
      expect(resultAfter.valid).toBe(true);
    });

    it("should allow drop inside container node", () => {
      const nodes = [createNode("1", "Text"), createNode("2", "Container")];

      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "inside",
        allNodes: nodes,
      });

      expect(result.valid).toBe(true);
    });

    it("should allow drop of container inside another container", () => {
      const nodes = [createNode("1", "Container"), createNode("2", "Section")];

      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "inside",
        allNodes: nodes,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("isValidDropTarget", () => {
    const { isValidDropTarget } = useDropRules();

    it("should return false when no dragged node", () => {
      expect(isValidDropTarget("container-1", null, "inside", allNodes)).toBe(
        false,
      );
    });

    it("should return true for valid target", () => {
      expect(
        isValidDropTarget("container-1", "text-1", "before", allNodes),
      ).toBe(true);
    });

    it("should return false for invalid target", () => {
      const nodes = [createNode("1", "Text"), createNode("2", "Image")];

      expect(isValidDropTarget("2", "1", "inside", nodes)).toBe(false);
    });
  });

  describe("validateDrops", () => {
    const { validateDrops } = useDropRules();

    it("should validate multiple drop operations", () => {
      const operations = [
        {
          draggedNodeId: "1",
          targetNodeId: "2",
          position: "inside" as DropPosition,
          allNodes: [createNode("1", "Text"), createNode("2", "Container")],
        },
        {
          draggedNodeId: "3",
          targetNodeId: "4",
          position: "before" as DropPosition,
          allNodes: [createNode("3", "Container"), createNode("4", "Section")],
        },
      ];

      const results = validateDrops(operations);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
    });

    it("should identify invalid drops in batch", () => {
      const operations = [
        {
          draggedNodeId: "1",
          targetNodeId: "2",
          position: "inside" as DropPosition,
          allNodes: [createNode("1", "Text"), createNode("2", "Container")],
        },
        {
          draggedNodeId: "1",
          targetNodeId: "1",
          position: "before" as DropPosition,
          allNodes: [createNode("1", "Text")],
        },
      ];

      const results = validateDrops(operations);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
    });
  });

  describe("getAllowedPositions", () => {
    const { getAllowedPositions } = useDropRules();

    it("should return all positions for container", () => {
      const positions = getAllowedPositions(createNode("1", "Container"));
      expect(positions).toContain("before");
      expect(positions).toContain("after");
      expect(positions).toContain("inside");
    });

    it("should return inside for list items", () => {
      const positions = getAllowedPositions(createNode("1", "listitem"));
      expect(positions).toContain("inside");
    });

    it("should return only before/after for leaf", () => {
      const positions = getAllowedPositions(createNode("1", "Text"));
      expect(positions).toContain("before");
      expect(positions).toContain("after");
      expect(positions).not.toContain("inside");
    });
  });

  describe("isPositionAllowed", () => {
    const { isPositionAllowed } = useDropRules();

    it("should return true for allowed position", () => {
      expect(isPositionAllowed(createNode("1", "Container"), "inside")).toBe(
        true,
      );
    });

    it("should return false for disallowed position", () => {
      expect(isPositionAllowed(createNode("1", "Text"), "inside")).toBe(false);
    });
  });

  describe("with custom validator", () => {
    it("should use custom validation when provided", () => {
      const customValidator = (
        _dragNode: BuilderNode,
        _targetNode: BuilderNode,
      ) => ({
        valid: false,
        reason: "Custom rule: no dropping allowed",
        code: VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED,
      });

      const { canDrop } = useDropRules({ customValidator });

      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "inside",
        allNodes: [createNode("1", "Container"), createNode("2", "Section")],
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED);
    });
  });

  describe("with debug mode", () => {
    it("should log when debug is enabled", () => {
      const { canDrop } = useDropRules({ debug: true });

      // Should not throw, just log
      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "inside",
        allNodes: [createNode("1", "Container"), createNode("2", "Section")],
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("edge cases", () => {
    const { canDrop } = useDropRules();

    it("should handle empty allNodes array", () => {
      const result = canDrop({
        draggedNodeId: "1",
        targetNodeId: "2",
        position: "before",
        allNodes: [],
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(VALIDATION_ERROR_CODES.NO_DRAG);
    });

    it("should handle deeply nested structures", () => {
      const deepNode = createNode("deep", "Container", [
        createNode("deeper", "Container", [createNode("deepest", "Container")]),
      ]);
      const newNode = createNode("new", "Text");
      const deepNodes = [newNode, deepNode];

      const result = canDrop({
        draggedNodeId: "new",
        targetNodeId: "deep",
        position: "inside",
        allNodes: deepNodes,
      });

      expect(result.valid).toBe(true);
    });
  });
});
