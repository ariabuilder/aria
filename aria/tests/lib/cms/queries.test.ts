import { describe, expect, it } from "vitest";
import { getAriaEntry } from "../../../lib/cms/queries";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";

const collection: AriaCollection = {
  id: "collection-posts",
  name: "posts",
  label: "Posts",
  kind: "content",
  scope: "global",
  schema: {
    id: "collection-posts",
    label: "Posts",
    kind: "content",
    fields: [{ key: "excerpt", label: "Excerpt", type: "text" }],
    entryFieldOrder: [],
    navigation: { showInSidebar: false },
    version: 1,
  },
  urlPattern: "/posts/{slug}",
  templatePageId: null,
  listPageId: null,
  supports: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const record: AriaEntryRecord = {
  entry: {
    id: "entry-1",
    collectionId: collection.id,
    authorId: "author-1",
    status: "published",
    version: "v1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
    scheduledFor: null,
  },
  locales: [
    {
      entryId: "entry-1",
      collectionId: collection.id,
      locale: "en",
      slug: "hello-world",
      title: "Hello World",
      frontmatter: { excerpt: "Intro" },
      body: [],
      isSource: true,
    },
  ],
  relations: [],
};

function createAdapter(): StorageAdapter {
  return {
    getCollection: async (idOrName: string) =>
      idOrName === collection.id || idOrName === collection.name
        ? collection
        : null,
    listEntries: async () => ({ items: [record], total: 1 }),
    getEntry: async () => record,
  } as unknown as StorageAdapter;
}

describe("hosted CMS query helpers", () => {
  it("returns a published entry with cache tags", async () => {
    const adapter = createAdapter();
    const result = await getAriaEntry(adapter, "posts", "hello-world");

    expect(result.entry).toMatchObject({
      slug: "hello-world",
      collectionName: "posts",
      title: "Hello World",
      data: { excerpt: "Intro" },
    });
    expect(
      result.cacheHint.tags.some((tag) => tag.includes("collection-posts")),
    ).toBe(true);
  });

  it("returns null for draft entries when status filter is published", async () => {
    const draftRecord: AriaEntryRecord = {
      ...record,
      entry: { ...record.entry, status: "draft", publishedAt: null },
    };
    const adapter = {
      ...createAdapter(),
      getEntry: async () => draftRecord,
    } as unknown as StorageAdapter;

    const result = await getAriaEntry(adapter, "posts", "hello-world", {
      status: "published",
    });

    expect(result.entry).toBeNull();
  });

  it("projects French content and falls back to English when French is absent", async () => {
    const bilingual: AriaEntryRecord = {
      ...record,
      locales: [
        ...record.locales,
        {
          ...record.locales[0]!,
          locale: "fr",
          slug: "bonjour-le-monde",
          title: "Bonjour le monde",
          frontmatter: { excerpt: "Bonjour" },
          isSource: false,
        },
      ],
    };
    const adapter = {
      ...createAdapter(),
      getEntry: async () => bilingual,
      getSiteSettings: async () => ({
        localization: {
          content: {
            defaultLocale: "en",
            locales: [
              { code: "en", label: "English", enabled: true, fallbacks: [] },
              { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
            ],
          },
        },
      }),
    } as unknown as StorageAdapter;

    await expect(
      getAriaEntry(adapter, "posts", "bonjour-le-monde", {
        locale: "fr",
        status: "any",
      }),
    ).resolves.toMatchObject({
      entry: { title: "Bonjour le monde", slug: "bonjour-le-monde" },
    });
  });
});
