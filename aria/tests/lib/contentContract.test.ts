import { describe, expect, it } from "vitest";
import {
  buildContentUpdates,
  buildNormalizeContentPropsUpdates,
  getCanonicalContentPropName,
  getContentHeadingLevel,
  getContentValue,
  hasContentPropAliases,
  isContentPropAlias,
  normalizeContentNodeType,
  shouldAddSyntheticCanonicalContentProp,
} from "../../lib/blocks/contentContract";
import { resolveTextBindingPropName } from "../../admin/features/Inspector/composables/useInspectorPropBinding";
import {
  resolveInspectorContentBindingPropName,
  shouldSkipInspectorContentAliasProp,
} from "../../admin/features/Inspector/composables/usePropsEditor";

describe("contentContract", () => {
  it("prefers content over text when reading", () => {
    expect(
      getContentValue({
        props: { content: "A", text: "B" },
      }),
    ).toBe("A");
  });

  it("falls back to child content when a wrapper has no text props", () => {
    expect(
      getContentValue({
        type: "Heading",
        props: { level: 2 },
        children: [
          {
            type: "Text",
            props: { text: "Nested heading" },
          },
        ],
      }),
    ).toBe("Nested heading");
  });

  it("falls back to child content when a wrapper text prop is empty", () => {
    expect(
      getContentValue({
        type: "Heading",
        props: { level: 2, text: "" },
        children: [
          {
            type: "Text",
            props: { text: "Rendered heading" },
          },
        ],
      }),
    ).toBe("Rendered heading");
  });

  it("normalizes paragraph type key to text", () => {
    expect(normalizeContentNodeType("Paragraph")).toBe("text");
    expect(normalizeContentNodeType("Heading")).toBe("heading");
  });

  it("resolves heading level from props.level", () => {
    expect(getContentHeadingLevel({ props: { level: 5 } })).toBe(5);
  });

  it("falls back to element tag for heading level", () => {
    expect(
      getContentHeadingLevel({
        props: { element: "h3" },
      }),
    ).toBe(3);
  });

  it("defaults invalid level to h2", () => {
    expect(getContentHeadingLevel({ props: { level: 99 } })).toBe(2);
  });

  it("resolves canonical content prop names by node type", () => {
    expect(getCanonicalContentPropName("text")).toBe("content");
    expect(getCanonicalContentPropName("Paragraph")).toBe("content");
    expect(getCanonicalContentPropName("heading")).toBe("text");
    expect(getCanonicalContentPropName("button")).toBe("text");
  });

  it("writes only the canonical prop in buildContentUpdates", () => {
    expect(
      buildContentUpdates(
        { type: "text", props: { text: "legacy", content: "legacy" } },
        "Updated",
      ),
    ).toEqual({ content: "Updated" });

    expect(
      buildContentUpdates({ type: "heading", props: { content: "legacy" } }, "Updated"),
    ).toEqual({ text: "Updated" });
  });

  it("normalizes alias props and bindings onto the canonical prop", () => {
    expect(
      buildNormalizeContentPropsUpdates({
        type: "text",
        props: { text: "Body copy", content: "Body copy" },
        dataSource: {
          type: "collection",
          collection: "blog",
          bindings: { text: "blog.excerpt" },
        },
      }),
    ).toEqual({
      "props.content": "Body copy",
      "props.text": undefined,
      dataSource: {
        type: "collection",
        collection: "blog",
        bindings: { content: "blog.excerpt" },
      },
    });
  });

  it("detects alias props and synthetic canonical field needs", () => {
    expect(
      hasContentPropAliases({
        type: "text",
        props: { text: "Only alias" },
      }),
    ).toBe(true);

    expect(
      shouldAddSyntheticCanonicalContentProp({
        nodeType: "text",
        props: { text: "Only alias" },
      }),
    ).toBe(true);

    expect(isContentPropAlias("text", "text")).toBe(true);
    expect(isContentPropAlias("text", "content")).toBe(false);
  });

  it("keeps inspector and binding helpers aligned on canonical props", () => {
    expect(
      shouldSkipInspectorContentAliasProp({
        nodeType: "text",
        propName: "text",
      }),
    ).toBe(true);

    expect(
      resolveInspectorContentBindingPropName({
        nodeType: "text",
        propName: "text",
      }),
    ).toBe("content");

    expect(
      resolveTextBindingPropName({
        type: "text",
        props: { text: "Body" },
      } as never),
    ).toBe("content");
  });
});
