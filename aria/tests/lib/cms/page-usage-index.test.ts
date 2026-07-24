import { describe, expect, it } from "vitest";

import {
  collectCmsDataSourceUsagesFromNodes,
  deriveCmsPageUsageIndex,
} from "../../../lib/cms/pageUsageIndex";
import { AriaCollectionSchema, type AriaCollection } from "../../../lib/cms/schemas";
import { StoredPageSystemRoleSchema } from "../../../lib/storage/adapter";
import type { BuilderNode, PageDSL } from "../../../lib/types/nodes";

function collection(
  overrides: Partial<AriaCollection> & Pick<AriaCollection, "id" | "name" | "label">,
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

describe("CMS page usage index", () => {
  it("derives template and list usages from collection references", () => {
    const result = deriveCmsPageUsageIndex({
      pages: [
        page({ id: "page-template", slug: "post-template", title: "Post" }),
        page({ id: "page-list", slug: "blog", title: "Blog" }),
      ],
      collections: [
        collection({
          id: "collection-blog",
          name: "blog",
          label: "Blog",
          templatePageId: "page-template",
          listPageId: "page-list",
        }),
      ],
    });

    expect(result.usagesByPageId["page-template"]).toContainEqual(
      expect.objectContaining({ kind: "template", collectionName: "blog" }),
    );
    expect(result.usagesByPageId["page-list"]).toContainEqual(
      expect.objectContaining({ kind: "list", collectionName: "blog" }),
    );
  });

  it("does not include cms-bound node usages in the page index", () => {
    const result = deriveCmsPageUsageIndex({
      pages: [
        page({
          id: "page-posts",
          slug: "posts",
          title: "Posts",
          nodes: [
            node({
              id: "navigation",
              type: "navigation",
              dataSource: {
                type: "collection",
                collection: "main-nav",
                mode: "single",
              },
            }),
            node({
              id: "loop",
              dataSource: {
                type: "collection",
                collection: "blog",
                mode: "list",
              },
            }),
          ],
        }),
      ],
      collections: [
        collection({
          id: "collection-blog",
          name: "blog",
          label: "Blog",
        }),
      ],
    });

    expect(result.usagesByPageId["page-posts"] ?? []).toEqual([]);
  });

  it("recursively detects CMS-bound nodes and loops", () => {
    const blog = collection({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
    });
    const usages = collectCmsDataSourceUsagesFromNodes(
      [
        node({
          id: "outer",
          children: [
            node({
              id: "heading",
              type: "Heading",
              dataSource: {
                type: "cms",
                collection: "blog",
                mode: "single",
                bindings: { text: "title" },
              },
            }),
            node({
              id: "loop",
              dataSource: {
                type: "collection",
                collection: "blog",
                mode: "list",
                limit: 3,
              },
            }),
          ],
        }),
      ],
      [blog],
    );

    expect(usages).toContainEqual(
      expect.objectContaining({
        kind: "cms-bound",
        nodeId: "heading",
        collectionName: "blog",
        bindingCount: 1,
        loop: false,
      }),
    );
    expect(usages).toContainEqual(
      expect.objectContaining({
        kind: "cms-bound",
        nodeId: "loop",
        collectionName: "blog",
        loop: true,
      }),
    );
  });

  it("ignores static/api nodes and survives invalid node dataSource values", () => {
    const usages = collectCmsDataSourceUsagesFromNodes(
      [
        node({
          id: "static-node",
          dataSource: { type: "static" },
        }),
        node({
          id: "api-node",
          dataSource: { type: "api", endpoint: "/api/demo" },
        }),
        node({
          id: "invalid-node",
          dataSource: {
            type: "cms",
            status: "not-a-real-status",
          } as unknown as BuilderNode["dataSource"],
        }),
      ],
      [],
    );

    expect(usages).toEqual([]);
  });

  it("keeps page systemRole limited to platform roles", () => {
    expect(StoredPageSystemRoleSchema.safeParse("template").success).toBe(
      false,
    );
    expect(StoredPageSystemRoleSchema.safeParse("list").success).toBe(false);
    expect(StoredPageSystemRoleSchema.safeParse("cms-collection").success).toBe(
      true,
    );
    expect(StoredPageSystemRoleSchema.safeParse("cms-entry").success).toBe(
      true,
    );
  });
});
