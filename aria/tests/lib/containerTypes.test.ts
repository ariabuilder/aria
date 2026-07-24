import { describe, expect, it } from "vitest";

import {
  isLinkableContainerNodeType,
  isStructuralContainerNodeType,
} from "../../lib/blocks/containerTypes";
import {
  hasLoopParentLinkConfig,
  shouldWrapContainerChildrenInLink,
  stripLinkPropsForContainerWrapper,
} from "../../lib/blocks/listItemLinks";
import type { BuilderNode } from "../../lib/types/nodes";

describe("isLinkableContainerNodeType", () => {
  it.each([
    "container",
    "section",
    "card",
    "grid",
    "header",
    "Container",
    "Section",
  ])("returns true for structural container %s", (type) => {
    expect(isLinkableContainerNodeType(type)).toBe(true);
    expect(isStructuralContainerNodeType(type)).toBe(true);
  });

  it.each(["navigation", "nav-item", "nav-items", "nav-toggle", "Navigation"])(
    "returns false for navigation container %s",
    (type) => {
      expect(isLinkableContainerNodeType(type)).toBe(false);
      expect(isStructuralContainerNodeType(type)).toBe(true);
    },
  );

  it("returns false for non-container types", () => {
    expect(isLinkableContainerNodeType("text")).toBe(false);
    expect(isLinkableContainerNodeType("button")).toBe(false);
  });
});

describe("shouldWrapContainerChildrenInLink", () => {
  it("returns true when a linkable container has href", () => {
    const node: BuilderNode = {
      id: "card-1",
      type: "card",
      props: { href: "/features" },
      styles: {},
      children: [],
    };

    expect(shouldWrapContainerChildrenInLink(node)).toBe(true);
  });

  it("returns false when navigation has href", () => {
    const node: BuilderNode = {
      id: "nav-1",
      type: "navigation",
      props: { href: "/features" },
      styles: {},
      children: [],
    };

    expect(shouldWrapContainerChildrenInLink(node)).toBe(false);
  });

  it("returns false when a linkable container has no href", () => {
    const node: BuilderNode = {
      id: "card-1",
      type: "card",
      props: {},
      styles: {},
      children: [],
    };

    expect(shouldWrapContainerChildrenInLink(node)).toBe(false);
  });

  it("returns false for list-loop parents with link config", () => {
    const node: BuilderNode = {
      id: "loop-1",
      type: "container",
      props: { href: "/features" },
      styles: {},
      children: [],
      dataSource: {
        type: "collection",
        collection: "blog",
        mode: "list",
      },
    };

    expect(hasLoopParentLinkConfig(node)).toBe(true);
    expect(shouldWrapContainerChildrenInLink(node)).toBe(false);
  });

  it("detects bound href on list-loop parents", () => {
    const node: BuilderNode = {
      id: "loop-1",
      type: "container",
      props: {},
      styles: {},
      children: [],
      dataSource: {
        type: "collection",
        collection: "blog",
        mode: "list",
        bindings: {
          href: "blog.url",
        },
      },
    };

    expect(hasLoopParentLinkConfig(node)).toBe(true);
    expect(shouldWrapContainerChildrenInLink(node)).toBe(false);
  });
});

describe("stripLinkPropsForContainerWrapper", () => {
  it("recursively strips href and url props from descendants", () => {
    const node: BuilderNode = {
      id: "card-1",
      type: "container",
      props: { href: "/blog/post" },
      styles: {},
      children: [
        {
          id: "title-1",
          type: "heading",
          props: {
            level: 1,
            text: "Title",
            href: "/blog/post",
            url: "/blog/post",
          },
          styles: {},
          children: [],
        },
      ],
    };

    const stripped = stripLinkPropsForContainerWrapper(node);

    expect(stripped.props?.href).toBeUndefined();
    expect(stripped.children[0]?.props?.href).toBeUndefined();
    expect(stripped.children[0]?.props?.url).toBeUndefined();
    expect(stripped.children[0]?.props?.text).toBe("Title");
  });
});
