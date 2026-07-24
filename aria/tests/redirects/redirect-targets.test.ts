import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../../lib/storage/adapter";
import {
  loadRedirectTargetPaths,
  listRedirectTargets,
} from "../../lib/redirects/targets";
import { validateRedirectRule } from "../../lib/redirects/validate";

const publishedPost = {
  entry: {
    id: "post-1",
    collectionId: "blog",
    status: "published",
    version: "v1",
    authorId: "author-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
    scheduledFor: null,
  },
  locales: [
    {
      entryId: "post-1",
      collectionId: "blog",
      locale: "en",
      slug: "welcome",
      title: "Welcome",
      frontmatter: {},
      body: null,
      isSource: true,
    },
    {
      entryId: "post-1",
      collectionId: "blog",
      locale: "fr",
      slug: "bienvenue",
      title: "Bienvenue",
      frontmatter: {},
      body: null,
      isSource: false,
    },
    {
      entryId: "post-1",
      collectionId: "blog",
      locale: "de",
      slug: "willkommen",
      title: "Willkommen",
      frontmatter: {},
      body: null,
      isSource: false,
    },
  ],
};

const unpublishedPost = {
  ...publishedPost,
  entry: {
    ...publishedPost.entry,
    id: "post-2",
    status: "draft",
  },
  locales: [
    {
      ...publishedPost.locales[0],
      entryId: "post-2",
      slug: "draft-post",
      title: "Draft post",
    },
  ],
};

function createAdapter(): StorageAdapter {
  return {
    listPagesDSL: vi.fn(async () => [
      {
        id: "page-about",
        slug: "about",
        title: "About",
        status: "published",
        parent: null,
      },
    ]),
    listCollections: vi.fn(async () => [
      {
        id: "blog",
        name: "blog",
        label: "Blog",
        kind: "content",
        schema: {
          id: "blog",
          label: "Blog",
          kind: "content",
          fields: [],
          version: 1,
        },
        scope: "global",
        urlPattern: "/blog/{slug}",
        templatePageId: "blog-template",
        listPageId: null,
        supports: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "drafts",
        name: "drafts",
        label: "Drafts",
        kind: "content",
        schema: {
          id: "drafts",
          label: "Drafts",
          kind: "content",
          fields: [],
          version: 1,
        },
        scope: "global",
        urlPattern: "/drafts/{slug}",
        templatePageId: "missing-template",
        listPageId: null,
        supports: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "data",
        name: "data",
        label: "Data",
        kind: "data",
        schema: {
          id: "data",
          label: "Data",
          kind: "data",
          fields: [],
          version: 1,
        },
        scope: "global",
        urlPattern: null,
        templatePageId: null,
        listPageId: null,
        supports: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
    getSiteSettings: vi.fn(async () => ({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
            { code: "fr", label: "Français", enabled: true, fallbacks: [] },
            { code: "de", label: "Deutsch", enabled: false, fallbacks: [] },
          ],
        },
      },
    })),
    listPublishedPageLocaleRoutes: vi.fn(async () => [
      { locale: "fr", pathname: "/a-propos" },
    ]),
    getPublishedPageDSL: vi.fn(async (id: string) =>
      id === "blog-template" ? {} : null,
    ),
    listEntries: vi.fn(async ({ collectionId }: { collectionId: string }) =>
      collectionId === "blog"
        ? {
            items: [publishedPost, unpublishedPost],
            total: 2,
            page: 1,
            limit: 250,
          }
        : { items: [], total: 0, page: 1, limit: 250 },
    ),
    getEntry: vi.fn(async ({ idOrSlug }: { idOrSlug: string }) =>
      idOrSlug === "post-2" ? unpublishedPost : publishedPost,
    ),
  } as unknown as StorageAdapter;
}

describe("redirect route targets", () => {
  it("lists page and published localized CMS entry routes", async () => {
    const adapter = createAdapter();
    const targets = await listRedirectTargets(adapter);

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "page", path: "/about" }),
        expect.objectContaining({
          kind: "page",
          path: "/fr/a-propos",
          locale: "fr",
        }),
        expect.objectContaining({
          kind: "entry",
          title: "Welcome",
          path: "/blog/welcome",
          collectionLabel: "Blog",
          locale: "en",
        }),
        expect.objectContaining({
          kind: "entry",
          title: "Bienvenue",
          path: "/fr/blog/bienvenue",
          collectionLabel: "Blog",
          locale: "fr",
        }),
      ]),
    );
    expect(targets.map((target) => target.path)).not.toContain(
      "/de/blog/willkommen",
    );
    expect(targets.map((target) => target.path)).not.toContain(
      "/blog/draft-post",
    );
    expect(targets.map((target) => target.path)).not.toContain(
      "/drafts/welcome",
    );
    expect(adapter.listEntries).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: "blog", status: "published" }),
    );
    expect(adapter.listEntries).not.toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: "drafts" }),
    );
  });

  it("uses CMS entry routes for redirect destination and source validation", async () => {
    const livePaths = await loadRedirectTargetPaths(createAdapter());

    expect(
      validateRedirectRule(
        {
          fromPath: "/old-post",
          toPath: "/blog/welcome",
          statusCode: 301,
          enabled: true,
        },
        { existingRules: [], livePaths },
      ),
    ).toEqual([]);
    expect(
      validateRedirectRule(
        {
          fromPath: "/fr/blog/bienvenue",
          toPath: "/about",
          statusCode: 301,
          enabled: true,
        },
        { existingRules: [], livePaths },
      ).some((error) => error.field === "fromPath"),
    ).toBe(true);
  });
});
