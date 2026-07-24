import { describe, expect, it } from "vitest";

import {
  formatEntryListFieldValue,
  isEntryListDisplayField,
} from "../../../admin/features/CMS/lib/entryListField";
import type { FieldSchema } from "../../../lib/cms/schemas";

describe("CMS entry list fields", () => {
  it("uses showInEntryList as the display-column contract", () => {
    const field = {
      key: "category",
      label: "Category",
      type: "select",
      showInEntryList: true,
    } satisfies FieldSchema;

    expect(isEntryListDisplayField(field)).toBe(true);
  });

  it("allows icon fields in entry list columns", () => {
    const field = {
      key: "feature_icon",
      label: "Feature Icon",
      type: "icon",
      showInEntryList: true,
    } satisfies FieldSchema;

    expect(isEntryListDisplayField(field)).toBe(true);
  });

  it("allows color fields in entry list columns", () => {
    const field = {
      key: "accentColor",
      label: "Accent Color",
      type: "color",
      showInEntryList: true,
    } satisfies FieldSchema;

    expect(isEntryListDisplayField(field)).toBe(true);
  });

  it("keeps legacy inlineEditable fields visible as read-only columns", () => {
    const field = {
      key: "summary",
      label: "Summary",
      type: "text",
      inlineEditable: true,
    } satisfies FieldSchema;

    expect(isEntryListDisplayField(field)).toBe(true);
  });

  it("formats list values without requiring an editor contract", () => {
    expect(formatEntryListFieldValue(["News", "Launch"])).toBe("News, Launch");
    expect(formatEntryListFieldValue({ mediaId: "media-1", alt: "Hero" })).toBe(
      "Hero",
    );
    expect(formatEntryListFieldValue(null)).toBe("—");
  });
});
