import { describe, expect, it } from "vitest";

import { resolveCmsBoundNodes } from "../../../lib/cms/resolveBoundNodes";
import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { BuilderNode } from "../../../lib/types/nodes";

const blogCollection = {
  id: "collection-blog",
  name: "blog",
  label: "Blog",
  kind: "content",
  schema: {
    id: "collection-blog",
    label: "Blog",
    kind: "content",
    fields: [{ key: "cover", label: "Cover", type: "image" }],
    version: 1,
  },
  scope: "global",
  urlPattern: "/blog/{slug}",
  templatePageId: "page-template",
  listPageId: "page-blog",
  supports: ["cover"],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
} satisfies AriaCollection;

const blogEntry = {
  entry: {
    id: "entry-1",
    collectionId: blogCollection.id,
    status: "published",
    version: "1",
    authorId: "user-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    publishedAt: "2026-06-30T00:00:00.000Z",
    scheduledFor: null,
  },
  locales: [
    {
      entryId: "entry-1",
      collectionId: blogCollection.id,
      locale: "en",
      isSource: true,
      title: "Hello World",
      slug: "hello-world",
      frontmatter: { cover: "hello-world-cover.png" },
      body: null,
    },
  ],
  relations: [],
} satisfies AriaEntryRecord;

function createAdapterStub(): StorageAdapter {
  return {
    listCollections: async () => [blogCollection],
    getCollection: async (idOrName: string) =>
      idOrName === blogCollection.id || idOrName === blogCollection.name
        ? blogCollection
        : null,
    listEntries: async () => ({
      items: [blogEntry],
      total: 1,
      page: 1,
      limit: 50,
    }),
  } as unknown as StorageAdapter;
}

function findImageNodes(nodes: readonly BuilderNode[]): BuilderNode[] {
  return nodes.flatMap((node) => {
    const self = node.type?.toLowerCase() === "image" ? [node] : [];
    return [...self, ...findImageNodes(node.children ?? [])];
  });
}

describe("blog list cover resolution integration", () => {
  it("materializes bare filename cover values for list templates", async () => {
    const nodes: BuilderNode[] = [
      {
        id: "blog-list",
        type: "container",
        props: {},
        styles: {},
        children: [
          {
            id: "post-cover",
            type: "image",
            props: {},
            styles: {},
            children: [],
            dataSource: {
              type: "collection",
              collection: "blog",
              mode: "single",
              bindings: { src: "blog.cover" },
            },
          },
        ],
        dataSource: {
          type: "collection",
          collection: "blog",
          mode: "list",
        },
      },
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(),
      basePath: "/blog",
      cms: { preview: true },
      catalog: null,
    });

    expect(findImageNodes(resolved).map((node) => node.props?.src)).toEqual([
      "/uploads/hello-world-cover.png",
    ]);
  });
});
