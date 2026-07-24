import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ariaBindNodeField,
  ariaSetContainerLoop,
  ariaSetupBlog,
} from "../../../admin/features/Agent/lib/tools/cms/cmsTools";
import { createCollectionOnAdapter } from "../../../lib/cms/services/collections";
import { resolveCmsBoundNodes } from "../../../lib/cms/resolveBoundNodes";
import { NodeDataSourceSchema } from "../../../lib/schemas/nodes";
import type { BuilderNode } from "../../../lib/types/nodes";
import {
  adminUser,
  buildHeroBindPage,
  buildLoopTemplatePage,
  contributorUser,
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
    requireAuth: vi.fn(
      async (ctx: { locals?: { user?: typeof adminUser } }) => {
        return ctx.locals?.user ?? adminUser;
      },
    ),
    requireOperation: vi.fn(
      async (ctx: { locals?: { user?: typeof adminUser } }) => {
        return ctx.locals?.user ?? adminUser;
      },
    ),
  };
});

function findNode(
  nodes: readonly BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children ?? [], nodeId);
    if (found) return found;
  }
  return null;
}

describe("aria_bind_node_field", () => {
  beforeEach(async () => {
    await setupHarnessAdapter();
  });

  afterEach(async () => {
    await teardownHarnessAdapter();
  });

  it("returns NOT_FOUND for a missing node", async () => {
    const suffix = Date.now().toString(36);
    const page = buildHeroBindPage({
      pageId: `page-${suffix}`,
      slug: `missing-node-${suffix}`,
    });
    await harnessAdapter!.savePageDSL(page.id, page);

    const result = await ariaBindNodeField(createAgentContext(), {
      collection: "pages",
      slug: page.slug,
      nodeId: "does-not-exist",
      propName: "text",
      fieldPath: "hero_title",
      cmsCollection: "homepage",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("requires cmsCollection on a non-template marketing page", async () => {
    const suffix = Date.now().toString(36);
    const page = buildHeroBindPage({
      pageId: `page-${suffix}`,
      slug: `marketing-${suffix}`,
    });
    await harnessAdapter!.savePageDSL(page.id, page);

    const result = await ariaBindNodeField(createAgentContext(), {
      collection: "pages",
      slug: page.slug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "hero_title",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.suggestedFix).toContain("cmsCollection");
    }
  });

  it("binds inside an inherited loop with static item scope", async () => {
    const suffix = Date.now().toString(36);
    const postsName = `posts-${suffix}`;
    const page = buildLoopTemplatePage({
      pageId: `page-${suffix}`,
      slug: `loop-${suffix}`,
    });
    await harnessAdapter!.savePageDSL(page.id, page);

    const loopResult = await ariaSetContainerLoop(createAgentContext(), {
      collection: "pages",
      slug: page.slug,
      nodeId: "posts-loop",
      cmsCollection: postsName,
      limit: 3,
    });
    expect(loopResult.ok).toBe(true);

    const bindResult = await ariaBindNodeField(createAgentContext(), {
      collection: "pages",
      slug: page.slug,
      nodeId: "card-title",
      propName: "text",
      fieldPath: "title",
    });
    expect(bindResult.ok).toBe(true);
    if (bindResult.ok) {
      const parsed = NodeDataSourceSchema.parse(bindResult.data.dataSource);
      expect(parsed).toBeDefined();
      if (!parsed) return;
      expect(parsed.type).toBe("static");
      expect(parsed.bindings).toEqual({ text: "title" });
      expect(parsed.collection).toBeUndefined();
    }
  });

  it("updates an existing binding without duplicating keys", async () => {
    const suffix = Date.now().toString(36);
    const configName = `homepage-${suffix}`;
    const page = buildHeroBindPage({
      pageId: `page-${suffix}`,
      slug: `rebind-${suffix}`,
    });
    await harnessAdapter!.savePageDSL(page.id, page);
    const context = createAgentContext();

    await ariaSetupBlog(context, {
      topicsName: `topics-${suffix}`,
      postsName: `posts-${suffix}`,
      seedSampleEntry: false,
    });

    const collection = await createCollectionOnAdapter(harnessAdapter!, {
      name: configName,
      label: "Homepage",
      kind: "config",
      fields: [
        { key: "hero_title", label: "Hero Title", type: "string" },
        { key: "hero_subtitle", label: "Hero Subtitle", type: "string" },
      ],
    });

    const first = await ariaBindNodeField(context, {
      collection: "pages",
      slug: page.slug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "hero_title",
      cmsCollection: collection.name,
    });
    expect(first.ok).toBe(true);

    const second = await ariaBindNodeField(context, {
      collection: "pages",
      slug: page.slug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "hero_subtitle",
      cmsCollection: collection.name,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.dataSource.bindings).toEqual({
        text: "hero_subtitle",
      });
    }
  });

  it("infers collection from a template page assignment", async () => {
    const suffix = Date.now().toString(36);
    const postsName = `posts-${suffix}`;
    const pageId = `template-${suffix}`;
    const pageSlug = `post-template-${suffix}`;
    const context = createAgentContext();

    const page = buildHeroBindPage({ pageId, slug: pageSlug });
    await harnessAdapter!.savePageDSL(pageId, page);

    const collection = await createCollectionOnAdapter(harnessAdapter!, {
      name: postsName,
      label: "Posts",
      kind: "content",
      fields: [{ key: "excerpt", label: "Excerpt", type: "text" }],
      templatePageId: pageId,
      urlPattern: `/${postsName}/{slug}`,
    });

    const result = await ariaBindNodeField(context, {
      collection: "pages",
      slug: pageSlug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "title",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dataSource.collection).toBe(collection.name);
    }
  });

  it("rejects container loops without child template nodes", async () => {
    const suffix = Date.now().toString(36);
    const pageId = `page-${suffix}`;
    const pageSlug = `empty-loop-${suffix}`;
    const page = buildHeroBindPage({ pageId, slug: pageSlug });
    page.nodes[0]!.children = [
      {
        id: "empty-loop",
        type: "Container",
        props: {},
        styles: {},
        children: [],
      },
    ];
    await harnessAdapter!.savePageDSL(pageId, page);

    const result = await ariaSetContainerLoop(createAgentContext(), {
      collection: "pages",
      slug: pageSlug,
      nodeId: "empty-loop",
      cmsCollection: "posts",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("denies contributors without editPages from binding nodes", async () => {
    const suffix = Date.now().toString(36);
    const page = buildHeroBindPage({
      pageId: `page-${suffix}`,
      slug: `forbidden-${suffix}`,
    });
    await harnessAdapter!.savePageDSL(page.id, page);

    const context = createAgentContext(contributorUser);
    const result = await ariaBindNodeField(context, {
      collection: "pages",
      slug: page.slug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "hero_title",
      cmsCollection: "homepage",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("resolves config hero bindings without manual entryContext", async () => {
    const suffix = Date.now().toString(36);
    const configName = `homepage-${suffix}`;
    const pageId = `page-${suffix}`;
    const pageSlug = `config-resolve-${suffix}`;
    const context = createAgentContext();

    const setup = await ariaSetupBlog(context, {
      topicsName: `topics-${suffix}`,
      postsName: `posts-${suffix}`,
      seedSampleEntry: false,
    });
    expect(setup.ok).toBe(true);

    await createCollectionOnAdapter(harnessAdapter!, {
      name: configName,
      label: "Homepage",
      kind: "config",
      fields: [{ key: "hero_title", label: "Hero Title", type: "string" }],
    });

    const { createEntryOnAdapter } =
      await import("../../../lib/cms/services/entries");
    const collection = await harnessAdapter!
      .listCollections()
      .then((rows) => rows.find((row) => row.name === configName));
    expect(collection).toBeTruthy();
    await createEntryOnAdapter(
      harnessAdapter!,
      {
        collectionId: collection!.id,
        title: "Default",
        slug: "default",
        frontmatter: { hero_title: "Build with Aria" },
      },
      {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email!,
      },
    );

    const page = buildHeroBindPage({ pageId, slug: pageSlug });
    await harnessAdapter!.savePageDSL(pageId, page);

    const bind = await ariaBindNodeField(context, {
      collection: "pages",
      slug: pageSlug,
      nodeId: "hero-title",
      propName: "text",
      fieldPath: "hero_title",
      cmsCollection: configName,
    });
    expect(bind.ok).toBe(true);

    const persisted = await harnessAdapter!.getPageDSL(pageSlug);
    const resolvedNodes = await resolveCmsBoundNodes({
      nodes: persisted!.nodes,
      adapter: harnessAdapter!,
      basePath: "/",
      cms: { preview: true },
    });
    const hero = findNode(resolvedNodes, "hero-title");
    expect(hero?.props?.text).toBe("Build with Aria");
  });
});

describe("aria_setup_blog idempotency", () => {
  beforeEach(async () => {
    await setupHarnessAdapter();
  });

  afterEach(async () => {
    await teardownHarnessAdapter();
  });

  it("reuses existing collections on a second run", async () => {
    const suffix = Date.now().toString(36);
    const context = createAgentContext();
    const input = {
      topicsName: `topics-${suffix}`,
      postsName: `posts-${suffix}`,
      seedSampleEntry: true,
    };

    const first = await ariaSetupBlog(context, input);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.created).toEqual(
        expect.arrayContaining([input.topicsName, input.postsName]),
      );
    }

    const second = await ariaSetupBlog(context, input);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.created).toEqual([]);
      expect(second.data.reused).toEqual(
        expect.arrayContaining([input.topicsName, input.postsName]),
      );
    }
  });
});
