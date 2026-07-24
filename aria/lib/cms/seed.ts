import { z } from "zod";
import type { ActorRef } from "../auth/types";
import type { StorageAdapter } from "../storage/adapter";
import { ExportedEntrySchema } from "../export/cmsTypes";
import {
  CreateCollectionRequestSchema,
  type AriaCollection,
  type AriaEntryRecord,
  type FieldSchema,
} from "./schemas";
import { CmsServiceError } from "./errors";
import { createCollectionOnAdapter } from "./services/collections";
import {
  createEntryOnAdapter,
  updateEntryOnAdapter,
} from "./services/entries";

export const SeedPackageIdSchema = z.enum(["blog", "marketing", "product"]);
export type SeedPackageId = z.infer<typeof SeedPackageIdSchema>;

const SeedEntrySchema = z
  .object({
    collection: z.string().trim().min(1),
    entry: ExportedEntrySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.entry.title.trim()) {
      context.addIssue({
        code: "custom",
        path: ["entry", "title"],
        message: "Seed entry title is required",
      });
    }
  });

export const AriaSeedPackageSchema = z
  .object({
    version: z.literal(1),
    id: SeedPackageIdSchema.optional(),
    label: z.string().trim().min(1).max(120).optional(),
    collections: z.array(CreateCollectionRequestSchema).min(1).max(32),
    entries: z.array(SeedEntrySchema).max(500).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const collectionNames = new Set<string>();
    for (const [index, collection] of value.collections.entries()) {
      if (collectionNames.has(collection.name)) {
        context.addIssue({
          code: "custom",
          path: ["collections", index, "name"],
          message: `Collection ${collection.name} appears more than once`,
        });
      }
      collectionNames.add(collection.name);
    }

    const entryKeys = new Set<string>();
    for (const [index, item] of value.entries.entries()) {
      if (!collectionNames.has(item.collection)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "collection"],
          message: `Seed entry references unknown collection ${item.collection}`,
        });
      }
      const key = `${item.collection}\u0000${item.entry.locale}\u0000${item.entry.slug}`;
      if (entryKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "entry", "slug"],
          message: "Seed package contains duplicate collection, locale, and slug",
        });
      }
      entryKeys.add(key);
    }
  });

export type AriaSeedPackage = z.infer<typeof AriaSeedPackageSchema>;

const SeedOperationKindSchema = z.enum(["collection", "entry", "relation"]);
const SeedOperationStatusSchema = z.enum(["create", "skip", "conflict"]);
export const SeedOperationSchema = z
  .object({
    kind: SeedOperationKindSchema,
    status: SeedOperationStatusSchema,
    key: z.string().trim().min(1),
    reason: z.string().trim().min(1).optional(),
  })
  .strict();

export const SeedPreviewSchema = z
  .object({
    packageId: SeedPackageIdSchema.optional(),
    operations: z.array(SeedOperationSchema),
    canApply: z.boolean(),
    creates: z.int().nonnegative(),
    skips: z.int().nonnegative(),
    conflicts: z.int().nonnegative(),
  })
  .strict();
export type SeedPreview = z.infer<typeof SeedPreviewSchema>;

export const SeedApplyReportSchema = SeedPreviewSchema.extend({
  applied: z.boolean(),
}).strict();
export type SeedApplyReport = z.infer<typeof SeedApplyReportSchema>;

export const SeedApplyInputSchema = z
  .object({
    package: AriaSeedPackageSchema,
    dryRun: z.boolean().default(false),
  })
  .strict();
export type SeedApplyInput = z.infer<typeof SeedApplyInputSchema>;

type IndexedEntry = {
  collectionName: string;
  locale: string;
  slug: string;
  record: AriaEntryRecord;
};

function entryKey(collectionName: string, locale: string, slug: string): string {
  return `${collectionName}\u0000${locale}\u0000${slug}`;
}

function collectionCompatible(
  existing: AriaCollection,
  input: z.infer<typeof CreateCollectionRequestSchema>,
  collectionNameById: ReadonlyMap<string, string>,
): boolean {
  return (
    existing.label === input.label &&
    existing.kind === input.kind &&
    existing.scope === (input.scope ?? "global") &&
    existing.urlPattern === (input.urlPattern?.trim() || null) &&
    existing.templatePageId === (input.templatePageId?.trim() || null) &&
    existing.listPageId === (input.listPageId?.trim() || null) &&
    JSON.stringify(normalizeStoredTargetCollections(existing.schema.fields, collectionNameById)) === JSON.stringify(input.fields) &&
    JSON.stringify(existing.supports) === JSON.stringify(input.supports ?? [])
  );
}

function normalizeStoredTargetCollections(
  fields: readonly FieldSchema[],
  collectionNameById: ReadonlyMap<string, string>,
): FieldSchema[] {
  return fields.map((field) => ({
    ...field,
    targetCollection:
      field.targetCollection && collectionNameById.has(field.targetCollection)
        ? collectionNameById.get(field.targetCollection)
        : field.targetCollection,
    fields: field.fields
      ? normalizeStoredTargetCollections(field.fields, collectionNameById)
      : undefined,
  }));
}

function replaceTargetCollections(
  fields: readonly FieldSchema[],
  collectionIdByName: ReadonlyMap<string, string>,
): FieldSchema[] {
  return fields.map((field) => ({
    ...field,
    targetCollection:
      field.targetCollection && collectionIdByName.has(field.targetCollection)
        ? collectionIdByName.get(field.targetCollection)
        : field.targetCollection,
    fields: field.fields
      ? replaceTargetCollections(field.fields, collectionIdByName)
      : undefined,
  }));
}

async function indexExistingEntries(
  adapter: StorageAdapter,
  collectionName: string,
  collectionId: string,
): Promise<IndexedEntry[]> {
  const listed = await adapter.listEntries({ collectionId, page: 1, limit: 200 });
  const entries = await Promise.all(
    listed.items.map((item) =>
      adapter.getEntry({
        collectionId,
        idOrSlug: item.entry.id,
        includeRelations: true,
      }),
    ),
  );
  return entries.flatMap((record) =>
    record
      ? record.locales.map((locale) => ({
          collectionName,
          locale: locale.locale,
          slug: locale.slug,
          record,
        }))
      : [],
  );
}

async function buildSeedPreview(
  adapter: StorageAdapter,
  input: AriaSeedPackage,
): Promise<SeedPreview> {
  const operations: z.infer<typeof SeedOperationSchema>[] = [];
  const existingCollections = await adapter.listCollections();
  const collectionsByName = new Map(existingCollections.map((item) => [item.name, item]));
  const collectionNameById = new Map(existingCollections.map((item) => [item.id, item.name]));
  const existingEntries = new Map<string, IndexedEntry>();

  for (const collection of input.collections) {
    const existing = collectionsByName.get(collection.name);
    if (!existing) {
      operations.push({ kind: "collection", status: "create", key: collection.name });
      continue;
    }
    operations.push(
      collectionCompatible(existing, collection, collectionNameById)
        ? { kind: "collection", status: "skip", key: collection.name, reason: "Compatible collection already exists" }
        : { kind: "collection", status: "conflict", key: collection.name, reason: "Existing collection schema differs from the seed package" },
    );
    for (const entry of await indexExistingEntries(adapter, collection.name, existing.id)) {
      existingEntries.set(entryKey(entry.collectionName, entry.locale, entry.slug), entry);
    }
  }

  const packageEntries = new Set(input.entries.map((item) => entryKey(item.collection, item.entry.locale, item.entry.slug)));
  for (const item of input.entries) {
    const key = entryKey(item.collection, item.entry.locale, item.entry.slug);
    const sourceExists = existingEntries.has(key);
    operations.push(
      sourceExists
        ? { kind: "entry", status: "skip", key, reason: "Entry already exists" }
        : { kind: "entry", status: "create", key },
    );
    for (const relation of item.entry.relations) {
      const targetKey = entryKey(relation.targetCollection, item.entry.locale, relation.targetSlug);
      const targetExists = existingEntries.has(targetKey) || packageEntries.has(targetKey);
      operations.push(
        sourceExists
          ? { kind: "relation", status: "skip", key: `${key}\u0000${relation.fieldKey}\u0000${targetKey}`, reason: "Source entry already exists" }
          : targetExists
          ? { kind: "relation", status: "create", key: `${key}\u0000${relation.fieldKey}\u0000${targetKey}` }
          : { kind: "relation", status: "conflict", key: `${key}\u0000${relation.fieldKey}\u0000${targetKey}`, reason: "Relation target does not exist in storage or this seed package" },
      );
    }
  }

  const creates = operations.filter((operation) => operation.status === "create").length;
  const skips = operations.filter((operation) => operation.status === "skip").length;
  const conflicts = operations.filter((operation) => operation.status === "conflict").length;
  return SeedPreviewSchema.parse({
    packageId: input.id,
    operations,
    canApply: conflicts === 0,
    creates,
    skips,
    conflicts,
  });
}

export async function previewAriaSeed(
  adapter: StorageAdapter,
  seedInput: unknown,
): Promise<SeedPreview> {
  return buildSeedPreview(adapter, AriaSeedPackageSchema.parse(seedInput));
}

export async function applyAriaSeed(
  adapter: StorageAdapter,
  seedInput: unknown,
  options: { actor: ActorRef; dryRun?: boolean },
): Promise<SeedApplyReport> {
  const packageInput = AriaSeedPackageSchema.parse(seedInput);
  const preview = await buildSeedPreview(adapter, packageInput);
  if (options.dryRun) {
    return SeedApplyReportSchema.parse({ ...preview, applied: false });
  }
  if (!preview.canApply) {
    const keys = preview.operations
      .filter((operation) => operation.status === "conflict")
      .map((operation) => operation.key)
      .join(", ");
    throw new CmsServiceError(
      "CONFLICT",
      `Seed package has conflicts; preview it before applying: ${keys}`,
    );
  }

  const collectionIdByName = new Map(
    (await adapter.listCollections()).map((collection) => [collection.name, collection.id]),
  );
  for (const collection of packageInput.collections) {
    if (collectionIdByName.has(collection.name)) continue;
    const created = await createCollectionOnAdapter(adapter, {
      ...collection,
      fields: replaceTargetCollections(collection.fields, collectionIdByName),
    });
    collectionIdByName.set(created.name, created.id);
  }

  const recordsByKey = new Map<string, AriaEntryRecord>();
  for (const collection of packageInput.collections) {
    const collectionId = collectionIdByName.get(collection.name);
    if (!collectionId) {
      throw new CmsServiceError("INTERNAL", `Seed collection was not created: ${collection.name}`);
    }
    for (const existing of await indexExistingEntries(adapter, collection.name, collectionId)) {
      recordsByKey.set(entryKey(existing.collectionName, existing.locale, existing.slug), existing.record);
    }
  }

  const createdEntryKeys = new Set<string>();
  for (const item of packageInput.entries) {
    const key = entryKey(item.collection, item.entry.locale, item.entry.slug);
    if (recordsByKey.has(key)) continue;
    const collectionId = collectionIdByName.get(item.collection);
    if (!collectionId) {
      throw new CmsServiceError("INTERNAL", `Seed collection was not resolved: ${item.collection}`);
    }
    const created = await createEntryOnAdapter(adapter, {
      collectionId,
      locale: item.entry.locale,
      slug: item.entry.slug,
      title: item.entry.title,
      frontmatter: item.entry.frontmatter,
      body: item.entry.body,
      status: item.entry.status,
    }, options.actor);
    recordsByKey.set(key, created);
    createdEntryKeys.add(key);
  }

  for (const item of packageInput.entries) {
    const key = entryKey(item.collection, item.entry.locale, item.entry.slug);
    if (!createdEntryKeys.has(key) || item.entry.relations.length === 0) continue;
    const source = recordsByKey.get(key);
    const collectionId = collectionIdByName.get(item.collection);
    if (!source || !collectionId) {
      throw new CmsServiceError("INTERNAL", `Seed entry was not resolved: ${key}`);
    }
    const relations = item.entry.relations.map((relation) => {
      const target = recordsByKey.get(
        entryKey(relation.targetCollection, item.entry.locale, relation.targetSlug),
      );
      if (!target) {
        throw new CmsServiceError("CONFLICT", `Relation target disappeared during seed apply: ${relation.targetCollection}/${relation.targetSlug}`);
      }
      return {
        sourceEntryId: source.entry.id,
        fieldKey: relation.fieldKey,
        targetEntryId: target.entry.id,
        position: relation.position,
        ...(relation.meta ? { meta: relation.meta } : {}),
      };
    });
    const updated = await updateEntryOnAdapter(adapter, {
      collectionId,
      id: source.entry.id,
      version: source.entry.version,
      patch: { locale: item.entry.locale, relations },
    }, options.actor);
    recordsByKey.set(key, updated);
  }

  return SeedApplyReportSchema.parse({ ...preview, applied: true });
}
