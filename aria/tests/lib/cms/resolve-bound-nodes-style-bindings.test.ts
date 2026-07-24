import { describe, expect, it } from "vitest";

import {
  buildBackgroundImageCssValue,
  coerceCmsBindingValueForStyleTarget,
  STYLE_BINDING_BACKGROUND_IMAGE,
} from "../../../lib/cms/styleBindings";
import { normalizeDirectCmsMediaReference } from "../../../lib/cms/directMediaReference";
import {
  coerceCmsBindingValueForNodeProp,
  resolveCmsBoundNodes,
  resolveCmsImageBindingPreviewValue,
} from "../../../lib/cms/resolveBoundNodes";
import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";
import type { MediaCatalogRepository } from "../../../lib/media/catalog/repository";
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
      frontmatter: {
        cover: { mediaId: "media-1", alt: "CMS Cover Alt" },
      },
      body: null,
    },
  ],
  relations: [],
} satisfies AriaEntryRecord;

function createAdapterStub(
  entry: AriaEntryRecord = blogEntry,
  mediaFiles: Array<{ path: string; url: string }> = [],
): StorageAdapter {
  return {
    listCollections: async () => [blogCollection],
    getCollection: async (idOrName: string) =>
      idOrName === blogCollection.id || idOrName === blogCollection.name
        ? blogCollection
        : null,
    getEntry: async () => entry,
    listMedia: async () =>
      mediaFiles.map((file) => ({
        path: file.path,
        url: file.url,
        size: 123,
        createdAt: "2026-06-30T00:00:00.000Z",
      })),
  } as unknown as StorageAdapter;
}

function createBlogEntryWithCover(
  cover: unknown,
): AriaEntryRecord {
  return {
    ...blogEntry,
    locales: [
      {
        ...blogEntry.locales[0]!,
        frontmatter: {
          cover,
        },
      },
    ],
  };
}

function createCatalogStub(
  overrides: Partial<MediaCatalogRepository> = {},
): MediaCatalogRepository {
  return {
    listAssetsByIds: async () => [
      {
        id: "media-1",
        logical_path: "/uploads/cover.jpg",
        filename: "cover.jpg",
        mime_type: "image/jpeg",
        size_bytes: 123,
        width: 1200,
        height: 800,
        status: "active",
        updated_at: "2026-06-30T00:00:00.000Z",
        public_url: "/uploads/cover.jpg",
      },
    ],
    listAssetsByLogicalPaths: async () => [],
    ...overrides,
  } as unknown as MediaCatalogRepository;
}

function boundImageNode(
  bindings: Record<string, string>,
  props: Record<string, unknown> = {},
): BuilderNode {
  return {
    id: "image-1",
    type: "image",
    props,
    styles: {},
    children: [],
    dataSource: {
      type: "collection",
      collection: "blog",
      mode: "single",
      filter: { slug: "hello-world" },
      bindings,
    },
  } as BuilderNode;
}

describe("style binding coercion", () => {
  it("wraps image urls for backgroundImage bindings", () => {
    expect(
      coerceCmsBindingValueForStyleTarget(
        STYLE_BINDING_BACKGROUND_IMAGE,
        "https://cdn.example.com/cover.jpg",
      ),
    ).toBe('url("https://cdn.example.com/cover.jpg")');
  });

  it("preserves cms image objects for materialization", () => {
    const value = { mediaId: "media-1", alt: "Cover" };
    expect(
      coerceCmsBindingValueForStyleTarget(
        STYLE_BINDING_BACKGROUND_IMAGE,
        value,
      ),
    ).toEqual(value);
  });

  it("builds css url values", () => {
    expect(buildBackgroundImageCssValue("https://cdn.example.com/a.png")).toBe(
      'url("https://cdn.example.com/a.png")',
    );
  });

  it("resolves preview values from cms image objects", () => {
    expect(
      resolveCmsImageBindingPreviewValue({
        mediaId: "media-1",
      }),
    ).toEqual({
      mediaId: "media-1",
    });
  });

  it("coerces image objects to alt text for alt props", () => {
    expect(
      coerceCmsBindingValueForNodeProp("alt", {
        mediaId: "media-1",
        alt: "CMS Cover Alt",
      }),
    ).toBe("CMS Cover Alt");
  });

  it("materializes cms image objects on image src props", async () => {
    const nodes = [
      boundImageNode({
        src: "blog.cover",
      }),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(),
      basePath: "/",
      catalog: createCatalogStub(),
    });

    expect(resolved[0]?.props.src).toBe("/uploads/cover.jpg");
    expect(resolved[0]?.props.alt).toBe("CMS Cover Alt");
  });

  it("does not overwrite explicit alt text when materializing image src", async () => {
    const nodes = [
      boundImageNode(
        {
          src: "blog.cover",
        },
        { alt: "Static alt" },
      ),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(),
      basePath: "/",
      catalog: createCatalogStub(),
    });

    expect(resolved[0]?.props.src).toBe("/uploads/cover.jpg");
    expect(resolved[0]?.props.alt).toBe("Static alt");
  });

  it("binds generated collection URLs to href props", async () => {
    const nodes = [
      boundImageNode({
        href: "blog.url",
      }),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(),
      basePath: "/",
      catalog: createCatalogStub(),
    });

    expect(resolved[0]?.props.href).toBe("/blog/hello-world");
  });

  it("normalizes bare media filenames to uploads paths", () => {
    expect(normalizeDirectCmsMediaReference("heathensad-c0a079.png")).toBe(
      "/uploads/heathensad-c0a079.png",
    );
  });

  it("materializes import-style cover paths stored in mediaId", async () => {
    const nodes = [
      boundImageNode({
        src: "blog.cover",
      }),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(
        createBlogEntryWithCover({
          mediaId: "/uploads/hero.jpg",
          alt: "Imported cover",
        }),
      ),
      basePath: "/",
      catalog: createCatalogStub(),
    });

    expect(resolved[0]?.props.src).toBe("/uploads/hero.jpg");
    expect(resolved[0]?.props.alt).toBe("Imported cover");
  });

  it("materializes bare filename cover strings", async () => {
    const nodes = [
      boundImageNode({
        src: "blog.cover",
      }),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(
        createBlogEntryWithCover("heathensad-c0a079.png"),
      ),
      basePath: "/",
      catalog: null,
    });

    expect(resolved[0]?.props.src).toBe("/uploads/heathensad-c0a079.png");
  });

  it("falls back to logical_path when catalog public_url is missing", async () => {
    const nodes = [
      boundImageNode({
        src: "blog.cover",
      }),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(),
      basePath: "/",
      catalog: createCatalogStub({
        listAssetsByIds: async () => [
          {
            id: "media-1",
            logical_path: "/uploads/cover.jpg",
            filename: "cover.jpg",
            mime_type: "image/jpeg",
            size_bytes: 123,
            width: 1200,
            height: 800,
            status: "active",
            updated_at: "2026-06-30T00:00:00.000Z",
            public_url: null,
          },
        ],
      }),
    });

    expect(resolved[0]?.props.src).toBe("/uploads/cover.jpg");
  });

  it("falls back to adapter media listing when catalog is unavailable", async () => {
    const nodes = [
      boundImageNode({
        src: "blog.cover",
      }),
    ];

    const resolved = await resolveCmsBoundNodes({
      nodes,
      adapter: createAdapterStub(
        createBlogEntryWithCover({
          mediaId: "gallery/cover.jpg",
        }),
        [
          {
            path: "gallery/cover.jpg",
            url: "/uploads/gallery/cover.jpg",
          },
        ],
      ),
      basePath: "/",
      catalog: null,
    });

    expect(resolved[0]?.props.src).toBe("/uploads/gallery/cover.jpg");
  });
});
