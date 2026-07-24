import { describe, expect, it, vi } from "vitest";
import { buildLocalizedCollectionFeedXml } from "../../lib/crawl/buildFeedXml";
import { loadLocalizedCollectionFeed } from "../../lib/crawl/loadLocalizedCollectionFeed";
import type { StorageAdapter } from "../../lib/storage/adapter";

describe("localized collection feeds", () => {
  it("uses only the requested locale and produces deterministic XML", async () => {
    const adapter = {
      getCollection: vi.fn(async () => ({
        id: "posts",
        name: "posts",
        label: "Posts",
        kind: "content",
        schema: {
          id: "posts",
          label: "Posts",
          kind: "content",
          fields: [],
          version: 1,
          rss: { enabled: true, itemLimit: 20 },
        },
        scope: "global",
        urlPattern: "/posts/{slug}",
        templatePageId: "post-template",
        listPageId: null,
        supports: ["rss"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      })),
      getSiteSettings: vi.fn(async () => ({
        siteUrl: "https://example.test",
        localization: {
          content: {
            defaultLocale: "en",
            locales: [
              { code: "en", label: "English", enabled: true, fallbacks: [] },
              {
                code: "fr",
                label: "Français",
                enabled: true,
                fallbacks: ["en"],
              },
            ],
          },
        },
      })),
      getPublishedPageDSL: vi.fn(async () => ({ id: "post-template" })),
      listEntries: vi.fn(async () => ({
        items: [
          {
            entry: {
              id: "bonjour",
              collectionId: "posts",
              status: "published",
              version: "v1",
              authorId: "author",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-03T00:00:00.000Z",
              publishedAt: "2026-01-03T00:00:00.000Z",
              scheduledFor: null,
            },
            locales: [
              {
                entryId: "bonjour",
                collectionId: "posts",
                locale: "en",
                slug: "hello",
                title: "Hello",
                frontmatter: {},
                body: null,
                isSource: true,
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
      })),
      getEntry: vi.fn(async () => ({
        entry: {
          id: "bonjour",
          collectionId: "posts",
          status: "published",
          version: "v1",
          authorId: "author",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
          publishedAt: "2026-01-03T00:00:00.000Z",
          scheduledFor: null,
        },
        locales: [
          {
            entryId: "bonjour",
            collectionId: "posts",
            locale: "en",
            slug: "hello",
            title: "Hello",
            frontmatter: {},
            body: null,
            isSource: true,
          },
          {
            entryId: "bonjour",
            collectionId: "posts",
            locale: "fr",
            slug: "bonjour",
            title: "Bonjour & bienvenue",
            frontmatter: {},
            body: "<p>Salut</p>",
            isSource: false,
          },
        ],
      })),
    } as unknown as StorageAdapter;

    const feed = await loadLocalizedCollectionFeed({
      adapter,
      collectionIdOrName: "posts",
      locale: "fr",
    });

    expect(feed?.link).toBe("https://example.test/fr/posts/rss.xml");
    expect(feed?.items[0]?.link).toBe("https://example.test/fr/posts/bonjour");
    expect(adapter.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({ includeAllLocales: true }),
    );
    const xml = buildLocalizedCollectionFeedXml(feed!);
    expect(xml).toContain("Bonjour &amp; bienvenue");
    expect(xml).toContain("<description>Salut</description>");
    expect(xml).not.toContain("new Date");
  });

  it("fails closed when RSS is not enabled", async () => {
    const adapter = {
      getCollection: vi.fn(async () => ({ supports: [] })),
    } as unknown as StorageAdapter;
    await expect(
      loadLocalizedCollectionFeed({
        adapter,
        collectionIdOrName: "private",
        locale: "en",
      }),
    ).resolves.toBeNull();
  });

  it("does not place a fallback locale variant under a localized feed URL", async () => {
    const adapter = {
      getCollection: vi.fn(async () => ({
        id: "posts",
        name: "posts",
        label: "Posts",
        supports: ["rss"],
        schema: { rss: { enabled: true, itemLimit: 20 } },
        urlPattern: "/posts/{slug}",
        templatePageId: "post-template",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      getSiteSettings: vi.fn(async () => ({
        siteUrl: "https://example.test",
        localization: {
          content: {
            defaultLocale: "en",
            locales: [
              { code: "en", label: "English", enabled: true, fallbacks: [] },
              {
                code: "fr",
                label: "Français",
                enabled: true,
                fallbacks: ["en"],
              },
            ],
          },
        },
      })),
      getPublishedPageDSL: vi.fn(async () => ({ id: "post-template" })),
      listEntries: vi.fn(async () => ({
        items: [{ entry: { id: "english-only" }, locales: [] }],
        total: 1,
        page: 1,
        limit: 100,
      })),
      getEntry: vi.fn(async () => ({
        entry: {
          id: "english-only",
          collectionId: "posts",
          status: "published",
          version: "v1",
          authorId: "author",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: "2026-01-01T00:00:00.000Z",
          scheduledFor: null,
        },
        locales: [
          {
            entryId: "english-only",
            collectionId: "posts",
            locale: "en",
            slug: "hello",
            title: "Hello",
            frontmatter: {},
            body: null,
            isSource: true,
          },
        ],
      })),
    } as unknown as StorageAdapter;

    const feed = await loadLocalizedCollectionFeed({
      adapter,
      collectionIdOrName: "posts",
      locale: "fr",
    });

    expect(feed?.items).toEqual([]);
  });
});
