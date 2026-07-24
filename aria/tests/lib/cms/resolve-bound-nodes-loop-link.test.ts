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
    fields: [],
    version: 1,
  },
  scope: "global",
  urlPattern: "/blog/{slug}",
  templatePageId: "page-template",
  listPageId: "page-blog",
  supports: [],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
} satisfies AriaCollection;

const helloEntry = {
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
      frontmatter: {},
      body: null,
    },
  ],
  relations: [],
} satisfies AriaEntryRecord;

const secondEntry = {
  ...helloEntry,
  entry: {
    ...helloEntry.entry,
    id: "entry-2",
  },
  locales: [
    {
      ...helloEntry.locales[0]!,
      entryId: "entry-2",
      title: "Second Post",
      slug: "second-post",
    },
  ],
} satisfies AriaEntryRecord;

function createAdapterStub(): StorageAdapter {
  return {
    listCollections: async () => [blogCollection],
    getCollection: async (idOrName: string) =>
      idOrName === blogCollection.id || idOrName === blogCollection.name
        ? blogCollection
        : null,
    getEntry: async () => helloEntry,
    listEntries: async () => ({
      items: [helloEntry, secondEntry],
      total: 2,
      page: 1,
      limit: 50,
    }),
  } as unknown as StorageAdapter;
}

function findCardNodes(nodes: readonly BuilderNode[]): BuilderNode[] {
  return nodes.flatMap((node) => {
    const self = node.type?.toLowerCase() === "card" ? [node] : [];
    return [...self, ...findCardNodes(node.children ?? [])];
  });
}

describe("resolveCmsBoundNodes loop item links", () => {
  it("propagates bound href onto each expanded clone", async () => {
    const nodes: BuilderNode[] = [
      {
        id: "loop-container",
        type: "container",
        props: { target: "_blank" },
        styles: {},
        children: [
          {
            id: "card-template",
            type: "card",
            props: {},
            styles: {},
            children: [],
          },
        ],
        dataSource: {
          type: "collection",
          collection: "blog",
          mode: "list",
          bindings: {
            href: "blog.url",
          },
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

    const cards = findCardNodes(resolved);
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.props?.href)).toEqual([
      "/blog/hello-world",
      "/blog/second-post",
    ]);
    expect(cards.every((card) => card.props?.target === "_blank")).toBe(true);
  });

  it("copies static href onto each expanded clone", async () => {
    const nodes: BuilderNode[] = [
      {
        id: "loop-container",
        type: "container",
        props: {
          href: "/features",
          target: "_blank",
          rel: "noopener",
        },
        styles: {},
        children: [
          {
            id: "card-template",
            type: "card",
            props: {},
            styles: {},
            children: [],
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

    const cards = findCardNodes(resolved);
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.props?.href === "/features")).toBe(true);
    expect(cards.every((card) => card.props?.target === "_blank")).toBe(true);
    expect(cards.every((card) => card.props?.rel === "noopener")).toBe(true);
  });
});
