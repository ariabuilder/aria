import { describe, expect, it } from "vitest";

import {
  findEditableListContextNode,
  findNearestListContextNode,
} from "../../../admin/features/Inspector/lib/findEditableListContextNode";
import type { BuilderNode } from "../../../lib/types/nodes";

function createNode(
  id: string,
  type: string,
  children: BuilderNode[] = [],
): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    children,
  };
}

describe("findEditableListContextNode", () => {
  const outerList = createNode("outer-list", "list", [
    createNode("parent-item", "listitem", [
      createNode("inner-list", "list", [
        createNode("child-item", "listitem", [
          createNode("child-text", "text", []),
        ]),
      ]),
    ]),
    createNode("sibling-item", "listitem", [
      createNode("sibling-text", "text", []),
    ]),
  ]);

  const tree = [outerList];

  it("returns the list node when a list is selected directly", () => {
    expect(findEditableListContextNode(tree, "outer-list")?.id).toBe(
      "outer-list",
    );
    expect(findEditableListContextNode(tree, "inner-list")?.id).toBe(
      "inner-list",
    );
  });

  it("returns the nested list when the parent listitem is selected", () => {
    expect(findEditableListContextNode(tree, "parent-item")?.id).toBe(
      "inner-list",
    );
  });

  it("returns the nested list when a child listitem inside it is selected", () => {
    expect(findEditableListContextNode(tree, "child-item")?.id).toBe(
      "inner-list",
    );
  });

  it("returns the nested list when a descendant inside the nested list is selected", () => {
    expect(findEditableListContextNode(tree, "child-text")?.id).toBe(
      "inner-list",
    );
  });

  it("returns the nearest ancestor list for listitems without a nested list child", () => {
    expect(findEditableListContextNode(tree, "sibling-item")?.id).toBe(
      "outer-list",
    );
    expect(findEditableListContextNode(tree, "sibling-text")?.id).toBe(
      "outer-list",
    );
  });

  it("differs from findNearestListContextNode for nested list selections", () => {
    expect(findNearestListContextNode(tree, "parent-item")?.id).toBe(
      "outer-list",
    );
    expect(findEditableListContextNode(tree, "parent-item")?.id).toBe(
      "inner-list",
    );
  });
});
