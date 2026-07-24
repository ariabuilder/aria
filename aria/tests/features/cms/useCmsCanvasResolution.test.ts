import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderNode } from "../../../lib/types/nodes";

const { resolveMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      resolvePageNodes: {
        resolve: resolveMock,
      },
    },
  },
}));

function node(overrides: Partial<BuilderNode> = {}): BuilderNode {
  return {
    id: "node-1",
    type: "Text",
    props: { text: "Fallback" },
    styles: {},
    children: [],
    ...overrides,
  };
}

describe("resolveCmsCanvasBlocks", () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  it("skips the CMS action when no source or entry context exists", async () => {
    const { resolveCmsCanvasBlocks } = await import(
      "../../../admin/features/CMS/composables/useCmsCanvasResolution"
    );
    const blocks = [node()];

    const resolved = await resolveCmsCanvasBlocks(blocks, { basePath: "/" });

    expect(resolveMock).not.toHaveBeenCalled();
    expect(resolved).toEqual(blocks);
    expect(resolved).not.toBe(blocks);
  });

  it("resolves list data sources for canvas rendering", async () => {
    const { resolveCmsCanvasBlocks } = await import(
      "../../../admin/features/CMS/composables/useCmsCanvasResolution"
    );
    const sourceBlock = node({
      id: "posts-list",
      type: "Container",
      dataSource: {
        type: "cms",
        collection: "posts",
        mode: "list",
        bindings: { text: "posts.title" },
      },
    });
    const renderedBlock = node({ id: "rendered-post" });
    resolveMock.mockResolvedValueOnce({
      data: { nodes: [renderedBlock] },
      error: null,
    });

    const resolved = await resolveCmsCanvasBlocks([sourceBlock], {
      basePath: "/posts",
    });

    expect(resolveMock).toHaveBeenCalledWith({
      nodes: [sourceBlock],
      basePath: "/posts",
      cms: { preview: true },
    });
    expect(resolved).toEqual([renderedBlock]);
  });

  it("passes preview entry context for single-entry template rendering", async () => {
    const { resolveCmsCanvasBlocks } = await import(
      "../../../admin/features/CMS/composables/useCmsCanvasResolution"
    );
    const sourceBlock = node({
      id: "post-title",
      dataSource: {
        type: "cms",
        collection: "posts",
        mode: "single",
        bindings: { text: "posts.title" },
      },
    });
    const cms = {
      preview: true,
      entryContext: {
        collectionId: "collection-posts",
        entryId: "entry-1",
        slug: "hello-world",
      },
    };
    resolveMock.mockResolvedValueOnce({
      data: { nodes: [node({ id: "resolved-title" })] },
      error: null,
    });

    await resolveCmsCanvasBlocks([sourceBlock], {
      basePath: "/posts/hello-world",
      cms,
    });

    expect(resolveMock).toHaveBeenCalledWith({
      nodes: [sourceBlock],
      basePath: "/posts/hello-world",
      cms,
    });
  });

  it("re-resolves canvas blocks when preview entry context changes", async () => {
    const { resolveCmsCanvasBlocks } = await import(
      "../../../admin/features/CMS/composables/useCmsCanvasResolution"
    );
    const sourceBlock = node({
      id: "tag-posts",
      type: "Container",
      dataSource: {
        type: "collection",
        collection: "blog",
        mode: "list",
        filter: {
          relationIncludes: {
            field: "tags",
            entryId: "$entryContext.id",
          },
        },
      },
    });
    resolveMock
      .mockResolvedValueOnce({
        data: { nodes: [node({ id: "design-post" })] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { nodes: [node({ id: "engineering-post" })] },
        error: null,
      });

    await resolveCmsCanvasBlocks([sourceBlock], {
      basePath: "/tags/design",
      cms: {
        preview: true,
        entryContext: {
          collectionId: "collection-tags",
          entryId: "tag-design",
          slug: "design",
        },
      },
    });
    await resolveCmsCanvasBlocks([sourceBlock], {
      basePath: "/tags/engineering",
      cms: {
        preview: true,
        entryContext: {
          collectionId: "collection-tags",
          entryId: "tag-engineering",
          slug: "engineering",
        },
      },
    });

    expect(resolveMock).toHaveBeenNthCalledWith(1, {
      nodes: [sourceBlock],
      basePath: "/tags/design",
      cms: {
        preview: true,
        entryContext: {
          collectionId: "collection-tags",
          entryId: "tag-design",
          slug: "design",
        },
      },
    });
    expect(resolveMock).toHaveBeenNthCalledWith(2, {
      nodes: [sourceBlock],
      basePath: "/tags/engineering",
      cms: {
        preview: true,
        entryContext: {
          collectionId: "collection-tags",
          entryId: "tag-engineering",
          slug: "engineering",
        },
      },
    });
  });
});
