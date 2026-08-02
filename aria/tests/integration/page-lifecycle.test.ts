/**
 * Tests the complete editing workflow: 1. Load page from storage 2.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const NodeSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  tag: z.string(),
  props: z.record(z.string(), z.unknown()).default({}),
  styles: z.record(z.string(), z.string()).optional(),
  children: z.array(z.uuid()).default([]),
  parentId: z.uuid().nullable(),
});

type Node = z.infer<typeof NodeSchema>;

const PageMetadataSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  slug: z.string(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  published: z.boolean().default(false),
});

const PageContentSchema = z.object({
  nodes: z.record(z.uuid(), NodeSchema),
  rootNodeId: z.uuid(),
  metadata: PageMetadataSchema,
});

type PageContent = z.infer<typeof PageContentSchema>;

const SaveResultSchema = z.object({
  success: z.boolean(),
  path: z.string().optional(),
  error: z.instanceof(Error).optional(),
});

type SaveResult = z.infer<typeof SaveResultSchema>;

const LoadResultSchema = z.object({
  success: z.boolean(),
  content: PageContentSchema.optional(),
  error: z.instanceof(Error).optional(),
});

type LoadResult = z.infer<typeof LoadResultSchema>;

class TestPageStorage {
  constructor(private basePath: string) {}

  async initialize(): Promise<void> {
    if (!existsSync(this.basePath)) {
      await mkdir(this.basePath, { recursive: true });
    }
  }

  async cleanup(): Promise<void> {
    if (existsSync(this.basePath)) {
      await rm(this.basePath, { recursive: true, force: true });
    }
  }

  async save(slug: string, content: PageContent): Promise<SaveResult> {
    try {
      PageContentSchema.parse(content);

      const path = join(this.basePath, `${slug}.json`);
      const json = JSON.stringify(content, null, 2);
      await writeFile(path, json, "utf-8");

      return SaveResultSchema.parse({
        success: true,
        path,
      });
    } catch (error) {
      return SaveResultSchema.parse({
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async load(slug: string): Promise<LoadResult> {
    try {
      const path = join(this.basePath, `${slug}.json`);

      if (!existsSync(path)) {
        return LoadResultSchema.parse({
          success: false,
          error: new Error(`Page ${slug} not found`),
        });
      }

      const json = await readFile(path, "utf-8");
      const content = JSON.parse(json);

      const validated = PageContentSchema.parse(content);

      return LoadResultSchema.parse({
        success: true,
        content: validated,
      });
    } catch (error) {
      return LoadResultSchema.parse({
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async exists(slug: string): Promise<boolean> {
    const path = join(this.basePath, `${slug}.json`);
    return existsSync(path);
  }

  async delete(slug: string): Promise<boolean> {
    try {
      const path = join(this.basePath, `${slug}.json`);
      if (existsSync(path)) {
        await rm(path);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

function createNode(
  type: string,
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

function createPage(slug: string, title: string): PageContent {
  const rootNode = createNode("container", "div", { className: "page-root" });

  return PageContentSchema.parse({
    nodes: {
      [rootNode.id]: rootNode,
    },
    rootNodeId: rootNode.id,
    metadata: {
      title,
      slug,
      published: false,
    },
  });
}

function addChildNode(page: PageContent, parentId: string, child: Node): void {
  child.parentId = parentId;
  page.nodes[child.id] = child;
  page.nodes[parentId].children.push(child.id);

  PageContentSchema.parse(page);
}

function updateNode(
  page: PageContent,
  nodeId: string,
  updates: Partial<Node>,
): void {
  const node = page.nodes[nodeId];
  if (!node) throw new Error(`Node ${nodeId} not found`);

  Object.assign(node, updates);

  NodeSchema.parse(node);
}

function deleteNode(page: PageContent, nodeId: string): void {
  const node = page.nodes[nodeId];
  if (!node) return;

  // Remove from parent's children
  if (node.parentId) {
    const parent = page.nodes[node.parentId];
    if (parent) {
      parent.children = parent.children.filter((id) => id !== nodeId);
    }
  }

  const childrenToDelete = [...node.children];
  for (const childId of childrenToDelete) {
    deleteNode(page, childId);
  }

  // Delete the node
  delete page.nodes[nodeId];

  PageContentSchema.parse(page);
}

describe("Page Lifecycle - Integration Tests", () => {
  let storage: TestPageStorage;
  const testDir = join(process.cwd(), "test-lifecycle-pages");

  beforeEach(async () => {
    storage = new TestPageStorage(testDir);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.cleanup();
  });

  describe("Basic Load-Edit-Save-Reload", () => {
    it("should persist simple text node addition", async () => {
      const slug = "test-page";
      const page = createPage(slug, "Test Page");

      const saveResult1 = await storage.save(slug, page);
      expect(saveResult1.success).toBe(true);

      const loadResult1 = await storage.load(slug);
      expect(loadResult1.success).toBe(true);
      expect(loadResult1.content).toBeDefined();

      // Edit: Add text node
      const textNode = createNode("text", "p", { text: "Hello World" });
      addChildNode(loadResult1.content!, page.rootNodeId, textNode);

      const saveResult2 = await storage.save(slug, loadResult1.content!);
      expect(saveResult2.success).toBe(true);

      const loadResult2 = await storage.load(slug);
      expect(loadResult2.success).toBe(true);
      expect(loadResult2.content).toBeDefined();

      const reloadedPage = loadResult2.content!;
      expect(Object.keys(reloadedPage.nodes)).toHaveLength(2); // root + text
      expect(reloadedPage.nodes[textNode.id]).toBeDefined();
      expect(reloadedPage.nodes[textNode.id].props.text).toBe("Hello World");
      expect(reloadedPage.nodes[page.rootNodeId].children).toContain(
        textNode.id,
      );

      PageContentSchema.parse(reloadedPage);
    });

    it("should persist multiple node additions", async () => {
      const slug = "multi-node-page";
      const page = createPage(slug, "Multi Node Page");

      await storage.save(slug, page);

      const loaded = (await storage.load(slug)).content!;

      const header = createNode("text", "h1", { text: "Title" });
      const section = createNode("container", "section", {});
      const paragraph = createNode("text", "p", { text: "Content" });
      const button = createNode("button", "button", { text: "Click Me" });

      addChildNode(loaded, loaded.rootNodeId, header);
      addChildNode(loaded, loaded.rootNodeId, section);
      addChildNode(loaded, section.id, paragraph);
      addChildNode(loaded, loaded.rootNodeId, button);

      await storage.save(slug, loaded);
      const reloaded = (await storage.load(slug)).content!;

      expect(Object.keys(reloaded.nodes)).toHaveLength(5);
      expect(reloaded.nodes[header.id].props.text).toBe("Title");
      expect(reloaded.nodes[section.id].children).toContain(paragraph.id);
      expect(reloaded.nodes[paragraph.id].parentId).toBe(section.id);

      PageContentSchema.parse(reloaded);
    });

    it("should persist node property updates", async () => {
      const slug = "update-props-page";
      const page = createPage(slug, "Update Props");

      const textNode = createNode("text", "p", { text: "Original" });
      addChildNode(page, page.rootNodeId, textNode);

      await storage.save(slug, page);

      // Load, edit props, save
      const loaded = (await storage.load(slug)).content!;
      updateNode(loaded, textNode.id, {
        props: { text: "Updated" },
      });

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;
      expect(reloaded.nodes[textNode.id].props.text).toBe("Updated");

      PageContentSchema.parse(reloaded);
    });

    it("should persist node deletions", async () => {
      const slug = "delete-node-page";
      const page = createPage(slug, "Delete Node");

      const node1 = createNode("text", "p", { text: "Keep me" });
      const node2 = createNode("text", "p", { text: "Delete me" });

      addChildNode(page, page.rootNodeId, node1);
      addChildNode(page, page.rootNodeId, node2);

      await storage.save(slug, page);

      // Load, delete, save
      const loaded = (await storage.load(slug)).content!;
      deleteNode(loaded, node2.id);

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;
      expect(reloaded.nodes[node1.id]).toBeDefined();
      expect(reloaded.nodes[node2.id]).toBeUndefined();
      expect(reloaded.nodes[page.rootNodeId].children).toHaveLength(1);

      PageContentSchema.parse(reloaded);
    });
  });

  describe("Complex Editing Workflows", () => {
    it("should handle complete page rebuild", async () => {
      const slug = "rebuild-page";
      const page = createPage(slug, "Original Page");

      const oldHeader = createNode("text", "h1", { text: "Old Title" });
      addChildNode(page, page.rootNodeId, oldHeader);

      await storage.save(slug, page);

      const loaded = (await storage.load(slug)).content!;

      const children = [...loaded.nodes[loaded.rootNodeId].children];
      for (const childId of children) {
        deleteNode(loaded, childId);
      }

      const newHeader = createNode("text", "h1", { text: "New Title" });
      const nav = createNode("container", "nav", {});
      const main = createNode("container", "main", {});
      const footer = createNode("container", "footer", {});

      addChildNode(loaded, loaded.rootNodeId, newHeader);
      addChildNode(loaded, loaded.rootNodeId, nav);
      addChildNode(loaded, loaded.rootNodeId, main);
      addChildNode(loaded, loaded.rootNodeId, footer);

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;
      expect(reloaded.nodes[oldHeader.id]).toBeUndefined();
      expect(reloaded.nodes[newHeader.id]).toBeDefined();
      expect(reloaded.nodes[loaded.rootNodeId].children).toHaveLength(4);

      PageContentSchema.parse(reloaded);
    });

    it("should persist deep nested structure", async () => {
      const slug = "deep-nested-page";
      const page = createPage(slug, "Deep Nested");

      await storage.save(slug, page);

      // Create deep nesting: root → a → b → c → d → e
      const loaded = (await storage.load(slug)).content!;

      const nodes = [
        createNode("container", "div", { level: 1 }),
        createNode("container", "div", { level: 2 }),
        createNode("container", "div", { level: 3 }),
        createNode("container", "div", { level: 4 }),
        createNode("text", "p", { level: 5, text: "Deep content" }),
      ];

      let parentId = loaded.rootNodeId;
      for (const node of nodes) {
        addChildNode(loaded, parentId, node);
        parentId = node.id;
      }

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;

      let currentId: string | null = reloaded.rootNodeId;
      let depth = 0;

      while (currentId && reloaded.nodes[currentId].children.length > 0) {
        currentId = reloaded.nodes[currentId].children[0];
        depth++;
      }

      expect(depth).toBe(5);
      expect(reloaded.nodes[nodes[4].id].props.text).toBe("Deep content");

      PageContentSchema.parse(reloaded);
    });

    it("should handle multiple edit cycles without corruption", async () => {
      const slug = "multi-cycle-page";
      const page = createPage(slug, "Multi Cycle");

      await storage.save(slug, page);

      // Cycle 1: Add nodes
      let current = (await storage.load(slug)).content!;
      const node1 = createNode("text", "p", { text: "Cycle 1" });
      addChildNode(current, current.rootNodeId, node1);
      await storage.save(slug, current);

      // Cycle 2: Modify nodes
      current = (await storage.load(slug)).content!;
      updateNode(current, node1.id, { props: { text: "Cycle 2 updated" } });
      await storage.save(slug, current);

      // Cycle 3: Add more nodes
      current = (await storage.load(slug)).content!;
      const node2 = createNode("button", "button", { text: "Cycle 3" });
      addChildNode(current, current.rootNodeId, node2);
      await storage.save(slug, current);

      // Cycle 4: Delete a node
      current = (await storage.load(slug)).content!;
      deleteNode(current, node1.id);
      await storage.save(slug, current);

      const final = (await storage.load(slug)).content!;

      expect(final.nodes[node1.id]).toBeUndefined();
      expect(final.nodes[node2.id]).toBeDefined();
      expect(final.nodes[node2.id].props.text).toBe("Cycle 3");

      PageContentSchema.parse(final);
    });
  });

  describe("Metadata Persistence", () => {
    it("should persist metadata updates", async () => {
      const slug = "metadata-page";
      const page = createPage(slug, "Original Title");

      await storage.save(slug, page);

      const loaded = (await storage.load(slug)).content!;
      loaded.metadata.title = "Updated Title";
      loaded.metadata.description = "A description";
      loaded.metadata.published = true;
      loaded.metadata.updatedAt = new Date().toISOString();

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;
      expect(reloaded.metadata.title).toBe("Updated Title");
      expect(reloaded.metadata.description).toBe("A description");
      expect(reloaded.metadata.published).toBe(true);
      expect(reloaded.metadata.updatedAt).toBeDefined();

      PageMetadataSchema.parse(reloaded.metadata);
    });

    it("should maintain metadata through node changes", async () => {
      const slug = "metadata-stable-page";
      const page = createPage(slug, "Stable Title");
      page.metadata.description = "Important description";

      await storage.save(slug, page);

      const loaded = (await storage.load(slug)).content!;
      const node = createNode("text", "p", { text: "Content" });
      addChildNode(loaded, loaded.rootNodeId, node);

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;
      expect(reloaded.metadata.title).toBe("Stable Title");
      expect(reloaded.metadata.description).toBe("Important description");
    });
  });

  describe("Data Integrity", () => {
    it("should maintain parent-child relationships", async () => {
      const slug = "relationships-page";
      const page = createPage(slug, "Relationships");

      const parent = createNode("container", "div", {});
      const child1 = createNode("text", "p", {});
      const child2 = createNode("text", "span", {});

      addChildNode(page, page.rootNodeId, parent);
      addChildNode(page, parent.id, child1);
      addChildNode(page, parent.id, child2);

      await storage.save(slug, page);

      const reloaded = (await storage.load(slug)).content!;

      expect(reloaded.nodes[parent.id].children).toEqual([
        child1.id,
        child2.id,
      ]);
      expect(reloaded.nodes[child1.id].parentId).toBe(parent.id);
      expect(reloaded.nodes[child2.id].parentId).toBe(parent.id);

      PageContentSchema.parse(reloaded);
    });

    it("should maintain node IDs across save/load cycles", async () => {
      const slug = "id-stability-page";
      const page = createPage(slug, "ID Stability");

      const nodeIds = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const node = createNode("text", "p", { index: i });
        addChildNode(page, page.rootNodeId, node);
        nodeIds.add(node.id);
      }

      await storage.save(slug, page);

      // Reload and verify all IDs exist
      const reloaded = (await storage.load(slug)).content!;

      for (const id of nodeIds) {
        expect(reloaded.nodes[id]).toBeDefined();
        expect(reloaded.nodes[id].id).toBe(id);
      }
    });

    it("should not create orphaned nodes", async () => {
      const slug = "no-orphans-page";
      const page = createPage(slug, "No Orphans");

      const parent = createNode("container", "div", {});
      const child = createNode("text", "p", {});

      addChildNode(page, page.rootNodeId, parent);
      addChildNode(page, parent.id, child);

      await storage.save(slug, page);

      // Delete parent (should also remove child)
      const loaded = (await storage.load(slug)).content!;
      deleteNode(loaded, parent.id);

      await storage.save(slug, loaded);

      const reloaded = (await storage.load(slug)).content!;

      for (const node of Object.values(reloaded.nodes)) {
        if (node.id === reloaded.rootNodeId) continue;

        // Every non-root node must have a valid parent
        expect(node.parentId).not.toBeNull();
        expect(reloaded.nodes[node.parentId!]).toBeDefined();
      }

      PageContentSchema.parse(reloaded);
    });

    it("should preserve node order in children array", async () => {
      const slug = "order-page";
      const page = createPage(slug, "Order");

      const nodes = [
        createNode("text", "p", { order: 1 }),
        createNode("text", "p", { order: 2 }),
        createNode("text", "p", { order: 3 }),
        createNode("text", "p", { order: 4 }),
        createNode("text", "p", { order: 5 }),
      ];

      for (const node of nodes) {
        addChildNode(page, page.rootNodeId, node);
      }

      await storage.save(slug, page);

      const reloaded = (await storage.load(slug)).content!;
      const childrenIds = reloaded.nodes[reloaded.rootNodeId].children;

      expect(childrenIds).toEqual(nodes.map((n) => n.id));

      for (let i = 0; i < nodes.length; i++) {
        expect(reloaded.nodes[childrenIds[i]].props.order).toBe(i + 1);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle loading non-existent page", async () => {
      const result = await storage.load("does-not-exist");

      expect(result.success).toBe(false);
      expect(result.content).toBeUndefined();
      expect(result.error).toBeDefined();

      LoadResultSchema.parse(result);
    });

    it("should validate corrupted data on load", async () => {
      const slug = "corrupted-page";
      const path = join(testDir, `${slug}.json`);

      await writeFile(path, JSON.stringify({ invalid: "structure" }), "utf-8");

      const result = await storage.load(slug);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid page content on save", async () => {
      const invalidPage: unknown = {
        nodes: { "not-a-uuid": { id: "invalid" } },
        rootNodeId: "not-a-uuid",
        metadata: { title: "Invalid" },
      };

      const result = await storage.save(
        "invalid",
        invalidPage as Parameters<typeof storage.save>[1],
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Real-World Scenarios", () => {
    it("should simulate complete editing session", async () => {
      const slug = "editing-session";

      // 1. Create new page
      const page = createPage(slug, "My Page");
      await storage.save(slug, page);

      // 2. First edit: Add header
      let current = (await storage.load(slug)).content!;
      const header = createNode("text", "h1", { text: "Welcome" });
      addChildNode(current, current.rootNodeId, header);
      await storage.save(slug, current);

      // 3. Second edit: Add main content
      current = (await storage.load(slug)).content!;
      const main = createNode("container", "main", {});
      const p1 = createNode("text", "p", { text: "Paragraph 1" });
      const p2 = createNode("text", "p", { text: "Paragraph 2" });
      addChildNode(current, current.rootNodeId, main);
      addChildNode(current, main.id, p1);
      addChildNode(current, main.id, p2);
      await storage.save(slug, current);

      // 4. Third edit: Update header
      current = (await storage.load(slug)).content!;
      updateNode(current, header.id, { props: { text: "Welcome - Updated" } });
      await storage.save(slug, current);

      // 5. Fourth edit: Publish
      current = (await storage.load(slug)).content!;
      current.metadata.published = true;
      current.metadata.updatedAt = new Date().toISOString();
      await storage.save(slug, current);

      // 6. Final verification
      const final = (await storage.load(slug)).content!;

      expect(Object.keys(final.nodes)).toHaveLength(5); // root + header + main + 2 paragraphs
      expect(final.nodes[header.id].props.text).toBe("Welcome - Updated");
      expect(final.nodes[main.id].children).toHaveLength(2);
      expect(final.metadata.published).toBe(true);

      PageContentSchema.parse(final);
    });
  });
});
