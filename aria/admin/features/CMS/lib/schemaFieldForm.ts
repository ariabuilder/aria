import { z } from "zod";
import { FIELD_TYPES, type FieldType } from "../../../../lib/cms/constants";
import type { FieldSchema } from "../../../../lib/cms/schemas";

export const CmsSchemaFieldTypeSchema = z.enum(FIELD_TYPES);

export type CmsSchemaFieldType = z.infer<typeof CmsSchemaFieldTypeSchema>;
const CmsSchemaDraftFieldTypeSchema = z.enum(FIELD_TYPES);

export interface CmsSchemaFieldTypeOption {
  value: FieldType;
  label: string;
}

export interface CmsSchemaFieldTypeGroup {
  label: string;
  options: readonly CmsSchemaFieldTypeOption[];
}

export const CMS_SCHEMA_FIELD_TYPE_GROUPS: readonly CmsSchemaFieldTypeGroup[] = [
  {
    label: "Text",
    options: [
      { value: "string", label: "Short text" },
      { value: "text", label: "Long text" },
      { value: "slug", label: "Slug" },
    ],
  },
  {
    label: "Numbers & dates",
    options: [
      { value: "number", label: "Number" },
      { value: "integer", label: "Integer" },
      { value: "boolean", label: "Boolean" },
      { value: "date", label: "Date" },
      { value: "datetime", label: "Date and time" },
    ],
  },
  {
    label: "Choices",
    options: [
      { value: "select", label: "Select" },
      { value: "multiSelect", label: "Multi-select" },
    ],
  },
  {
    label: "Design",
    options: [{ value: "color", label: "Color" }],
  },
  {
    label: "Media",
    options: [
      { value: "icon", label: "Icon" },
      { value: "image", label: "Image" },
      { value: "file", label: "File" },
    ],
  },
  {
    label: "References",
    options: [
      { value: "reference", label: "Reference" },
      { value: "relation", label: "Relation" },
      { value: "link", label: "Link" },
    ],
  },
  {
    label: "Advanced",
    options: [
      { value: "structuredText", label: "Structured text" },
      { value: "richtext", label: "Rich text" },
      { value: "json", label: "JSON object" },
      { value: "object", label: "Object" },
      { value: "repeater", label: "Repeater" },
    ],
  },
] as const;

export const CMS_SCHEMA_FIELD_TYPE_OPTIONS: readonly CmsSchemaFieldTypeOption[] =
  CMS_SCHEMA_FIELD_TYPE_GROUPS.flatMap((group) => group.options);

export const CmsSchemaFieldDraftSchema = z
  .object({
    label: z.string(),
    key: z.string(),
    type: CmsSchemaDraftFieldTypeSchema,
    required: z.boolean(),
    searchable: z.boolean(),
    showInEntryList: z.boolean(),
    optionsText: z.string(),
    targetCollection: z.string(),
    repeaterTitleFieldKey: z.string(),
    repeaterAddButtonLabel: z.string(),
  })
  .strict();

export type CmsSchemaFieldDraft = z.infer<typeof CmsSchemaFieldDraftSchema>;

export const CmsSchemaFieldErrorsSchema = z.record(z.string(), z.string());
export type CmsSchemaFieldErrors = z.infer<typeof CmsSchemaFieldErrorsSchema>;
const CmsNestedSchemaFieldInputSchema: z.ZodType<FieldSchema> = z.lazy(() =>
  z
    .object({
      key: z.string().trim().min(1),
      label: z.string().trim().min(1),
      type: CmsSchemaFieldTypeSchema,
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      options: z.array(z.string().trim().min(1)).optional(),
      targetCollection: z.string().trim().min(1).optional(),
      fields: z.array(CmsNestedSchemaFieldInputSchema).optional(),
      searchable: z.boolean().optional(),
      showInEntryList: z.boolean().optional(),
      inlineEditable: z.boolean().optional(),
      repeaterDisplay: z
        .object({
          titleFieldKey: z.string().trim().min(1).optional(),
          addButtonLabel: z.string().trim().min(1).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
);
const CmsNestedSchemaFieldsInputSchema = z.array(CmsNestedSchemaFieldInputSchema);

export function createEmptySchemaFieldDraft(): CmsSchemaFieldDraft {
  return CmsSchemaFieldDraftSchema.parse({
    label: "",
    key: "",
    type: "string",
    required: false,
    searchable: false,
    showInEntryList: true,
    optionsText: "",
    targetCollection: "",
    repeaterTitleFieldKey: "",
    repeaterAddButtonLabel: "Add",
  });
}

export function createSchemaFieldDraftFromField(
  field: FieldSchema,
): CmsSchemaFieldDraft {
  const parsedType = CmsSchemaDraftFieldTypeSchema.parse(field.type);
  return CmsSchemaFieldDraftSchema.parse({
    label: field.label,
    key: field.key,
    type: parsedType,
    required: field.required === true,
    searchable: field.searchable === true,
    showInEntryList: field.showInEntryList === true,
    optionsText: field.options?.join("\n") ?? "",
    targetCollection: field.targetCollection ?? "",
    repeaterTitleFieldKey: field.repeaterDisplay?.titleFieldKey ?? "",
    repeaterAddButtonLabel: field.repeaterDisplay?.addButtonLabel ?? "Add",
  });
}

export function normalizeSchemaFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseOptions(optionsText: string): string[] {
  return optionsText
    .split("\n")
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function isNestedSchemaField(field: FieldSchema): boolean {
  return field.type === "object" || field.type === "repeater";
}

function repeaterTitleFieldExists(
  titleFieldKey: string,
  nestedFields: readonly FieldSchema[],
): boolean {
  return nestedFields.some((field) => field.key === titleFieldKey);
}

function buildRepeaterDisplaySettings(
  parsed: CmsSchemaFieldDraft,
): FieldSchema["repeaterDisplay"] | undefined {
  if (parsed.type !== "repeater") {
    return undefined;
  }

  const titleFieldKey = parsed.repeaterTitleFieldKey.trim();
  const addButtonLabel = parsed.repeaterAddButtonLabel.trim();
  const repeaterDisplay: FieldSchema["repeaterDisplay"] = {};

  if (titleFieldKey) {
    repeaterDisplay.titleFieldKey = titleFieldKey;
  }
  if (addButtonLabel && addButtonLabel !== "Add") {
    repeaterDisplay.addButtonLabel = addButtonLabel;
  }

  return Object.keys(repeaterDisplay).length > 0
    ? repeaterDisplay
    : undefined;
}

export function buildSchemaFieldFromDraft(
  draft: CmsSchemaFieldDraft,
  existingFields: readonly FieldSchema[],
  nestedFields: readonly FieldSchema[] = [],
): { success: true; field: FieldSchema } | { success: false; errors: CmsSchemaFieldErrors } {
  const parsed = CmsSchemaFieldDraftSchema.parse(draft);
  const parsedNestedFields = CmsNestedSchemaFieldsInputSchema.parse(nestedFields);
  const errors: CmsSchemaFieldErrors = {};
  const label = parsed.label.trim();
  const key = normalizeSchemaFieldKey(parsed.key || parsed.label);

  if (!label) {
    errors.label = "Label is required";
  }
  if (!key) {
    errors.key = "Field key is required";
  }
  if (existingFields.some((field) => field.key === key)) {
    errors.key = `Field "${key}" already exists`;
  }

  const needsOptions = parsed.type === "select" || parsed.type === "multiSelect";
  const options = needsOptions ? parseOptions(parsed.optionsText) : undefined;
  if (needsOptions && (!options || options.length === 0)) {
    errors.optionsText = "Add at least one option";
  }
  const targetCollection = parsed.targetCollection.trim();
  if ((parsed.type === "reference" || parsed.type === "relation") && !targetCollection) {
    errors.targetCollection = "Target collection is required";
  }
  if (
    (parsed.type === "object" || parsed.type === "repeater") &&
    parsedNestedFields.length === 0
  ) {
    errors.fields = "Add at least one nested field";
  }
  const repeaterTitleFieldKey = parsed.repeaterTitleFieldKey.trim();
  if (
    parsed.type === "repeater" &&
    repeaterTitleFieldKey &&
    !repeaterTitleFieldExists(repeaterTitleFieldKey, parsedNestedFields)
  ) {
    errors.repeaterTitleFieldKey = "Choose a nested field for the row title";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const field = {
    key,
    label,
    type: parsed.type,
    required: parsed.required || undefined,
    searchable: parsed.searchable || undefined,
    options,
    targetCollection: targetCollection || undefined,
    fields:
      parsed.type === "object" || parsed.type === "repeater"
        ? [...parsedNestedFields]
        : undefined,
    showInEntryList: parsed.showInEntryList || undefined,
    repeaterDisplay: buildRepeaterDisplaySettings(parsed),
  } satisfies FieldSchema;

  return { success: true, field };
}

export function buildUpdatedSchemaFieldFromDraft(
  currentField: FieldSchema,
  draft: CmsSchemaFieldDraft,
  nestedFields: readonly FieldSchema[] = currentField.fields ?? [],
): { success: true; field: FieldSchema } | { success: false; errors: CmsSchemaFieldErrors } {
  const parsed = CmsSchemaFieldDraftSchema.parse(draft);
  const errors: CmsSchemaFieldErrors = {};
  const label = parsed.label.trim();

  if (!label) {
    errors.label = "Label is required";
  }
  if (parsed.key !== currentField.key) {
    errors.key = "Field key cannot be changed yet";
  }
  if (parsed.type !== currentField.type) {
    errors.type = "Field type cannot be changed yet";
  }

  const needsOptions = parsed.type === "select" || parsed.type === "multiSelect";
  const options = needsOptions ? parseOptions(parsed.optionsText) : undefined;
  if (needsOptions && (!options || options.length === 0)) {
    errors.optionsText = "Add at least one option";
  }

  const targetCollection = parsed.targetCollection.trim();
  if ((parsed.type === "reference" || parsed.type === "relation") && !targetCollection) {
    errors.targetCollection = "Target collection is required";
  }
  const repeaterTitleFieldKey = parsed.repeaterTitleFieldKey.trim();
  if (
    parsed.type === "repeater" &&
    repeaterTitleFieldKey &&
    !repeaterTitleFieldExists(repeaterTitleFieldKey, nestedFields)
  ) {
    errors.repeaterTitleFieldKey = "Choose a nested field for the row title";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const field = {
    ...currentField,
    label,
    required: parsed.required || undefined,
    searchable: parsed.searchable || undefined,
    options,
    targetCollection: targetCollection || undefined,
    showInEntryList: parsed.showInEntryList || undefined,
    repeaterDisplay: buildRepeaterDisplaySettings(parsed),
  } satisfies FieldSchema;

  return { success: true, field };
}

export function fieldSupportsNestedSchema(field: FieldSchema): boolean {
  return isNestedSchemaField(field);
}

export function addNestedSchemaField(
  parentField: FieldSchema,
  nestedField: FieldSchema,
): FieldSchema {
  if (!isNestedSchemaField(parentField)) {
    return parentField;
  }

  return {
    ...parentField,
    fields: [...(parentField.fields ?? []), nestedField],
  } satisfies FieldSchema;
}

export function replaceNestedSchemaField(
  parentField: FieldSchema,
  nestedField: FieldSchema,
): FieldSchema {
  if (!isNestedSchemaField(parentField)) {
    return parentField;
  }

  return {
    ...parentField,
    fields: replaceSchemaField(parentField.fields ?? [], nestedField),
  } satisfies FieldSchema;
}

export function removeNestedSchemaField(
  parentField: FieldSchema,
  nestedFieldKey: string,
): FieldSchema {
  if (!isNestedSchemaField(parentField)) {
    return parentField;
  }

  return {
    ...parentField,
    fields: removeSchemaField(parentField.fields ?? [], nestedFieldKey),
  } satisfies FieldSchema;
}

export function reorderNestedSchemaFields(
  parentField: FieldSchema,
  nestedFields: readonly FieldSchema[],
): FieldSchema {
  if (!isNestedSchemaField(parentField)) {
    return parentField;
  }

  return {
    ...parentField,
    fields: [...nestedFields],
  } satisfies FieldSchema;
}

export function replaceSchemaField(
  fields: readonly FieldSchema[],
  field: FieldSchema,
): FieldSchema[] {
  return fields.map((current) => (current.key === field.key ? field : current));
}

export function removeSchemaField(
  fields: readonly FieldSchema[],
  fieldKey: string,
): FieldSchema[] {
  return fields.filter((field) => field.key !== fieldKey);
}
