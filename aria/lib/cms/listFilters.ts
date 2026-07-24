import { z } from "zod";
import type { FieldSchema } from "./fieldSchema";
import type { AriaCollection } from "./schemas";
import { CmsServiceError } from "./errors";
import { entryFieldsForCollection } from "./systemFields";

export const CmsListFilterRelationIncludesSchema = z
  .object({
    field: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
  })
  .strict();

export const CmsListFilterReferenceEqualsSchema = z
  .object({
    field: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
  })
  .strict();

export const CmsListFilterSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    relationIncludes: CmsListFilterRelationIncludesSchema.optional(),
    referenceEquals: CmsListFilterReferenceEqualsSchema.optional(),
  })
  .strict();

export type CmsListFilter = z.infer<typeof CmsListFilterSchema>;

export const CmsListFilterEntryContextSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  })
  .strict();

export type CmsListFilterEntryContext = z.infer<
  typeof CmsListFilterEntryContextSchema
>;

const ENTRY_CONTEXT_ID_TOKEN = "$entryContext.id";
const ENTRY_CONTEXT_SLUG_TOKEN = "$entryContext.slug";

function collectionFields(collection: AriaCollection): FieldSchema[] {
  return entryFieldsForCollection(collection);
}

function resolveFieldByKey(
  collection: AriaCollection,
  fieldKey: string,
): FieldSchema | null {
  return collectionFields(collection).find((field) => field.key === fieldKey) ?? null;
}

function resolveTargetCollectionId(
  field: FieldSchema,
  collectionsById: Map<string, AriaCollection>,
): string | null {
  if (field.type !== "reference" && field.type !== "relation") {
    return null;
  }
  const target = field.targetCollection?.trim();
  if (!target) {
    return null;
  }
  const collection = collectionsById.get(target);
  return collection?.id ?? target;
}

function resolveEntryContextToken(
  value: string,
  entryContext?: CmsListFilterEntryContext,
): string {
  if (value === ENTRY_CONTEXT_ID_TOKEN) {
    const entryId = entryContext?.entryId?.trim();
    if (!entryId) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        "List filter requires entry context id",
      );
    }
    return entryId;
  }
  if (value === ENTRY_CONTEXT_SLUG_TOKEN) {
    const slug = entryContext?.slug?.trim();
    if (!slug) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        "List filter requires entry context slug",
      );
    }
    return slug;
  }
  return value;
}

function validateBridgingField(input: {
  collection: AriaCollection;
  fieldKey: string;
  expectedType: "reference" | "relation";
  entryContext?: CmsListFilterEntryContext;
  collectionsById: Map<string, AriaCollection>;
}): FieldSchema & { type: typeof input.expectedType } {
  const field = resolveFieldByKey(input.collection, input.fieldKey);
  if (!field || field.type !== input.expectedType) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `List filter field must be a ${input.expectedType} field: ${input.fieldKey}`,
    );
  }

  const targetCollectionId = resolveTargetCollectionId(field, input.collectionsById);
  const contextCollectionId = input.entryContext?.collectionId?.trim();
  if (
    contextCollectionId &&
    targetCollectionId &&
    targetCollectionId !== contextCollectionId
  ) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `List filter field ${input.fieldKey} does not target the current entry context collection`,
    );
  }

  return field as FieldSchema & { type: typeof input.expectedType };
}

export function parseCmsListFilter(
  raw: Record<string, unknown> | undefined,
): CmsListFilter {
  return CmsListFilterSchema.parse(raw ?? {});
}

export function resolveCmsListFilter(input: {
  collection: AriaCollection;
  rawFilter?: Record<string, unknown>;
  entryContext?: CmsListFilterEntryContext;
  collections: readonly AriaCollection[];
}): CmsListFilter {
  const filter = parseCmsListFilter(input.rawFilter);
  const collectionsById = new Map(
    input.collections.map((collection) => [collection.id, collection]),
  );
  for (const collection of input.collections) {
    collectionsById.set(collection.name, collection);
  }

  const resolved: CmsListFilter = {
    ...(filter.id ? { id: filter.id } : {}),
    ...(filter.slug ? { slug: filter.slug } : {}),
  };

  if (filter.relationIncludes) {
    validateBridgingField({
      collection: input.collection,
      fieldKey: filter.relationIncludes.field,
      expectedType: "relation",
      entryContext: input.entryContext,
      collectionsById,
    });
    resolved.relationIncludes = {
      field: filter.relationIncludes.field,
      entryId: resolveEntryContextToken(
        filter.relationIncludes.entryId,
        input.entryContext,
      ),
    };
  }

  if (filter.referenceEquals) {
    validateBridgingField({
      collection: input.collection,
      fieldKey: filter.referenceEquals.field,
      expectedType: "reference",
      entryContext: input.entryContext,
      collectionsById,
    });
    resolved.referenceEquals = {
      field: filter.referenceEquals.field,
      entryId: resolveEntryContextToken(
        filter.referenceEquals.entryId,
        input.entryContext,
      ),
    };
  }

  return CmsListFilterSchema.parse(resolved);
}

export interface CmsArchiveBridgingField {
  key: string;
  label: string;
  type: "reference" | "relation";
}

export function findArchiveBridgingFields(input: {
  listCollection: AriaCollection;
  entryContextCollectionId: string;
  collections: readonly AriaCollection[];
}): CmsArchiveBridgingField[] {
  const collectionsById = new Map(
    input.collections.map((collection) => [collection.id, collection]),
  );
  for (const collection of input.collections) {
    collectionsById.set(collection.name, collection);
  }

  const matches: CmsArchiveBridgingField[] = [];
  for (const field of collectionFields(input.listCollection)) {
    if (field.type !== "reference" && field.type !== "relation") {
      continue;
    }
    const targetCollectionId = resolveTargetCollectionId(field, collectionsById);
    if (targetCollectionId === input.entryContextCollectionId) {
      matches.push({
        key: field.key,
        label: field.label,
        type: field.type,
      });
    }
  }
  return matches;
}

export function buildArchiveListFilter(input: {
  bridgingField: CmsArchiveBridgingField;
}): CmsListFilter {
  if (input.bridgingField.type === "relation") {
    return {
      relationIncludes: {
        field: input.bridgingField.key,
        entryId: ENTRY_CONTEXT_ID_TOKEN,
      },
    };
  }
  return {
    referenceEquals: {
      field: input.bridgingField.key,
      entryId: ENTRY_CONTEXT_ID_TOKEN,
    },
  };
}

export interface CmsListFilterSqlClause {
  sql: string;
  args: unknown[];
  joins: string;
}

function assertSafeJsonFieldKey(fieldKey: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(fieldKey)) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `Invalid frontmatter field key for filter: ${fieldKey}`,
    );
  }
  return fieldKey;
}

export function buildCmsListFilterSql(
  filter: CmsListFilter,
): CmsListFilterSqlClause {
  const joins: string[] = [];
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (filter.relationIncludes) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM aria_entry_relations rel_filter
      WHERE rel_filter.source_entry_id = e.id
        AND rel_filter.field_key = ?
        AND rel_filter.target_entry_id = ?
    )`);
    args.push(
      filter.relationIncludes.field,
      filter.relationIncludes.entryId,
    );
  }

  if (filter.referenceEquals) {
    const fieldKey = assertSafeJsonFieldKey(filter.referenceEquals.field);
    joins.push(
      `INNER JOIN aria_entry_locales ref_locale_filter
        ON ref_locale_filter.entry_id = e.id
       AND ref_locale_filter.is_source = 1`,
    );
    clauses.push(`json_extract(ref_locale_filter.frontmatter_json, '$.${fieldKey}') = ?`);
    args.push(filter.referenceEquals.entryId);
  }

  return {
    joins: joins.join("\n"),
    sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "",
    args,
  };
}
