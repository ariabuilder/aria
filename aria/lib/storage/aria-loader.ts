import type { Loader } from "astro/loaders";
import type { JsonObject } from "../types/nodes";
import type { StorageAdapter } from "./adapter";
import { getStorageAdapterAsync } from "./getStorageAdapter";
import { touchLastSyncResource } from "./last-sync";

/** Normalized entry shape shared by all Aria loaders. */
export interface AriaLoaderEntry<T> {
  id: string;
  slug: string;
  title?: string;
  filePath?: string;
  body?: string;
  metadata?: JsonObject;
  data: T;
  rendered?: {
    html: string;
    metadata?: JsonObject;
  };
  digest?: string;
}

export type NormalizeEntryParams<T> = {
  item: T;
  resourceName: string;
  storage: StorageAdapter;
};

export type NormalizeEntryHook<T> = (
  params: NormalizeEntryParams<T>,
) => Promise<AriaLoaderEntry<T>>;

export type CreateAriaLoaderOptions<T> = {
  /** Loader name surfaced in Astro logs. */
  name: string;
  /** Logical resource name used for metadata (e.g. aria-pages). */
  resourceName?: string;
  /** Storage adapter helper that returns every entry that should be published. */
  listFn: (storage: StorageAdapter) => Promise<T[]>;
  normalizeEntry?: NormalizeEntryHook<T>;
};

export function createAriaLoader<T extends { slug?: string; id?: string }>(
  options: CreateAriaLoaderOptions<T>,
): Loader {
  const { name, listFn, resourceName = name, normalizeEntry } = options;

  return {
    name,
    load: async (context) => {
      const storage = await getStorageAdapterAsync();
      const items = await listFn(storage);

      context.store.clear();

      for (const item of items) {
        const normalized = await (normalizeEntry
          ? normalizeEntry({ item, storage, resourceName })
          : normalizeEntryDefault({ item, resourceName, storage }));

        if (!normalized?.id) continue;

        const digest =
          normalized.digest ?? context.generateDigest(normalized.data);

        context.store.set({
          id: normalized.id,
          data: normalized.data,
          filePath: normalized.filePath,
          body: normalized.body,
          rendered: normalized.rendered,
          digest,
        });
      }

      const metaTimestamp =
        (await touchLastSyncResource(storage, resourceName)) ??
        new Date().toISOString();

      context.meta.set(`last-sync:${resourceName}`, metaTimestamp);
    },
  };
}

async function normalizeEntryDefault<T extends { slug?: string; id?: string }>(
  params: NormalizeEntryParams<T>,
): Promise<AriaLoaderEntry<T>> {
  const slug = normalizeSlug(params.item.slug ?? params.item.id);
  return {
    id: slug,
    slug,
    title: resolveTitle(params.item),
    data: params.item,
    metadata: {
      resource: params.resourceName,
      storageBackend: "aria",
      normalizedAt: new Date().toISOString(),
    },
  };
}

function resolveTitle(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;

  if ("title" in item && typeof item.title === "string") {
    return item.title;
  }

  if ("name" in item && typeof item.name === "string") {
    return item.name;
  }

  return undefined;
}

function normalizeSlug(value: string | undefined): string {
  if (!value) return "index";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "index";

  const cleaned = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  return cleaned || "index";
}
