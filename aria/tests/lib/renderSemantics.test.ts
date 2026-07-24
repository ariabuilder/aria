import { describe, expect, it } from "vitest";

import {
  HEADING_TAG_OVERRIDES,
  TEXT_TAG_OVERRIDES,
  getNativeTagForRenderableNode,
  resolveRenderedButtonVariant,
  stripConsumedRenderPropsForNode,
} from "../../lib/blocks/renderSemantics";
import type { BuilderNode } from "../../lib/types/nodes";

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id || "node-1",
    type: overrides.type || "Button",
    props: overrides.props || {},
    styles: overrides.styles || {},
    children: overrides.children || [],
    ...overrides,
  };
}

describe("renderSemantics", () => {
  it("renders button nodes with href as anchors", () => {
    const node = createNode({
      type: "Button",
      props: {
        href: "/contact",
        text: "Contact sales",
      },
    });

    expect(getNativeTagForRenderableNode(node, node.props ?? {})).toBe("a");
  });

  it("keeps action buttons as button elements when href is absent", () => {
    const node = createNode({
      type: "Button",
      props: {
        text: "Open modal",
      },
    });

    expect(getNativeTagForRenderableNode(node, node.props ?? {})).toBe(
      "button",
    );
  });

  it("defaults missing and legacy button variants to primary for rendering", () => {
    const missingVariantNode = createNode({
      type: "Button",
      props: {
        text: "Start",
      },
    });
    const legacyVariantNode = createNode({
      type: "Button",
      props: {
        text: "Start",
        variant: "default",
      },
    });

    expect(resolveRenderedButtonVariant(missingVariantNode)).toBe("primary");
    expect(resolveRenderedButtonVariant(legacyVariantNode)).toBe("primary");
  });

  it("strips button-only render props from published attributes", () => {
    const node = createNode({
      type: "Button",
      props: {
        text: "Start",
        variant: "secondary",
        size: "lg",
        icon: "i-lucide:rocket",
        iconPosition: "right",
        iconGap: "1rem",
        iconSpaceBetween: true,
        iconSize: "1.25em",
        iconColor: "#ff0000",
        href: "/contact",
      },
    });

    expect(stripConsumedRenderPropsForNode(node, node.props ?? {})).toEqual({
      text: "Start",
      href: "/contact",
    });
  });

  it("renders ordered lists and list items with semantic tags", () => {
    const listNode = createNode({
      type: "list",
      props: {
        ordered: true,
      },
    });
    const listItemNode = createNode({
      type: "listitem",
    });

    expect(getNativeTagForRenderableNode(listNode, listNode.props ?? {})).toBe(
      "ol",
    );
    expect(
      getNativeTagForRenderableNode(listItemNode, listItemNode.props ?? {}),
    ).toBe("li");
    expect(
      stripConsumedRenderPropsForNode(listNode, listNode.props ?? {}),
    ).toEqual({});
  });

  it("strips paste-import responsive attrs from image publish attributes", () => {
    const imageNode = createNode({
      type: "Image",
      props: {
        src: "/uploads/Veil.avif",
        alt: "Logo",
        srcset: "/_astro/hero.png 200w, /_astro/hero-2x.png 520w",
        sizes: "(max-width: 800px) 100vw, 620px",
      },
    });

    expect(
      stripConsumedRenderPropsForNode(imageNode, imageNode.props ?? {}),
    ).toEqual({
      src: "/uploads/Veil.avif",
      alt: "Logo",
    });
  });

  it("strips list-item link props from published attributes", () => {
    const listItemNode = createNode({
      type: "listitem",
      props: {
        href: "/features",
        target: "_blank",
        rel: "noopener noreferrer",
        title: "Features",
        download: true,
        linkScope: "row",
      },
    });

    expect(
      stripConsumedRenderPropsForNode(listItemNode, listItemNode.props ?? {}),
    ).toEqual({});
  });

  it("supports text-specific HTML tag overrides", () => {
    const textNode = createNode({
      type: "Text",
      props: {
        content: "Intro copy",
        element: "span",
      },
    });

    const headingNode = createNode({
      type: "Heading",
      props: {
        text: "Title",
        level: 2,
        element: "div",
      },
    });

    expect(TEXT_TAG_OVERRIDES).toContain("span");
    expect(HEADING_TAG_OVERRIDES).toContain("div");
    expect(getNativeTagForRenderableNode(textNode, textNode.props ?? {})).toBe(
      "span",
    );
    expect(
      getNativeTagForRenderableNode(headingNode, headingNode.props ?? {}),
    ).toBe("div");
  });
});
