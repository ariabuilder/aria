import { describe, expect, it, vi } from "vitest";

import {
  cmsRouteSafetyErrorMessage,
  validateCmsCollectionRouteSafety,
} from "../../../lib/cms/routeSafety";
import {
  createCollectionOnAdapter,
  updateCollectionOnAdapter,
  setCollectionTemplateOnAdapter,
  clearCollectionTemplateOnAdapter,
} from "../../../lib/cms/services/collections";
import {
  AriaCollectionSchema,
  type AriaCollection,
} from "../../../lib/cms/schemas";
import type { CmsPageReference } from "../../../lib/cms/pageUsage";
import type {
  PageInventoryItem,
  StorageAdapter,
} from "../../../lib/storage/adapter";

function collection(
  overrides: Partial<AriaCollection> &
    Pick<AriaCollection, "id" | "name" | "label">,
): AriaCollection {
  const kind = overrides.kind ?? "content";
  return AriaCollectionSchema.parse({
    ...overrides,
    id: overrides.id,
    name: overrides.name,
    label: overrides.label,
    kind,
    schema: overrides.schema ?? {
      id: overrides.id,
      label: overrides.label,
      kind,
      fields: [],
      version: 1,
    },
    scope: overrides.scope ?? "global",
    urlPattern: overrides.urlPattern ?? null,
    templatePageId: overrides.templatePageId ?? null,
    listPageId: overrides.listPageId ?? null,
    supports: overrides.supports ?? [],
    createdAt: overrides.createdAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
  });
}

const page = {
  id: "page-template",
  slug: "post-template",
  title: "Post Template",
} satisfies CmsPageReference;

const inventoryPage = {
  id: "page-template",
  slug: "post-template",
  title: "Post Template",
  status: "draft",
  isModifiedSincePublish: false,
  systemRole: "standard",
  accessMode: "public",
  hasPassword: false,
} satisfies PageInventoryItem;

function adapter(collections: AriaCollection[] = []): StorageAdapter {
  return {
    getCollection: vi.fn(
      async (idOrName: string) =>
        collections.find(
          (item) => item.id === idOrName || item.name === idOrName,
        ) ?? null,
    ),
    listCollections: vi.fn(async () => collections),
    listPagesDSL: vi.fn(async () => [inventoryPage]),
    getSiteSettings: vi.fn(async () => ({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
          ],
        },
      },
    })),
    getPageLocaleRoute: vi.fn(async () => null),
    listPublishedPageLocaleRoutes: vi.fn(async () => []),
    replaceCmsSearchDocuments: vi.fn(async () => undefined),
    beginCmsSearchScopeRebuild: vi.fn(async () => true),
    listEntries: vi.fn(async () => ({ items: [], total: 0 })),
    writeCmsSearchScopeGeneration: vi.fn(async () => undefined),
    commitCmsSearchScopeRebuild: vi.fn(async () => true),
    cleanupInactiveCmsSearchDocuments: vi.fn(async () => undefined),
    abortCmsSearchScopeRebuild: vi.fn(async () => undefined),
    saveCollection: vi.fn(async (next: AriaCollection) => next),
    deleteCollection: vi.fn(async () => undefined),
  } as unknown as StorageAdapter;
}

describe("CMS route safety", () => {
  it("blocks invalid URL patterns and unsupported tokens", () => {
    const active = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      urlPattern: "/posts/{id}",
      templatePageId: "page-template",
    });

    const result = validateCmsCollectionRouteSafety({
      collection: active,
      collections: [active],
      pages: [page],
      mode: "update",
    });

    expect(result.blocking).toContainEqual(
      expect.objectContaining({
        code: "invalid-url-pattern",
        severity: "blocking",
      }),
    );
  });

  it("blocks missing page refs and advises on route patterns without templates", () => {
    const active = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      urlPattern: "/posts/{slug}",
      templatePageId: "missing-template",
      listPageId: "missing-list",
    });

    const result = validateCmsCollectionRouteSafety({
      collection: active,
      collections: [active],
      pages: [page],
      mode: "update",
    });

    expect(result.blocking.map((warning) => warning.code)).toEqual([
      "missing-template-page",
      "missing-list-page",
    ]);

    const noTemplate = validateCmsCollectionRouteSafety({
      collection: collection({
        id: "collection-no-template",
        name: "no-template",
        label: "No Template",
        urlPattern: "/posts/{slug}",
      }),
      collections: [],
      pages: [page],
      mode: "update",
    });

    expect(noTemplate.advisory).toContainEqual(
      expect.objectContaining({ code: "route-pattern-without-template" }),
    );
    expect(noTemplate.blocking).toEqual([]);
  });

  it("keeps template-only, static conflicts, and overlaps advisory", () => {
    const active = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      templatePageId: "page-template",
    });
    const templateOnly = validateCmsCollectionRouteSafety({
      collection: active,
      collections: [active],
      pages: [page],
      mode: "update",
    });

    expect(templateOnly.advisory).toContainEqual(
      expect.objectContaining({ code: "template-without-url-pattern" }),
    );

    const overlapping = collection({
      id: "collection-news",
      name: "news",
      label: "News",
      urlPattern: "/posts/{slug}",
      templatePageId: "page-template",
    });
    const result = validateCmsCollectionRouteSafety({
      collection: collection({
        id: "collection-blog",
        name: "blog",
        label: "Blog",
        urlPattern: "/posts/{slug}",
        templatePageId: "page-template",
      }),
      collections: [overlapping],
      pages: [page],
      mode: "update",
    });

    expect(result.blocking).toEqual([]);
    expect(result.advisory).toContainEqual(
      expect.objectContaining({ code: "overlapping-collection-pattern" }),
    );
  });

  it("enforces route safety in collection services", async () => {
    const storage = adapter();
    await expect(
      createCollectionOnAdapter(storage, {
        name: "blog",
        label: "Blog",
        kind: "content",
        fields: [],
        urlPattern: "/posts/{slug}",
      }),
    ).resolves.toMatchObject({
      name: "blog",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
    });

    const existing = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const updateStorage = adapter([existing]);
    await expect(
      updateCollectionOnAdapter(updateStorage, {
        id: existing.id,
        patch: {
          urlPattern: "/posts/{slug}",
          templatePageId: "missing-template",
        },
      }),
    ).rejects.toThrow("template page no longer exists");

    await expect(
      setCollectionTemplateOnAdapter(updateStorage, {
        collectionId: existing.id,
        templatePageId: "",
      }),
    ).rejects.toThrow("Choose a template page");

    await expect(
      clearCollectionTemplateOnAdapter(updateStorage, existing.id),
    ).resolves.toMatchObject({
      templatePageId: null,
      listPageId: null,
      urlPattern: null,
    });
  });

  it("blocks a collection pattern that would absorb a localized page route", async () => {
    const existing = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const storage = adapter([existing]);
    vi.mocked(storage.getSiteSettings).mockResolvedValue({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
            { code: "fr", label: "French", enabled: true, fallbacks: [] },
          ],
        },
      },
    } as never);
    vi.mocked(storage.getPageLocaleRoute).mockResolvedValue({
      locale: "fr",
      pathname: "/blog/a-propos",
      pathnameKey: "/blog/a-propos",
      pageId: "page-template",
      draftClaim: true,
      publishedClaim: false,
    });

    await expect(
      updateCollectionOnAdapter(storage, {
        id: existing.id,
        patch: {
          urlPattern: "/blog/{slug}",
          templatePageId: "page-template",
        },
      }),
    ).rejects.toThrow("conflicts with localized fr page route /blog/a-propos");
  });

  it("allows support-only updates without re-validating unchanged routing", async () => {
    const existing = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
      supports: ["body", "drafts"],
    });
    const updateStorage = adapter([existing]);

    await expect(
      updateCollectionOnAdapter(updateStorage, {
        id: existing.id,
        patch: {
          supports: ["drafts"],
          urlPattern: "/posts/{slug}",
          templatePageId: null,
          listPageId: null,
        },
      }),
    ).resolves.toMatchObject({
      supports: ["drafts"],
      urlPattern: "/posts/{slug}",
      templatePageId: null,
    });
  });

  it("validates routing when url pattern changes without a template", async () => {
    const existing = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const updateStorage = adapter([existing]);

    await expect(
      updateCollectionOnAdapter(updateStorage, {
        id: existing.id,
        patch: {
          urlPattern: "/posts/{slug}",
          templatePageId: null,
        },
      }),
    ).resolves.toMatchObject({
      urlPattern: "/posts/{slug}",
      templatePageId: null,
    });
  });

  it("formats blocking messages for action errors", () => {
    const result = validateCmsCollectionRouteSafety({
      collection: collection({
        id: "collection-blog",
        name: "blog",
        label: "Blog",
        urlPattern: "/posts/{slug}",
      }),
      collections: [],
      pages: [page],
      mode: "create",
    });

    expect(cmsRouteSafetyErrorMessage(result)).toBeNull();
    expect(result.advisory).toContainEqual(
      expect.objectContaining({ code: "route-pattern-without-template" }),
    );
  });

  it("blocks cms-entry pages as list templates", () => {
    const active = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      listPageId: "page-template",
    });

    const result = validateCmsCollectionRouteSafety({
      collection: active,
      collections: [active],
      pages: [{ ...page, systemRole: "cms-entry" }],
      mode: "update",
    });

    expect(result.blocking).toContainEqual(
      expect.objectContaining({ code: "invalid-list-page-role" }),
    );
  });

  it("does not warn when the entry template page is standard (auto-promoted on save)", () => {
    const active = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      urlPattern: "/posts/{slug}",
      templatePageId: "page-template",
    });

    const result = validateCmsCollectionRouteSafety({
      collection: active,
      collections: [active],
      pages: [{ ...page, systemRole: "standard" }],
      mode: "update",
    });

    expect(result.blocking).toEqual([]);
  });

  it("blocks when the entry template page is a cms-collection page for another collection", () => {
    const news = collection({
      id: "collection-news",
      name: "news",
      label: "News",
      listPageId: "page-template",
    });
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      urlPattern: "/posts/{slug}",
      templatePageId: "page-template",
    });

    const result = validateCmsCollectionRouteSafety({
      collection: blog,
      collections: [news, blog],
      pages: [{ ...page, systemRole: "cms-collection" }],
      mode: "update",
    });

    expect(result.blocking).toContainEqual(
      expect.objectContaining({ code: "invalid-template-page-role" }),
    );
  });
});
