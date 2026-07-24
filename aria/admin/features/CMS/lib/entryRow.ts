import { z } from "zod";
import { ENTRY_STATUSES } from "../../../../lib/cms/constants";
import type { AriaEntryRecord } from "../../../../lib/cms/schemas";

export const CmsEntryRowSchema = z
  .object({
    id: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    title: z.string(),
    slug: z.string().trim().min(1),
    status: z.enum(ENTRY_STATUSES),
    version: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    frontmatter: z.record(z.string(), z.unknown()).default({}),
    updatedAt: z.string().min(1),
    publishedAt: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
  })
  .strict();

export type CmsEntryRow = z.infer<typeof CmsEntryRowSchema>;

function resolveSourceLocale(record: AriaEntryRecord) {
  return (
    record.locales.find((locale) => locale.isSource) ??
    record.locales[0] ??
    null
  );
}

export function mapEntryRecordToRow(record: AriaEntryRecord): CmsEntryRow {
  const locale = resolveSourceLocale(record);
  if (!locale) {
    throw new Error(`Entry ${record.entry.id} is missing locale data`);
  }

  return CmsEntryRowSchema.parse({
    id: record.entry.id,
    collectionId: record.entry.collectionId,
    title: locale.title,
    slug: locale.slug,
    status: record.entry.status,
    version: record.entry.version,
    locale: locale.locale,
    frontmatter: locale.frontmatter,
    updatedAt: record.entry.updatedAt,
    publishedAt: record.entry.publishedAt,
    createdAt: record.entry.createdAt,
  });
}
