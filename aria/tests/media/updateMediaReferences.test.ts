import { describe, expect, it, vi } from "vitest";
import { z } from "astro/zod";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import { updateMediaReferencesForPath } from "../../lib/media/catalog/updateMediaReferences";
import {
  StoredMediaUsageSchema,
  type SiteSettings,
  type StorageAdapter,
} from "../../lib/storage/adapter";
import type { SessionUser } from "../../lib/auth/types";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../lib/types/nodes";

const administrator: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
};

const authorship = buildAuthorshipSaveContext(administrator, "save-page");

const pageWithHero: PageDSL = {
  id: "home",
  title: "Home",
  slug: "home",
  nodes: [
    {
      id: "n1",
      type: "Image",
      props: { src: "/uploads/gallery/hero.jpg" },
      styles: {},
      children: [],
    },
  ],
  featuredImage: {
    src: "/uploads/gallery/hero.jpg",
  },
};

const layoutWithHero: LayoutDSL = {
  id: "default",
  name: "Default",
  nodes: [
    {
      id: "l1",
      type: "Image",
      props: { src: "/uploads/gallery/hero.jpg" },
      styles: {},
      children: [],
    },
  ],
  slots: [{ name: "default", label: "Default", isDefault: true }],
};

const componentWithHero: ComponentDSL = {
  id: "hero",
  name: "Hero",
  category: "marketing",
  nodes: [
    {
      id: "c1",
      type: "Image",
      props: { src: "/uploads/gallery/hero.jpg" },
      styles: {},
      children: [],
    },
  ],
};

function createMockAdapter(
  overrides: Partial<StorageAdapter> = {},
): StorageAdapter {
  const pages = new Map<string, PageDSL>([
    ["home", structuredClone(pageWithHero)],
  ]);
  const layouts = new Map<string, LayoutDSL>([
    ["default", structuredClone(layoutWithHero)],
  ]);
  const components = new Map<string, ComponentDSL>([
    ["hero", structuredClone(componentWithHero)],
  ]);
  let siteSettings: SiteSettings = {
    favicon: "/uploads/gallery/hero.jpg",
    ogImage: "https://cdn.example.com/uploads/gallery/hero.jpg",
  };

  const adapter = {
    getPageDSL: vi.fn(async (id: string) => pages.get(id) ?? null),
    getPublishedPageDSL: vi.fn(async () => null),
    savePageDSL: vi.fn(async (id: string, dsl: PageDSL) => {
      pages.set(id, structuredClone(dsl));
      return "1";
    }),
    listPagesDSL: vi.fn(async () =>
      Array.from(pages.values()).map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        status: "draft" as const,
        isModifiedSincePublish: false,
        systemRole: "standard" as const,
        accessMode: "public" as const,
        hasPassword: false,
      })),
    ),
    getLayoutDSL: vi.fn(async (id: string) => layouts.get(id) ?? null),
    saveLayoutDSL: vi.fn(async (id: string, dsl: LayoutDSL) => {
      layouts.set(id, structuredClone(dsl));
      return "1";
    }),
    listLayoutsDSL: vi.fn(async () =>
      Array.from(layouts.values()).map((layout) => ({
        id: layout.id,
        name: layout.name,
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    ),
    getComponentDSL: vi.fn(async (id: string) => components.get(id) ?? null),
    saveComponentDSL: vi.fn(async (id: string, dsl: ComponentDSL) => {
      components.set(id, structuredClone(dsl));
      return "1";
    }),
    listComponentsDSL: vi.fn(async () =>
      Array.from(components.values()).map((component) => ({
        id: component.id,
        name: component.name,
        category: component.category,
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    ),
    listCollections: vi.fn(async () => []),
    listPageLocaleRecords: vi.fn(async () => []),
    listLayoutLocaleRecords: vi.fn(async () => []),
    getDesignSystem: vi.fn(async () => null),
    listMediaUsageByLogicalPath: vi.fn(async () =>
      StoredMediaUsageSchema.array().parse([
        {
          kind: "page",
          refId: "home",
          refPath: "nodes[0].props.src",
        },
      ]),
    ),
    getSiteSettings: vi.fn(async () => structuredClone(siteSettings)),
    saveSiteSettings: vi.fn(async (next: SiteSettings) => {
      siteSettings = structuredClone(next);
    }),
    ...overrides,
  };

  return adapter as unknown as StorageAdapter;
}

describe("updateMediaReferencesForPath", () => {
  it("scrubs indexed and full-scanned resources plus site settings", async () => {
    const adapter = createMockAdapter();

    const result = await updateMediaReferencesForPath(
      adapter,
      { authorship },
      {
        mode: "scrub",
        logicalPath: "/uploads/gallery/hero.jpg",
      },
    );

    expect(result.updatedResources).toBe(4);
    expect(result.updatedLocations).toBeGreaterThanOrEqual(5);
    expect(result.failures).toEqual([]);

    const savedPage = (await adapter.getPageDSL("home"))!;
    expect(savedPage.nodes[0]?.props.src).toBe("");
    expect(savedPage.featuredImage?.src).toBe("");

    const savedLayout = (await adapter.getLayoutDSL("default"))!;
    expect(savedLayout.nodes[0]?.props.src).toBe("");

    const savedComponent = (await adapter.getComponentDSL("hero"))!;
    expect(savedComponent.nodes[0]?.props.src).toBe("");

    const settings = await adapter.getSiteSettings();
    expect(settings?.favicon).toBeUndefined();
    expect(settings?.ogImage).toBeUndefined();
  });

  it("migrates references to the new logical path", async () => {
    const adapter = createMockAdapter();

    const result = await updateMediaReferencesForPath(
      adapter,
      { authorship },
      {
        mode: "migrate",
        logicalPath: "/uploads/gallery/hero.jpg",
        newLogicalPath: "/uploads/gallery/renamed.jpg",
      },
    );

    expect(result.updatedResources).toBe(4);
    expect(result.failures).toEqual([]);

    const savedPage = (await adapter.getPageDSL("home"))!;
    expect(savedPage.nodes[0]?.props.src).toBe("/uploads/gallery/renamed.jpg");
    expect(savedPage.featuredImage?.src).toBe("/uploads/gallery/renamed.jpg");

    const settings = await adapter.getSiteSettings();
    expect(settings?.favicon).toBe("/uploads/gallery/renamed.jpg");
    expect(settings?.ogImage).toBe(
      "https://cdn.example.com/uploads/gallery/renamed.jpg",
    );
  });

  it("records per-resource failures without aborting the scan", async () => {
    const adapter = createMockAdapter({
      savePageDSL: vi.fn(async () => {
        throw new Error("page save failed");
      }),
    } as Partial<StorageAdapter>);

    const result = await updateMediaReferencesForPath(
      adapter,
      { authorship },
      {
        mode: "scrub",
        logicalPath: "/uploads/gallery/hero.jpg",
      },
    );

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "page",
          refId: "home",
          error: "page save failed",
        }),
      ]),
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("reports immutable published and localized references instead of hiding them", async () => {
    const adapter = createMockAdapter({
      getPublishedPageDSL: vi.fn(async () => structuredClone(pageWithHero)),
      listPageLocaleRecords: vi.fn(async () => [
        {
          meta: {
            pageId: "home",
            locale: "fr",
            currentVersion: "fr-v1",
            publishedVersion: "fr-v1",
          },
          versions: [
            {
              pageId: "home",
              locale: "fr",
              version: "fr-v1",
              dsl: {
                nodes: [
                  {
                    type: "Image",
                    props: { src: "/uploads/gallery/hero.jpg" },
                  },
                ],
              },
            },
          ],
          routes: [],
        } as never,
      ]),
    });

    const result = await updateMediaReferencesForPath(
      adapter,
      { authorship },
      {
        mode: "migrate",
        logicalPath: "/uploads/gallery/hero.jpg",
        newLogicalPath: "/uploads/gallery/renamed.jpg",
      },
    );

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "page", refId: "home" }),
        expect.objectContaining({ kind: "page-locale", refId: "home:fr" }),
      ]),
    );
  });

  it("updates logical-path media fields across every CMS entry locale", async () => {
    const entry = {
      entry: {
        id: "post-1",
        collectionId: "blog",
        status: "draft",
        version: "entry-v1",
        authorId: administrator.id,
        createdAt: "2026-07-14T12:00:00.000Z",
        updatedAt: "2026-07-14T12:00:00.000Z",
        publishedAt: null,
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "post-1",
          collectionId: "blog",
          locale: "en",
          slug: "post-1",
          title: "Post",
          frontmatter: { cover: { mediaId: "/uploads/gallery/hero.jpg" } },
          body: null,
          isSource: true,
        },
        {
          entryId: "post-1",
          collectionId: "blog",
          locale: "fr",
          slug: "article-1",
          title: "Article",
          frontmatter: {},
          body: [{ _type: "image", mediaId: "/uploads/gallery/hero.jpg" }],
          isSource: false,
        },
      ],
    } as const;
    const saveEntry = vi.fn(async (next) => next);
    const adapter = createMockAdapter({
      listCollections: vi.fn(async () => [{ id: "blog" } as never]),
      listEntries: vi.fn(async () => ({
        items: [entry as never],
        total: 1,
        page: 1,
        limit: 500,
      })),
      getEntry: vi.fn(async () => entry as never),
      saveEntry,
    });

    const result = await updateMediaReferencesForPath(
      adapter,
      { authorship },
      {
        mode: "migrate",
        logicalPath: "/uploads/gallery/hero.jpg",
        newLogicalPath: "/uploads/gallery/renamed.jpg",
      },
    );

    expect(result.failures).toEqual([]);
    const saved = saveEntry.mock.calls[0]?.[0];
    expect(saved.locales[0].frontmatter).toMatchObject({
      cover: { mediaId: "/uploads/gallery/renamed.jpg" },
    });
    expect(saved.locales[1].body).toMatchObject([
      { mediaId: "/uploads/gallery/renamed.jpg" },
    ]);
  });

  it("rejects migrate mode without newLogicalPath", async () => {
    const adapter = createMockAdapter();

    await expect(
      updateMediaReferencesForPath(adapter, { authorship }, {
        mode: "migrate",
        logicalPath: "/uploads/gallery/hero.jpg",
      } as never),
    ).rejects.toThrow(z.ZodError);
  });
});
