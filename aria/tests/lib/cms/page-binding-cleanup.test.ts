import { describe, expect, it, vi } from "vitest";

import {
  cleanupCollectionPageBindingsOnAdapter,
  getCollectionPageBindingImpactOnAdapter,
} from "../../../lib/cms/pageBindingCleanup";
import {
  deleteCollectionOnAdapter,
  getCollectionDeleteImpactOnAdapter,
} from "../../../lib/cms/services/collections";
import { DeleteCollectionResponseSchema } from "../../../lib/cms/actionSchemas";
import {
  AriaCollectionSchema,
  type AriaCollection,
} from "../../../lib/cms/schemas";
import type {
  AuthorshipSaveContext,
  PageInventoryItem,
  StorageAdapter,
} from "../../../lib/storage/adapter";
import type { BuilderNode, PageDSL } from "../../../lib/types/nodes";

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

function node(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: "node",
    type: "Container",
    props: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function page(overrides: Partial<PageDSL>): PageDSL {
  return {
    id: "page-index",
    title: "Home",
    slug: "index",
    nodes: [],
    status: "draft",
    systemRole: "standard",
    ...overrides,
  };
}

function pageInventory(item: PageDSL): PageInventoryItem {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    status: "draft",
    isModifiedSincePublish: false,
    systemRole: "standard",
    accessMode: "public",
    hasPassword: false,
  };
}

function adapter(input: {
  collections: AriaCollection[];
  pages: PageDSL[];
}): StorageAdapter {
  const collections = [...input.collections];
  const pages = new Map(input.pages.map((item) => [item.id, item]));

  return {
    getCollection: vi.fn(async (idOrName: string) =>
      collections.find(
        (item) => item.id === idOrName || item.name === idOrName,
      ) ?? null,
    ),
    listCollections: vi.fn(async () => collections),
    deleteCollection: vi.fn(async (idOrName: string) => {
      const index = collections.findIndex(
        (item) => item.id === idOrName || item.name === idOrName,
      );
      if (index >= 0) {
        collections.splice(index, 1);
      }
    }),
    deleteCmsSearchDocuments: vi.fn(async () => {}),
    listPagesDSL: vi.fn(async () =>
      Array.from(pages.values()).map(pageInventory),
    ),
    getPageDSL: vi.fn(async (id: string) => pages.get(id) ?? null),
    savePageDSL: vi.fn(async (id: string, nextPage: PageDSL) => {
      pages.set(id, nextPage);
      return "saved-version";
    }),
  } as unknown as StorageAdapter;
}

const authorship: AuthorshipSaveContext = {
  actor: {
    id: "user-admin",
    username: "admin",
    email: "admin@example.com",
  },
  mutationKind: "cms-collection-delete",
};

describe("CMS collection page binding cleanup", () => {
  it("removes direct node bindings by collection name and preserves props", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const storage = adapter({
      collections: [blog],
      pages: [
        page({
          nodes: [
            node({
              id: "heading",
              type: "Heading",
              props: { text: "Static fallback" },
              dataSource: {
                type: "cms",
                collection: "blog",
                mode: "single",
                bindings: { text: "title" },
              },
            }),
          ],
        }),
      ],
    });

    const result = await cleanupCollectionPageBindingsOnAdapter(
      storage,
      blog,
      authorship,
    );

    expect(result).toMatchObject({
      removedPageBindingCount: 1,
      updatedPageIds: ["page-index"],
      updatedPageSlugs: ["index"],
    });
    const saved = vi.mocked(storage.savePageDSL).mock.calls[0];
    expect(saved?.[0]).toBe("page-index");
    expect(saved?.[2]).toBeUndefined();
    expect(saved?.[3]).toEqual(authorship);
    expect(saved?.[1].nodes[0]).toEqual(
      expect.objectContaining({
        id: "heading",
        props: { text: "Static fallback" },
      }),
    );
    expect(saved?.[1].nodes[0]?.dataSource).toBeUndefined();
  });

  it("removes direct node bindings by collection id", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const storage = adapter({
      collections: [blog],
      pages: [
        page({
          nodes: [
            node({
              id: "title",
              dataSource: {
                type: "collection",
                collection: "collection-blog",
                mode: "single",
                bindings: { text: "title" },
              },
            }),
          ],
        }),
      ],
    });

    const result = await getCollectionPageBindingImpactOnAdapter(storage, [
      blog,
    ]);

    expect(result.removedPageBindingCount).toBe(1);
    expect(result.affectedPages).toHaveLength(1);
  });

  it("removes inherited context bindings under a deleted collection loop", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const storage = adapter({
      collections: [blog],
      pages: [
        page({
          nodes: [
            node({
              id: "loop",
              dataSource: {
                type: "collection",
                collection: "blog",
                mode: "list",
                limit: 3,
              },
              children: [
                node({
                  id: "child-title",
                  dataSource: {
                    type: "static",
                    bindings: { text: "title" },
                  },
                }),
                node({
                  id: "child-repeater",
                  dataSource: {
                    type: "static",
                    source: "field",
                    field: "items",
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = await cleanupCollectionPageBindingsOnAdapter(storage, blog);

    expect(result.removedPageBindingCount).toBe(3);
    const saved = vi.mocked(storage.savePageDSL).mock.calls[0]?.[1];
    expect(saved?.nodes[0]?.dataSource).toBeUndefined();
    expect(saved?.nodes[0]?.children[0]?.dataSource).toBeUndefined();
    expect(saved?.nodes[0]?.children[1]?.dataSource).toBeUndefined();
  });

  it("preserves bindings for other collections under a deleted loop", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const staff = collection({
      id: "collection-staff",
      name: "staff",
      label: "Staff",
    });
    const storage = adapter({
      collections: [blog, staff],
      pages: [
        page({
          nodes: [
            node({
              id: "loop",
              dataSource: {
                type: "collection",
                collection: "blog",
                mode: "list",
              },
              children: [
                node({
                  id: "staff-title",
                  dataSource: {
                    type: "cms",
                    collection: "staff",
                    mode: "single",
                    bindings: { text: "name" },
                  },
                  children: [
                    node({
                      id: "staff-context-child",
                      dataSource: {
                        type: "static",
                        bindings: { text: "role" },
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    await cleanupCollectionPageBindingsOnAdapter(storage, blog);

    const saved = vi.mocked(storage.savePageDSL).mock.calls[0]?.[1];
    const staffNode = saved?.nodes[0]?.children[0];
    expect(staffNode?.dataSource).toEqual(
      expect.objectContaining({ collection: "staff" }),
    );
    expect(staffNode?.children[0]?.dataSource).toEqual(
      expect.objectContaining({ bindings: { text: "role" } }),
    );
  });

  it("returns zero cleanup metadata for unbound collection deletes", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const storage = adapter({
      collections: [blog],
      pages: [page({ nodes: [node({ id: "plain" })] })],
    });

    const result = await deleteCollectionOnAdapter(storage, blog.id);

    expect(result).toEqual({
      success: true,
      removedPageBindingCount: 0,
      updatedPageIds: [],
      updatedPageSlugs: [],
    });
    expect(
      DeleteCollectionResponseSchema.parse(result),
    ).toEqual(result);
    expect(storage.savePageDSL).not.toHaveBeenCalled();
    expect(await storage.getCollection(blog.id)).toBeNull();
  });

  it("returns delete response shape compatible with action schema when bindings are removed", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const storage = adapter({
      collections: [blog],
      pages: [
        page({
          nodes: [
            node({
              id: "heading",
              dataSource: {
                type: "cms",
                collection: "blog",
                mode: "single",
                bindings: { text: "title" },
              },
            }),
          ],
        }),
      ],
    });

    const result = await deleteCollectionOnAdapter(storage, blog.id);

    expect(result).toMatchObject({
      success: true,
      removedPageBindingCount: 1,
      updatedPageIds: ["page-index"],
      updatedPageSlugs: ["index"],
    });
    expect(DeleteCollectionResponseSchema.parse(result)).toEqual(result);
    expect(await storage.getCollection(blog.id)).toBeNull();
  });

  it("returns delete response shape compatible with action schema for config collections", async () => {
    const mainNav = collection({
      id: "collection-main-nav",
      name: "main-nav",
      label: "Main Navigation",
      kind: "config",
    });
    const storage = adapter({
      collections: [mainNav],
      pages: [page({ nodes: [node({ id: "plain" })] })],
    });

    const result = await deleteCollectionOnAdapter(storage, mainNav.id);

    expect(result).toEqual({
      success: true,
      removedPageBindingCount: 0,
      updatedPageIds: [],
      updatedPageSlugs: [],
    });
    expect(DeleteCollectionResponseSchema.parse(result)).toEqual(result);
    expect(await storage.getCollection(mainNav.id)).toBeNull();
  });

  it("previews aggregate delete impact for multiple collections", async () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const staff = collection({
      id: "collection-staff",
      name: "staff",
      label: "Staff",
    });
    const storage = adapter({
      collections: [blog, staff],
      pages: [
        page({
          nodes: [
            node({
              id: "blog-title",
              dataSource: {
                type: "cms",
                collection: "blog",
                bindings: { text: "title" },
              },
            }),
            node({
              id: "staff-title",
              dataSource: {
                type: "cms",
                collection: "staff",
                bindings: { text: "name" },
              },
            }),
          ],
        }),
      ],
    });

    const impact = await getCollectionDeleteImpactOnAdapter(storage, [
      blog.id,
      staff.id,
    ]);

    expect(impact).toMatchObject({
      removedPageBindingCount: 2,
      affectedPages: [
        expect.objectContaining({
          pageId: "page-index",
          removedPageBindingCount: 2,
        }),
      ],
    });
  });
});
