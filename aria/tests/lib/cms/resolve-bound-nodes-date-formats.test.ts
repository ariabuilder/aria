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

const blogEntry = {
  entry: {
    id: "entry-1",
    collectionId: blogCollection.id,
    status: "published",
    version: "1",
    authorId: "user-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    publishedAt: "2026-07-07T17:13:01.028Z",
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

function createAdapterStub(): StorageAdapter {
  return {
    listCollections: async () => [blogCollection],
    getCollection: async (idOrName: string) =>
      idOrName === blogCollection.id || idOrName === blogCollection.name
        ? blogCollection
        : null,
    getEntry: async () => blogEntry,
  } as unknown as StorageAdapter;
}

describe("resolveCmsBoundNodes date binding formats", () => {
  it("formats bound date values using bindingFormats metadata", async () => {
    const nodes: BuilderNode[] = [
      {
        id: "date-text",
        type: "text",
        props: { content: "" },
        styles: {},
        children: [],
        dataSource: {
          type: "collection",
          collection: "blog",
          mode: "single",
          filter: { slug: "hello-world" },
          bindings: {
            content: "blog.publishedAt",
          },
          bindingFormats: {
            content: "medium",
          },
        },
      },
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(),
      basePath: "/",
    });

    expect(resolved[0]?.props.content).toBe("July 7, 2026");
  });
});
