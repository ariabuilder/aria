import { describe, expect, it } from "vitest";

import {
  CollectionSchemaInputSchema,
  CollectionSupportSchema,
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
} from "../../../lib/cms/schemas";

describe("CMS collection schemas", () => {
  it("accepts collection supports in create and update payloads", () => {
    expect(CollectionSupportSchema.parse("body")).toBe("body");
    expect(CollectionSupportSchema.parse("cover")).toBe("cover");

    expect(
      CreateCollectionRequestSchema.parse({
        name: "blog",
        label: "Blog",
        kind: "content",
        supports: ["body", "cover"],
      }).supports,
    ).toEqual(["body", "cover"]);

    expect(
      UpdateCollectionRequestSchema.parse({
        id: "collection-blog",
        patch: {
          supports: ["body", "cover", "revisions"],
        },
      }).patch.supports,
    ).toEqual(["body", "cover", "revisions"]);
  });

  it("accepts configurable entry field order metadata", () => {
    const entryFieldOrder = [
      { kind: "system", key: "title" },
      {
        kind: "field",
        key: "summary",
        placement: "sidebar",
        width: "third",
      },
      { kind: "system", key: "body" },
      { kind: "system", key: "slug" },
    ] as const;

    expect(
      CollectionSchemaInputSchema.parse({
        id: "collection-blog",
        label: "Blog",
        kind: "content",
        fields: [{ key: "summary", label: "Summary", type: "text" }],
        entryFieldOrder,
        version: 1,
      }).entryFieldOrder,
    ).toEqual(entryFieldOrder);

    expect(
      UpdateCollectionRequestSchema.parse({
        id: "collection-blog",
        patch: {
          entryFieldOrder,
        },
      }).patch.entryFieldOrder,
    ).toEqual(entryFieldOrder);
  });

  it("rejects UI labels from persisted entry field order metadata", () => {
    const entryFieldOrder = [
      { kind: "system", key: "title", label: "Title" },
      { kind: "field", key: "summary", label: "Summary" },
      { kind: "system", key: "slug", label: "Slug" },
    ];

    expect(
      () => CollectionSchemaInputSchema.parse({
        id: "collection-blog",
        label: "Blog",
        kind: "content",
        fields: [{ key: "summary", label: "Summary", type: "text" }],
        entryFieldOrder,
        version: 1,
      }),
    ).toThrow();
  });

  it("accepts icon fields in collection update payloads", () => {
    expect(
      UpdateCollectionRequestSchema.parse({
        id: "collection-blog",
        patch: {
          fields: [
            {
              key: "feature_icon",
              label: "Feature Icon",
              type: "icon",
              showInEntryList: true,
            },
          ],
          entryFieldOrder: [{ kind: "field", key: "feature_icon" }],
        },
      }).patch.fields,
    ).toEqual([
      {
        key: "feature_icon",
        label: "Feature Icon",
        type: "icon",
        showInEntryList: true,
      },
    ]);
  });

  it("accepts repeater display settings in collection schemas", () => {
    expect(
      CollectionSchemaInputSchema.parse({
        id: "collection-blog",
        label: "Blog",
        kind: "content",
        fields: [
          {
            key: "steps",
            label: "Steps",
            type: "repeater",
            fields: [{ key: "label", label: "Label", type: "string" }],
            repeaterDisplay: {
              titleFieldKey: "label",
              addButtonLabel: "Add step",
            },
          },
        ],
        version: 1,
      }).fields[0]?.repeaterDisplay,
    ).toEqual({
      titleFieldKey: "label",
      addButtonLabel: "Add step",
    });
  });
});
