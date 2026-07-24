/**
 * Insert, delete, move) - Batch operations (multiple changes as single unit) -.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { useHistory } from "../../admin/features/History/composables/useHistory";
import type { Operation } from "../../admin/features/History/composables/useHistory";

const NodePropsSchema = z.record(z.string(), z.unknown());

const NodeSchema = z.object({
  id: z.uuid(),
  type: z.enum(["container", "text", "image", "button", "form", "input"]),
  tag: z.string(),
  props: NodePropsSchema,
  styles: z.record(z.string(), z.string()).optional(),
  children: z.array(z.uuid()).default([]),
  parentId: z.uuid().nullable(),
});

type Node = z.infer<typeof NodeSchema>;

const DesignTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  category: z.enum(["colors", "typography", "spacing", "shadows"]),
});

type DesignToken = z.infer<typeof DesignTokenSchema>;

const PageSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  rootNodeId: z.uuid(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type Page = z.infer<typeof PageSchema>;

const LayoutSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  rootNodeId: z.uuid(),
});

type Layout = z.infer<typeof LayoutSchema>;

const ComponentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  rootNodeId: z.uuid(),
  props: z.record(z.string(), z.unknown()).optional(),
});

type Component = z.infer<typeof ComponentSchema>;

function createNode(
  type: Node["type"],
  tag: string,
  props: Record<string, unknown> = {},
): Node {
  return NodeSchema.parse({
    id: crypto.randomUUID(),
    type,
    tag,
    props,
    children: [],
    parentId: null,
  });
}

function createDesignToken(
  name: string,
  value: string,
  category: DesignToken["category"],
): DesignToken {
  return DesignTokenSchema.parse({ name, value, category });
}

function createPage(slug: string, title: string): Page {
  return PageSchema.parse({
    id: crypto.randomUUID(),
    slug,
    title,
    rootNodeId: crypto.randomUUID(),
  });
}

function createLayout(name: string): Layout {
  return LayoutSchema.parse({
    id: crypto.randomUUID(),
    name,
    rootNodeId: crypto.randomUUID(),
  });
}

function createComponent(name: string): Component {
  return ComponentSchema.parse({
    id: crypto.randomUUID(),
    name,
    rootNodeId: crypto.randomUUID(),
  });
}

describe("History - Node Operations", () => {
  let history: ReturnType<typeof useHistory>;

  beforeEach(() => {
    history = useHistory();
    history.clear();
  });

  afterEach(() => {
    history.clear();
  });

  describe("update-node Operations", () => {
    it("should undo/redo property changes correctly", async () => {
      const node = createNode("text", "p", { text: "Original" });
      const oldProps = { ...node.props };
      const newProps = { text: "Updated" };

      const operation: Operation = {
        type: "update-node",
        undo: () => {
          node.props = oldProps;
        },
        redo: () => {
          node.props = newProps;
        },
        timestamp: Date.now(),
        description: "Update text content",
        affectedNodeIds: [node.id],
      };

      node.props = newProps;
      await history.execute(operation);

      expect(node.props.text).toBe("Updated");

      await history.undo();
      expect(node.props.text).toBe("Original");

      await history.redo();
      expect(node.props.text).toBe("Updated");

      NodeSchema.parse(node);
    });

    it("should handle multiple property updates", async () => {
      const node = createNode("button", "button", {
        text: "Click",
        variant: "primary",
        disabled: false,
      });

      const snapshots = [{ ...node.props }];

      // Update 1: Change text
      node.props.text = "Submit";
      snapshots.push({ ...node.props });
      await history.execute({
        type: "update-node",
        undo: () => {
          node.props = { ...snapshots[0] };
        },
        redo: () => {
          node.props = { ...snapshots[1] };
        },
        timestamp: Date.now(),
        affectedNodeIds: [node.id],
      });

      // Update 2: Change variant
      node.props.variant = "secondary";
      snapshots.push({ ...node.props });
      await history.execute({
        type: "update-node",
        undo: () => {
          node.props = { ...snapshots[1] };
        },
        redo: () => {
          node.props = { ...snapshots[2] };
        },
        timestamp: Date.now(),
        affectedNodeIds: [node.id],
      });

      // Update 3: Disable button
      node.props.disabled = true;
      snapshots.push({ ...node.props });
      await history.execute({
        type: "update-node",
        undo: () => {
          node.props = { ...snapshots[2] };
        },
        redo: () => {
          node.props = { ...snapshots[3] };
        },
        timestamp: Date.now(),
        affectedNodeIds: [node.id],
      });

      expect(node.props.text).toBe("Submit");
      expect(node.props.variant).toBe("secondary");
      expect(node.props.disabled).toBe(true);

      await history.undo();
      expect(node.props.disabled).toBe(false);

      await history.undo();
      expect(node.props.variant).toBe("primary");

      await history.undo();
      expect(node.props.text).toBe("Click");

      await history.redo();
      await history.redo();
      await history.redo();

      expect(node.props.text).toBe("Submit");
      expect(node.props.variant).toBe("secondary");
      expect(node.props.disabled).toBe(true);
    });

    it("should handle style updates", async () => {
      const node = createNode("container", "div");
      node.styles = { backgroundColor: "white" };

      const oldStyles = { ...node.styles };
      const newStyles = { backgroundColor: "black", color: "white" };

      node.styles = newStyles;
      await history.execute({
        type: "update-node",
        undo: () => {
          node.styles = oldStyles;
        },
        redo: () => {
          node.styles = newStyles;
        },
        timestamp: Date.now(),
        affectedNodeIds: [node.id],
      });

      expect(node.styles.backgroundColor).toBe("black");

      await history.undo();
      expect(node.styles.backgroundColor).toBe("white");
      expect(node.styles.color).toBeUndefined();

      await history.redo();
      expect(node.styles.backgroundColor).toBe("black");
      expect(node.styles.color).toBe("white");
    });
  });

  describe("insert-node Operations", () => {
    it("should undo/redo node insertion", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      const newNode = createNode("text", "p", { text: "Hello" });

      const operation: Operation = {
        type: "insert-node",
        undo: () => {
          delete nodes[newNode.id];
          nodes[rootId].children = nodes[rootId].children.filter(
            (id) => id !== newNode.id,
          );
        },
        redo: () => {
          newNode.parentId = rootId;
          nodes[newNode.id] = newNode;
          nodes[rootId].children.push(newNode.id);
        },
        timestamp: Date.now(),
        description: "Insert text node",
        affectedNodeIds: [newNode.id, rootId],
      };

      newNode.parentId = rootId;
      nodes[newNode.id] = newNode;
      nodes[rootId].children.push(newNode.id);
      await history.execute(operation);

      expect(nodes[newNode.id]).toBeDefined();
      expect(nodes[rootId].children).toContain(newNode.id);

      await history.undo();
      expect(nodes[newNode.id]).toBeUndefined();
      expect(nodes[rootId].children).not.toContain(newNode.id);

      await history.redo();
      expect(nodes[newNode.id]).toBeDefined();
      expect(nodes[rootId].children).toContain(newNode.id);
    });

    it("should handle inserting at specific index", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      const child1 = createNode("text", "p", { text: "First" });
      const child2 = createNode("text", "p", { text: "Third" });
      child1.parentId = rootId;
      child2.parentId = rootId;
      nodes[child1.id] = child1;
      nodes[child2.id] = child2;
      nodes[rootId].children = [child1.id, child2.id];

      const newNode = createNode("text", "p", { text: "Second" });
      const insertIndex = 1;
      const originalChildren = [...nodes[rootId].children];

      const operation: Operation = {
        type: "insert-node",
        undo: () => {
          delete nodes[newNode.id];
          nodes[rootId].children = [...originalChildren];
        },
        redo: () => {
          newNode.parentId = rootId;
          nodes[newNode.id] = newNode;
          nodes[rootId].children = [...originalChildren];
          nodes[rootId].children.splice(insertIndex, 0, newNode.id);
        },
        timestamp: Date.now(),
        affectedNodeIds: [newNode.id, rootId],
      };

      newNode.parentId = rootId;
      nodes[newNode.id] = newNode;
      nodes[rootId].children.splice(insertIndex, 0, newNode.id);
      await history.execute(operation);

      expect(nodes[rootId].children).toEqual([
        child1.id,
        newNode.id,
        child2.id,
      ]);

      await history.undo();
      expect(nodes[rootId].children).toEqual([child1.id, child2.id]);

      await history.redo();
      expect(nodes[rootId].children).toEqual([
        child1.id,
        newNode.id,
        child2.id,
      ]);
    });
  });

  describe("delete-node Operations", () => {
    it("should undo/redo node deletion", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      const child = createNode("text", "p", { text: "Delete me" });
      child.parentId = rootId;
      nodes[child.id] = child;
      nodes[rootId].children.push(child.id);

      const deletedNode = { ...child };
      const parentChildren = [...nodes[rootId].children];

      const operation: Operation = {
        type: "delete-node",
        undo: () => {
          nodes[deletedNode.id] = deletedNode;
          nodes[rootId].children = parentChildren;
        },
        redo: () => {
          delete nodes[deletedNode.id];
          nodes[rootId].children = nodes[rootId].children.filter(
            (id) => id !== deletedNode.id,
          );
        },
        timestamp: Date.now(),
        description: "Delete text node",
        affectedNodeIds: [deletedNode.id, rootId],
      };

      delete nodes[child.id];
      nodes[rootId].children = nodes[rootId].children.filter(
        (id) => id !== child.id,
      );
      await history.execute(operation);

      expect(nodes[child.id]).toBeUndefined();
      expect(nodes[rootId].children).not.toContain(child.id);

      await history.undo();
      expect(nodes[child.id]).toBeDefined();
      expect(nodes[rootId].children).toContain(child.id);

      await history.redo();
      expect(nodes[child.id]).toBeUndefined();
      expect(nodes[rootId].children).not.toContain(child.id);
    });

    it("should restore deleted subtree", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      // Create subtree: parent -> [child1, child2]
      const parent = createNode("container", "section");
      const child1 = createNode("text", "p");
      const child2 = createNode("text", "span");

      parent.parentId = rootId;
      child1.parentId = parent.id;
      child2.parentId = parent.id;
      parent.children = [child1.id, child2.id];

      nodes[parent.id] = parent;
      nodes[child1.id] = child1;
      nodes[child2.id] = child2;
      nodes[rootId].children.push(parent.id);

      const deletedSubtree = {
        parent: { ...parent },
        child1: { ...child1 },
        child2: { ...child2 },
      };
      const parentChildren = [...nodes[rootId].children];

      const operation: Operation = {
        type: "delete-node",
        undo: () => {
          nodes[parent.id] = deletedSubtree.parent;
          nodes[child1.id] = deletedSubtree.child1;
          nodes[child2.id] = deletedSubtree.child2;
          nodes[rootId].children = parentChildren;
        },
        redo: () => {
          delete nodes[parent.id];
          delete nodes[child1.id];
          delete nodes[child2.id];
          nodes[rootId].children = nodes[rootId].children.filter(
            (id) => id !== parent.id,
          );
        },
        timestamp: Date.now(),
        affectedNodeIds: [parent.id, child1.id, child2.id, rootId],
      };

      delete nodes[parent.id];
      delete nodes[child1.id];
      delete nodes[child2.id];
      nodes[rootId].children = nodes[rootId].children.filter(
        (id) => id !== parent.id,
      );
      await history.execute(operation);

      expect(nodes[parent.id]).toBeUndefined();
      expect(nodes[child1.id]).toBeUndefined();
      expect(nodes[child2.id]).toBeUndefined();

      await history.undo();
      expect(nodes[parent.id]).toBeDefined();
      expect(nodes[child1.id]).toBeDefined();
      expect(nodes[child2.id]).toBeDefined();
      expect(nodes[parent.id].children).toEqual([child1.id, child2.id]);

      await history.redo();
      expect(nodes[parent.id]).toBeUndefined();
      expect(nodes[child1.id]).toBeUndefined();
      expect(nodes[child2.id]).toBeUndefined();
    });
  });

  describe("move-node Operations", () => {
    it("should undo/redo node move (drag/drop)", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      const parent1 = createNode("container", "section");
      const parent2 = createNode("container", "article");
      const child = createNode("text", "p");

      parent1.parentId = rootId;
      parent2.parentId = rootId;
      child.parentId = parent1.id;

      parent1.children = [child.id];
      parent2.children = [];
      nodes[rootId].children = [parent1.id, parent2.id];

      nodes[parent1.id] = parent1;
      nodes[parent2.id] = parent2;
      nodes[child.id] = child;

      const oldParentId = parent1.id;
      const newParentId = parent2.id;
      const oldChildren1 = [...parent1.children];
      const oldChildren2 = [...parent2.children];

      const operation: Operation = {
        type: "move-node",
        undo: () => {
          nodes[child.id].parentId = oldParentId;
          nodes[parent1.id].children = oldChildren1;
          nodes[parent2.id].children = oldChildren2;
        },
        redo: () => {
          nodes[child.id].parentId = newParentId;
          nodes[parent1.id].children = nodes[parent1.id].children.filter(
            (id) => id !== child.id,
          );
          nodes[parent2.id].children.push(child.id);
        },
        timestamp: Date.now(),
        description: "Move node between parents",
        affectedNodeIds: [child.id, parent1.id, parent2.id],
      };

      nodes[child.id].parentId = newParentId;
      nodes[parent1.id].children = nodes[parent1.id].children.filter(
        (id) => id !== child.id,
      );
      nodes[parent2.id].children.push(child.id);
      await history.execute(operation);

      expect(nodes[child.id].parentId).toBe(parent2.id);
      expect(nodes[parent1.id].children).toHaveLength(0);
      expect(nodes[parent2.id].children).toContain(child.id);

      await history.undo();
      expect(nodes[child.id].parentId).toBe(parent1.id);
      expect(nodes[parent1.id].children).toContain(child.id);
      expect(nodes[parent2.id].children).toHaveLength(0);

      await history.redo();
      expect(nodes[child.id].parentId).toBe(parent2.id);
      expect(nodes[parent2.id].children).toContain(child.id);
    });

    it("should handle reordering within same parent", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      const child1 = createNode("text", "p", { text: "First" });
      const child2 = createNode("text", "p", { text: "Second" });
      const child3 = createNode("text", "p", { text: "Third" });

      child1.parentId = rootId;
      child2.parentId = rootId;
      child3.parentId = rootId;

      nodes[child1.id] = child1;
      nodes[child2.id] = child2;
      nodes[child3.id] = child3;
      nodes[rootId].children = [child1.id, child2.id, child3.id];

      const oldOrder = [...nodes[rootId].children];
      const newOrder = [child3.id, child1.id, child2.id]; // Move child3 to start

      const operation: Operation = {
        type: "move-node",
        undo: () => {
          nodes[rootId].children = oldOrder;
        },
        redo: () => {
          nodes[rootId].children = newOrder;
        },
        timestamp: Date.now(),
        affectedNodeIds: [rootId],
      };

      nodes[rootId].children = newOrder;
      await history.execute(operation);

      expect(nodes[rootId].children).toEqual([child3.id, child1.id, child2.id]);

      await history.undo();
      expect(nodes[rootId].children).toEqual([child1.id, child2.id, child3.id]);

      await history.redo();
      expect(nodes[rootId].children).toEqual([child3.id, child1.id, child2.id]);
    });
  });

  describe("batch-nodes Operations", () => {
    it("should undo/redo multiple changes as single unit", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      const node1 = createNode("text", "p", { text: "One" });
      const node2 = createNode("text", "p", { text: "Two" });
      const node3 = createNode("text", "p", { text: "Three" });

      const changes = {
        before: {
          node1Props: { ...node1.props },
          node2Props: { ...node2.props },
          node3Props: { ...node3.props },
        },
        after: {
          node1Props: { text: "Changed One" },
          node2Props: { text: "Changed Two" },
          node3Props: { text: "Changed Three" },
        },
      };

      const operation: Operation = {
        type: "batch-nodes",
        undo: () => {
          node1.props = changes.before.node1Props;
          node2.props = changes.before.node2Props;
          node3.props = changes.before.node3Props;
        },
        redo: () => {
          node1.props = changes.after.node1Props;
          node2.props = changes.after.node2Props;
          node3.props = changes.after.node3Props;
        },
        timestamp: Date.now(),
        description: "Batch update multiple nodes",
        affectedNodeIds: [node1.id, node2.id, node3.id],
      };

      node1.props = changes.after.node1Props;
      node2.props = changes.after.node2Props;
      node3.props = changes.after.node3Props;
      await history.execute(operation);

      expect(node1.props.text).toBe("Changed One");
      expect(node2.props.text).toBe("Changed Two");
      expect(node3.props.text).toBe("Changed Three");

      // Undo - all changes revert together
      await history.undo();
      expect(node1.props.text).toBe("One");
      expect(node2.props.text).toBe("Two");
      expect(node3.props.text).toBe("Three");

      // Redo - all changes apply together
      await history.redo();
      expect(node1.props.text).toBe("Changed One");
      expect(node2.props.text).toBe("Changed Two");
      expect(node3.props.text).toBe("Changed Three");
    });
  });

  describe("Page Operations", () => {
    it("should undo/redo page creation", async () => {
      const pages: Record<string, Page> = {};
      const newPage = createPage("about", "About Us");

      const operation: Operation = {
        type: "create-page",
        undo: () => {
          delete pages[newPage.id];
        },
        redo: () => {
          pages[newPage.id] = newPage;
        },
        timestamp: Date.now(),
        description: "Create About page",
      };

      pages[newPage.id] = newPage;
      await history.execute(operation);

      expect(pages[newPage.id]).toBeDefined();
      PageSchema.parse(pages[newPage.id]);

      await history.undo();
      expect(pages[newPage.id]).toBeUndefined();

      await history.redo();
      expect(pages[newPage.id]).toBeDefined();
    });

    it("should undo/redo page updates", async () => {
      const page = createPage("home", "Home");

      const oldMetadata = { description: "Original" };
      const newMetadata = { description: "Updated", keywords: "new,keywords" };

      page.metadata = oldMetadata;

      const operation: Operation = {
        type: "update-page-dsl",
        undo: () => {
          page.metadata = oldMetadata;
        },
        redo: () => {
          page.metadata = newMetadata;
        },
        timestamp: Date.now(),
      };

      page.metadata = newMetadata;
      await history.execute(operation);

      expect(page.metadata.description).toBe("Updated");
      expect(page.metadata.keywords).toBe("new,keywords");

      await history.undo();
      expect(page.metadata.description).toBe("Original");
      expect(page.metadata.keywords).toBeUndefined();

      await history.redo();
      expect(page.metadata.description).toBe("Updated");
    });
  });

  describe("Design System Operations", () => {
    it("should undo/redo design token changes", async () => {
      const tokens: Record<string, DesignToken> = {};

      const token = createDesignToken("primary", "#007bff", "colors");
      tokens[token.name] = token;

      const oldValue = "#007bff";
      const newValue = "#0056b3";

      const operation: Operation = {
        type: "update-design-colors",
        undo: () => {
          tokens[token.name].value = oldValue;
        },
        redo: () => {
          tokens[token.name].value = newValue;
        },
        timestamp: Date.now(),
        description: "Update primary color",
      };

      tokens[token.name].value = newValue;
      await history.execute(operation);

      expect(tokens[token.name].value).toBe("#0056b3");
      DesignTokenSchema.parse(tokens[token.name]);

      await history.undo();
      expect(tokens[token.name].value).toBe("#007bff");

      await history.redo();
      expect(tokens[token.name].value).toBe("#0056b3");
    });

    it("should undo/redo adding design tokens", async () => {
      const tokens: Record<string, DesignToken> = {};

      const newToken = createDesignToken("secondary", "#6c757d", "colors");

      const operation: Operation = {
        type: "add-palette",
        undo: () => {
          delete tokens[newToken.name];
        },
        redo: () => {
          tokens[newToken.name] = newToken;
        },
        timestamp: Date.now(),
      };

      tokens[newToken.name] = newToken;
      await history.execute(operation);

      expect(tokens[newToken.name]).toBeDefined();

      await history.undo();
      expect(tokens[newToken.name]).toBeUndefined();

      await history.redo();
      expect(tokens[newToken.name]).toBeDefined();
      DesignTokenSchema.parse(tokens[newToken.name]);
    });
  });

  describe("Component Operations", () => {
    it("should undo/redo component creation", async () => {
      const components: Record<string, Component> = {};
      const newComponent = createComponent("Button");

      const operation: Operation = {
        type: "create-component",
        undo: () => {
          delete components[newComponent.id];
        },
        redo: () => {
          components[newComponent.id] = newComponent;
        },
        timestamp: Date.now(),
        description: "Create Button component",
      };

      components[newComponent.id] = newComponent;
      await history.execute(operation);

      expect(components[newComponent.id]).toBeDefined();
      ComponentSchema.parse(components[newComponent.id]);

      await history.undo();
      expect(components[newComponent.id]).toBeUndefined();

      await history.redo();
      expect(components[newComponent.id]).toBeDefined();
    });
  });

  describe("Layout Operations", () => {
    it("should undo/redo layout creation", async () => {
      const layouts: Record<string, Layout> = {};
      const newLayout = createLayout("MainLayout");

      const operation: Operation = {
        type: "create-layout",
        undo: () => {
          delete layouts[newLayout.id];
        },
        redo: () => {
          layouts[newLayout.id] = newLayout;
        },
        timestamp: Date.now(),
        description: "Create MainLayout",
      };

      layouts[newLayout.id] = newLayout;
      await history.execute(operation);

      expect(layouts[newLayout.id]).toBeDefined();
      LayoutSchema.parse(layouts[newLayout.id]);

      await history.undo();
      expect(layouts[newLayout.id]).toBeUndefined();

      await history.redo();
      expect(layouts[newLayout.id]).toBeDefined();
    });
  });

  describe("Real-World Editing Scenarios", () => {
    it("should handle complete editing session", async () => {
      const nodes: Record<string, Node> = {};
      const rootId = crypto.randomUUID();
      nodes[rootId] = createNode("container", "div");
      nodes[rootId].id = rootId;

      // Session: Add button → Update text → Change styles → Reposition

      // 1. Add button
      const button = createNode("button", "button", { text: "Click" });
      button.parentId = rootId;
      nodes[button.id] = button;
      nodes[rootId].children.push(button.id);

      await history.execute({
        type: "insert-node",
        undo: () => {
          delete nodes[button.id];
          nodes[rootId].children = [];
        },
        redo: () => {
          button.parentId = rootId;
          nodes[button.id] = button;
          nodes[rootId].children = [button.id];
        },
        timestamp: Date.now(),
      });

      // 2. Update text
      const oldText = button.props.text;
      button.props.text = "Submit";

      await history.execute({
        type: "update-node",
        undo: () => {
          button.props.text = oldText;
        },
        redo: () => {
          button.props.text = "Submit";
        },
        timestamp: Date.now(),
      });

      // 3. Add styles
      button.styles = { backgroundColor: "blue", color: "white" };

      await history.execute({
        type: "update-node",
        undo: () => {
          button.styles = undefined;
        },
        redo: () => {
          button.styles = { backgroundColor: "blue", color: "white" };
        },
        timestamp: Date.now(),
      });

      expect(nodes[button.id].props.text).toBe("Submit");
      expect(nodes[button.id].styles?.backgroundColor).toBe("blue");

      // Undo all (reverse editing session)
      await history.undo(); // Remove styles
      expect(button.styles).toBeUndefined();

      await history.undo(); // Revert text
      expect(button.props.text).toBe("Click");

      await history.undo(); // Remove button
      expect(nodes[button.id]).toBeUndefined();

      // Redo all (replay editing session)
      await history.redo(); // Add button
      await history.redo(); // Update text
      await history.redo(); // Add styles

      expect(nodes[button.id]).toBeDefined();
      expect(nodes[button.id].props.text).toBe("Submit");
      expect(nodes[button.id].styles?.backgroundColor).toBe("blue");
    });
  });
});
