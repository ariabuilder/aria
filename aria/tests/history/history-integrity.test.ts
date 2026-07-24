/**
 * CRITICAL: Verify undo/redo operations DO NOT corrupt: - Node tree structure - Parent-child relationships
 * - Node IDs and references - Array indices - Orphaned nodes - Circular.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { useHistory } from "../../admin/features/History/composables/useHistory";
import type { Operation } from "../../admin/features/History/composables/useHistory";

const NodeSchema = z.object({
  id: z.uuid(),
  type: z.enum(["container", "text", "image", "button"]),
  tag: z.string(),
  children: z.array(z.string()).default([]),
  parentId: z.uuid().nullable().default(null),
  props: z.record(z.string(), z.unknown()).optional(),
});

type Node = z.infer<typeof NodeSchema>;

const NodeTreeSchema = z.object({
  nodes: z.record(z.string(), NodeSchema),
  rootId: z.uuid(),
});

type NodeTree = z.infer<typeof NodeTreeSchema>;

const IntegrityReportSchema = z.object({
  isValid: z.boolean(),
  totalNodes: z.int().nonnegative(),
  orphanedNodes: z.array(z.uuid()),
  missingParents: z.array(z.uuid()),
  childParentMismatches: z.array(
    z.object({
      nodeId: z.uuid(),
      issue: z.string(),
    }),
  ),
  circularReferences: z.array(z.array(z.uuid())),
});

type IntegrityReport = z.infer<typeof IntegrityReportSchema>;

function createNode(
  type: Node["type"],
  tag: string,
  parentId: string | null = null,
): Node {
  const node: Node = {
    id: crypto.randomUUID(),
    type,
    tag,
    children: [],
    parentId,
    props: {},
  };

  return NodeSchema.parse(node);
}

function createNodeTree(): NodeTree {
  const root = createNode("container", "div", null);

  const tree: NodeTree = {
    nodes: { [root.id]: root },
    rootId: root.id,
  };

  return NodeTreeSchema.parse(tree);
}

function addChild(tree: NodeTree, parentId: string, childNode: Node): void {
  const parent = tree.nodes[parentId];
  if (!parent) throw new Error(`Parent ${parentId} not found`);

  childNode.parentId = parentId;
  parent.children.push(childNode.id);
  tree.nodes[childNode.id] = childNode;

  NodeTreeSchema.parse(tree);
}

function removeChild(tree: NodeTree, nodeId: string): Node | null {
  const node = tree.nodes[nodeId];
  if (!node) return null;

  // Remove from parent's children array
  if (node.parentId) {
    const parent = tree.nodes[node.parentId];
    if (parent) {
      parent.children = parent.children.filter((id) => id !== nodeId);
    }
  }

  const toRemove = [nodeId];
  while (toRemove.length > 0) {
    const currentId = toRemove.pop()!;
    const currentNode = tree.nodes[currentId];
    if (currentNode) {
      toRemove.push(...currentNode.children);
      delete tree.nodes[currentId];
    }
  }

  return node;
}

function moveNode(
  tree: NodeTree,
  nodeId: string,
  newParentId: string,
  index: number,
): void {
  const node = tree.nodes[nodeId];
  const newParent = tree.nodes[newParentId];

  if (!node || !newParent) throw new Error("Node or parent not found");

  // Remove from old parent
  if (node.parentId) {
    const oldParent = tree.nodes[node.parentId];
    if (oldParent) {
      oldParent.children = oldParent.children.filter((id) => id !== nodeId);
    }
  }

  // Add to new parent
  node.parentId = newParentId;
  newParent.children.splice(index, 0, nodeId);

  NodeTreeSchema.parse(tree);
}

function validateTreeIntegrity(tree: NodeTree): IntegrityReport {
  const orphaned: string[] = [];
  const missingParents: string[] = [];
  const childParentMismatches: IntegrityReport["childParentMismatches"] = [];
  const circularRefs: string[][] = [];

  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    if (nodeId === tree.rootId) continue;

    if (node.parentId === null) {
      orphaned.push(nodeId);
      continue;
    }

    const parent = tree.nodes[node.parentId];
    if (!parent) {
      missingParents.push(nodeId);
      continue;
    }

    // Check parent contains this node in children
    if (!parent.children.includes(nodeId)) {
      childParentMismatches.push({
        nodeId,
        issue: `Parent ${node.parentId} doesn't list ${nodeId} in children`,
      });
    }

    // Check for circular references
    const visited = new Set<string>();
    let currentId: string | null = nodeId;
    const path: string[] = [];

    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      path.push(currentId);
      currentId = tree.nodes[currentId]?.parentId ?? null;
    }

    if (currentId !== null && visited.has(currentId)) {
      circularRefs.push(path);
    }
  }

  // Check all children references are valid
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    for (const childId of node.children) {
      const child = tree.nodes[childId];
      if (!child) {
        childParentMismatches.push({
          nodeId,
          issue: `Child ${childId} referenced but doesn't exist`,
        });
      } else if (child.parentId !== nodeId) {
        childParentMismatches.push({
          nodeId,
          issue: `Child ${childId} has wrong parentId: ${child.parentId}`,
        });
      }
    }
  }

  const report: IntegrityReport = {
    isValid:
      orphaned.length === 0 &&
      missingParents.length === 0 &&
      childParentMismatches.length === 0 &&
      circularRefs.length === 0,
    totalNodes: Object.keys(tree.nodes).length,
    orphanedNodes: orphaned,
    missingParents,
    childParentMismatches,
    circularReferences: circularRefs,
  };

  return IntegrityReportSchema.parse(report);
}

function cloneTree(tree: NodeTree): NodeTree {
  return NodeTreeSchema.parse(JSON.parse(JSON.stringify(tree)));
}

describe("History - State Integrity", () => {
  let history: ReturnType<typeof useHistory>;
  let tree: NodeTree;

  beforeEach(() => {
    history = useHistory();
    history.clear();
    tree = createNodeTree();
  });

  afterEach(() => {
    history.clear();
  });

  describe("Node Tree Structure", () => {
    it("should preserve tree structure after undo/redo", async () => {
      const child1 = createNode("container", "section");
      const child2 = createNode("text", "p");
      const grandchild = createNode("button", "button");

      addChild(tree, tree.rootId, child1);
      addChild(tree, tree.rootId, child2);
      addChild(tree, child1.id, grandchild);

      const snapshot = cloneTree(tree);
      const newChild = createNode("image", "img");

      // Create operation to modify structure
      const operation: Operation = {
        type: "update-node",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          addChild(tree, tree.rootId, newChild);
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      let report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);

      await history.undo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
      expect(report.totalNodes).toBe(4); // root + 3 children

      await history.redo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
    });

    it("should maintain structure through multiple undo/redo cycles", async () => {
      const operations: Operation[] = [];

      // Operation 1: Add child
      const child1 = createNode("container", "div");
      const snapshot1 = cloneTree(tree);
      operations.push({
        type: "insert-node",
        undo: () => {
          tree = snapshot1;
        },
        redo: () => {
          tree = cloneTree(snapshot1);
          addChild(tree, tree.rootId, child1);
        },
        timestamp: Date.now(),
      });

      for (const op of operations) {
        await history.execute(op);
      }

      // Cycle 1: Undo → Redo
      for (let i = 0; i < 5; i++) {
        await history.undo();
        let report = validateTreeIntegrity(tree);
        expect(report.isValid).toBe(true);
        expect(report.orphanedNodes).toHaveLength(0);

        await history.redo();
        report = validateTreeIntegrity(tree);
        expect(report.isValid).toBe(true);
        expect(report.orphanedNodes).toHaveLength(0);
      }
    });
  });

  describe("Parent-Child Relationships", () => {
    it("should maintain bidirectional parent-child links", async () => {
      const parent = createNode("container", "div");
      const child = createNode("text", "p");

      addChild(tree, tree.rootId, parent);
      const snapshot = cloneTree(tree);

      const operation: Operation = {
        type: "insert-node",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          addChild(tree, parent.id, child);
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      const parentNode = tree.nodes[parent.id];
      expect(parentNode.children).toContain(child.id);

      const childNode = tree.nodes[child.id];
      expect(childNode.parentId).toBe(parent.id);

      await history.undo();
      const parentAfterUndo = tree.nodes[parent.id];
      expect(parentAfterUndo.children).not.toContain(child.id);
      expect(tree.nodes[child.id]).toBeUndefined();

      await history.redo();
      const report = validateTreeIntegrity(tree);
      expect(report.childParentMismatches).toHaveLength(0);
    });

    it("should not create orphaned nodes on delete+undo", async () => {
      // Setup tree with children
      const child1 = createNode("container", "div");
      const child2 = createNode("text", "p");
      addChild(tree, tree.rootId, child1);
      addChild(tree, tree.rootId, child2);

      const snapshot = cloneTree(tree);

      const operation: Operation = {
        type: "delete-node",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          removeChild(tree, child1.id);
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      expect(tree.nodes[child1.id]).toBeUndefined();

      await history.undo();

      const report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
      expect(report.orphanedNodes).toHaveLength(0);
      expect(tree.nodes[child1.id]).toBeDefined();
      expect(tree.nodes[child1.id].parentId).toBe(tree.rootId);
    });

    it("should handle move operations without breaking relationships", async () => {
      // Create tree: root -> [parent1, parent2], parent1 -> [child]
      const parent1 = createNode("container", "div");
      const parent2 = createNode("container", "section");
      const child = createNode("text", "p");

      addChild(tree, tree.rootId, parent1);
      addChild(tree, tree.rootId, parent2);
      addChild(tree, parent1.id, child);

      const snapshot = cloneTree(tree);

      // Move child from parent1 to parent2
      const operation: Operation = {
        type: "move-node",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          moveNode(tree, child.id, parent2.id, 0);
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      expect(tree.nodes[child.id].parentId).toBe(parent2.id);
      expect(tree.nodes[parent2.id].children).toContain(child.id);
      expect(tree.nodes[parent1.id].children).not.toContain(child.id);

      let report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);

      await history.undo();
      expect(tree.nodes[child.id].parentId).toBe(parent1.id);
      expect(tree.nodes[parent1.id].children).toContain(child.id);
      expect(tree.nodes[parent2.id].children).not.toContain(child.id);

      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
    });
  });

  describe("Node ID Stability", () => {
    it("should keep node IDs stable across undo/redo", async () => {
      const child = createNode("text", "p");
      const originalId = child.id;

      const snapshot = cloneTree(tree);

      const operation: Operation = {
        type: "insert-node",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          addChild(tree, tree.rootId, child);
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);
      expect(tree.nodes[originalId]).toBeDefined();
      expect(tree.nodes[originalId].id).toBe(originalId);

      await history.undo();
      await history.redo();

      expect(tree.nodes[originalId]).toBeDefined();
      expect(tree.nodes[originalId].id).toBe(originalId);
    });

    it("should not create duplicate IDs", async () => {
      const child1 = createNode("text", "p");
      const child2 = createNode("button", "button");

      addChild(tree, tree.rootId, child1);
      const snapshot = cloneTree(tree);

      const operation: Operation = {
        type: "insert-node",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          addChild(tree, tree.rootId, child2);
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      const nodeIds = Object.keys(tree.nodes);
      const uniqueIds = new Set(nodeIds);
      expect(nodeIds.length).toBe(uniqueIds.size);

      await history.undo();
      await history.redo();

      const nodeIdsAfter = Object.keys(tree.nodes);
      const uniqueIdsAfter = new Set(nodeIdsAfter);
      expect(nodeIdsAfter.length).toBe(uniqueIdsAfter.size);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle deep nesting without corruption", async () => {
      // Create deep tree: root -> a -> b -> c -> d -> e
      const nodes: Node[] = [];
      for (let i = 0; i < 5; i++) {
        nodes.push(createNode("container", `div-${i}`));
      }

      const snapshot = cloneTree(tree);

      const operation: Operation = {
        type: "batch-nodes",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          let parentId = tree.rootId;
          for (const node of nodes) {
            addChild(tree, parentId, node);
            parentId = node.id;
          }
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      let report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
      expect(report.totalNodes).toBe(6); // root + 5 nodes

      await history.undo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
      expect(report.totalNodes).toBe(1); // just root

      await history.redo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
      expect(report.totalNodes).toBe(6);
    });

    it("should handle batch operations without corruption", async () => {
      const children: Node[] = [];
      for (let i = 0; i < 10; i++) {
        children.push(createNode("text", `p-${i}`));
      }

      const snapshot = cloneTree(tree);

      const operation: Operation = {
        type: "batch-nodes",
        undo: () => {
          tree = cloneTree(snapshot);
        },
        redo: () => {
          tree = cloneTree(snapshot);
          for (const child of children) {
            addChild(tree, tree.rootId, child);
          }
        },
        timestamp: Date.now(),
      };

      await history.execute(operation);

      let report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
      expect(report.totalNodes).toBe(11);

      for (let i = 0; i < 3; i++) {
        await history.undo();
        report = validateTreeIntegrity(tree);
        expect(report.isValid).toBe(true);
        expect(report.orphanedNodes).toHaveLength(0);

        await history.redo();
        report = validateTreeIntegrity(tree);
        expect(report.isValid).toBe(true);
        expect(report.orphanedNodes).toHaveLength(0);
      }
    });

    it("should maintain integrity with mixed operation types", async () => {
      const child1 = createNode("container", "div");
      const child2 = createNode("text", "p");

      // Operation 1: Add child1
      addChild(tree, tree.rootId, child1);
      const snapshot1 = cloneTree(tree);
      await history.execute({
        type: "insert-node",
        undo: () => {
          tree = createNodeTree();
        },
        redo: () => {
          tree = cloneTree(snapshot1);
        },
        timestamp: Date.now(),
      });

      // Operation 2: Add child2 to child1
      addChild(tree, child1.id, child2);
      const snapshot2 = cloneTree(tree);
      await history.execute({
        type: "insert-node",
        undo: () => {
          tree = cloneTree(snapshot1);
        },
        redo: () => {
          tree = cloneTree(snapshot2);
        },
        timestamp: Date.now(),
      });

      // Operation 3: Update child2 props
      const snapshot3 = cloneTree(tree);
      tree.nodes[child2.id].props = { text: "Updated" };
      await history.execute({
        type: "update-node",
        undo: () => {
          tree = cloneTree(snapshot2);
        },
        redo: () => {
          tree = cloneTree(snapshot3);
        },
        timestamp: Date.now(),
      });

      let report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);

      await history.undo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);

      await history.undo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);

      await history.undo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);

      await history.redo();
      await history.redo();
      await history.redo();
      report = validateTreeIntegrity(tree);
      expect(report.isValid).toBe(true);
    });
  });
});
