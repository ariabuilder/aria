import { describe, expect, it } from "vitest";

import { cleanupOrphanedNavigationBindingsInPage } from "../../../lib/cms/navigationBindingCleanup";
import type { BuilderNode, PageDSL } from "../../../lib/types/nodes";

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
    id: "page-posts",
    title: "Posts",
    slug: "posts",
    nodes: [],
    status: "draft",
    systemRole: "standard",
    ...overrides,
  };
}

describe("cleanupOrphanedNavigationBindingsInPage", () => {
  it("strips cms bindings from static navigation nodes", () => {
    const result = cleanupOrphanedNavigationBindingsInPage(
      page({
        nodes: [
          node({
            id: "navigation",
            type: "navigation",
            props: { sourceMode: "static" },
            dataSource: {
              type: "collection",
              collection: "blog",
              mode: "list",
            },
          }),
        ],
      }),
    );

    expect(result.cleanedNavigationNodeCount).toBe(1);
    expect(result.page.nodes[0]?.dataSource).toBeUndefined();
    expect(result.page.nodes[0]?.props).toMatchObject({ sourceMode: "static" });
  });

  it("strips main-nav bindings even when sourceMode is cms", () => {
    const result = cleanupOrphanedNavigationBindingsInPage(
      page({
        nodes: [
          node({
            id: "navigation",
            type: "navigation",
            props: { sourceMode: "cms", loopMode: "field", fieldPath: "items" },
            dataSource: {
              type: "collection",
              collection: "main-nav",
              mode: "single",
            },
            children: [
              node({
                id: "nav-items",
                type: "nav-items",
                dataSource: {
                  type: "static",
                  source: "field",
                  mode: "list",
                  field: "items",
                  entryScope: "context",
                },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.cleanedNavigationNodeCount).toBe(1);
    expect(result.page.nodes[0]?.dataSource).toBeUndefined();
    expect(result.page.nodes[0]?.children).toEqual([]);
    expect(result.page.nodes[0]?.props).toMatchObject({ sourceMode: "static" });
  });

  it("keeps intentional cms navigation bindings for non-main-nav collections", () => {
    const original = page({
      nodes: [
        node({
          id: "navigation",
          type: "navigation",
          props: { sourceMode: "cms", loopMode: "collection" },
          dataSource: {
            type: "collection",
            collection: "blog",
            mode: "list",
          },
        }),
      ],
    });

    const result = cleanupOrphanedNavigationBindingsInPage(original);
    expect(result.cleanedNavigationNodeCount).toBe(0);
    expect(result.page).toEqual(original);
  });
});
