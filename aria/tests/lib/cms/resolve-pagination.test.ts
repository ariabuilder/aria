import { describe, expect, it } from "vitest";
import {
  applyPaginationOffsetsToDataSources,
  resolvePaginationPageFromQuery,
} from "../../../lib/cms/resolvePagination";
import type { BuilderNode } from "../../../lib/types/nodes";

describe("resolvePagination", () => {
  it("defaults invalid page query values to page 1", () => {
    expect(
      resolvePaginationPageFromQuery({
        pageParam: "page",
        rawQueryValue: "abc",
      }),
    ).toEqual({ page: 1, pageParam: "page" });
  });

  it("applies pagination offsets to connected list sources", () => {
    const nodes: BuilderNode[] = [
      {
        id: "posts-list",
        type: "Container",
        props: {},
        styles: {},
        children: [],
        dataSource: {
          type: "collection",
          collection: "posts",
          mode: "list",
          limit: 12,
        },
      },
      {
        id: "posts-pagination",
        type: "Pagination",
        props: {},
        styles: {},
        children: [],
        dataSource: {
          type: "pagination",
          targetNodeId: "posts-list",
        },
      },
    ];

    const sources = {
      "posts-list": nodes[0].dataSource!,
    };

    const nextSources = applyPaginationOffsetsToDataSources({
      nodes,
      sources,
      page: 3,
    });

    expect(nextSources["posts-list"]?.offset).toBe(24);
  });
});
