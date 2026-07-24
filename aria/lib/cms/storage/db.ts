import { z } from "zod";
import {
  AriaCollectionSchema,
  AriaEntryAuthorshipSchema,
  AriaEntryLocaleSchema,
  AriaEntryRelationSchema,
  AriaEntryRevisionSchema,
  AriaEntrySchema,
  AriaEntrySnapshotSchema,
  CollectionSchemaInputSchema,
} from "../schemas";
import { COLLECTION_SUPPORTS, type CollectionSupport } from "../constants";
import type {
  AriaCollection,
  AriaEntry,
  AriaEntryAuthorship,
  AriaEntryLocale,
  AriaEntryRelation,
  AriaEntryRevision,
} from "../schemas";

const CollectionRowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    label: z.string().min(1),
    kind: z.string().min(1),
    schema_json: z.string().min(1),
    scope: z.string().min(1),
    url_pattern: z.string().nullable(),
    template_page_id: z.string().nullable(),
    list_page_id: z.string().nullable(),
    supports_json: z.string().nullable(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict();

const COLLECTION_SUPPORT_SET = new Set<string>(COLLECTION_SUPPORTS);

const EntryRowSchema = z
  .object({
    id: z.string().min(1),
    collection_id: z.string().min(1),
    status: z.string().min(1),
    version: z.string().min(1),
    author_id: z.string().min(1),
    created_by_id: z.string().nullable().optional(),
    created_by_username: z.string().nullable().optional(),
    created_by_email: z.string().nullable().optional(),
    updated_by_id: z.string().nullable().optional(),
    updated_by_username: z.string().nullable().optional(),
    updated_by_email: z.string().nullable().optional(),
    published_by_id: z.string().nullable().optional(),
    published_by_username: z.string().nullable().optional(),
    published_by_email: z.string().nullable().optional(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    published_at: z.string().nullable(),
    scheduled_for: z.string().nullable(),
    scheduled_version: z.string().nullable().optional(),
    schedule_lease_token: z.string().nullable().optional(),
    schedule_lease_expires_at: z.string().nullable().optional(),
    schedule_attempt_count: z.coerce.number().int().nonnegative().optional(),
    last_schedule_error: z.string().nullable().optional(),
  })
  .strict();

const EntryLocaleRowSchema = z
  .object({
    entry_id: z.string().min(1),
    collection_id: z.string().min(1),
    locale: z.string().min(1),
    slug: z.string().min(1),
    title: z.string(),
    frontmatter_json: z.string().min(1),
    body: z.string().nullable(),
    is_source: z.union([z.literal(0), z.literal(1), z.boolean()]),
    comments_closed: z
      .union([z.literal(0), z.literal(1), z.boolean()])
      .optional(),
    translation_meta_json: z.string().nullable().optional(),
  })
  .strict();

const EntryRelationRowSchema = z
  .object({
    source_entry_id: z.string().min(1),
    field_key: z.string().min(1),
    target_entry_id: z.string().min(1),
    position: z.coerce.number().int().nonnegative(),
    meta_json: z.string().nullable(),
  })
  .strict();

const EntryRevisionRowSchema = z
  .object({
    id: z.string().min(1),
    entry_id: z.string().min(1),
    locale: z.string().nullable(),
    version: z.string().min(1),
    snapshot_json: z.string().min(1),
    actor_id: z.string().min(1),
    actor_username: z.string().nullable().optional(),
    actor_email: z.string().nullable().optional(),
    actor_avatar_url: z.string().nullable().optional(),
    message: z.string().nullable(),
    created_at: z.string().min(1),
  })
  .strict();

function parseSupportsJson(value: string | null): CollectionSupport[] {
  if (!value) {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  return z
    .array(z.string())
    .parse(parsed)
    .filter((support): support is CollectionSupport =>
      COLLECTION_SUPPORT_SET.has(support),
    );
}

function serializeSupports(supports: CollectionSupport[]): string | null {
  return supports.length > 0 ? JSON.stringify(supports) : null;
}

function parseBodyJson(value: string | null): unknown | null {
  if (value == null) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function serializeBody(body: unknown | null): string | null {
  if (body == null) {
    return null;
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}

export function mapCollectionRow(row: unknown): AriaCollection {
  const parsed = CollectionRowSchema.parse(row);
  const schema = CollectionSchemaInputSchema.parse(
    JSON.parse(parsed.schema_json),
  );

  return AriaCollectionSchema.parse({
    id: parsed.id,
    name: parsed.name,
    label: parsed.label,
    kind: schema.kind,
    schema,
    scope: parsed.scope,
    urlPattern: parsed.url_pattern,
    templatePageId: parsed.template_page_id,
    listPageId: parsed.list_page_id,
    supports: parseSupportsJson(parsed.supports_json),
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

export function mapEntryRow(row: unknown): AriaEntry {
  const parsed = EntryRowSchema.parse(row);
  return AriaEntrySchema.parse({
    id: parsed.id,
    collectionId: parsed.collection_id,
    status: parsed.status,
    version: parsed.version,
    authorId: parsed.author_id,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    publishedAt: parsed.published_at,
    scheduledFor: parsed.scheduled_for,
  });
}

export function mapEntryAuthorshipFromRow(
  row: unknown,
): AriaEntryAuthorship | undefined {
  const parsed = EntryRowSchema.parse(row);
  const toDisplay = (
    id: string | null | undefined,
    username: string | null | undefined,
    email: string | null | undefined,
  ) =>
    id && username
      ? {
          id,
          username,
          email: email ?? undefined,
        }
      : null;

  const createdBy = toDisplay(
    parsed.created_by_id,
    parsed.created_by_username,
    parsed.created_by_email,
  );
  const updatedBy = toDisplay(
    parsed.updated_by_id,
    parsed.updated_by_username,
    parsed.updated_by_email,
  );
  const publishedBy = toDisplay(
    parsed.published_by_id,
    parsed.published_by_username,
    parsed.published_by_email,
  );
  const author = updatedBy ?? createdBy;
  if (!author && !createdBy && !updatedBy && !publishedBy) {
    return undefined;
  }
  return AriaEntryAuthorshipSchema.parse({
    author,
    createdBy,
    updatedBy,
    publishedBy,
  });
}

export function mapEntryLocaleRow(row: unknown): AriaEntryLocale {
  const parsed = EntryLocaleRowSchema.parse(row);
  return AriaEntryLocaleSchema.parse({
    entryId: parsed.entry_id,
    collectionId: parsed.collection_id,
    locale: parsed.locale,
    slug: parsed.slug,
    title: parsed.title,
    frontmatter: JSON.parse(parsed.frontmatter_json) as Record<string, unknown>,
    body: parseBodyJson(parsed.body),
    isSource: parsed.is_source === 1 || parsed.is_source === true,
    commentsClosed:
      parsed.comments_closed === 1 || parsed.comments_closed === true,
    translationMeta: parsed.translation_meta_json
      ? JSON.parse(parsed.translation_meta_json)
      : null,
  });
}

export function mapEntryRelationRow(row: unknown): AriaEntryRelation {
  const parsed = EntryRelationRowSchema.parse(row);
  return AriaEntryRelationSchema.parse({
    sourceEntryId: parsed.source_entry_id,
    fieldKey: parsed.field_key,
    targetEntryId: parsed.target_entry_id,
    position: parsed.position,
    meta: parsed.meta_json
      ? (JSON.parse(parsed.meta_json) as Record<string, unknown>)
      : undefined,
  });
}

export function mapEntryRevisionRow(row: unknown): AriaEntryRevision {
  const parsed = EntryRevisionRowSchema.parse(row);
  const snapshot = AriaEntrySnapshotSchema.parse(
    JSON.parse(parsed.snapshot_json),
  );
  return AriaEntryRevisionSchema.parse({
    id: parsed.id,
    entryId: parsed.entry_id,
    locale: parsed.locale,
    version: parsed.version,
    snapshot,
    actorId: parsed.actor_id,
    message: parsed.message ?? undefined,
    createdAt: parsed.created_at,
    authorship: {
      actor: parsed.actor_username
        ? {
            id: parsed.actor_id,
            username: parsed.actor_username,
            email: parsed.actor_email ?? undefined,
            avatarUrl: parsed.actor_avatar_url ?? undefined,
          }
        : null,
    },
  });
}

export function collectionToRow(collection: AriaCollection): {
  id: string;
  name: string;
  label: string;
  kind: string;
  schema_json: string;
  scope: string;
  url_pattern: string | null;
  template_page_id: string | null;
  list_page_id: string | null;
  supports_json: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    id: collection.id,
    name: collection.name,
    label: collection.label,
    kind: collection.schema.kind,
    schema_json: JSON.stringify(collection.schema),
    scope: collection.scope,
    url_pattern: collection.urlPattern,
    template_page_id: collection.templatePageId,
    list_page_id: collection.listPageId,
    supports_json: serializeSupports(collection.supports),
    created_at: collection.createdAt,
    updated_at: collection.updatedAt,
  };
}

export function entryToRow(entry: AriaEntry): {
  id: string;
  collection_id: string;
  status: string;
  version: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  scheduled_for: string | null;
  scheduled_version: string | null;
  created_by_id: string | null;
  created_by_username: string | null;
  created_by_email: string | null;
  updated_by_id: string | null;
  updated_by_username: string | null;
  updated_by_email: string | null;
  published_by_id: string | null;
  published_by_username: string | null;
  published_by_email: string | null;
} {
  return {
    id: entry.id,
    collection_id: entry.collectionId,
    status: entry.status,
    version: entry.version,
    author_id: entry.authorId,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    published_at: entry.publishedAt,
    scheduled_for: entry.scheduledFor,
    scheduled_version: entry.status === "scheduled" ? entry.version : null,
    created_by_id: null,
    created_by_username: null,
    created_by_email: null,
    updated_by_id: null,
    updated_by_username: null,
    updated_by_email: null,
    published_by_id: null,
    published_by_username: null,
    published_by_email: null,
  };
}

export function entryLocaleToRow(locale: AriaEntryLocale): {
  entry_id: string;
  collection_id: string;
  locale: string;
  slug: string;
  title: string;
  frontmatter_json: string;
  body: string | null;
  is_source: number;
  comments_closed: number;
  translation_meta_json: string | null;
} {
  return {
    entry_id: locale.entryId,
    collection_id: locale.collectionId,
    locale: locale.locale,
    slug: locale.slug,
    title: locale.title,
    frontmatter_json: JSON.stringify(locale.frontmatter),
    body: serializeBody(locale.body),
    is_source: locale.isSource ? 1 : 0,
    comments_closed: locale.commentsClosed ? 1 : 0,
    translation_meta_json: locale.translationMeta
      ? JSON.stringify(locale.translationMeta)
      : null,
  };
}

export function entryRelationToRow(relation: AriaEntryRelation): {
  source_entry_id: string;
  field_key: string;
  target_entry_id: string;
  position: number;
  meta_json: string | null;
} {
  return {
    source_entry_id: relation.sourceEntryId,
    field_key: relation.fieldKey,
    target_entry_id: relation.targetEntryId,
    position: relation.position,
    meta_json: relation.meta ? JSON.stringify(relation.meta) : null,
  };
}

export function createEmptyCollectionSchema(
  id: string,
  label: string,
  kind: AriaCollection["kind"],
  icon?: string,
): z.infer<typeof CollectionSchemaInputSchema> {
  return CollectionSchemaInputSchema.parse({
    id,
    label,
    kind,
    ...(icon ? { icon } : {}),
    fields: [],
    version: 1,
  });
}
