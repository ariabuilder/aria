import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";
import {
  loadCollectionPublicPageRoute,
  resolveCollectionTemplateRoute,
} from "../../../lib/rendering/resolvePublicPageRoute";

function createCollection(
  overrides: Partial<AriaCollection> = {},
): AriaCollection {
  return {
    id: "collection-posts",
    name: "posts",
    label: "Posts",
    kind: "content",
    schema: {
      id: "collection-posts",
      label: "Posts",
      kind: "content",
      fields: [],
      version: 1,
    },
    scope: "global",
    urlPattern: "/posts/{slug}",
    templatePageId: "post-template",
    listPageId: null,
    supports: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function createEntry(
  overrides: Partial<AriaEntryRecord["entry"]> = {},
): AriaEntryRecord {
  return {
    entry: {
      id: "entry-launch",
      collectionId: "collection-posts",
      status: "published",
      version: "v1",
      authorId: "author-1",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
      publishedAt: "2026-06-02T00:00:00.000Z",
      scheduledFor: null,
      ...overrides,
    },
    locales: [
      {
        entryId: "entry-launch",
        collectionId: "collection-posts",
        locale: "en",
        slug: "launch-notes",
        title: "Launch Notes",
        frontmatter: {},
        body: null,
        isSource: true,
      },
    ],
  };
}

describe("resolvePublicPageRoute", () => {
  it("resolves published collection template routes", async () => {
    const collection = createCollection();
    const entry = createEntry();
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      getEntry: vi.fn(async () => entry),
    } as unknown as StorageAdapter;

    const route = await resolveCollectionTemplateRoute(adapter, {
      pathname: "/posts/launch-notes",
      stage: "published",
    });

    expect(route).toEqual({
      collectionId: "collection-posts",
      entrySlug: "launch-notes",
      entryId: "entry-launch",
      templatePageId: "post-template",
    });
  });

  it("requires the locale variant addressed by a public locale route", async () => {
    const collection = createCollection();
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      getEntry: vi.fn(async () => null),
    } as unknown as StorageAdapter;

    await expect(
      resolveCollectionTemplateRoute(adapter, {
        pathname: "/posts/bonjour",
        stage: "published",
        locale: "fr",
      }),
    ).resolves.toBeNull();
    expect(adapter.getEntry).toHaveBeenCalledWith({
      collectionId: "collection-posts",
      idOrSlug: "bonjour",
      locale: "fr",
    });
  });

  it("returns null for draft entries on public stage", async () => {
    const collection = createCollection();
    const entry = createEntry({ status: "draft", publishedAt: null });
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      getEntry: vi.fn(async () => ({
        ...entry,
        entry: { ...entry.entry, status: "draft" as const, publishedAt: null },
      })),
    } as unknown as StorageAdapter;

    const route = await resolveCollectionTemplateRoute(adapter, {
      pathname: "/posts/launch-notes",
      stage: "published",
    });

    expect(route).toBeNull();
  });

  it("resolves scheduled entries on preview stage", async () => {
    const collection = createCollection();
    const entry = createEntry({
      status: "scheduled",
      publishedAt: null,
      scheduledFor: "2026-12-01T09:00:00.000Z",
    });
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      getEntry: vi.fn(async () => entry),
    } as unknown as StorageAdapter;

    const route = await resolveCollectionTemplateRoute(adapter, {
      pathname: "/posts/launch-notes",
      stage: "draft",
    });

    expect(route?.entryId).toBe("entry-launch");
  });

  it("excludes archived entries on preview stage", async () => {
    const collection = createCollection();
    const entry = createEntry({ status: "archived" });
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      getEntry: vi.fn(async () => entry),
    } as unknown as StorageAdapter;

    const route = await resolveCollectionTemplateRoute(adapter, {
      pathname: "/posts/launch-notes",
      stage: "draft",
    });

    expect(route).toBeNull();
  });

  it("loads template page for collection routes", async () => {
    const collection = createCollection();
    const entry = createEntry();
    const templatePage = {
      id: "post-template",
      slug: "post-template",
      title: "Post Template",
      nodes: [],
    };
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      getEntry: vi.fn(async () => entry),
      getPublishedPageDSL: vi.fn(async (id: string) =>
        id === "post-template" ? templatePage : null,
      ),
    } as unknown as StorageAdapter;

    const route = await loadCollectionPublicPageRoute(adapter, {
      pathname: "/posts/launch-notes",
      stage: "published",
    });

    expect(route?.kind).toBe("collection");
    expect(route?.entryContext).toEqual({
      collectionId: "collection-posts",
      slug: "launch-notes",
      entryId: "entry-launch",
    });
    expect(route?.templatePage.id).toBe("post-template");
  });
});
