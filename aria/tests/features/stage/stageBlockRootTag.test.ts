/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";

import {
  resolveStageBlockRootTag,
  shouldDeferLinkBlockContent,
  shouldDeferTypographyBlockContent,
} from "../../../admin/features/Stage/utils/stageBlockRootTag";
import type { BuilderNode } from "../../../lib/types/nodes";

function renderImportedLogoDom(linkNode: BuilderNode, imageNode: BuilderNode) {
  const anchor = document.createElement(resolveStageBlockRootTag(linkNode));
  anchor.setAttribute("href", String(linkNode.props?.href ?? "#"));

  if (!shouldDeferLinkBlockContent(linkNode)) {
    throw new Error("Expected link content to defer to children");
  }

  const image = document.createElement(resolveStageBlockRootTag(imageNode));
  image.setAttribute("src", String(imageNode.props?.src ?? ""));
  image.className = (imageNode.classNames?.base ?? []).join(" ");
  anchor.appendChild(image);

  return anchor;
}

describe("stageBlockRootTag", () => {
  it("uses native roots for link and image paste structures", () => {
    const linkNode: BuilderNode = {
      id: "n_link0001",
      type: "Link",
      props: { href: "#" },
      styles: {},
      classNames: { base: ["flex", "items-center"] },
      children: [
        {
          id: "n_image001",
          type: "Image",
          props: {
            src: "https://cdn.example.com/logo.svg",
            alt: "Brand",
          },
          styles: {},
          classNames: { base: ["h-10", "w-auto"] },
          children: [],
        },
      ],
    };

    const imageNode = linkNode.children[0]!;

    expect(resolveStageBlockRootTag(linkNode)).toBe("a");
    expect(resolveStageBlockRootTag(imageNode)).toBe("img");
    expect(shouldDeferLinkBlockContent(linkNode)).toBe(true);

    const anchor = renderImportedLogoDom(linkNode, imageNode);
    const logo = anchor.querySelector("img.h-10");

    expect(logo).not.toBeNull();
    expect(anchor.contains(logo)).toBe(true);
  });

  it("defers heading content when word spans are nested inside", () => {
    const headingNode: BuilderNode = {
      id: "n_heading01",
      type: "Heading",
      props: { level: 2 },
      styles: {},
      classNames: { base: ["text-3xl", "font-bold"] },
      children: [
        {
          id: "n_wrap0001",
          type: "Span",
          props: {},
          styles: {},
          children: [
            {
              id: "n_word0001",
              type: "Span",
              props: { text: "Sustainable " },
              styles: {},
              customClasses: ["motion-word"],
              children: [],
            },
            {
              id: "n_word0002",
              type: "Span",
              props: { text: "Future" },
              styles: {},
              customClasses: ["motion-word"],
              children: [],
            },
          ],
        },
      ],
    };

    expect(resolveStageBlockRootTag(headingNode)).toBe("h2");
    expect(shouldDeferTypographyBlockContent(headingNode)).toBe(true);
    expect(shouldDeferTypographyBlockContent(headingNode.children[0]!)).toBe(
      true,
    );
    expect(
      shouldDeferTypographyBlockContent(headingNode.children[0]!.children[0]!),
    ).toBe(false);
  });

  it("downgrades anchor roots for children rendered inside container links", () => {
    const linkNode: BuilderNode = {
      id: "image-link",
      type: "Link",
      props: {},
      styles: {},
      classNames: { base: ["group", "relative", "block"] },
      children: [],
    };

    expect(resolveStageBlockRootTag(linkNode)).toBe("a");
    expect(
      resolveStageBlockRootTag(linkNode, {
        insideContainerLinkWrapper: true,
      }),
    ).toBe("div");
  });
});
