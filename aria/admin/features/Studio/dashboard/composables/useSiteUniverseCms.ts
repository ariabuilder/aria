import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { CollectionSummary } from "@/features/CMS/composables/useCollectionsList";
import { useCollectionsList } from "@/features/CMS/composables/useCollectionsList";
import { fetchEntryList } from "@/features/CMS/composables/useCmsDataCache";
import { mapEntryRecordToRow } from "@/features/CMS/lib/entryRow";
import {
  SiteUniverseCmsSystemSchema,
  type SiteUniverseCmsSystem,
} from "../schemas/dashboard";

export const CMS_UNIVERSE_COLLECTION_LIMIT = 8;
export const CMS_UNIVERSE_ENTRY_LIMIT = 24;
export const CMS_UNIVERSE_ENTRY_LIMIT_PER_COLLECTION = 6;
const CMS_UNIVERSE_LOAD_CONCURRENCY = 3;
const CMS_UNIVERSE_FETCH_LIMIT_PER_COLLECTION = 24;

export interface SiteUniverseCmsEntryInput {
  id: string;
  collectionId: string;
  collectionName: string;
  title: string;
  slug: string;
  locale: string;
  status: "draft" | "published" | "scheduled" | "archived";
  updatedAt: string;
}

export interface UseSiteUniverseCmsReturn {
  cmsSystems: ComputedRef<SiteUniverseCmsSystem[]>;
  isLoadingCmsSystems: Ref<boolean>;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sortCollectionsForUniverse(
  collections: readonly CollectionSummary[],
): CollectionSummary[] {
  return [...collections]
    .sort((left, right) => {
      const updatedDelta =
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime();
      return updatedDelta || left.label.localeCompare(right.label);
    })
    .slice(0, CMS_UNIVERSE_COLLECTION_LIMIT);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );
  return results;
}

export function buildSiteUniverseCmsSystems(
  collections: readonly CollectionSummary[],
  entries: readonly SiteUniverseCmsEntryInput[],
): SiteUniverseCmsSystem[] {
  const selectedCollections = sortCollectionsForUniverse(collections);
  const selectedCollectionIds = new Set(
    selectedCollections.map((collection) => collection.id),
  );
  const acceptedPerCollection = new Map<string, number>();
  const acceptedEntries = [...entries]
    .filter((entry) => selectedCollectionIds.has(entry.collectionId))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime() ||
        left.title.localeCompare(right.title),
    )
    .filter((entry) => {
      const accepted = acceptedPerCollection.get(entry.collectionId) ?? 0;
      if (accepted >= CMS_UNIVERSE_ENTRY_LIMIT_PER_COLLECTION) return false;
      acceptedPerCollection.set(entry.collectionId, accepted + 1);
      return true;
    })
    .slice(0, CMS_UNIVERSE_ENTRY_LIMIT);

  return selectedCollections.map((collection, collectionIndex) => {
    const hash = stableHash(collection.id);
    const durationMs = 70_000 + (hash % 40_001);
    const collectionEntries = acceptedEntries.filter(
      (entry) => entry.collectionId === collection.id,
    );

    return SiteUniverseCmsSystemSchema.parse({
      id: collection.id,
      name: collection.name,
      label: collection.label,
      kind: collection.kind,
      itemCount: collection.itemCount,
      orbitStartPercent:
        ((collectionIndex / Math.max(1, selectedCollections.length)) * 100 +
          (hash % 7)) %
        100,
      durationMs,
      phaseMs: hash % durationMs,
      entries: collectionEntries.map((entry, entryIndex) => {
        const entryHash = stableHash(`${collection.id}:${entry.id}`);
        const entryDurationMs = 18_000 + (entryHash % 14_001);
        return {
          ...entry,
          title: entry.title.trim() || entry.slug,
          orbitAngleDeg:
            ((entryIndex / Math.max(1, collectionEntries.length)) * 360 +
              (entryHash % 23)) %
            360,
          orbitRadiusPx: 32 + (entryIndex % 3) * 16 + (entryHash % 5),
          durationMs: entryDurationMs,
          phaseMs: entryHash % entryDurationMs,
          size: entry.status === "published" ? 6 : 5,
        };
      }),
    });
  });
}

export function useSiteUniverseCms(): UseSiteUniverseCmsReturn {
  const { collections } = useCollectionsList();
  const entries = ref<SiteUniverseCmsEntryInput[]>([]);
  const isLoadingCmsSystems = ref(false);
  let loadGeneration = 0;

  const selectedCollections = computed(() =>
    sortCollectionsForUniverse(collections.value),
  );
  const selectedCollectionKey = computed(() =>
    selectedCollections.value
      .map(
        (collection) =>
          `${collection.id}:${collection.itemCount}:${collection.updatedAt}`,
      )
      .join("|"),
  );

  async function loadEntries(): Promise<void> {
    const generation = ++loadGeneration;
    const candidates = selectedCollections.value.filter(
      (collection) => collection.itemCount > 0,
    );
    if (candidates.length === 0) {
      entries.value = [];
      isLoadingCmsSystems.value = false;
      return;
    }

    isLoadingCmsSystems.value = true;
    const entryGroups = await mapWithConcurrency(
      candidates,
      CMS_UNIVERSE_LOAD_CONCURRENCY,
      async (collection): Promise<SiteUniverseCmsEntryInput[]> => {
        try {
          const response = await fetchEntryList({
            collectionId: collection.id,
            page: 1,
            limit: CMS_UNIVERSE_FETCH_LIMIT_PER_COLLECTION,
            sort: [{ field: "updatedAt", direction: "desc" }],
          });
          return response.items.flatMap((record) => {
            try {
              const row = mapEntryRecordToRow(record);
              return [
                {
                  id: row.id,
                  collectionId: row.collectionId,
                  collectionName: collection.name,
                  title: row.title,
                  slug: row.slug,
                  locale: row.locale,
                  status: row.status,
                  updatedAt: row.updatedAt,
                },
              ];
            } catch {
              return [];
            }
          });
        } catch {
          return [];
        }
      },
    );

    if (generation !== loadGeneration) return;
    entries.value = entryGroups.flat();
    isLoadingCmsSystems.value = false;
  }

  watch(selectedCollectionKey, () => void loadEntries(), { immediate: true });

  const cmsSystems = computed(() =>
    buildSiteUniverseCmsSystems(selectedCollections.value, entries.value),
  );

  return { cmsSystems, isLoadingCmsSystems };
}
