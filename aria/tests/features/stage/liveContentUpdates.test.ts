import { describe, expect, it } from "vitest";

import type { StructuredTextDocument } from "../../../lib/cms/structuredText";
import {
  resolveLiveHeadingUpdate,
  resolveLiveTextValue,
} from "../../../admin/features/Stage/utils/liveContentUpdates";

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

describe("resolveLiveTextValue", () => {
  it("returns null when a live payload does not include text fields", () => {
    expect(resolveLiveTextValue({ level: 4 })).toBeNull();
  });

  it("preserves explicit empty content updates", () => {
    expect(resolveLiveTextValue({ content: "" })).toBe("");
  });

  it("renders structured text content as HTML instead of object strings", () => {
    expect(resolveLiveTextValue({ content: sampleStructuredText })).toBe(
      "<p><strong>Hello &lt;CMS&gt;</strong></p>",
    );
    expect(resolveLiveTextValue({ content: sampleStructuredText })).not.toContain(
      "[object Object]",
    );
  });

  it("preserves plain string content updates", () => {
    expect(resolveLiveTextValue({ content: "Plain paragraph" })).toBe(
      "Plain paragraph",
    );
  });
});

describe("resolveLiveHeadingUpdate", () => {
  it("preserves existing text when a live update only changes heading level", () => {
    expect(
      resolveLiveHeadingUpdate(
        { level: 4 },
        {
          existingTagName: "H2",
          existingText: "Existing title",
          defaultLevel: 2,
        },
      ),
    ).toEqual({
      level: 4,
      text: "Existing title",
      hasExplicitText: false,
    });
  });

  it("preserves existing level when a live update only changes heading text", () => {
    expect(
      resolveLiveHeadingUpdate(
        { content: "Updated title" },
        {
          existingTagName: "H5",
          existingText: "Existing title",
          defaultLevel: 2,
        },
      ),
    ).toEqual({
      level: 5,
      text: "Updated title",
      hasExplicitText: true,
    });
  });
});
