import { describe, expect, it } from "vitest";

import {
  addNestedSchemaField,
  buildSchemaFieldFromDraft,
  buildUpdatedSchemaFieldFromDraft,
  CMS_SCHEMA_FIELD_TYPE_GROUPS,
  CMS_SCHEMA_FIELD_TYPE_OPTIONS,
  createSchemaFieldDraftFromField,
  CmsSchemaFieldTypeSchema,
  createEmptySchemaFieldDraft,
  fieldSupportsNestedSchema,
  normalizeSchemaFieldKey,
  removeNestedSchemaField,
  reorderNestedSchemaFields,
  replaceNestedSchemaField,
  removeSchemaField,
  replaceSchemaField,
} from "../../../admin/features/CMS/lib/schemaFieldForm";
import { FIELD_TYPES } from "../../../lib/cms/constants";
import type { FieldSchema } from "../../../lib/cms/schemas";

describe("CMS schema field form", () => {
  it("normalizes field keys for collection schemas", () => {
    expect(normalizeSchemaFieldKey("Hero Title")).toBe("hero_title");
    expect(normalizeSchemaFieldKey(" SEO---Summary ")).toBe("seo_summary");
  });

  it("groups every field type option exactly once", () => {
    const groupedOptions = CMS_SCHEMA_FIELD_TYPE_GROUPS.flatMap((group) => group.options);
    const groupedValues = groupedOptions.map((option) => option.value);
    const flatValues = CMS_SCHEMA_FIELD_TYPE_OPTIONS.map((option) => option.value);

    expect(CMS_SCHEMA_FIELD_TYPE_GROUPS.map((group) => group.label)).toEqual([
      "Text",
      "Numbers & dates",
      "Choices",
      "Design",
      "Media",
      "References",
      "Advanced",
    ]);
    expect(groupedValues).toEqual(flatValues);
    expect(new Set(groupedValues)).toEqual(new Set(FIELD_TYPES));
    expect(new Set(groupedValues).size).toBe(groupedValues.length);
    for (const value of groupedValues) {
      expect(CmsSchemaFieldTypeSchema.safeParse(value).success).toBe(true);
    }
  });

  it("builds a typed schema field from a draft", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Category",
        key: "category",
        type: "select",
        required: true,
        optionsText: "News\nNotes",
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "category",
      label: "Category",
      type: "select",
      required: true,
      showInEntryList: true,
      options: ["News", "Notes"],
    });
  });

  it("builds icon fields without media metadata", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Feature Icon",
        key: "feature_icon",
        type: "icon",
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "feature_icon",
      label: "Feature Icon",
      type: "icon",
      showInEntryList: true,
    });
  });

  it("builds color fields as string-backed design values", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Accent Color",
        key: "accent_color",
        type: "color",
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "accent_color",
      label: "Accent Color",
      type: "color",
      showInEntryList: true,
    });
  });

  it("allows fields to opt out of entry list columns", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Internal Notes",
        key: "internal_notes",
        type: "text",
        showInEntryList: false,
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "internal_notes",
      label: "Internal Notes",
      type: "text",
    });
  });

  it("requires nested schema containers to define child fields", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Menu items",
        key: "items",
        type: "repeater",
        showInEntryList: false,
      },
      [],
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.fields).toContain("nested field");
  });

  it("builds nested schema containers with child fields", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Menu items",
        key: "items",
        type: "repeater",
        showInEntryList: false,
      },
      [],
      [{ key: "label", label: "Label", type: "string" }],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "items",
      label: "Menu items",
      type: "repeater",
      fields: [{ key: "label", label: "Label", type: "string" }],
    });
  });

  it("builds repeater display settings from a draft", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Steps",
        key: "steps",
        type: "repeater",
        repeaterTitleFieldKey: "label",
        repeaterAddButtonLabel: "Add step",
      },
      [],
      [
        { key: "label", label: "Label", type: "string" },
        { key: "complete", label: "Complete", type: "boolean" },
      ],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "steps",
      label: "Steps",
      type: "repeater",
      fields: [
        { key: "label", label: "Label", type: "string" },
        { key: "complete", label: "Complete", type: "boolean" },
      ],
      showInEntryList: true,
      repeaterDisplay: {
        titleFieldKey: "label",
        addButtonLabel: "Add step",
      },
    });
  });

  it("builds structured text fields from drafts", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Story",
        key: "story",
        type: "structuredText",
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "story",
      label: "Story",
      type: "structuredText",
      showInEntryList: true,
    });
  });

  it("updates safe field settings without changing key or type", () => {
    const field = {
      key: "publishedDate",
      label: "Published date",
      type: "date",
      required: true,
      showInEntryList: true,
    } satisfies FieldSchema;

    const draft = {
      ...createSchemaFieldDraftFromField(field),
      label: "Editorial date",
      required: false,
      searchable: true,
      showInEntryList: false,
    };
    const result = buildUpdatedSchemaFieldFromDraft(field, draft);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "publishedDate",
      label: "Editorial date",
      type: "date",
      searchable: true,
    });
  });

  it("creates editable drafts for nested field types", () => {
    const field = {
      key: "sections",
      label: "Sections",
      type: "repeater",
      fields: [{ key: "heading", label: "Heading", type: "string" }],
      showInEntryList: true,
    } satisfies FieldSchema;

    const draft = createSchemaFieldDraftFromField(field);

    expect(draft).toMatchObject({
      key: "sections",
      label: "Sections",
      type: "repeater",
      showInEntryList: true,
    });
  });

  it("updates repeater display settings without dropping nested fields", () => {
    const field = {
      key: "sections",
      label: "Sections",
      type: "repeater",
      fields: [{ key: "heading", label: "Heading", type: "string" }],
      showInEntryList: true,
    } satisfies FieldSchema;

    const result = buildUpdatedSchemaFieldFromDraft(field, {
      ...createSchemaFieldDraftFromField(field),
      label: "Page sections",
      showInEntryList: false,
      repeaterTitleFieldKey: "heading",
      repeaterAddButtonLabel: "Add section",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "sections",
      label: "Page sections",
      type: "repeater",
      fields: [{ key: "heading", label: "Heading", type: "string" }],
      repeaterDisplay: {
        titleFieldKey: "heading",
        addButtonLabel: "Add section",
      },
    });
  });

  it("rejects repeater display title fields that are not nested fields", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Steps",
        key: "steps",
        type: "repeater",
        repeaterTitleFieldKey: "missing",
      },
      [],
      [{ key: "label", label: "Label", type: "string" }],
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.repeaterTitleFieldKey).toContain("nested field");
  });

  it("rejects edit attempts that change key or type", () => {
    const field = {
      key: "category",
      label: "Category",
      type: "select",
      options: ["News"],
    } satisfies FieldSchema;

    const result = buildUpdatedSchemaFieldFromDraft(field, {
      ...createSchemaFieldDraftFromField(field),
      key: "category_v2",
      type: "text",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.key).toContain("cannot be changed");
    expect(result.errors.type).toContain("cannot be changed");
  });

  it("rejects duplicate keys and missing select options", () => {
    const existing = [
      { key: "category", label: "Category", type: "string" },
    ] satisfies FieldSchema[];
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Category",
        key: "category",
        type: "select",
        required: false,
        optionsText: "",
      },
      existing,
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.key).toContain("already exists");
    expect(result.errors.optionsText).toContain("option");
  });

  it("builds reference fields with explicit target collections", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Author",
        key: "author",
        type: "reference",
        targetCollection: "authors",
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "author",
      label: "Author",
      type: "reference",
      targetCollection: "authors",
      showInEntryList: true,
    });
  });

  it("builds relation fields with explicit target collections", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Authors",
        key: "authors",
        type: "relation",
        targetCollection: "authors",
      },
      [],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field).toEqual({
      key: "authors",
      label: "Authors",
      type: "relation",
      targetCollection: "authors",
      showInEntryList: true,
    });
  });

  it("rejects relation fields without target collections", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Authors",
        key: "authors",
        type: "relation",
      },
      [],
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.targetCollection).toContain("required");
  });

  it("rejects reference fields without target collections", () => {
    const result = buildSchemaFieldFromDraft(
      {
        ...createEmptySchemaFieldDraft(),
        label: "Author",
        key: "author",
        type: "reference",
      },
      [],
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.targetCollection).toContain("required");
  });

  it("removes fields by key without mutating the source array", () => {
    const fields = [
      { key: "title", label: "Title", type: "string" },
      { key: "summary", label: "Summary", type: "text" },
    ] satisfies FieldSchema[];

    expect(removeSchemaField(fields, "summary")).toEqual([
      { key: "title", label: "Title", type: "string" },
    ]);
    expect(fields).toHaveLength(2);
  });

  it("replaces fields by key without mutating the source array", () => {
    const fields = [
      { key: "title", label: "Title", type: "string" },
      { key: "summary", label: "Summary", type: "text" },
    ] satisfies FieldSchema[];

    expect(
      replaceSchemaField(fields, {
        key: "summary",
        label: "Short summary",
        type: "text",
        showInEntryList: true,
      }),
    ).toEqual([
      { key: "title", label: "Title", type: "string" },
      {
        key: "summary",
        label: "Short summary",
        type: "text",
        showInEntryList: true,
      },
    ]);
    expect(fields[1]?.label).toBe("Summary");
  });

  it("manages nested schema fields without mutating the parent", () => {
    const parent = {
      key: "items",
      label: "Items",
      type: "repeater",
      fields: [{ key: "label", label: "Label", type: "string" }],
    } satisfies FieldSchema;

    const withLink = addNestedSchemaField(parent, {
      key: "link",
      label: "Link",
      type: "link",
    });
    expect(fieldSupportsNestedSchema(parent)).toBe(true);
    expect(withLink.fields?.map((field) => field.key)).toEqual(["label", "link"]);
    expect(parent.fields?.map((field) => field.key)).toEqual(["label"]);

    const renamed = replaceNestedSchemaField(withLink, {
      key: "label",
      label: "Menu label",
      type: "string",
    });
    expect(renamed.fields?.[0]?.label).toBe("Menu label");

    const reordered = reorderNestedSchemaFields(renamed, [
      renamed.fields?.[1],
      renamed.fields?.[0],
    ].filter((field): field is FieldSchema => field !== undefined));
    expect(reordered.fields?.map((field) => field.key)).toEqual(["link", "label"]);

    const removed = removeNestedSchemaField(reordered, "link");
    expect(removed.fields).toEqual([
      { key: "label", label: "Menu label", type: "string" },
    ]);
  });
});
