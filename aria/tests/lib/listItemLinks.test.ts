import { describe, expect, it } from "vitest";

import {
  findListItemTextLinkChildIndex,
  resolveListItemLinkScope,
  stripTextLinkWrapperPropsFromNode,
} from "../../lib/blocks/listItemLinks";
import type { BuilderNode } from "../../lib/types/nodes";

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id || "node-1",
    type: overrides.type || "listitem",
    props: overrides.props || {},
    styles: overrides.styles || {},
    children: overrides.children || [],
    ...overrides,
  };
}

describe("listItemLinks", () => {
  it("defaults linked icon-style list items to row scope", () => {
    const node = createNode({
      props: {
        href: "/features",
      },
      children: [
        createNode({
          id: "icon-1",
          type: "icon",
          props: { icon: "i-lucide:star" },
        }),
        createNode({
          id: "text-1",
          type: "text",
          props: { text: "Features" },
        }),
      ],
    });

    expect(resolveListItemLinkScope(node)).toBe("row");
  });

  it("defaults linked editorial list items to text scope", () => {
    const node = createNode({
      props: {
        href: "/features",
      },
      children: [
        createNode({
          id: "text-1",
          type: "text",
          props: { text: "Features" },
        }),
      ],
    });

    expect(resolveListItemLinkScope(node)).toBe("text");
    expect(findListItemTextLinkChildIndex(node)).toBe(0);
  });

  it("strips nested text-link props before wrapping list item content", () => {
    const node = createNode({
      children: [
        createNode({
          id: "text-1",
          type: "text",
          props: {
            text: "Features",
            href: "/nested",
            target: "_blank",
          },
        }),
      ],
    });

    expect(stripTextLinkWrapperPropsFromNode(node).children[0]?.props).toEqual({
      text: "Features",
    });
  });
});
