import { describe, expect, it } from "vitest";
import type { BuilderNode } from "../../lib/types/nodes";
import { getContentValue } from "../../lib/blocks/contentContract";
import { normalizeTypographyNode } from "../../lib/blocks/normalizeTypographyNode";

function createNode(
  type: string,
  props: BuilderNode["props"] = {},
  children: BuilderNode[] = [],
): BuilderNode {
  return {
    id: "node-1",
    type,
    props,
    styles: {},
    children,
  };
}

describe("normalizeTypographyNode", () => {
  it("canonicalizes Paragraph to text with content", () => {
    const source = createNode("Paragraph", { text: "Hello body" });
    const result = normalizeTypographyNode(source);

    expect(result.type).toBe("text");
    expect(result.props.content).toBe("Hello body");
    expect(result.props.text).toBe("Hello body");
  });

  it("canonicalizes Heading with level and text", () => {
    const source = createNode("Heading", { text: "Title", level: 3 });
    const result = normalizeTypographyNode(source);

    expect(result.type).toBe("heading");
    expect(result.props.text).toBe("Title");
    expect(result.props.level).toBe(3);
    expect(result.props.content).toBeUndefined();
  });

  it("mirrors content on heading when content prop existed", () => {
    const source = createNode("heading", {
      content: "From content",
      level: 1,
    });
    const result = normalizeTypographyNode(source);

    expect(result.props.text).toBe("From content");
    expect(result.props.content).toBe("From content");
    expect(result.props.level).toBe(1);
  });

  it("preserves dormant level on text for round-trip", () => {
    const source = createNode("paragraph", {
      content: "Body",
      level: 4,
    });
    const result = normalizeTypographyNode(source);

    expect(result.type).toBe("text");
    expect(result.props.level).toBe(4);
  });

  it("preserves href link props on text", () => {
    const source = createNode("text", {
      content: "Linked",
      href: "/about",
      target: "_blank",
    });
    const result = normalizeTypographyNode(source);

    expect(result.props.href).toBe("/about");
    expect(result.props.target).toBe("_blank");
  });

  it("strips invalid element override on text (h2)", () => {
    const source = createNode("Text", {
      content: "Mis-tagged",
      element: "h2",
    });
    const result = normalizeTypographyNode(source);

    expect(result.props.element).toBeUndefined();
  });

  it("strips conflicting element when level disagrees on heading", () => {
    const source = createNode("Heading", {
      text: "Title",
      level: 2,
      element: "h4",
    });
    const result = normalizeTypographyNode(source);

    expect(result.props.level).toBe(2);
    expect(result.props.element).toBeUndefined();
  });

  it("keeps valid element override on text", () => {
    const source = createNode("text", {
      content: "Span-like",
      element: "span",
    });
    const result = normalizeTypographyNode(source);

    expect(result.props.element).toBe("span");
  });

  it("preserves children and content through normalization", () => {
    const child = createNode("Span", { text: "word" });
    const source = createNode("Heading", { text: "Motion" }, [child]);
    const result = normalizeTypographyNode(source);

    expect(result.children).toHaveLength(1);
    expect(result.children[0]?.type).toBe("Span");
    expect(getContentValue(result)).toBe("Motion");
  });

  it("leaves non-typography nodes unchanged except child walk", () => {
    const nested = createNode("paragraph", { text: "inner" });
    const source = createNode("Container", {}, [nested]);
    const result = normalizeTypographyNode(source);

    expect(result.type).toBe("Container");
    expect(result.children[0]?.type).toBe("text");
    expect(result.children[0]?.props.content).toBe("inner");
  });
});
