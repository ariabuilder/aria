import { describe, expect, it } from "vitest";

import {
  buildEntryRelationsFromDraft,
  createRelationDraft,
} from "../../../admin/features/CMS/lib/relationForm";
import type { AriaEntryRelation, FieldSchema } from "../../../lib/cms/schemas";

describe("CMS relation form", () => {
  const fields = [
    {
      key: "authors",
      label: "Authors",
      type: "relation",
      targetCollection: "authors",
    },
    { key: "headline", label: "Headline", type: "string" },
  ] satisfies FieldSchema[];

  it("creates ordered relation drafts from stored relations", () => {
    const relations = [
      {
        sourceEntryId: "post-1",
        fieldKey: "authors",
        targetEntryId: "author-2",
        position: 1,
      },
      {
        sourceEntryId: "post-1",
        fieldKey: "authors",
        targetEntryId: "author-1",
        position: 0,
      },
    ] satisfies AriaEntryRelation[];

    expect(createRelationDraft(fields, relations)).toEqual({
      authors: ["author-2", "author-1"],
    });
  });

  it("builds ordered entry relation records from drafts", () => {
    expect(
      buildEntryRelationsFromDraft("post-1", fields, {
        authors: ["author-1", "author-2", "author-1"],
      }),
    ).toEqual([
      {
        sourceEntryId: "post-1",
        fieldKey: "authors",
        targetEntryId: "author-1",
        position: 0,
      },
      {
        sourceEntryId: "post-1",
        fieldKey: "authors",
        targetEntryId: "author-2",
        position: 1,
      },
    ]);
  });
});
