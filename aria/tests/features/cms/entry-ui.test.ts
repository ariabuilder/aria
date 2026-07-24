import { describe, expect, it } from "vitest";
import {
  plainTextToStructuredText,
  structuredTextToPlainText,
} from "../../../lib/cms/structuredText";
import { mapEntryRecordToRow } from "../../../admin/features/CMS/lib/entryRow";
import type { AriaEntryRecord } from "../../../lib/cms/schemas";

describe("structured text plain text bridge", () => {
  it("round-trips plain text through structured text blocks", () => {
    const document = plainTextToStructuredText("Hello CMS");
    expect(document).toHaveLength(1);
    expect(structuredTextToPlainText(document)).toBe("Hello CMS");
  });

  it("returns empty document for blank input", () => {
    expect(plainTextToStructuredText("   ")).toEqual([]);
    expect(structuredTextToPlainText(null)).toBe("");
  });
});

describe("mapEntryRecordToRow", () => {
  it("maps source locale fields onto table rows", () => {
    const record: AriaEntryRecord = {
      entry: {
        id: "entry-1",
        collectionId: "col-1",
        status: "draft",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-25T12:00:00.000Z",
        updatedAt: "2026-06-25T13:00:00.000Z",
        publishedAt: null,
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-1",
          collectionId: "col-1",
          locale: "en",
          slug: "hello-world",
          title: "Hello World",
          frontmatter: {
            summary: "A short preview",
          },
          body: null,
          isSource: true,
        },
      ],
    };

    expect(mapEntryRecordToRow(record)).toEqual({
      id: "entry-1",
      collectionId: "col-1",
      title: "Hello World",
      slug: "hello-world",
      status: "draft",
      version: "v1",
      locale: "en",
      updatedAt: "2026-06-25T13:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-06-25T12:00:00.000Z",
      frontmatter: {
        summary: "A short preview",
      },
    });
  });
});
