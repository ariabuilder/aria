import { describe, expect, it } from "vitest";

import {
  buildArchiveListFilter,
  findArchiveBridgingFields,
  resolveCmsListFilter,
} from "../../../lib/cms/listFilters";
import { AriaCollectionSchema } from "../../../lib/cms/schemas";

function collection(
  overrides: Partial<{
    id: string;
    name: string;
    label: string;
    kind: "content" | "tags" | "data";
    fields: Array<Record<string, unknown>>;
  }> = {},
) {
  const id = overrides.id ?? "collection-blog";
  const name = overrides.name ?? "blog";
  return AriaCollectionSchema.parse({
    id,
    name,
    label: overrides.label ?? "Blog",
    kind: overrides.kind ?? "content",
    schema: {
      id,
      label: overrides.label ?? "Blog",
      kind: overrides.kind ?? "content",
      fields: overrides.fields ?? [],
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  });
}

describe("listFilters", () => {
  it("finds relation and reference fields that bridge to the entry context collection", () => {
    const tags = collection({
      id: "collection-tags",
      name: "tags",
      label: "Tags",
      kind: "tags",
    });
    const blog = collection({
      fields: [
        {
          key: "tags",
          label: "Tags",
          type: "relation",
          targetCollection: tags.id,
        },
        {
          key: "author",
          label: "Author",
          type: "reference",
          targetCollection: "collection-authors",
        },
      ],
    });
    const authors = collection({
      id: "collection-authors",
      name: "authors",
      label: "Authors",
      kind: "data",
    });

    expect(
      findArchiveBridgingFields({
        listCollection: blog,
        entryContextCollectionId: tags.id,
        collections: [blog, tags, authors],
      }),
    ).toEqual([
      {
        key: "tags",
        label: "Tags",
        type: "relation",
      },
    ]);
  });

  it("builds archive filters that use entry context tokens", () => {
    expect(
      buildArchiveListFilter({
        bridgingField: {
          key: "tags",
          label: "Tags",
          type: "relation",
        },
      }),
    ).toEqual({
      relationIncludes: {
        field: "tags",
        entryId: "$entryContext.id",
      },
    });
  });

  it("resolves entry context tokens to literal ids", () => {
    const tags = collection({
      id: "collection-tags",
      name: "tags",
      label: "Tags",
      kind: "tags",
    });
    const blog = collection({
      fields: [
        {
          key: "tags",
          label: "Tags",
          type: "relation",
          targetCollection: tags.id,
        },
      ],
    });

    expect(
      resolveCmsListFilter({
        collection: blog,
        rawFilter: {
          relationIncludes: {
            field: "tags",
            entryId: "$entryContext.id",
          },
        },
        entryContext: {
          collectionId: tags.id,
          entryId: "tag-design",
        },
        collections: [blog, tags],
      }),
    ).toEqual({
      relationIncludes: {
        field: "tags",
        entryId: "tag-design",
      },
    });
  });
});
