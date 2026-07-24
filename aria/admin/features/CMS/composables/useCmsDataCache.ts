import { actions } from "astro:actions";
import { z } from "zod";
import {
  ListCollectionsResponseSchema,
  ListEntriesResponseSchema,
} from "../../../../lib/cms/actionSchemas";
import {
  AriaCollectionSchema,
  EntryListRequestSchema,
} from "../../../../lib/cms/schemas";

type CollectionListData = z.infer<typeof ListCollectionsResponseSchema>;
type CollectionData = z.infer<typeof AriaCollectionSchema>;
type EntryListData = z.infer<typeof ListEntriesResponseSchema>;
type EntryListRequest = z.infer<typeof EntryListRequestSchema>;

const CmsCollectionIdSchema = z.string().trim().min(1);

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

type CacheLoadOptions = {
  force?: boolean;
};

const FRESH_MS = 30_000;
const collectionsKey = "collections:list";
const collectionsCache = new Map<string, CacheEntry<CollectionListData>>();
const collectionCache = new Map<string, CacheEntry<CollectionData>>();
const entryListCache = new Map<string, CacheEntry<EntryListData>>();
const inflightCollections = new Map<string, Promise<CollectionListData>>();
const inflightCollectionsById = new Map<string, Promise<CollectionData>>();
const inflightEntryLists = new Map<string, Promise<EntryListData>>();
const prewarmQueue: Array<() => Promise<void>> = [];
let prewarmInFlight = 0;
const PREWARM_MAX_CONCURRENT = 2;

function now(): number {
  return Date.now();
}

function isFresh(entry: CacheEntry<unknown> | undefined): boolean {
  return Boolean(entry && now() - entry.fetchedAt < FRESH_MS);
}

function normalizeCollectionLookup(value: string): string {
  return value.trim().toLowerCase();
}

export function cmsEntryListCacheKey(input: EntryListRequest): string {
  const payload = EntryListRequestSchema.parse(input);
  return JSON.stringify({
    collectionId: payload.collectionId,
    page: payload.page ?? 1,
    limit: payload.limit ?? 50,
    query: payload.query ?? "",
    status: payload.status ?? "",
    locale: payload.locale ?? "",
    sort: payload.sort ?? [],
  });
}

function rememberCollection(collection: CollectionData): void {
  const entry = { data: collection, fetchedAt: now() };
  collectionCache.set(normalizeCollectionLookup(collection.id), entry);
  collectionCache.set(normalizeCollectionLookup(collection.name), entry);
}

export function getCachedCollections(): CollectionListData | null {
  return collectionsCache.get(collectionsKey)?.data ?? null;
}

export function hasFreshCollections(): boolean {
  return isFresh(collectionsCache.get(collectionsKey));
}

export function getCachedCollection(idOrName: string): CollectionData | null {
  return collectionCache.get(normalizeCollectionLookup(idOrName))?.data ?? null;
}

export function hasFreshCollection(idOrName: string): boolean {
  return isFresh(collectionCache.get(normalizeCollectionLookup(idOrName)));
}

export function getCachedEntryList(
  input: EntryListRequest,
): EntryListData | null {
  return entryListCache.get(cmsEntryListCacheKey(input))?.data ?? null;
}

export function hasFreshEntryList(input: EntryListRequest): boolean {
  return isFresh(entryListCache.get(cmsEntryListCacheKey(input)));
}

export async function fetchCollections(
  options: CacheLoadOptions = {},
): Promise<CollectionListData> {
  const cached = collectionsCache.get(collectionsKey);
  if (!options.force && isFresh(cached) && cached) {
    return cached.data;
  }

  const existing = inflightCollections.get(collectionsKey);
  if (!options.force && existing) {
    return existing;
  }

  const request = actions.cms.collections.list({}).then(({ data, error }) => {
    if (error) throw error;
    const parsed = ListCollectionsResponseSchema.parse(data);
    collectionsCache.set(collectionsKey, { data: parsed, fetchedAt: now() });
    for (const collection of parsed.collections) {
      rememberCollection(collection);
    }
    return parsed;
  });

  inflightCollections.set(collectionsKey, request);
  try {
    return await request;
  } finally {
    inflightCollections.delete(collectionsKey);
  }
}

export async function fetchCollection(
  idOrName: string,
  options: CacheLoadOptions = {},
): Promise<CollectionData> {
  const cacheKey = normalizeCollectionLookup(idOrName);
  const cached = collectionCache.get(cacheKey);
  if (!options.force && isFresh(cached) && cached) {
    return cached.data;
  }

  const existing = inflightCollectionsById.get(cacheKey);
  if (!options.force && existing) {
    return existing;
  }

  const request = actions.cms.collections
    .get({ id: idOrName.trim() })
    .then(({ data, error }) => {
      if (error) throw error;
      const parsed = AriaCollectionSchema.parse(data);
      rememberCollection(parsed);
      return parsed;
    });

  inflightCollectionsById.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inflightCollectionsById.delete(cacheKey);
  }
}

export async function fetchEntryList(
  input: EntryListRequest,
  options: CacheLoadOptions = {},
): Promise<EntryListData> {
  const payload = EntryListRequestSchema.parse(input);
  const cacheKey = cmsEntryListCacheKey(payload);
  const cached = entryListCache.get(cacheKey);
  if (!options.force && isFresh(cached) && cached) {
    return cached.data;
  }

  const existing = inflightEntryLists.get(cacheKey);
  if (!options.force && existing) {
    return existing;
  }

  const request = actions.cms.entries.list(payload).then(({ data, error }) => {
    if (error) throw error;
    const parsed = ListEntriesResponseSchema.parse(data);
    entryListCache.set(cacheKey, { data: parsed, fetchedAt: now() });
    return parsed;
  });

  inflightEntryLists.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inflightEntryLists.delete(cacheKey);
  }
}

function drainPrewarmQueue(): void {
  while (
    prewarmInFlight < PREWARM_MAX_CONCURRENT &&
    prewarmQueue.length > 0
  ) {
    const next = prewarmQueue.shift();
    if (!next) return;
    prewarmInFlight++;
    void next().finally(() => {
      prewarmInFlight--;
      drainPrewarmQueue();
    });
  }
}

function enqueuePrewarm(task: () => Promise<void>): void {
  prewarmQueue.push(task);
  drainPrewarmQueue();
}

export function prewarmCollections(): void {
  if (hasFreshCollections() || inflightCollections.has(collectionsKey)) return;
  enqueuePrewarm(async () => {
    await fetchCollections().catch(() => undefined);
  });
}

export function prewarmCollection(idOrName: string): void {
  const cacheKey = normalizeCollectionLookup(idOrName);
  if (hasFreshCollection(idOrName) || inflightCollectionsById.has(cacheKey)) {
    return;
  }
  enqueuePrewarm(async () => {
    await fetchCollection(idOrName).catch(() => undefined);
  });
}

export function prewarmEntryList(input: EntryListRequest): void {
  const cacheKey = cmsEntryListCacheKey(input);
  if (hasFreshEntryList(input) || inflightEntryLists.has(cacheKey)) return;
  enqueuePrewarm(async () => {
    await fetchEntryList(input).catch(() => undefined);
  });
}

export function invalidateCollectionsCache(): void {
  collectionsCache.delete(collectionsKey);
}

export function invalidateCollectionCache(idOrName?: string): void {
  if (!idOrName) {
    collectionCache.clear();
    return;
  }
  collectionCache.delete(normalizeCollectionLookup(idOrName));
}

export function invalidateEntryListCache(collectionId?: string): void {
  if (!collectionId) {
    entryListCache.clear();
    return;
  }

  const parsedCollectionId = CmsCollectionIdSchema.parse(collectionId);
  for (const [key, entry] of entryListCache.entries()) {
    if (entry.data.items.some((item) => item.entry.collectionId === parsedCollectionId)) {
      entryListCache.delete(key);
      continue;
    }
    if (key.includes(`"collectionId":"${parsedCollectionId}"`)) {
      entryListCache.delete(key);
    }
  }
}

export function invalidateEntryMutationCaches(collectionId: string): void {
  const parsedCollectionId = CmsCollectionIdSchema.parse(collectionId);
  invalidateEntryListCache(parsedCollectionId);
  invalidateCollectionsCache();
}

export function clearCmsDataCache(): void {
  collectionsCache.clear();
  collectionCache.clear();
  entryListCache.clear();
  inflightCollections.clear();
  inflightCollectionsById.clear();
  inflightEntryLists.clear();
  prewarmQueue.length = 0;
  prewarmInFlight = 0;
}
