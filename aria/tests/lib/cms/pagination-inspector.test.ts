import { describe, expect, it } from "vitest";
import type { BuilderNode } from "../../../lib/types/nodes";
import {
  collectPaginationListContainers,
  findPaginationAutoConnectTarget,
  resolvePaginationInheritedLimit,
} from "../../../lib/cms/paginationInspector";

const listContainer: BuilderNode = {
  id: "list-1",
  type: "Container",
  props: {},
  styles: {},
  children: [],
  dataSource: {
    type: "cms",
    mode: "list",
    collection: "posts",
    limit: 12,
  },
};

describe("paginationInspector", () => {
  it("collects list containers", () => {
    expect(collectPaginationListContainers([listContainer])).toEqual([
      expect.objectContaining({ id: "list-1", limit: 12 }),
    ]);
  });

  it("inherits list limit from connected container", () => {
    expect(resolvePaginationInheritedLimit([listContainer], "list-1")).toBe(12);
  });

  it("auto-connects to the previous sibling list container", () => {
    const target = findPaginationAutoConnectTarget({
      pageBlocks: [listContainer, { ...listContainer, id: "other" }],
      parentId: null,
      insertionIndex: 1,
    });
    expect(target).toBe("list-1");
  });
});
