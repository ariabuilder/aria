import { describe, expect, it } from "vitest";

import {
  collectionSchemaForEntryFrontmatter,
  entryFieldsForCollection,
  isCoverImageField,
} from "../../../lib/cms/systemFields";
import type { AriaCollection } from "../../../lib/cms/schemas";

function collection(
  patch: Partial<AriaCollection> = {},
): AriaCollection {
  return {
    id: "collection-1",
    name: "posts",
    label: "Posts",
    kind: "content",
    schema: {
      id: "posts",
      label: "Posts",
      kind: "content",
      fields: [],
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: ["cover"],
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...patch,
  };
}

describe("CMS system fields", () => {
  it("adds an optional cover image field to cover-enabled collections", () => {
    for (const kind of ["content", "data", "config", "tags"] as const) {
      expect(
        entryFieldsForCollection(
          collection({
            kind,
            schema: {
              id: kind,
              label: kind,
              kind,
              fields: [],
              version: 1,
            },
          }),
        ).map((field) => field.key),
      ).toEqual(["cover"]);
    }
  });

  it("does not add a cover image field when cover support is disabled", () => {
    expect(
      entryFieldsForCollection(collection({ supports: [] })).map(
        (field) => field.key,
      ),
    ).toEqual([]);
  });

  it("does not duplicate an existing cover-like image field", () => {
    const fields = entryFieldsForCollection(
      collection({
        schema: {
          id: "posts",
          label: "Posts",
          kind: "content",
          fields: [{ key: "coverPhoto", label: "Cover Photo", type: "image" }],
          version: 1,
        },
      }),
    );

    expect(fields.map((field) => field.key)).toEqual(["coverPhoto"]);
    expect(isCoverImageField(fields[0]!)).toBe(true);
  });

  it("keeps non-cover collections schema-driven", () => {
    expect(
      entryFieldsForCollection(
        collection({
          kind: "data",
          supports: [],
          schema: {
            id: "topics",
            label: "Topics",
            kind: "data",
            fields: [],
            version: 1,
          },
        }),
      ),
    ).toEqual([]);
  });

  it("returns a schema that can validate system cover frontmatter", () => {
    expect(
      collectionSchemaForEntryFrontmatter(collection()).fields.map(
        (field) => field.key,
      ),
    ).toEqual(["cover"]);
  });
});
