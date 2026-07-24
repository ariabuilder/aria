import { actions } from "astro:actions";
import { PageDSLSchema } from "@/lib/schemas/nodes";
import type { PageDSL } from "@/lib/types/nodes";
import type { GetPageActivityOutput } from "@/lib/schemas/activity";
import type { PagePolicyResult } from "@/lib/pages/policy";
import type { Page } from "@/composables/useBuilderData";

export type PageResourcePriority = "active" | "hover" | "visible" | "adjacent" | "idle";

export interface PageResourceInventory {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  isModifiedSincePublish: boolean;
  layout: string;
  systemRole?: "standard" | "not-found" | "cms-collection" | "cms-entry";
  accessMode?: "public" | "password" | "private" | "unlisted";
  hasPassword?: boolean;
  snapshotUrl?: string;
  thumbnailUrl?: string;
  parent?: string;
  order?: number;
  updatedAt: string | null;
}

export interface PageDetailBundle {
  page: PageDSL;
  inventory?: PageResourceInventory | null;
  policy?: PagePolicyResult | null;
  activity?: GetPageActivityOutput | null;
  updatedAt?: string | null;
  preview?: {
    snapshotUrl?: string;
    thumbnailUrl?: string;
  } | null;
  serverTiming?: readonly string[];
}

export interface PageResourceEntry extends PageDetailBundle {
  slug: string;
  cachedAt: number;
  invalidatedAt: number | null;
  invalidationReason: string | null;
  size: number;
}

export interface LoadPageResourceOptions {
  priority?: PageResourcePriority;
  revalidate?: boolean;
  activityLimit?: number;
}

type PageResourceLoader = (
  slug: string,
  options: LoadPageResourceOptions,
) => Promise<PageDetailBundle>;

const MAX_FULL_PAGE_ENTRIES = 25;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024;

const pageEntries = new Map<string, PageResourceEntry>();
const inventoryEntries = new Map<string, PageResourceInventory>();
const inFlightLoads = new Map<string, Promise<PageResourceEntry>>();

let totalEntrySize = 0;
let testLoader: PageResourceLoader | null = null;

function normalizeSlug(slug: string): string {
  return slug.trim();
}

function toInventory(page: Page): PageResourceInventory {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    status: page.status,
    isModifiedSincePublish: page.isModifiedSincePublish,
    layout: page.layout,
    systemRole: page.systemRole,
    accessMode: page.accessMode,
    hasPassword: page.hasPassword,
    snapshotUrl: page.snapshotUrl,
    thumbnailUrl: page.thumbnailUrl,
    parent: page.parent,
    order: page.order,
    updatedAt: page.updatedAt,
  };
}

function estimateBundleSize(bundle: PageDetailBundle): number {
  try {
    return JSON.stringify(bundle).length;
  } catch {
    return 0;
  }
}

function removeEntry(slug: string): void {
  const existing = pageEntries.get(slug);
  if (!existing) return;
  pageEntries.delete(slug);
  totalEntrySize = Math.max(0, totalEntrySize - existing.size);
}

function rememberEntry(slug: string, bundle: PageDetailBundle): PageResourceEntry {
  const normalizedSlug = normalizeSlug(slug);
  const parsedPage = PageDSLSchema.parse(bundle.page);
  const entry: PageResourceEntry = {
    ...bundle,
    page: parsedPage,
    inventory: bundle.inventory ?? inventoryEntries.get(normalizedSlug) ?? null,
    slug: normalizedSlug,
    cachedAt: Date.now(),
    invalidatedAt: null,
    invalidationReason: null,
    size: estimateBundleSize(bundle),
  };

  removeEntry(normalizedSlug);
  pageEntries.set(normalizedSlug, entry);
  totalEntrySize += entry.size;
  trimEntries(normalizedSlug);
  return entry;
}

function trimEntries(protectedSlug?: string): void {
  while (
    pageEntries.size > MAX_FULL_PAGE_ENTRIES ||
    totalEntrySize > MAX_TOTAL_SIZE_BYTES
  ) {
    const oldestSlug = pageEntries.keys().next().value as string | undefined;
    if (!oldestSlug) return;

    if (oldestSlug === protectedSlug && pageEntries.size === 1) {
      return;
    }

    if (oldestSlug === protectedSlug) {
      const protectedEntry = pageEntries.get(oldestSlug);
      if (!protectedEntry) return;
      pageEntries.delete(oldestSlug);
      pageEntries.set(oldestSlug, protectedEntry);
      continue;
    }

    removeEntry(oldestSlug);
  }
}

async function defaultLoadPageResource(
  slug: string,
  options: LoadPageResourceOptions,
): Promise<PageDetailBundle> {
  const response = await actions.pages.getDetailBundle({
    slug,
    activityLimit: options.activityLimit ?? 5,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  const data = response.data as PageDetailBundle | undefined;
  if (!data) {
    throw new Error("Page detail bundle was empty");
  }

  return {
    ...data,
    page: PageDSLSchema.parse(data.page),
  };
}

function getLoader(): PageResourceLoader {
  return testLoader ?? defaultLoadPageResource;
}

export function seedPageResourceInventory(pages: readonly Page[]): void {
  for (const page of pages) {
    if (!page.slug) continue;
    inventoryEntries.set(page.slug, toInventory(page));
  }
}

export function getPageResourceInventory(
  slug: string,
): PageResourceInventory | null {
  return inventoryEntries.get(normalizeSlug(slug)) ?? null;
}

export function getCachedPageResource(slug: string): PageResourceEntry | null {
  const normalizedSlug = normalizeSlug(slug);
  const cached = pageEntries.get(normalizedSlug);
  if (!cached) return null;

  pageEntries.delete(normalizedSlug);
  pageEntries.set(normalizedSlug, cached);
  return cached;
}

export function isPageResourceStale(entry: PageResourceEntry): boolean {
  return entry.invalidatedAt !== null;
}

export async function loadPageResource(
  slug: string,
  options: LoadPageResourceOptions = {},
): Promise<PageResourceEntry> {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw new Error("Page slug is required");
  }

  const cached = getCachedPageResource(normalizedSlug);
  if (cached && !options.revalidate && !isPageResourceStale(cached)) {
    return cached;
  }

  const existingLoad = inFlightLoads.get(normalizedSlug);
  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = getLoader()(normalizedSlug, options)
    .then((bundle) => rememberEntry(normalizedSlug, bundle))
    .finally(() => {
      inFlightLoads.delete(normalizedSlug);
    });

  inFlightLoads.set(normalizedSlug, loadPromise);
  return loadPromise;
}

export function prefetchPageResource(
  slug: string,
  priority: PageResourcePriority = "hover",
): Promise<void> {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return Promise.resolve();

  const cached = getCachedPageResource(normalizedSlug);
  if (cached && !isPageResourceStale(cached)) {
    return Promise.resolve();
  }

  return loadPageResource(normalizedSlug, {
    priority,
    revalidate: Boolean(cached),
  }).then(
    () => undefined,
    () => undefined,
  );
}

export function invalidatePageResource(
  slug: string,
  reason = "mutation",
): void {
  const normalizedSlug = normalizeSlug(slug);
  const existing = pageEntries.get(normalizedSlug);
  if (!existing) return;

  existing.invalidatedAt = Date.now();
  existing.invalidationReason = reason;
}

export function invalidatePageResourceById(
  pageId: string,
  reason = "mutation",
): void {
  for (const [slug, entry] of pageEntries) {
    if (entry.page.id === pageId) {
      invalidatePageResource(slug, reason);
    }
  }
}

export function invalidateAllPageResources(reason = "dependency"): void {
  for (const slug of pageEntries.keys()) {
    invalidatePageResource(slug, reason);
  }
}

/**
 * Permanently remove a resource from the memory bank. Use
 * this for deletion, logout/site changes, or explicit memory eviction.
 */
export function evictPageResource(slug: string): void {
  removeEntry(normalizeSlug(slug));
}

export function updateCachedPageResource(
  slug: string,
  updater: (entry: PageResourceEntry) => PageDetailBundle | PageResourceEntry,
): PageResourceEntry | null {
  const normalizedSlug = normalizeSlug(slug);
  const existing = pageEntries.get(normalizedSlug);
  if (!existing) return null;
  return rememberEntry(normalizedSlug, updater(existing));
}

export function usePageResourceBank() {
  return {
    getCachedPage: getCachedPageResource,
    getInventory: getPageResourceInventory,
    loadPage: loadPageResource,
    prefetchPage: prefetchPageResource,
    invalidatePage: invalidatePageResource,
    invalidatePageById: invalidatePageResourceById,
    invalidateAllPages: invalidateAllPageResources,
    evictPage: evictPageResource,
    updateCachedPage: updateCachedPageResource,
    seedInventory: seedPageResourceInventory,
    isStale: isPageResourceStale,
  };
}

export function __resetPageResourceBankForTests(): void {
  pageEntries.clear();
  inventoryEntries.clear();
  inFlightLoads.clear();
  totalEntrySize = 0;
  testLoader = null;
}

export function __setPageResourceBankLoaderForTests(
  loader: PageResourceLoader | null,
): void {
  testLoader = loader;
}
