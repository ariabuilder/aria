import { z } from "zod";
import type { FieldSchema } from "../../../../lib/cms/schemas";

export const CmsEntryListFieldTypeSchema = z.enum([
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
]);

export type CmsEntryListFieldType = z.infer<typeof CmsEntryListFieldTypeSchema>;

const EntryListFieldSchema = z
  .object({
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
    type: CmsEntryListFieldTypeSchema,
    showInEntryList: z.boolean().optional(),
    inlineEditable: z.boolean().optional(),
  })
  .catchall(z.unknown());

const MediaPreviewValueSchema = z
  .object({
    mediaId: z.string().optional(),
    id: z.string().optional(),
    url: z.string().optional(),
    alt: z.string().optional(),
    caption: z.string().optional(),
    label: z.string().optional(),
  })
  .strip();

export function isEntryListDisplayField(field: FieldSchema): boolean {
  const parsed = EntryListFieldSchema.safeParse(field);
  if (!parsed.success) {
    return false;
  }
  return parsed.data.showInEntryList === true || parsed.data.inlineEditable === true;
}

export function formatEntryListFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  if (typeof value === "object") {
    const parsedMedia = MediaPreviewValueSchema.safeParse(value);
    if (parsedMedia.success) {
      return (
        parsedMedia.data.label?.trim() ||
        parsedMedia.data.alt?.trim() ||
        parsedMedia.data.mediaId?.trim() ||
        parsedMedia.data.id?.trim() ||
        parsedMedia.data.url?.trim() ||
        "—"
      );
    }
  }
  return "—";
}
