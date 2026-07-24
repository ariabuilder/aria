/**
 * Tests tree traversal, search, and manipulation helper functions. These are
 * pure functions that should be fully testable without Vue.
 */

import { describe, it, expect } from "vitest";
import type { BuilderNode, JsonObject } from "../../../lib/types/nodes";
import {
  traverseNodes,
  findNodeById,
  findParentNode,
  getNodePath,
  getNodeDepth,
  isAncestor,
  isDescendant,
  getDescendantIds,
  collectAllNodeIds,

  isLeafNodeType,
  isContainerNodeType,
  canHaveChildren,
  hasChildren,
  isComponentInstance,
  getNodeLabel,

  countNodes,
  countNodesByType,
  getMaxDepth,

  cloneNodeTree,
  removeNodeById,
  updateNodeById,

  findDuplicateIds,
  validateNodeIds,
} from "../../../admin/features/Layers/utils/nodeHelpers";

function createNode(
  id: string,
  type: string,
  props: JsonObject = {},
  children: BuilderNode[] = [],
): BuilderNode {
  return {
    id,
    type,
    props,
    styles: {},
    children,
  };
}

describe("nodeHelpers - Tree Traversal", () => {
  const tree: BuilderNode[] = [
    createNode("root-1", "Container", {}, [
      createNode("child-1", "Text", { content: "Child 1" }),
      createNode("child-2", "Container", {}, [
        createNode("grandchild-1", "Heading", {
          level: 2,
          content: "Grandchild",
        }),
      ]),
    ]),
    createNode("root-2", "Section"),
  ];

  describe("traverseNodes", () => {
    it("should visit all nodes in the tree", () => {
      const visited: string[] = [];
      traverseNodes(tree, (node) => visited.push(node.id));
      expect(visited).toEqual([
        "root-1",
        "child-1",
        "child-2",
        "grandchild-1",
        "root-2",
      ]);
    });

    it("should provide correct path for each node", () => {
      const paths: Map<string, string[]> = new Map();
      traverseNodes(tree, (node, path) => paths.set(node.id, [...path]));

      expect(paths.get("root-1")).toEqual(["root-1"]);
      expect(paths.get("child-1")).toEqual(["root-1", "child-1"]);
      expect(paths.get("grandchild-1")).toEqual([
        "root-1",
        "child-2",
        "grandchild-1",
      ]);
    });

    it("should provide correct depth for each node", () => {
      const depths: Map<string, number> = new Map();
      traverseNodes(tree, (_, __, depth) =>
        depths.set(depth.toString(), depth),
      );

      expect(depths.get("0")).toBe(0);
      // child-1 and child-2
      expect(depths.get("1")).toBe(1);
      // grandchild-1
      expect(depths.get("2")).toBe(2);
    });
  });

  describe("findNodeById", () => {
    it("should find root node", () => {
      const result = findNodeById(tree, "root-1");
      expect(result?.id).toBe("root-1");
    });

    it("should find nested child node", () => {
      const result = findNodeById(tree, "grandchild-1");
      expect(result?.id).toBe("grandchild-1");
      expect(result?.type).toBe("Heading");
    });

    it("should return null for non-existent node", () => {
      const result = findNodeById(tree, "non-existent");
      expect(result).toBeNull();
    });

    it("should return first match when duplicates exist", () => {
      const treeWithDuplicates: BuilderNode[] = [
        createNode("same", "Text"),
        createNode("same", "Text"),
      ];
      const result = findNodeById(treeWithDuplicates, "same");
      expect(result).not.toBeNull();
    });
  });

  describe("findParentNode", () => {
    it("should return null for root node", () => {
      const result = findParentNode(tree, "root-1");
      expect(result).toBeNull();
    });

    it("should find parent of child node", () => {
      const result = findParentNode(tree, "child-1");
      expect(result?.id).toBe("root-1");
    });

    it("should find parent of deeply nested node", () => {
      const result = findParentNode(tree, "grandchild-1");
      expect(result?.id).toBe("child-2");
    });

    it("should return null for non-existent node", () => {
      const result = findParentNode(tree, "non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getNodePath", () => {
    it("should return path for root node", () => {
      const path = getNodePath(tree, "root-1");
      expect(path).toEqual(["root-1"]);
    });

    it("should return full path for nested node", () => {
      const path = getNodePath(tree, "grandchild-1");
      expect(path).toEqual(["root-1", "child-2", "grandchild-1"]);
    });

    it("should return empty array for non-existent node", () => {
      const path = getNodePath(tree, "non-existent");
      expect(path).toEqual([]);
    });
  });

  describe("getNodeDepth", () => {
    it("should return 0 for root node", () => {
      const depth = getNodeDepth(tree, "root-1");
      expect(depth).toBe(0);
    });

    it("should return 1 for child node", () => {
      const depth = getNodeDepth(tree, "child-1");
      expect(depth).toBe(1);
    });

    it("should return 2 for grandchild node", () => {
      const depth = getNodeDepth(tree, "grandchild-1");
      expect(depth).toBe(2);
    });

    it("should return -1 for non-existent node", () => {
      const depth = getNodeDepth(tree, "non-existent");
      expect(depth).toBe(-1);
    });
  });

  describe("isAncestor", () => {
    it("should return true when ancestorId is ancestor of descendantId", () => {
      expect(isAncestor(tree, "root-1", "grandchild-1")).toBe(true);
      expect(isAncestor(tree, "child-2", "grandchild-1")).toBe(true);
    });

    it("should return false when ancestorId is not ancestor", () => {
      expect(isAncestor(tree, "child-1", "grandchild-1")).toBe(false);
      expect(isAncestor(tree, "root-2", "grandchild-1")).toBe(false);
    });

    it("should return false for same node", () => {
      // A node is not considered its own ancestor
      expect(isAncestor(tree, "root-1", "root-1")).toBe(false);
    });

    it("should return false when ancestorId is not ancestor", () => {
      expect(isAncestor(tree, "child-1", "root-1")).toBe(false);
    });
  });

  describe("isDescendant", () => {
    it("should return true when descendantId is descendant of ancestorId", () => {
      expect(isDescendant(tree, "grandchild-1", "root-1")).toBe(true);
      expect(isDescendant(tree, "grandchild-1", "child-2")).toBe(true);
    });

    it("should return false when not descendant", () => {
      expect(isDescendant(tree, "child-1", "child-2")).toBe(false);
    });
  });

  describe("getDescendantIds", () => {
    it("should return all descendant IDs", () => {
      const descendants = getDescendantIds(tree[0]);
      expect(descendants).toEqual(
        new Set(["child-1", "child-2", "grandchild-1"]),
      );
    });

    it("should return empty set for leaf node", () => {
      const descendants = getDescendantIds({
        ...createNode("leaf", "Text"),
      });
      expect(descendants.size).toBe(0);
    });
  });

  describe("collectAllNodeIds", () => {
    it("should collect all node IDs in tree", () => {
      const allIds = collectAllNodeIds(tree);
      expect(allIds).toEqual(
        new Set(["root-1", "child-1", "child-2", "grandchild-1", "root-2"]),
      );
    });

    it("should return empty set for empty tree", () => {
      const allIds = collectAllNodeIds([]);
      expect(allIds.size).toBe(0);
    });
  });
});

describe("nodeHelpers - Type Helpers", () => {
  describe("isLeafNodeType", () => {
    it("should return true for leaf node types", () => {
      expect(isLeafNodeType("Image")).toBe(true);
      expect(isLeafNodeType("Icon")).toBe(true);
      expect(isLeafNodeType("Text")).toBe(true);
      expect(isLeafNodeType("Input")).toBe(true);
      expect(isLeafNodeType("Link")).toBe(true);
    });

    it("should return false for container node types", () => {
      expect(isLeafNodeType("Container")).toBe(false);
      expect(isLeafNodeType("Section")).toBe(false);
      expect(isLeafNodeType("Div")).toBe(false);
      expect(isLeafNodeType("Component")).toBe(false);
    });

    it("should return false for unknown types", () => {
      expect(isLeafNodeType("CustomType")).toBe(false);
    });
  });

  describe("isContainerNodeType", () => {
    it("should return true for container node types", () => {
      expect(isContainerNodeType("Container")).toBe(true);
      expect(isContainerNodeType("Section")).toBe(true);
      expect(isContainerNodeType("Div")).toBe(true);
      expect(isContainerNodeType("Block")).toBe(true);
      expect(isContainerNodeType("Layout")).toBe(true);
      expect(isContainerNodeType("Component")).toBe(true);
    });

    it("should return true for list node types", () => {
      expect(isContainerNodeType("list")).toBe(true);
      expect(isContainerNodeType("ListItem")).toBe(true);
    });

    it("should return false for leaf node types", () => {
      expect(isContainerNodeType("Image")).toBe(false);
      expect(isContainerNodeType("Text")).toBe(false);
    });
  });

  describe("canHaveChildren", () => {
    it("should return true for container types", () => {
      expect(canHaveChildren(createNode("1", "Container"))).toBe(true);
    });

    it("should return true for nodes with children", () => {
      expect(
        canHaveChildren({
          ...createNode("1", "Image", {}, [createNode("2", "Text")]),
        }),
      ).toBe(true);
    });

    it("should return false for leaf types without children", () => {
      expect(canHaveChildren(createNode("1", "Image"))).toBe(false);
    });
  });

  describe("hasChildren", () => {
    it("should return true when children array exists and has length", () => {
      expect(
        hasChildren({
          ...createNode("1", "Container"),
          children: [{} as BuilderNode],
        }),
      ).toBe(true);
    });

    it("should return false for empty children", () => {
      expect(hasChildren(createNode("1", "Container"))).toBe(false);
    });

    it("should return false when children is undefined", () => {
      expect(
        hasChildren({
          id: "1",
          type: "Container",
          props: {},
          styles: {},
        } as BuilderNode),
      ).toBe(false);
    });
  });

  describe("isComponentInstance", () => {
    it("should return true for Component type with componentRef", () => {
      expect(
        isComponentInstance({
          ...createNode("1", "Component"),
          componentRef: "my-component",
        }),
      ).toBe(true);
    });

    it("should return false for Component type without componentRef", () => {
      expect(
        isComponentInstance({
          ...createNode("1", "Component"),
        }),
      ).toBe(false);
    });

    it("should return false for non-Component types", () => {
      expect(
        isComponentInstance({
          ...createNode("1", "Container"),
        }),
      ).toBe(false);
    });
  });

  describe("getNodeLabel", () => {
    it("should return metadata.label when present", () => {
      const node: BuilderNode = {
        ...createNode("1", "Container"),
        metadata: { label: "Custom Label" },
      };
      expect(getNodeLabel(node)).toBe("Custom Label");
    });

    it("should return componentRef for component instances", () => {
      const node: BuilderNode = {
        ...createNode("1", "Component"),
        componentRef: "header-component",
      };
      expect(getNodeLabel(node)).toBe("<header-component>");
    });

    it("should return truncated text content for Text nodes", () => {
      const node: BuilderNode = {
        ...createNode("1", "Text", {
          text: "This is a very long text that should be truncated",
        }),
      };
      expect(getNodeLabel(node)).toBe("This is a very long text that ...");
    });

    it("should keep code nodes labeled as Code", () => {
      const node: BuilderNode = {
        ...createNode("1", "Code", {
          content: "<script>console.log('hi')</script>",
        }),
      };
      expect(getNodeLabel(node)).toBe("Code");
    });

    it("should label svg nodes as SVG instead of inner markup", () => {
      const node: BuilderNode = {
        ...createNode("1", "svg", {
          content: '<circle cx="12" cy="12" r="9"></circle>',
        }),
      };
      expect(getNodeLabel(node)).toBe("SVG");
    });

    it("should return type as fallback", () => {
      const node: BuilderNode = {
        ...createNode("1", "CustomType"),
      };
      expect(getNodeLabel(node)).toBe("CustomType");
    });

    it("should return friendly labels for lists and list items", () => {
      expect(getNodeLabel(createNode("1", "list"))).toBe("List");
      expect(getNodeLabel(createNode("2", "listitem"))).toBe("List item");
    });

    it("should use lower-case text content labels when available", () => {
      const node: BuilderNode = {
        ...createNode("1", "text", {
          content: "List item body",
        }),
      };

      expect(getNodeLabel(node)).toBe("List item body");
    });
  });
});

describe("nodeHelpers - Statistics", () => {
  const tree: BuilderNode[] = [
    createNode("1", "Container", {}, [
      createNode("2", "Text"),
      createNode("3", "Heading"),
      createNode("4", "Container"),
    ]),
    createNode("5", "Section"),
  ];

  describe("countNodes", () => {
    it("should count all nodes in tree", () => {
      expect(countNodes(tree)).toBe(5);
    });

    it("should return 0 for empty tree", () => {
      expect(countNodes([])).toBe(0);
    });
  });

  describe("countNodesByType", () => {
    it("should return counts grouped by type", () => {
      const counts = countNodesByType(tree);
      expect(counts).toContainEqual({ type: "Container", count: 2 });
      expect(counts).toContainEqual({ type: "Text", count: 1 });
      expect(counts).toContainEqual({ type: "Heading", count: 1 });
      expect(counts).toContainEqual({ type: "Section", count: 1 });
    });

    it("should sort by count descending", () => {
      const counts = countNodesByType(tree);
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i].count).toBeGreaterThanOrEqual(counts[i + 1].count);
      }
    });
  });

  describe("getMaxDepth", () => {
    it("should return 0 for single root node", () => {
      expect(getMaxDepth([createNode("1", "Container")])).toBe(0);
    });

    it("should return 1 for tree with children", () => {
      expect(
        getMaxDepth([
          createNode("1", "Container", {}, [createNode("2", "Text")]),
        ]),
      ).toBe(1);
    });

    it("should return 2 for tree with grandchildren", () => {
      const testTree: BuilderNode[] = [
        createNode("root-1", "Container", {}, [
          createNode("child-1", "Text"),
          createNode("child-2", "Container", {}, [
            createNode("grandchild-1", "Heading"),
          ]),
        ]),
      ];
      expect(getMaxDepth(testTree)).toBe(2);
    });
  });
});

describe("nodeHelpers - Tree Manipulation", () => {
  const tree: BuilderNode[] = [
    createNode("root-1", "Container", {}, [
      createNode("child-1", "Text", { content: "Child 1" }),
      createNode("child-2", "Container", {}, [
        createNode("grandchild-1", "Heading", { level: 2 }),
      ]),
    ]),
  ];

  describe("cloneNodeTree", () => {
    it("should create deep clone of tree", () => {
      const cloned = cloneNodeTree(tree);

      expect(cloned[0].id).toBe(tree[0].id);
      expect(cloned[0].children[0].id).toBe(tree[0].children[0].id);

      // Modify original - should not affect clone
      tree[0].children[0] = {
        ...tree[0].children[0],
        id: "modified",
      };
      expect(cloned[0].children[0].id).toBe("child-1");
    });

    it("should handle nested structures", () => {
      const cloned = cloneNodeTree(tree);
      expect(cloned[0].children[1].children[0].id).toBe("grandchild-1");
    });
  });

  describe("removeNodeById", () => {
    const testTree = cloneNodeTree(tree);

    it("should remove leaf node", () => {
      const result = removeNodeById(testTree, "child-1");
      expect(result[0].children?.length).toBe(1);
      expect(result[0].children?.[0].id).toBe("child-2");
    });

    it("should remove nested node", () => {
      const result = removeNodeById(testTree, "grandchild-1");
      expect(result[0].children[1].children?.length).toBe(0);
    });

    it("should remove root node", () => {
      const result = removeNodeById(testTree, "root-1");
      expect(result.length).toBe(0);
    });

    it("should return original tree when node not found", () => {
      const result = removeNodeById(testTree, "non-existent");
      expect(result).toEqual(testTree);
    });
  });

  describe("updateNodeById", () => {
    const testTree = cloneNodeTree(tree);

    it("should update node properties", () => {
      const result = updateNodeById(testTree, "child-1", (node) => ({
        ...node,
        props: { ...node.props, content: "Updated" },
      }));

      expect((result[0].children?.[0] as BuilderNode).props.content).toBe(
        "Updated",
      );
    });

    it("should update nested node", () => {
      const result = updateNodeById(testTree, "grandchild-1", (node) => ({
        ...node,
        props: { ...node.props, level: 3 },
      }));

      const nestedNode = (result[0].children?.[1] as BuilderNode)
        .children?.[0] as BuilderNode;
      expect(nestedNode.props.level).toBe(3);
    });

    it("should not modify other nodes", () => {
      const result = updateNodeById(testTree, "child-1", (node) => ({
        ...node,
        props: { ...node.props, updated: true },
      }));

      expect((result[0].children?.[1] as BuilderNode).id).toBe("child-2");
    });
  });
});

describe("nodeHelpers - Validation", () => {
  describe("findDuplicateIds", () => {
    it("should return empty array when no duplicates", () => {
      const tree: BuilderNode[] = [
        createNode("1", "Container"),
        createNode("2", "Text"),
      ];
      expect(findDuplicateIds(tree)).toEqual([]);
    });

    it("should find duplicate IDs", () => {
      const tree: BuilderNode[] = [
        createNode("duplicate", "Container"),
        createNode("2", "Text"),
        createNode("duplicate", "Text"),
      ];
      expect(findDuplicateIds(tree)).toEqual(["duplicate"]);
    });

    it("should find multiple duplicate IDs", () => {
      const tree: BuilderNode[] = [
        createNode("a", "Container"),
        createNode("b", "Text"),
        createNode("a", "Heading"),
        createNode("b", "Button"),
      ];
      const duplicates = findDuplicateIds(tree);
      expect(duplicates).toContain("a");
      expect(duplicates).toContain("b");
    });
  });

  describe("validateNodeIds", () => {
    it("should return true when all IDs are valid", () => {
      const tree: BuilderNode[] = [
        createNode("valid-1", "Container"),
        createNode("valid-2", "Text"),
      ];
      expect(validateNodeIds(tree)).toBe(true);
    });

    it("should return false when ID is empty string", () => {
      const tree: BuilderNode[] = [createNode("", "Container")];
      expect(validateNodeIds(tree)).toBe(false);
    });

    it("should return false when ID is undefined", () => {
      const tree: BuilderNode[] = [
        {
          ...createNode("invalid", "Container"),
          id: undefined as unknown as string,
        },
      ];
      expect(validateNodeIds(tree)).toBe(false);
    });

    it("should return false when ID is only whitespace", () => {
      const tree: BuilderNode[] = [createNode("   ", "Container")];
      expect(validateNodeIds(tree)).toBe(false);
    });

    it("should validate nested nodes", () => {
      const tree: BuilderNode[] = [
        createNode("parent", "Container", {}, [createNode("child", "Text")]),
      ];
      expect(validateNodeIds(tree)).toBe(true);
    });
  });
});
