import { describe, expect, it } from "vitest";

import {
  renderStructuredTextToHtml,
  resolveRenderableContentValue,
} from "../../../lib/cms/structuredText";
import type { StructuredTextDocument } from "../../../lib/cms/structuredText";

const sampleStructuredText = [
  {
    _type: "block",
    _key: "block-1",
    style: "normal",
    markDefs: [],
    children: [
      {
        _type: "span",
        _key: "span-1",
        text: "Hello <CMS>",
        marks: ["strong"],
      },
    ],
  },
] satisfies StructuredTextDocument;

describe("resolveRenderableContentValue", () => {
  it("returns plain strings unchanged", () => {
    expect(resolveRenderableContentValue("Hello world")).toBe("Hello world");
  });

  it("renders structured text documents as HTML", () => {
    expect(resolveRenderableContentValue(sampleStructuredText)).toBe(
      "<p><strong>Hello &lt;CMS&gt;</strong></p>",
    );
    expect(resolveRenderableContentValue(sampleStructuredText)).not.toContain(
      "[object Object]",
    );
  });

  it("falls back for nullish values and stringifies other primitives", () => {
    expect(resolveRenderableContentValue(null, "fallback")).toBe("fallback");
    expect(resolveRenderableContentValue(undefined, "fallback")).toBe(
      "fallback",
    );
    expect(resolveRenderableContentValue(42)).toBe("42");
  });
});

describe("renderStructuredTextToHtml", () => {
  it("renders escaped paragraphs, headings, marks, and links", () => {
    const document = [
      {
        _type: "block",
        _key: "block-1",
        style: "h2",
        markDefs: [
          {
            _key: "link-1",
            _type: "link",
            href: "https://example.com",
            openInNewTab: true,
          },
        ],
        children: [
          {
            _type: "span",
            _key: "span-1",
            text: "Hello <CMS>",
            marks: ["strong", "link-1"],
          },
        ],
      },
    ] satisfies StructuredTextDocument;

    expect(renderStructuredTextToHtml(document)).toBe(
      '<h2><a href="https://example.com" target="_blank" rel="noopener noreferrer"><strong>Hello &lt;CMS&gt;</strong></a></h2>',
    );
  });

  it("groups adjacent list blocks by list type", () => {
    const document = [
      {
        _type: "block",
        _key: "block-1",
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
        _key: "block-2",
        style: "normal",
        listItem: "bullet",
        level: 1,
        markDefs: [],
        children: [
          { _type: "span", _key: "span-2", text: "Two", marks: [] },
        ],
      },
      {
        _type: "block",
        _key: "block-3",
        style: "normal",
        markDefs: [],
        children: [
          { _type: "span", _key: "span-3", text: "Done", marks: [] },
        ],
      },
    ] satisfies StructuredTextDocument;

    expect(renderStructuredTextToHtml(document)).toBe(
      "<ul><li>One</li><li>Two</li></ul><p>Done</p>",
    );
  });

  it("renders h4, blockquotes, dividers, strike, code, and same-tab links", () => {
    const document = [
      {
        _type: "block",
        _key: "heading-4",
        style: "h4",
        markDefs: [],
        children: [{ _type: "span", _key: "span-h4", text: "Deck", marks: [] }],
      },
      {
        _type: "block",
        _key: "quote",
        style: "blockquote",
        markDefs: [],
        children: [
          {
            _type: "span",
            _key: "span-quote",
            text: "Quietly useful",
            marks: ["strike", "code"],
          },
        ],
      },
      { _type: "divider", _key: "divider" },
      {
        _type: "block",
        _key: "link-block",
        style: "normal",
        markDefs: [
          {
            _key: "link-1",
            _type: "link",
            href: "javascript:alert(1)",
            openInNewTab: false,
          },
        ],
        children: [
          {
            _type: "span",
            _key: "span-link",
            text: "Unsafe link",
            marks: ["link-1"],
          },
        ],
      },
    ] satisfies StructuredTextDocument;

    expect(renderStructuredTextToHtml(document)).toBe(
      "<h4>Deck</h4><blockquote><code><s>Quietly useful</s></code></blockquote><hr><p><a href=\"#\">Unsafe link</a></p>",
    );
  });

  it("renders images with resolved URLs and escaped captions", () => {
    const document = [
      {
        _type: "image",
        _key: "image-1",
        mediaId: "media-1",
        alt: "Hero",
        caption: [
          {
            _type: "span",
            _key: "caption-1",
            text: "Caption & credit",
            marks: [],
          },
        ],
      },
    ] satisfies StructuredTextDocument;

    expect(
      renderStructuredTextToHtml(document, {
        resolveImageUrl: (mediaId) => `/media/${mediaId}.jpg`,
      }),
    ).toBe(
      '<figure><img src="/media/media-1.jpg" alt="Hero" loading="lazy"><figcaption>Caption &amp; credit</figcaption></figure>',
    );
  });

  it("renders hard breaks as HTML line breaks", () => {
    expect(
      renderStructuredTextToHtml([
        {
          _type: "block",
          _key: "line-break-block",
          style: "normal",
          markDefs: [],
          children: [
            { _type: "span", _key: "one", text: "First\nSecond", marks: [] },
          ],
        },
      ]),
    ).toBe("<p>First<br>Second</p>");
  });

  it("renders embeds as safe placeholders", () => {
    const document = [
      {
        _type: "embed",
        _key: "embed-1",
        provider: "youtube",
        url: "javascript:alert(1)",
      },
    ] satisfies StructuredTextDocument;

    expect(renderStructuredTextToHtml(document)).toBe(
      '<div data-embed-provider="youtube" data-embed-url="#"></div>',
    );
  });

  it("rejects invalid documents at the render boundary", () => {
    expect(() =>
      renderStructuredTextToHtml([{ _type: "unknown" }]),
    ).toThrow();
  });
});
