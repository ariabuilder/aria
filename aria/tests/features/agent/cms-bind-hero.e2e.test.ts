import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ariaBindNodeField,
  ariaGetCmsInventory,
  ariaSetContainerLoop,
  ariaSetupBlog,
  ariaSetupConfigCollection,
} from "../../../admin/features/Agent/lib/tools/cms/cmsTools";
import { readResourceForTool } from "../../../admin/features/Agent/lib/tools/content/readResource";
import { resolveCmsBoundNodes } from "../../../lib/cms/resolveBoundNodes";
import { NodeDataSourceSchema } from "../../../lib/schemas/nodes";
import type { BuilderNode } from "../../../lib/types/nodes";
import {
  adminUser,
  buildHeroBindPage,
  createAgentContext,
  harnessAdapter,
  setupHarnessAdapter,
  teardownHarnessAdapter,
} from "./helpers/agentCmsHarness";

vi.mock("../../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => {
    if (!harnessAdapter) {
      throw new Error("Agent CMS harness not initialized");
    }
    return harnessAdapter;
  }),
  clearStorageAdapterCache: vi.fn(),
}));

vi.mock("../../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async () => adminUser),
    requireOperation: vi.fn(async () => adminUser),
  };
});

function findNode(nodes: readonly BuilderNode[], nodeId: string): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children ?? [], nodeId);
    if (found) return found;
  }
  return null;
}

describe("create blog and bind hero playbook", () => {
  beforeEach(async () => {
    await setupHarnessAdapter();
  });

  afterEach(async () => {
    await teardownHarnessAdapter();
  });

  it("runs setup, binds hero fields, loops posts, and resolves config copy", async () => {
    const suffix = Date.now().toString(36);
    const postsName = `posts-${suffix}`;
    const topicsName = `topics-${suffix}`;
    const configName = `homepage-${suffix}`;
    const pageId = `page-${suffix}`;
    const pageSlug = `hero-bind-${suffix}`;
    const context = createAgentContext();

    const inventoryBefore = await ariaGetCmsInventory(context, {
      includeEntries: false,
    });
    expect(inventoryBefore.ok).toBe(true);

    const blogResult = await ariaSetupBlog(context, {
      topicsName,
      postsName,
      seedSampleEntry: true,
    });
    expect(blogResult.ok).toBe(true);
    if (blogResult.ok) {
      expect(blogResult.data.created).toEqual(
        expect.arrayContaining([topicsName, postsName]),
      );
    }

    const configResult = await ariaSetupConfigCollection(context, {
      name: configName,
      label: "Homepage",
    });
    expect(configResult.ok).toBe(true);
    if (configResult.ok) {
      expect(configResult.data.created).toContain(configName);
      expect(configResult.data.entries.length).toBeGreaterThan(0);
    }

    const page = buildHeroBindPage({ pageId, slug: pageSlug });
    await harnessAdapter!.savePageDSL(pageId, page);

    const titleBind = await ariaBindNodeField(context, {
      collection: "pages",
      slug: pageSlug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "hero_title",
      cmsCollection: configName,
    });
    expect(titleBind.ok).toBe(true);
    if (titleBind.ok) {
      const parsed = NodeDataSourceSchema.parse(titleBind.data.dataSource);
      expect(parsed).toMatchObject({
        type: "collection",
        mode: "single",
        collection: configName,
        bindings: { text: "hero_title" },
        filter: { slug: "default" },
      });
    }

    const imageBind = await ariaBindNodeField(context, {
      collection: "pages",
      slug: pageSlug,
      nodeId: "hero-image",
      propName: "src",
      fieldPath: "hero_image",
      cmsCollection: configName,
    });
    expect(imageBind.ok).toBe(true);
    if (imageBind.ok) {
      expect(imageBind.data.dataSource).toMatchObject({
        bindings: { src: "hero_image" },
      });
    }

    const loopBind = await ariaSetContainerLoop(context, {
      collection: "pages",
      slug: pageSlug,
      nodeId: "latest-posts",
      cmsCollection: postsName,
      limit: 6,
    });
    expect(loopBind.ok).toBe(true);
    if (loopBind.ok) {
      expect(loopBind.data.dataSource).toMatchObject({
        type: "collection",
        mode: "list",
        collection: postsName,
        limit: 6,
      });
    }

    const readBack = await readResourceForTool(context, {
      collection: "pages",
      slug: pageSlug,
      target: "draft",
    });
    expect(readBack.ok).toBe(true);
    if (readBack.ok) {
      const heroNode = findNode(readBack.data.nodes ?? [], "hero-title");
      expect(heroNode?.dataSource).toMatchObject({
        collection: configName,
        bindings: { text: "hero_title" },
        filter: { slug: "default" },
      });
    }

    const persisted = await harnessAdapter!.getPageDSL(pageSlug);
    expect(persisted).not.toBeNull();
    const resolvedNodes = await resolveCmsBoundNodes({
      nodes: persisted!.nodes,
      adapter: harnessAdapter!,
      basePath: "/",
      cms: { preview: true },
    });
    const resolvedHero = findNode(resolvedNodes, "hero-title");
    expect(resolvedHero?.props?.text).toBe("Build with Aria");
  });
});
