import { actions } from "astro:actions";
import { ComponentDSLSchema } from "@/lib/schemas/nodes";
import type { ComponentDSL } from "@/lib/types/nodes";
import { parseStudioGetItemPayload } from "@/features/Studio/composer/composables/componentPropertiesActionResults";

export interface ComponentResourceEntry {
  id: string;
  component: ComponentDSL;
  cachedAt: number;
  invalidatedAt: number | null;
  invalidationReason: string | null;
  size: number;
}

type ComponentResourceLoader = (id: string) => Promise<ComponentDSL>;

const MAX_COMPONENT_ENTRIES = 50;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024;

const entries = new Map<string, ComponentResourceEntry>();
const inFlightLoads = new Map<string, Promise<ComponentResourceEntry>>();

let totalEntrySize = 0;
let testLoader: ComponentResourceLoader | null = null;

function normalizeId(id: string): string {
  return id.trim();
}

function estimateSize(component: ComponentDSL): number {
  try {
    return JSON.stringify(component).length;
  } catch {
    return 0;
  }
}

function removeEntry(id: string): void {
  const existing = entries.get(id);
  if (!existing) return;
  entries.delete(id);
  totalEntrySize = Math.max(0, totalEntrySize - existing.size);
}

function trimEntries(protectedId?: string): void {
  while (
    entries.size > MAX_COMPONENT_ENTRIES ||
    totalEntrySize > MAX_TOTAL_SIZE_BYTES
  ) {
    const oldestId = entries.keys().next().value as string | undefined;
    if (!oldestId) return;

    if (oldestId === protectedId && entries.size === 1) return;
    if (oldestId === protectedId) {
      const protectedEntry = entries.get(oldestId);
      if (!protectedEntry) return;
      entries.delete(oldestId);
      entries.set(oldestId, protectedEntry);
      continue;
    }

    removeEntry(oldestId);
  }
}

function rememberComponent(component: ComponentDSL): ComponentResourceEntry {
  const parsed = ComponentDSLSchema.parse(component);
  const id = normalizeId(parsed.id);
  const entry: ComponentResourceEntry = {
    id,
    component: parsed,
    cachedAt: Date.now(),
    invalidatedAt: null,
    invalidationReason: null,
    size: estimateSize(parsed),
  };

  removeEntry(id);
  entries.set(id, entry);
  totalEntrySize += entry.size;
  trimEntries(id);
  return entry;
}

async function defaultLoader(id: string): Promise<ComponentDSL> {
  const component = parseStudioGetItemPayload(
    "components",
    await actions.getItem({ collection: "components", slug: id }),
    { source: "useComponentResourceBank.load", slug: id },
  );

  if (!component) {
    throw new Error(`Component not found: ${id}`);
  }

  return ComponentDSLSchema.parse(component);
}

function getLoader(): ComponentResourceLoader {
  return testLoader ?? defaultLoader;
}

export function getCachedComponentResource(
  id: string,
): ComponentResourceEntry | null {
  const normalizedId = normalizeId(id);
  const cached = entries.get(normalizedId);
  if (!cached) return null;

  entries.delete(normalizedId);
  entries.set(normalizedId, cached);
  return cached;
}

export function isComponentResourceInvalidated(
  entry: ComponentResourceEntry,
): boolean {
  return entry.invalidatedAt !== null;
}

export async function loadComponentResource(
  id: string,
  options: { revalidate?: boolean } = {},
): Promise<ComponentResourceEntry> {
  const normalizedId = normalizeId(id);
  if (!normalizedId) throw new Error("Component id is required");

  const cached = getCachedComponentResource(normalizedId);
  if (cached && !options.revalidate && !isComponentResourceInvalidated(cached)) {
    return cached;
  }

  const existingLoad = inFlightLoads.get(normalizedId);
  if (existingLoad) return existingLoad;

  const load = getLoader()(normalizedId)
    .then(rememberComponent)
    .finally(() => {
      inFlightLoads.delete(normalizedId);
    });

  inFlightLoads.set(normalizedId, load);
  return load;
}

export function invalidateComponentResource(
  id: string,
  reason = "mutation",
): void {
  const existing = entries.get(normalizeId(id));
  if (!existing) return;
  existing.invalidatedAt = Date.now();
  existing.invalidationReason = reason;
}

export function updateCachedComponentResource(
  component: ComponentDSL,
): ComponentResourceEntry {
  return rememberComponent(component);
}

export function evictComponentResource(id: string): void {
  removeEntry(normalizeId(id));
}

export function useComponentResourceBank() {
  return {
    getCachedComponent: getCachedComponentResource,
    loadComponent: loadComponentResource,
    invalidateComponent: invalidateComponentResource,
    updateCachedComponent: updateCachedComponentResource,
    evictComponent: evictComponentResource,
    isInvalidated: isComponentResourceInvalidated,
  };
}

export function __resetComponentResourceBankForTests(): void {
  entries.clear();
  inFlightLoads.clear();
  totalEntrySize = 0;
  testLoader = null;
}

export function __setComponentResourceBankLoaderForTests(
  loader: ComponentResourceLoader | null,
): void {
  testLoader = loader;
}
