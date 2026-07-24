import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import {
  deserializeStructuredTextToTiptap,
  serializeTiptapToStructuredText,
} from "../../../lib/cms/structuredText";
import type { StructuredTextDocument } from "../../../lib/cms/structuredText";

describe("structured text Tiptap adapter", () => {
  it("serializes Tiptap paragraphs, marks, and links to Aria Structured Text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hello CMS",
              marks: [
                { type: "bold" },
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com",
                    target: "_blank",
                  },
                },
              ],
            },
          ],
        },
      ],
    } satisfies JSONContent;

    const structured = serializeTiptapToStructuredText(doc);

    expect(structured).toHaveLength(1);
    const block = structured[0];
    expect(block?._type).toBe("block");
    if (block?._type !== "block") return;
    expect(block.children[0]?.text).toBe("Hello CMS");
    expect(block.children[0]?.marks).toContain("strong");
    expect(block.markDefs[0]).toMatchObject({
      _type: "link",
      href: "https://example.com",
      openInNewTab: true,
    });
  });

  it("round-trips headings and grouped lists into Tiptap JSON", () => {
    const structured = [
      {
        _type: "block",
        _key: "heading",
        style: "h3",
        markDefs: [],
        children: [
          { _type: "span", _key: "span-heading", text: "Title", marks: [] },
        ],
      },
      {
        _type: "block",
        _key: "item-1",
        style: "normal",
        listItem: "bullet",
        level: 1,
        markDefs: [],
        children: [
          { _type: "span", _key: "span-1", text: "One", marks: [] },
        ],
      },
      {
        _type: "block",
        _key: "item-2",
        style: "normal",
        listItem: "bullet",
        level: 1,
        markDefs: [],
        children: [
          { _type: "span", _key: "span-2", text: "Two", marks: [] },
        ],
      },
    ] satisfies StructuredTextDocument;

    const tiptap = deserializeStructuredTextToTiptap(structured);

    expect(tiptap.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 3 },
    });
    expect(tiptap.content?.[1]).toMatchObject({
      type: "bulletList",
      content: [{ type: "listItem" }, { type: "listItem" }],
    });
    expect(serializeTiptapToStructuredText(tiptap).map((block) => block._type)).toEqual([
      "block",
      "block",
      "block",
    ]);
  });

  it("round-trips h4, blockquotes, dividers, strike, code, and link targets", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: "Small heading" }],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Quoted code",
                  marks: [{ type: "strike" }, { type: "code" }],
                },
              ],
            },
          ],
        },
        { type: "horizontalRule" },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Same tab",
              marks: [
                {
                  type: "link",
                  attrs: { href: "/same-tab", target: null },
                },
              ],
            },
            {
              type: "text",
              text: " New tab",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com", target: "_blank" },
                },
              ],
            },
          ],
        },
      ],
    } satisfies JSONContent;

    const structured = serializeTiptapToStructuredText(doc);

    expect(structured.map((block) => block._type)).toEqual([
      "block",
      "block",
      "divider",
      "block",
    ]);
    expect(structured[0]).toMatchObject({ _type: "block", style: "h4" });
    expect(structured[1]).toMatchObject({
      _type: "block",
      style: "blockquote",
    });
    const quote = structured[1];
    expect(quote?._type === "block" ? quote.children[0]?.marks : []).toEqual([
      "strike",
      "code",
    ]);
    const paragraph = structured[3];
    expect(paragraph?._type === "block" ? paragraph.markDefs : []).toEqual([
      expect.objectContaining({
        _type: "link",
        href: "/same-tab",
        openInNewTab: false,
      }),
      expect.objectContaining({
        _type: "link",
        href: "https://example.com",
        openInNewTab: true,
      }),
    ]);

    const tiptap = deserializeStructuredTextToTiptap(structured);
    expect(tiptap.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 4 },
    });
    expect(tiptap.content?.[1]).toMatchObject({ type: "blockquote" });
    expect(tiptap.content?.[2]).toMatchObject({ type: "horizontalRule" });
  });

  it("round-trips hard breaks without collapsing lines", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "First line" },
            { type: "hardBreak" },
            { type: "text", text: "Second line" },
          ],
        },
      ],
    } satisfies JSONContent;

    const structured = serializeTiptapToStructuredText(doc);
    expect(structured[0]).toMatchObject({
      _type: "block",
      children: [
        expect.objectContaining({ text: "First line" }),
        expect.objectContaining({ text: "\n" }),
        expect.objectContaining({ text: "Second line" }),
      ],
    });

    expect(deserializeStructuredTextToTiptap(structured).content?.[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "First line", marks: [] },
        { type: "hardBreak" },
        { type: "text", text: "Second line", marks: [] },
      ],
    });
  });

  it("round-trips image and safe embed blocks through editor JSON", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "ariaStructuredImage",
          attrs: {
            mediaId: "media-hero",
            alt: "Hero alt",
            caption: "Hero caption",
          },
        },
        {
          type: "ariaStructuredEmbed",
          attrs: {
            provider: "youtube",
            url: "https://www.youtube.com/watch?v=abc123",
          },
        },
      ],
    } satisfies JSONContent;

    const structured = serializeTiptapToStructuredText(doc);

    expect(structured).toEqual([
      expect.objectContaining({
        _type: "image",
        mediaId: "media-hero",
        alt: "Hero alt",
        caption: [
          expect.objectContaining({
            _type: "span",
            text: "Hero caption",
            marks: [],
          }),
        ],
      }),
      expect.objectContaining({
        _type: "embed",
        provider: "youtube",
        url: "https://www.youtube.com/watch?v=abc123",
      }),
    ]);

    expect(deserializeStructuredTextToTiptap(structured).content).toEqual([
      {
        type: "ariaStructuredImage",
        attrs: {
          mediaId: "media-hero",
          alt: "Hero alt",
          caption: "Hero caption",
        },
      },
      {
        type: "ariaStructuredEmbed",
        attrs: {
          provider: "youtube",
          url: "https://www.youtube.com/watch?v=abc123",
        },
      },
    ]);
  });

  it("skips malformed editor-only image and embed attrs", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "ariaStructuredImage", attrs: { mediaId: "" } },
        { type: "ariaStructuredEmbed", attrs: { provider: "", url: "" } },
      ],
    } satisfies JSONContent;

    expect(serializeTiptapToStructuredText(doc)).toEqual([]);
  });

  it("returns an empty structured document for an empty Tiptap document", () => {
    expect(
      serializeTiptapToStructuredText({
        type: "doc",
        content: [{ type: "paragraph" }],
      }),
    ).toEqual([]);
  });
});
