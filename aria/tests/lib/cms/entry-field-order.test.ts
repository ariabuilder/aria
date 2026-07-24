import { describe, expect, it } from "vitest";

import {
  normalizeEntryFieldOrder,
  normalizeEntryFieldOrderForCollection,
} from "../../../lib/cms/entryFieldOrder";
import type {
  AriaCollection,
  EntryFieldOrderItem,
  FieldSchema,
} from "../../../lib/cms/schemas";

const fields = [
  { key: "summary", label: "Summary", type: "text" },
  { key: "cover", label: "Cover", type: "image" },
] satisfies FieldSchema[];

function collection(input: {
  fields?: FieldSchema[];
  supports?: AriaCollection["supports"];
  entryFieldOrder?: EntryFieldOrderItem[];
}): AriaCollection {
  return {
    id: "collection-blog",
    name: "blog",
    label: "Blog",
    kind: "content",
    schema: {
      id: "collection-blog",
      label: "Blog",
      kind: "content",
      fields: input.fields ?? fields,
      entryFieldOrder: input.entryFieldOrder,
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: input.supports ?? ["body"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("CMS entry field order", () => {
  it("defaults to title, slug, custom fields, then body", () => {
    expect(
      normalizeEntryFieldOrder({
        fields,
        supportsBody: true,
      }),
    ).toEqual([
      { kind: "system", key: "title" },
      { kind: "system", key: "slug" },
      { kind: "field", key: "summary" },
      { kind: "field", key: "cover" },
      { kind: "system", key: "body" },
    ]);
  });

  it("removes body when body support is disabled", () => {
    expect(
      normalizeEntryFieldOrderForCollection(
        collection({
          supports: [],
          entryFieldOrder: [
            { kind: "system", key: "title" },
            { kind: "system", key: "body" },
            { kind: "system", key: "slug" },
          ],
        }),
      ),
    ).toEqual([
      { kind: "system", key: "title" },
      { kind: "system", key: "slug" },
      { kind: "field", key: "summary" },
      { kind: "field", key: "cover" },
    ]);
  });

  it("includes the managed cover field when cover support is enabled", () => {
    expect(
      normalizeEntryFieldOrderForCollection(
        collection({
          supports: ["body", "cover"],
          fields: [fields[0]!],
        }),
      ),
    ).toEqual([
      { kind: "system", key: "title" },
      { kind: "system", key: "slug" },
      { kind: "field", key: "cover" },
      { kind: "field", key: "summary" },
      { kind: "system", key: "body" },
    ]);
  });

  it("removes stale custom fields and duplicate order entries", () => {
    expect(
      normalizeEntryFieldOrder({
        fields: [fields[0]!],
        supportsBody: true,
        entryFieldOrder: [
          { kind: "system", key: "title" },
          { kind: "field", key: "deleted" },
          { kind: "field", key: "summary" },
          { kind: "field", key: "summary" },
          { kind: "system", key: "body" },
        ],
      }),
    ).toEqual([
      { kind: "system", key: "title" },
      { kind: "system", key: "slug" },
      { kind: "field", key: "summary" },
      { kind: "system", key: "body" },
    ]);
  });

  it("preserves custom ordering and inserts missing items in default positions", () => {
    expect(
      normalizeEntryFieldOrder({
        fields,
        supportsBody: true,
        entryFieldOrder: [
          { kind: "field", key: "cover" },
          { kind: "system", key: "body" },
        ],
      }),
    ).toEqual([
      { kind: "system", key: "title" },
      { kind: "system", key: "slug" },
      { kind: "field", key: "summary" },
      { kind: "field", key: "cover" },
      { kind: "system", key: "body" },
    ]);
  });

  it("preserves explicit field placement while normalizing the order", () => {
    expect(
      normalizeEntryFieldOrder({
        fields,
        supportsBody: true,
        entryFieldOrder: [
          { kind: "system", key: "title" },
          {
            kind: "field",
            key: "cover",
            placement: "main",
            width: "half",
          },
          {
            kind: "field",
            key: "summary",
            placement: "sidebar",
            width: "third",
          },
        ],
      }),
    ).toEqual([
      { kind: "system", key: "title" },
      { kind: "system", key: "slug" },
      {
        kind: "field",
        key: "cover",
        placement: "main",
        width: "half",
      },
      {
        kind: "field",
        key: "summary",
        placement: "sidebar",
        width: "third",
      },
      { kind: "system", key: "body" },
    ]);
  });
});
