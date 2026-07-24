import { z } from "zod";
import { FIELD_TYPES } from "../../../../lib/cms/constants";
import type { FieldSchema } from "../../../../lib/cms/schemas";
import {
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
} from "../../../../lib/cms/structuredText";

export const CmsEditableFieldTypeSchema = z.enum([
  "string",
  "text",
  "slug",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "select",
  "multiSelect",
  "color",
  "icon",
  "image",
  "file",
  "reference",
  "link",
  "structuredText",
  "richtext",
  "json",
  "repeater",
  "object",
]);

export type CmsEditableFieldType = z.infer<typeof CmsEditableFieldTypeSchema>;

export const CmsFrontmatterDraftSchema = z.record(z.string(), z.unknown());
export type CmsFrontmatterDraft = z.infer<typeof CmsFrontmatterDraftSchema>;

export const CmsFrontmatterErrorsSchema = z.record(z.string(), z.string());
export type CmsFrontmatterErrors = z.infer<typeof CmsFrontmatterErrorsSchema>;

export const CmsRepeaterItemDraftSchema = z.record(z.string(), z.unknown());
export type CmsRepeaterItemDraft = z.infer<typeof CmsRepeaterItemDraftSchema>;

const CmsFieldTypeSchema = z.enum(FIELD_TYPES);
export const CmsImageFieldValueSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    alt: z.string().trim().optional(),
    caption: z.string().trim().optional(),
  })
  .strict();
export type CmsImageFieldValue = z.infer<typeof CmsImageFieldValueSchema>;

export const CmsFileFieldValueSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    label: z.string().trim().optional(),
  })
  .strict();
export type CmsFileFieldValue = z.infer<typeof CmsFileFieldValueSchema>;

import {
  CmsLinkFieldValueSchema,
  type CmsLinkFieldValue,
} from "../../../../lib/cms/linkField";

export { CmsLinkFieldValueSchema, type CmsLinkFieldValue };

const CmsLinkDraftValueSchema = z
  .object({
    type: z.enum(["page", "entry", "external", "email", "phone", "internal"]),
    url: z.string(),
    pageId: z.string(),
    entryId: z.string(),
    collectionId: z.string(),
    slug: z.string(),
    label: z.string(),
    openInNewTab: z.boolean(),
  })
  .strict();

export type CmsLinkDraftValue = z.infer<typeof CmsLinkDraftValueSchema>;

const CmsMediaDraftValueSchema = z
  .object({
    mediaId: z.string(),
    alt: z.string().optional(),
    caption: z.string().optional(),
    label: z.string().optional(),
  })
  .strict();

export type CmsMediaDraftValue = z.infer<typeof CmsMediaDraftValueSchema>;

const CmsLegacyMediaRecordSchema = z
  .object({
    mediaId: z.string().optional(),
    id: z.string().optional(),
    url: z.string().optional(),
    alt: z.string().optional(),
    caption: z.string().optional(),
    label: z.string().optional(),
  })
  .strip();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function isEditableCmsField(field: FieldSchema): boolean {
  return CmsEditableFieldTypeSchema.safeParse(field.type).success;
}

export function editableCmsFields(fields: readonly FieldSchema[]): FieldSchema[] {
  return fields.filter(isEditableCmsField);
}

export function normalizeCmsMediaDraftValue(value: unknown): CmsMediaDraftValue {
  if (typeof value === "string") {
    return CmsMediaDraftValueSchema.parse({ mediaId: value });
  }

  const parsedRecord = CmsLegacyMediaRecordSchema.safeParse(value);
  if (parsedRecord.success) {
    return CmsMediaDraftValueSchema.parse({
      mediaId:
        parsedRecord.data.mediaId ??
        parsedRecord.data.id ??
        parsedRecord.data.url ??
        "",
      alt: parsedRecord.data.alt,
      caption: parsedRecord.data.caption,
      label: parsedRecord.data.label,
    });
  }

  return CmsMediaDraftValueSchema.parse({ mediaId: "" });
}

function initialValueForField(
  field: FieldSchema,
  initial: Record<string, unknown>,
): unknown {
  if (field.type === "image" || field.type === "file") {
    return normalizeCmsMediaDraftValue(initial[field.key]);
  }
  if (field.type === "link") {
    return normalizeCmsLinkDraftValue(initial[field.key]);
  }
  if (field.type === "repeater") {
    const value = initial[field.key];
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) =>
      createFrontmatterDraft(
        field.fields ?? [],
        isPlainRecord(item) ? item : {},
      ),
    );
  }
  if (field.type === "object") {
    const value = initial[field.key];
    return createFrontmatterDraft(field.fields ?? [], isPlainRecord(value) ? value : {});
  }

  if (Object.prototype.hasOwnProperty.call(initial, field.key)) {
    return initial[field.key];
  }
  if (field.default !== undefined) {
    return field.default;
  }

  switch (field.type) {
    case "boolean":
      return false;
    case "multiSelect":
    case "relation":
      return [];
    case "json":
      return {};
    case "structuredText":
    case "richtext":
      return [];
    default:
      return "";
  }
}

export function createFrontmatterDraft(
  fields: readonly FieldSchema[],
  initial?: Record<string, unknown>,
): CmsFrontmatterDraft {
  const source = CmsFrontmatterDraftSchema.parse(initial ?? {});
  const draft: CmsFrontmatterDraft = {};

  for (const field of editableCmsFields(fields)) {
    draft[field.key] = initialValueForField(field, source);
  }

  return CmsFrontmatterDraftSchema.parse(draft);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  return JSON.parse(trimmed) as unknown;
}

function parseStructuredTextValue(value: unknown): StructuredTextDocument {
  const parsed = StructuredTextDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseMultiSelectValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return z.array(z.string()).parse(value);
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function cloneCmsRepeaterItemDraft(value: unknown): CmsRepeaterItemDraft {
  const parsed = CmsRepeaterItemDraftSchema.parse(value);
  return structuredClone(parsed);
}

function repeaterTitleFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isPlainRecord(value)) {
    const label = value.label;
    if (typeof label === "string" && label.trim().length > 0) {
      return label.trim();
    }
    const url = value.url;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }
  return null;
}

export function resolveCmsRepeaterItemTitle(
  fields: readonly FieldSchema[],
  item: unknown,
  index: number,
  titleFieldKey?: string,
): string {
  const parsed = CmsRepeaterItemDraftSchema.safeParse(item);
  if (!parsed.success) {
    return `Item ${index + 1}`;
  }

  const configuredTitleField = titleFieldKey
    ? fields.find((field) => field.key === titleFieldKey)
    : undefined;
  const titleField =
    configuredTitleField ??
    fields.find((field) => field.key === "label") ??
    fields.find((field) => field.key === "title") ??
    fields.find((field) => field.type === "string" || field.type === "slug") ??
    fields.find((field) => field.type === "text" || field.type === "select") ??
    fields.find((field) => field.type === "link");

  if (!titleField) {
    return `Item ${index + 1}`;
  }

  return repeaterTitleFromValue(parsed.data[titleField.key]) ?? `Item ${index + 1}`;
}

function parseNumericValue(value: unknown, integer: boolean): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const numeric = integer ? Number.parseInt(trimmed, 10) : Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function optionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseImageValue(value: unknown): CmsImageFieldValue | undefined {
  const parsed = CmsMediaDraftValueSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const candidate = {
    mediaId: parsed.data.mediaId,
    ...(optionalTrimmed(parsed.data.alt)
      ? { alt: optionalTrimmed(parsed.data.alt) }
      : {}),
    ...(optionalTrimmed(parsed.data.caption)
      ? { caption: optionalTrimmed(parsed.data.caption) }
      : {}),
  };
  const result = CmsImageFieldValueSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}

function parseFileValue(value: unknown): CmsFileFieldValue | undefined {
  const parsed = CmsMediaDraftValueSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const candidate = {
    mediaId: parsed.data.mediaId,
    ...(optionalTrimmed(parsed.data.label)
      ? { label: optionalTrimmed(parsed.data.label) }
      : {}),
  };
  const result = CmsFileFieldValueSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}

export function normalizeCmsLinkDraftValue(value: unknown): CmsLinkDraftValue {
  const empty = CmsLinkDraftValueSchema.parse({
    type: "external",
    url: "",
    pageId: "",
    entryId: "",
    collectionId: "",
    slug: "",
    label: "",
    openInNewTab: false,
  });

  const parsed = CmsLinkFieldValueSchema.safeParse(value);
  if (!parsed.success) {
    return empty;
  }

  return CmsLinkDraftValueSchema.parse({
    type: parsed.data.type,
    url: parsed.data.url ?? "",
    pageId: parsed.data.pageId ?? "",
    entryId: parsed.data.entryId ?? "",
    collectionId: parsed.data.collectionId ?? "",
    slug: parsed.data.slug ?? "",
    label: parsed.data.label ?? "",
    openInNewTab: parsed.data.openInNewTab === true,
  });
}

function normalizeUrlForLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function parseLinkValue(value: unknown): CmsLinkFieldValue | undefined {
  const parsed = normalizeCmsLinkDraftValue(value);

  const common = {
    ...(optionalTrimmed(parsed.label)
      ? { label: optionalTrimmed(parsed.label) }
      : {}),
    ...(parsed.openInNewTab ? { openInNewTab: true } : {}),
  };

  switch (parsed.type) {
    case "internal": {
      const url = optionalTrimmed(parsed.url);
      if (!url) return undefined;
      return CmsLinkFieldValueSchema.parse({
        type: "internal",
        url,
        ...common,
      });
    }
    case "page": {
      const url = optionalTrimmed(parsed.url);
      if (!url) return undefined;
      return CmsLinkFieldValueSchema.parse({
        type: "page",
        url,
        ...(optionalTrimmed(parsed.pageId)
          ? { pageId: optionalTrimmed(parsed.pageId) }
          : {}),
        ...(optionalTrimmed(parsed.slug) ? { slug: optionalTrimmed(parsed.slug) } : {}),
        ...common,
      });
    }
    case "entry": {
      const entryId = optionalTrimmed(parsed.entryId);
      if (!entryId) return undefined;
      return CmsLinkFieldValueSchema.parse({
        type: "entry",
        entryId,
        ...(optionalTrimmed(parsed.collectionId)
          ? { collectionId: optionalTrimmed(parsed.collectionId) }
          : {}),
        ...(optionalTrimmed(parsed.slug) ? { slug: optionalTrimmed(parsed.slug) } : {}),
        ...common,
      });
    }
    case "email": {
      const email = optionalTrimmed(parsed.url);
      if (!email) return undefined;
      return CmsLinkFieldValueSchema.parse({
        type: "email",
        url: email.startsWith("mailto:") ? email : `mailto:${email}`,
        ...common,
      });
    }
    case "phone": {
      const phone = optionalTrimmed(parsed.url);
      if (!phone) return undefined;
      return CmsLinkFieldValueSchema.parse({
        type: "phone",
        url: phone.startsWith("tel:") ? phone : `tel:${phone}`,
        ...common,
      });
    }
    case "external":
    default: {
      const url = normalizeUrlForLink(parsed.url);
      if (!url) return undefined;
      return CmsLinkFieldValueSchema.parse({
        type: "external",
        url,
        ...common,
      });
    }
  }
}

function parseObjectValue(
  fields: readonly FieldSchema[] | undefined,
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  return buildFrontmatterFromDraft(fields ?? [], value);
}

function parseRepeaterValue(
  fields: readonly FieldSchema[] | undefined,
  value: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => parseObjectValue(fields, item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

export function buildFrontmatterFromDraft(
  fields: readonly FieldSchema[],
  draft: CmsFrontmatterDraft,
): Record<string, unknown> {
  const parsedDraft = CmsFrontmatterDraftSchema.parse(draft);
  const frontmatter: Record<string, unknown> = {};

  for (const field of editableCmsFields(fields)) {
    const fieldType = CmsFieldTypeSchema.parse(field.type);
    const value = parsedDraft[field.key];

    switch (fieldType) {
      case "boolean":
        frontmatter[field.key] = value === true;
        break;
      case "number": {
        const numeric = parseNumericValue(value, false);
        if (numeric !== undefined) {
          frontmatter[field.key] = numeric;
        }
        break;
      }
      case "integer": {
        const numeric = parseNumericValue(value, true);
        if (numeric !== undefined) {
          frontmatter[field.key] = numeric;
        }
        break;
      }
      case "multiSelect": {
        const selected = parseMultiSelectValue(value);
        if (selected.length > 0 || field.required) {
          frontmatter[field.key] = selected;
        }
        break;
      }
      case "relation": {
        const selected = parseMultiSelectValue(value);
        if (selected.length > 0 || field.required) {
          frontmatter[field.key] = selected;
        }
        break;
      }
      case "json": {
        const jsonValue = parseJsonValue(value);
        if (isPlainRecord(jsonValue)) {
          frontmatter[field.key] = jsonValue;
        } else {
          frontmatter[field.key] = jsonValue;
        }
        break;
      }
      case "structuredText":
      case "richtext": {
        const document = parseStructuredTextValue(value);
        if (document.length > 0 || field.required) {
          frontmatter[field.key] = document;
        }
        break;
      }
      case "image": {
        const imageValue = parseImageValue(value);
        if (imageValue !== undefined) {
          frontmatter[field.key] = imageValue;
        }
        break;
      }
      case "file": {
        const fileValue = parseFileValue(value);
        if (fileValue !== undefined) {
          frontmatter[field.key] = fileValue;
        }
        break;
      }
      case "link": {
        const linkValue = parseLinkValue(value);
        if (linkValue !== undefined) {
          frontmatter[field.key] = linkValue;
        }
        break;
      }
      case "object": {
        const objectValue = parseObjectValue(field.fields, value);
        if (
          objectValue !== undefined &&
          (Object.keys(objectValue).length > 0 || field.required)
        ) {
          frontmatter[field.key] = objectValue;
        }
        break;
      }
      case "repeater": {
        const repeaterValue = parseRepeaterValue(field.fields, value);
        if (repeaterValue.length > 0 || field.required) {
          frontmatter[field.key] = repeaterValue;
        }
        break;
      }
      case "string":
      case "text":
      case "slug":
      case "color":
      case "icon":
      case "date":
      case "datetime":
      case "select":
      case "reference": {
        const stringValue = parseStringValue(value);
        if (stringValue !== undefined) {
          frontmatter[field.key] = stringValue;
        }
        break;
      }
      default:
        break;
    }
  }

  return z.record(z.string(), z.unknown()).parse(frontmatter);
}
