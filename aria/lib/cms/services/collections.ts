import { generateId } from "../../crypto";
import {
  AriaCollectionSchema,
  CollectionSchemaInputSchema,
  type CreateCollectionRequestSchema,
  type UpdateCollectionRequestSchema,
} from "../schemas";
import type { z } from "zod";
import {
  compileCollectionSchema,
  validateCollectionSchema,
} from "../schema/compiler";
import { CmsServiceError } from "../errors";
import { createEmptyCollectionSchema } from "../storage/db";
import type { AriaCollection, CollectionSchema } from "../schemas";
import type {
  AuthorshipSaveContext,
  StorageAdapter,
} from "../../storage/adapter";
import {
  cmsRouteSafetyErrorMessage,
  validateCmsCollectionRouteSafety,
  type CmsRouteSafetyMode,
} from "../routeSafety";
import type { CmsPageReference } from "../pageUsage";
import {
  cleanupCollectionPageBindingsOnAdapter,
  getCollectionPageBindingImpactOnAdapter,
  type CmsCollectionPageBindingImpact,
} from "../pageBindingCleanup";
import { resolvePagePolicyUpdate } from "../../pages/policy";
import { normalizeContentLocalization } from "../../localization/contentLocale";
import { matchCmsUrlPattern } from "../routing";
import {
  rebuildCmsCollectionSearchDocuments,
  removeCmsCollectionSearchDocuments,
  syncCmsCollectionSearchDocument,
} from "./search";

type CmsSyncedPageRole = "cms-entry" | "cms-collection";

type CreateCollectionInput = z.infer<typeof CreateCollectionRequestSchema>;
type UpdateCollectionInput = z.infer<typeof UpdateCollectionRequestSchema>;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRouteSetting(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function routingSettingsChanged(
  current: AriaCollection,
  patch: UpdateCollectionInput["patch"],
): boolean {
  const nextUrlPattern =
    patch.urlPattern !== undefined
      ? normalizeRouteSetting(patch.urlPattern)
      : current.urlPattern;
  const nextTemplatePageId =
    patch.templatePageId !== undefined
      ? normalizeRouteSetting(patch.templatePageId)
      : current.templatePageId;
  const nextListPageId =
    patch.listPageId !== undefined
      ? normalizeRouteSetting(patch.listPageId)
      : current.listPageId;

  return (
    nextUrlPattern !== current.urlPattern ||
    nextTemplatePageId !== current.templatePageId ||
    nextListPageId !== current.listPageId
  );
}

async function listCmsPageReferences(
  adapter: StorageAdapter,
  pageRoleOverrides?: ReadonlyMap<string, CmsSyncedPageRole>,
): Promise<CmsPageReference[]> {
  const pages = await adapter.listPagesDSL({ limit: 1000, offset: 0 });
  return pages.map((page) => ({
    id: page.id,
    slug: page.slug ?? page.id,
    title: page.title,
    parent: page.parent ?? null,
    systemRole: pageRoleOverrides?.get(page.id) ?? page.systemRole,
  }));
}

async function assertCollectionDoesNotShadowLocalizedPageRoutes(
  adapter: StorageAdapter,
  collection: AriaCollection,
  pages: readonly CmsPageReference[],
): Promise<void> {
  if (!collection.templatePageId || !collection.urlPattern) return;
  const localization = normalizeContentLocalization(
    (await adapter.getSiteSettings())?.localization?.content,
  );
  const localeCodes = localization.locales
    .filter((locale) => locale.code !== localization.defaultLocale)
    .map((locale) => locale.code);
  const [draftRoutes, publishedRoutes] = await Promise.all([
    Promise.all(
      pages.flatMap((page) =>
        localeCodes.map((locale) =>
          adapter.getPageLocaleRoute(page.id, locale),
        ),
      ),
    ),
    Promise.all(
      pages.map((page) => adapter.listPublishedPageLocaleRoutes(page.id)),
    ),
  ]);
  const collision = [...draftRoutes, ...publishedRoutes.flat()].find(
    (route) =>
      route &&
      matchCmsUrlPattern(collection.urlPattern!, route.pathname) !== null,
  );
  if (collision) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `URL pattern conflicts with localized ${collision.locale} page route ${collision.pathname}.`,
    );
  }
}

async function assertCollectionRouteSafe(
  adapter: StorageAdapter,
  collection: AriaCollection,
  mode: CmsRouteSafetyMode,
  options: {
    collections?: readonly AriaCollection[];
    pageRoleOverrides?: ReadonlyMap<string, CmsSyncedPageRole>;
  } = {},
): Promise<void> {
  const [collections, pages] = await Promise.all([
    Promise.resolve(options.collections ?? adapter.listCollections()),
    listCmsPageReferences(adapter, options.pageRoleOverrides),
  ]);
  const result = validateCmsCollectionRouteSafety({
    collection,
    collections: Array.from(collections),
    pages,
    mode,
  });
  const message = cmsRouteSafetyErrorMessage(result);
  if (message) {
    throw new CmsServiceError("VALIDATION_ERROR", message);
  }
  await assertCollectionDoesNotShadowLocalizedPageRoutes(
    adapter,
    collection,
    pages,
  );
}

function collectionWithTimestamp(
  collection: AriaCollection,
  updatedAt: string,
): AriaCollection {
  return AriaCollectionSchema.parse({
    ...collection,
    updatedAt,
  });
}

function applyOppositeRoleClearsForAssignment(input: {
  collections: readonly AriaCollection[];
  collectionId: string;
  nextTemplatePageId: string | null;
  nextListPageId: string | null;
  timestamp: string;
}): Map<string, AriaCollection> {
  const updates = new Map<string, AriaCollection>();

  for (const collection of input.collections) {
    let next = collection;
    if (
      input.nextTemplatePageId &&
      collection.id !== input.collectionId &&
      collection.listPageId === input.nextTemplatePageId
    ) {
      next = collectionWithTimestamp(
        { ...next, listPageId: null },
        input.timestamp,
      );
    }
    if (
      input.nextListPageId &&
      collection.id !== input.collectionId &&
      collection.templatePageId === input.nextListPageId
    ) {
      next = collectionWithTimestamp(
        { ...next, templatePageId: null },
        input.timestamp,
      );
    }
    if (next !== collection) {
      updates.set(next.id, next);
    }
  }

  return updates;
}

/**
 * Applies a page's system role as a side effect of
 * a collection's `templatePageId`/`listPageId` assignment. Auto-syncing here is what lets.
 */
async function applyPageSystemRoleOnAdapter(
  adapter: StorageAdapter,
  pageId: string,
  nextSystemRole: CmsSyncedPageRole | "standard",
): Promise<void> {
  const policy = await adapter.getPagePolicy(pageId);
  if (!policy || policy.systemRole === nextSystemRole) {
    return;
  }

  const resolved = await resolvePagePolicyUpdate({
    existingPolicy: policy,
    nextPolicy: {
      systemRole: nextSystemRole,
      accessMode: policy.accessMode,
      promptTitle: policy.accessPromptTitle ?? undefined,
      promptDescription: policy.accessPromptDescription ?? undefined,
      rememberForDays: policy.accessRememberForDays ?? undefined,
    },
  });

  await adapter.savePagePolicy({
    idOrSlug: policy.id,
    systemRole: resolved.systemRole,
    accessMode: resolved.accessMode,
    accessPasswordHash: resolved.accessPasswordHash,
    accessPromptTitle: resolved.accessPromptTitle,
    accessPromptDescription: resolved.accessPromptDescription,
    accessRememberForDays: resolved.accessRememberForDays,
    accessPolicyVersion: resolved.accessPolicyVersion,
  });

  if (resolved.shouldDeleteExistingSessions) {
    await adapter.deletePageAccessSessionsForPage(policy.id);
  }
}

/**
 * Demotes a former list/entry page back to Standard, but only if no
 * other collection still points at it in that role — cross-collection.
 */
async function demotePageRoleIfUnusedOnAdapter(
  adapter: StorageAdapter,
  pageId: string,
  role: CmsSyncedPageRole,
): Promise<void> {
  const collections = await adapter.listCollections();
  const stillUsed = collections.some((collection) =>
    role === "cms-entry"
      ? collection.templatePageId === pageId
      : collection.listPageId === pageId,
  );
  if (stillUsed) return;

  const policy = await adapter.getPagePolicy(pageId);
  if (!policy || policy.systemRole !== role) return;

  await applyPageSystemRoleOnAdapter(adapter, pageId, "standard");
}

/**
 * Reconciles page system roles after a collection's routing pages change. Must
 * run after the collection itself is saved so demotion checks.
 */
async function syncPageRolesForCollectionChangeOnAdapter(
  adapter: StorageAdapter,
  input: {
    previousTemplatePageId: string | null;
    previousListPageId: string | null;
    nextTemplatePageId: string | null;
    nextListPageId: string | null;
  },
): Promise<void> {
  const {
    previousTemplatePageId,
    previousListPageId,
    nextTemplatePageId,
    nextListPageId,
  } = input;

  if (nextTemplatePageId && nextTemplatePageId !== previousTemplatePageId) {
    await applyPageSystemRoleOnAdapter(
      adapter,
      nextTemplatePageId,
      "cms-entry",
    );
  }
  if (nextListPageId && nextListPageId !== previousListPageId) {
    await applyPageSystemRoleOnAdapter(
      adapter,
      nextListPageId,
      "cms-collection",
    );
  }
  if (previousTemplatePageId && previousTemplatePageId !== nextTemplatePageId) {
    await demotePageRoleIfUnusedOnAdapter(
      adapter,
      previousTemplatePageId,
      "cms-entry",
    );
  }
  if (previousListPageId && previousListPageId !== nextListPageId) {
    await demotePageRoleIfUnusedOnAdapter(
      adapter,
      previousListPageId,
      "cms-collection",
    );
  }
}

/**
 * Repairs page system roles to match current collection template assignments.
 * Promotes assigned list/entry pages and demotes orphaned CMS-role pages.
 */
export async function repairCmsPageRoleAssignmentsOnAdapter(
  adapter: StorageAdapter,
): Promise<void> {
  const collections = await adapter.listCollections();
  const entryPageIds = new Set<string>();
  const listPageIds = new Set<string>();

  for (const collection of collections) {
    if (collection.templatePageId) {
      entryPageIds.add(collection.templatePageId);
      await applyPageSystemRoleOnAdapter(
        adapter,
        collection.templatePageId,
        "cms-entry",
      );
    }
    if (collection.listPageId) {
      listPageIds.add(collection.listPageId);
      await applyPageSystemRoleOnAdapter(
        adapter,
        collection.listPageId,
        "cms-collection",
      );
    }
  }

  const pages = await adapter.listPagesDSL();
  for (const page of pages) {
    if (page.systemRole === "cms-entry" && !entryPageIds.has(page.id)) {
      await applyPageSystemRoleOnAdapter(adapter, page.id, "standard");
    }
    if (page.systemRole === "cms-collection" && !listPageIds.has(page.id)) {
      await applyPageSystemRoleOnAdapter(adapter, page.id, "standard");
    }
  }
}

function filterCollections(
  collections: AriaCollection[],
  options?: { query?: string; kind?: AriaCollection["kind"] },
): AriaCollection[] {
  let result = collections;
  if (options?.kind) {
    result = result.filter((collection) => collection.kind === options.kind);
  }
  const query = options?.query?.trim().toLowerCase();
  if (query) {
    result = result.filter(
      (collection) =>
        collection.name.toLowerCase().includes(query) ||
        collection.label.toLowerCase().includes(query),
    );
  }
  return result;
}

function mergeCollectionSchema(
  current: CollectionSchema,
  fields: CollectionSchema["fields"] | undefined,
  entryFieldOrder: CollectionSchema["entryFieldOrder"] | undefined,
  label?: string,
  kind?: CollectionSchema["kind"],
  icon?: string | null,
  navigation?: CollectionSchema["navigation"],
  rss?: CollectionSchema["rss"],
  comments?: CollectionSchema["comments"],
): CollectionSchema {
  const nextFields = fields ?? current.fields;
  const schemaChanged = fields !== undefined || entryFieldOrder !== undefined;
  const nextSchema = CollectionSchemaInputSchema.parse({
    id: current.id,
    label: label ?? current.label,
    kind: kind ?? current.kind,
    icon: icon === null ? undefined : (icon ?? current.icon),
    fields: nextFields,
    entryFieldOrder: entryFieldOrder ?? current.entryFieldOrder,
    navigation: navigation ?? current.navigation,
    rss: rss ?? current.rss,
    comments: comments ?? current.comments,
    version: schemaChanged ? current.version + 1 : current.version,
    ownerCollectionId: current.ownerCollectionId,
  });

  const errors = validateCollectionSchema(nextSchema);
  if (errors.length > 0) {
    throw new CmsServiceError("SCHEMA_ERROR", errors.join("; "));
  }

  return nextSchema;
}

export async function listCollectionsFromAdapter(
  adapter: StorageAdapter,
  options?: { query?: string; kind?: AriaCollection["kind"] },
): Promise<AriaCollection[]> {
  const collections = await adapter.listCollections(
    options?.kind ? { kind: options.kind } : undefined,
  );
  return filterCollections(collections, options);
}

export async function countEntriesByCollectionFromAdapter(
  adapter: StorageAdapter,
  collections: readonly AriaCollection[],
): Promise<Record<string, number>> {
  const counts = await adapter.countEntriesByCollection(
    collections.map((collection) => collection.id),
  );
  return Object.fromEntries(
    collections.map((collection) => [
      collection.id,
      counts[collection.id] ?? 0,
    ]),
  );
}

export async function getCollectionFromAdapter(
  adapter: StorageAdapter,
  id: string,
): Promise<AriaCollection> {
  const collection = await adapter.getCollection(id);
  if (!collection) {
    throw new CmsServiceError("NOT_FOUND", `Collection not found: ${id}`);
  }
  return collection;
}

export async function createCollectionOnAdapter(
  adapter: StorageAdapter,
  input: CreateCollectionInput,
): Promise<AriaCollection> {
  const existing = await adapter.getCollection(input.name);
  if (existing) {
    throw new CmsServiceError(
      "CONFLICT",
      `Collection name already exists: ${input.name}`,
    );
  }

  const id = generateId();
  const timestamp = nowIso();
  const schema = createEmptyCollectionSchema(
    id,
    input.label,
    input.kind,
    input.icon,
  );
  const collectionSchema =
    input.fields.length > 0 ||
    input.entryFieldOrder ||
    input.navigation ||
    input.rss ||
    input.comments
      ? mergeCollectionSchema(
          schema,
          input.fields,
          input.entryFieldOrder,
          undefined,
          undefined,
          undefined,
          input.navigation,
          input.rss,
          input.comments,
        )
      : schema;

  const collection = AriaCollectionSchema.parse({
    id,
    name: input.name,
    label: input.label,
    kind: input.kind,
    schema: collectionSchema,
    scope: input.scope ?? "global",
    urlPattern: normalizeRouteSetting(input.urlPattern),
    templatePageId: normalizeRouteSetting(input.templatePageId),
    listPageId: normalizeRouteSetting(input.listPageId),
    supports: input.supports ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await assertCollectionRouteSafe(adapter, collection, "create");
  const saved = await adapter.saveCollection(collection);
  await syncCmsCollectionSearchDocument(adapter, saved);
  await syncPageRolesForCollectionChangeOnAdapter(adapter, {
    previousTemplatePageId: null,
    previousListPageId: null,
    nextTemplatePageId: saved.templatePageId,
    nextListPageId: saved.listPageId,
  });
  return saved;
}

export async function updateCollectionOnAdapter(
  adapter: StorageAdapter,
  input: UpdateCollectionInput,
): Promise<AriaCollection> {
  const current = await getCollectionFromAdapter(adapter, input.id);

  if (
    input.expectedUpdatedAt &&
    current.updatedAt !== input.expectedUpdatedAt
  ) {
    throw new CmsServiceError(
      "CONFLICT",
      `Collection was updated at ${current.updatedAt}`,
    );
  }

  const nextSchema = mergeCollectionSchema(
    current.schema,
    input.patch.fields,
    input.patch.entryFieldOrder,
    input.patch.label,
    input.patch.kind,
    input.patch.icon,
    input.patch.navigation,
    input.patch.rss === null ? undefined : input.patch.rss,
    input.patch.comments === null ? undefined : input.patch.comments,
  );

  let nextTemplatePageId =
    input.patch.templatePageId !== undefined
      ? normalizeRouteSetting(input.patch.templatePageId)
      : current.templatePageId;
  let nextListPageId =
    input.patch.listPageId !== undefined
      ? normalizeRouteSetting(input.patch.listPageId)
      : current.listPageId;

  if (
    input.patch.templatePageId !== undefined &&
    input.patch.listPageId === undefined &&
    nextTemplatePageId &&
    nextTemplatePageId === nextListPageId
  ) {
    nextListPageId = null;
  }
  if (
    input.patch.listPageId !== undefined &&
    input.patch.templatePageId === undefined &&
    nextListPageId &&
    nextListPageId === nextTemplatePageId
  ) {
    nextTemplatePageId = null;
  }

  const timestamp = nowIso();
  const collection = AriaCollectionSchema.parse({
    ...current,
    label: input.patch.label ?? current.label,
    kind: input.patch.kind ?? current.kind,
    schema: nextSchema,
    scope: input.patch.scope ?? current.scope,
    urlPattern:
      input.patch.urlPattern !== undefined
        ? normalizeRouteSetting(input.patch.urlPattern)
        : current.urlPattern,
    templatePageId: nextTemplatePageId,
    listPageId: nextListPageId,
    supports: input.patch.supports ?? current.supports,
    updatedAt: timestamp,
  });

  let effectiveCollections: AriaCollection[] | null = null;
  let oppositeRoleClears = new Map<string, AriaCollection>();
  const pageRoleOverrides = new Map<string, CmsSyncedPageRole>();
  if (routingSettingsChanged(current, input.patch)) {
    const allCollections = await adapter.listCollections();
    oppositeRoleClears = applyOppositeRoleClearsForAssignment({
      collections: allCollections,
      collectionId: current.id,
      nextTemplatePageId: collection.templatePageId,
      nextListPageId: collection.listPageId,
      timestamp,
    });
    if (collection.templatePageId) {
      pageRoleOverrides.set(collection.templatePageId, "cms-entry");
    }
    if (collection.listPageId) {
      pageRoleOverrides.set(collection.listPageId, "cms-collection");
    }
    effectiveCollections = allCollections.map((existing) => {
      if (existing.id === collection.id) return collection;
      return oppositeRoleClears.get(existing.id) ?? existing;
    });
    await assertCollectionRouteSafe(adapter, collection, "update", {
      collections: effectiveCollections,
      pageRoleOverrides,
    });
  }
  for (const clearedCollection of oppositeRoleClears.values()) {
    await adapter.saveCollection(clearedCollection);
  }
  const saved = await adapter.saveCollection(collection);
  await rebuildCmsCollectionSearchDocuments(adapter, saved);
  await syncPageRolesForCollectionChangeOnAdapter(adapter, {
    previousTemplatePageId: current.templatePageId,
    previousListPageId: current.listPageId,
    nextTemplatePageId: saved.templatePageId,
    nextListPageId: saved.listPageId,
  });
  return saved;
}

export async function deleteCollectionOnAdapter(
  adapter: StorageAdapter,
  id: string,
  authorship?: AuthorshipSaveContext,
): Promise<{
  success: true;
  removedPageBindingCount: number;
  updatedPageIds: string[];
  updatedPageSlugs: string[];
}> {
  const collection = await getCollectionFromAdapter(adapter, id);
  const cleanup = await cleanupCollectionPageBindingsOnAdapter(
    adapter,
    collection,
    authorship,
  );
  await adapter.deleteCollection(id);
  await removeCmsCollectionSearchDocuments(adapter, id);

  const [byId, byName] = await Promise.all([
    adapter.getCollection(collection.id),
    adapter.getCollection(collection.name),
  ]);
  if (byId || byName) {
    throw new CmsServiceError("INTERNAL", "Failed to delete collection.");
  }

  await syncPageRolesForCollectionChangeOnAdapter(adapter, {
    previousTemplatePageId: collection.templatePageId,
    previousListPageId: collection.listPageId,
    nextTemplatePageId: null,
    nextListPageId: null,
  });

  return {
    success: true,
    removedPageBindingCount: cleanup.removedPageBindingCount,
    updatedPageIds: cleanup.updatedPageIds,
    updatedPageSlugs: cleanup.updatedPageSlugs,
  };
}

export async function getCollectionDeleteImpactOnAdapter(
  adapter: StorageAdapter,
  ids: readonly string[],
): Promise<CmsCollectionPageBindingImpact> {
  const collections = await Promise.all(
    ids.map((id) => getCollectionFromAdapter(adapter, id)),
  );
  return getCollectionPageBindingImpactOnAdapter(adapter, collections);
}

export function compileCollectionSchemaForCollection(
  collection: AriaCollection,
): { hash: string; errors: string[] } {
  const compiled = compileCollectionSchema(collection.schema);
  return {
    hash: compiled.hash,
    errors: compiled.errors,
  };
}

export async function setCollectionTemplateOnAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    templatePageId: string;
    listPageId?: string;
    urlPattern?: string;
  },
): Promise<AriaCollection> {
  const current = await getCollectionFromAdapter(adapter, input.collectionId);
  const templatePageId = normalizeRouteSetting(input.templatePageId);
  if (!templatePageId) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Choose a template page before saving template routing.",
    );
  }
  let nextListPageId =
    input.listPageId !== undefined
      ? normalizeRouteSetting(input.listPageId)
      : current.listPageId;
  if (input.listPageId === undefined && nextListPageId === templatePageId) {
    nextListPageId = null;
  }
  const collection = AriaCollectionSchema.parse({
    ...current,
    templatePageId,
    listPageId: nextListPageId,
    urlPattern:
      input.urlPattern !== undefined
        ? normalizeRouteSetting(input.urlPattern)
        : current.urlPattern,
    updatedAt: nowIso(),
  });
  const allCollections = await adapter.listCollections();
  const oppositeRoleClears = applyOppositeRoleClearsForAssignment({
    collections: allCollections,
    collectionId: current.id,
    nextTemplatePageId: collection.templatePageId,
    nextListPageId: collection.listPageId,
    timestamp: collection.updatedAt,
  });
  const pageRoleOverrides = new Map<string, CmsSyncedPageRole>();
  if (collection.templatePageId) {
    pageRoleOverrides.set(collection.templatePageId, "cms-entry");
  }
  if (collection.listPageId) {
    pageRoleOverrides.set(collection.listPageId, "cms-collection");
  }
  await assertCollectionRouteSafe(adapter, collection, "update", {
    collections: allCollections.map((existing) => {
      if (existing.id === collection.id) return collection;
      return oppositeRoleClears.get(existing.id) ?? existing;
    }),
    pageRoleOverrides,
  });
  for (const clearedCollection of oppositeRoleClears.values()) {
    await adapter.saveCollection(clearedCollection);
  }
  const saved = await adapter.saveCollection(collection);
  await syncCmsCollectionSearchDocument(adapter, saved);
  await syncPageRolesForCollectionChangeOnAdapter(adapter, {
    previousTemplatePageId: current.templatePageId,
    previousListPageId: current.listPageId,
    nextTemplatePageId: saved.templatePageId,
    nextListPageId: saved.listPageId,
  });
  return saved;
}

export async function clearCollectionTemplateOnAdapter(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<AriaCollection> {
  const current = await getCollectionFromAdapter(adapter, collectionId);
  const collection = AriaCollectionSchema.parse({
    ...current,
    templatePageId: null,
    listPageId: null,
    urlPattern: null,
    updatedAt: nowIso(),
  });
  const saved = await adapter.saveCollection(collection);
  await syncCmsCollectionSearchDocument(adapter, saved);
  await syncPageRolesForCollectionChangeOnAdapter(adapter, {
    previousTemplatePageId: current.templatePageId,
    previousListPageId: current.listPageId,
    nextTemplatePageId: null,
    nextListPageId: null,
  });
  return saved;
}
