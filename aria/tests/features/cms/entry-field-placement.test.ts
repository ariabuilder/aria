import { describe, expect, it } from "vitest";

import {
  entryFieldsForPlacement,
  getEntryFieldPlacement,
  getOrderedEntryFieldPlacement,
} from "../../../admin/features/CMS/lib/entryFieldPlacement";
import type { FieldSchema } from "../../../lib/cms/schemas";

describe("CMS entry field placement", () => {
  it("places cover-like image fields in the sidebar", () => {
    const field = {
      key: "cover",
      label: "Cover",
      type: "image",
    } satisfies FieldSchema;

    expect(getEntryFieldPlacement(field)).toBe("sidebar");
  });

  it("places camelCase cover and media photo image fields in the sidebar", () => {
    const fields = [
      { key: "coverPhoto", label: "Cover Photo", type: "image" },
      { key: "mediaPhoto", label: "Media Photo", type: "image" },
    ] satisfies FieldSchema[];

    expect(entryFieldsForPlacement(fields, "sidebar").map((field) => field.key)).toEqual([
      "coverPhoto",
      "mediaPhoto",
    ]);
  });

  it("keeps ordinary fields in the main editor", () => {
    const fields = [
      { key: "cover", label: "Cover", type: "image" },
      { key: "summary", label: "Summary", type: "text" },
      { key: "author", label: "Author", type: "reference" },
    ] satisfies FieldSchema[];

    expect(entryFieldsForPlacement(fields, "sidebar").map((field) => field.key)).toEqual([
      "cover",
    ]);
    expect(entryFieldsForPlacement(fields, "main").map((field) => field.key)).toEqual([
      "summary",
      "author",
    ]);
  });

  it("uses an explicit collection layout placement over the field default", () => {
    const field = {
      key: "cover",
      label: "Cover",
      type: "image",
    } satisfies FieldSchema;

    expect(
      getOrderedEntryFieldPlacement(
        { kind: "field", key: "cover", placement: "main" },
        field,
      ),
    ).toBe("main");
  });
});
