import { z } from "zod";
import type { AriaCollection, AriaEntryRecord } from "./schemas";
import type { EntryStatus } from "./constants";
import {
  getPublicCollectionCacheTag,
  getPublicCollectionEntryCacheTags,
} from "../cache/service";

export const AriaCacheHintSchema = z
  .object({
    tags: z.array(z.string().trim().min(1)),
    maxAge: z.int().positive().optional(),
  })
  .strict();

export type AriaCacheHint = z.infer<typeof AriaCacheHintSchema>;

export const AriaEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    collectionName: z.string().trim().min(1),
    status: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    title: z.string(),
    data: z.record(z.string(), z.unknown()),
    publishedAt: z.string().nullable().optional(),
    updatedAt: z.string().min(1),
  })
  .strict();

export type AriaEntry = z.infer<typeof AriaEntrySchema>;

export type AriaQueryEntry<
  T extends Record<string, unknown> = Record<string, unknown>,
> = Omit<AriaEntry, "data"> & { data: T };

export const GetAriaEntryOptionsSchema = z
  .object({
    locale: z.string().trim().min(1).optional(),
    status: z.enum(["published", "draft", "any"]).default("published"),
    include: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export type GetAriaEntryOptions = z.infer<typeof GetAriaEntryOptionsSchema>;

export const GetAriaCollectionOptionsSchema = z
  .object({
    locale: z.string().trim().min(1).optional(),
    status: z.union([
      z.enum(["published", "draft", "any"]),
      z.array(z.enum(["draft", "published", "scheduled", "archived"])),
    ]).optional(),
    orderBy: z
      .object({
        title: z.enum(["asc", "desc"]).optional(),
        slug: z.enum(["asc", "desc"]).optional(),
        updatedAt: z.enum(["asc", "desc"]).optional(),
        publishedAt: z.enum(["asc", "desc"]).optional(),
        createdAt: z.enum(["asc", "desc"]).optional(),
      })
      .strict()
      .optional(),
    limit: z.int().positive().optional(),
    offset: z.int().nonnegative().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
    include: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export type GetAriaCollectionOptions = z.infer<
  typeof GetAriaCollectionOptionsSchema
>;

export function buildEntryCacheHint(input: {
  collectionId: string;
  entryId: string;
  templatePageId: string | null;
  maxAge?: number;
}): AriaCacheHint {
  const tags = input.templatePageId
    ? [
        ...getPublicCollectionEntryCacheTags({
          collectionId: input.collectionId,
          entryId: input.entryId,
          templatePageId: input.templatePageId,
        }),
      ]
    : [getPublicCollectionCacheTag(input.collectionId)];

  return AriaCacheHintSchema.parse({
    tags: [...new Set(tags)],
    maxAge: input.maxAge,
  });
}

export function buildCollectionCacheHint(input: {
  collectionId: string;
  maxAge?: number;
}): AriaCacheHint {
  return AriaCacheHintSchema.parse({
    tags: [getPublicCollectionCacheTag(input.collectionId)],
    maxAge: input.maxAge,
  });
}

export function mapStatusFilter(
  status: GetAriaEntryOptions["status"] | GetAriaCollectionOptions["status"],
): EntryStatus | EntryStatus[] | undefined {
  if (!status || status === "any") {
    return undefined;
  }
  if (status === "published") {
    return "published";
  }
  if (status === "draft") {
    return "draft";
  }
  if (Array.isArray(status)) {
    return status;
  }
  return undefined;
}

export function projectAriaEntry(input: {
  record: AriaEntryRecord;
  collection: AriaCollection;
  locale: string;
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
}): AriaEntry {
  return AriaEntrySchema.parse({
    id: input.record.entry.id,
    slug: input.slug,
    collectionId: input.collection.id,
    collectionName: input.collection.name,
    status: input.record.entry.status,
    locale: input.locale,
    title: input.title,
    data: input.frontmatter,
    publishedAt: input.record.entry.publishedAt,
    updatedAt: input.record.entry.updatedAt,
  });
}
