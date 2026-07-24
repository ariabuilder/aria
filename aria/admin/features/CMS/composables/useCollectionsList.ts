import { computed, ref, type ComputedRef, type Ref } from "vue";
import { z } from "zod";
import { ListCollectionsResponseSchema } from "../../../../lib/cms/actionSchemas";
import {
  COLLECTION_KINDS,
} from "../../../../lib/cms/constants";
import { AriaCollectionSchema } from "../../../../lib/cms/schemas";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import {
  CmsCollectionKindFilterSchema,
  CmsCollectionSortSchema,
  type CmsCollectionKindFilter,
  type CmsCollectionSort,
} from "../lib/collectionViewPreferences";
import {
  fetchCollections,
  getCachedCollections,
  hasFreshCollections,
  invalidateCollectionsCache,
} from "./useCmsDataCache";
import { useStudioI18n } from "@/i18n";

export const CollectionSummarySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    label: z.string(),
    kind: z.enum(COLLECTION_KINDS),
    iconName: z.string().nullable(),
    showInSidebar: z.boolean(),
    itemCount: z.int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type CollectionSummary = z.infer<typeof CollectionSummarySchema>;
type ListCollectionsResponse = z.infer<typeof ListCollectionsResponseSchema>;

export interface UseCollectionsListReturn {
  collections: Ref<CollectionSummary[]>;
  searchQuery: Ref<string>;
  kindFilter: Ref<CmsCollectionKindFilter>;
  sortBy: Ref<CmsCollectionSort>;
  isLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  stats: ComputedRef<{ total: number; items: number }>;
  filteredCollections: ComputedRef<CollectionSummary[]>;
  filters: ComputedRef<
    Array<{ key: CmsCollectionKindFilter; label: string; count: number }>
  >;
  collectionNames: ComputedRef<readonly string[]>;
  loadCollections: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  upsertCollectionSummary: (
    collection: z.input<typeof AriaCollectionSchema>,
  ) => void;
  setKindFilter: (nextFilter: CmsCollectionKindFilter) => void;
  setSortBy: (nextSort: CmsCollectionSort) => void;
}

const collections = ref<CollectionSummary[]>([]);
const searchQuery = ref("");
const kindFilter = ref<CmsCollectionKindFilter>("all");
const sortBy = ref<CmsCollectionSort>({ key: "label", direction: "asc" });
const isLoading = ref(false);
const loadError = ref<string | null>(null);

export function collectionToSummary(
  collectionInput: z.input<typeof AriaCollectionSchema>,
  itemCount = 0,
): CollectionSummary {
  const collection = AriaCollectionSchema.parse(collectionInput);
  return CollectionSummarySchema.parse({
    id: collection.id,
    name: collection.name,
    label: collection.label,
    kind: collection.kind,
    iconName: collection.schema.icon ?? null,
    showInSidebar: collection.schema.navigation?.showInSidebar ?? true,
    itemCount,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  });
}

/**
 * Shared collections list state for CMS views and create flows.
 */
export function useCollectionsList(): UseCollectionsListReturn {
  const { t } = useStudioI18n();
  const stats = computed(() => ({
    total: collections.value.length,
    items: collections.value.reduce(
      (sum, collection) => sum + collection.itemCount,
      0,
    ),
  }));

  const filteredCollections = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();
    const activeKind = kindFilter.value;

    const result = collections.value.filter((collection) => {
      if (activeKind !== "all" && collection.kind !== activeKind) {
        return false;
      }
      if (!query) return true;
      const name = collection.name.toLowerCase();
      const label = collection.label.toLowerCase();
      return name.includes(query) || label.includes(query);
    });

    const sort = CmsCollectionSortSchema.parse(sortBy.value);
    return [...result].sort((a, b) => {
      const direction = sort.direction === "asc" ? 1 : -1;
      switch (sort.key) {
        case "itemCount":
          return (a.itemCount - b.itemCount) * direction;
        case "kind":
          return a.kind.localeCompare(b.kind) * direction;
        case "name":
          return a.name.localeCompare(b.name) * direction;
        case "label":
        default:
          return a.label.localeCompare(b.label) * direction;
      }
    });
  });

  const filters = computed(() => [
    { key: "all" as const, label: t("collections.filter.all"), count: collections.value.length },
    ...COLLECTION_KINDS.map((kind) => ({
      key: kind,
      label: t(`collections.filter.${kind}` as const),
      count: collections.value.filter((collection) => collection.kind === kind)
        .length,
    })),
  ]);

  const collectionNames = computed(() =>
    collections.value.map((collection) => collection.name),
  );

  function applyCollectionsData(data: ListCollectionsResponse): void {
    collections.value = z.array(CollectionSummarySchema).parse(
      data.collections.map((collection) =>
        collectionToSummary(collection, data.entryCounts[collection.id] ?? 0),
      ),
    );
  }

  async function loadCollections(
    options: { force?: boolean; silent?: boolean } = {},
  ): Promise<void> {
    const cached = getCachedCollections();
    if (cached) {
      applyCollectionsData(cached);
      if (!options.force && hasFreshCollections()) {
        loadError.value = null;
        isLoading.value = false;
        return;
      }
    }

    isLoading.value = !cached && !options.silent;
    loadError.value = null;

    try {
      applyCollectionsData(await fetchCollections({ force: options.force }));
    } catch (err) {
      if (handleActionResultForbidden({ error: err }, "cms.collections.list")) {
        if (!cached) collections.value = [];
        return;
      }
      loadError.value =
        err instanceof Error ? err.message : "Failed to load collections";
      if (!cached) collections.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  function upsertCollectionSummary(
    collectionInput: z.input<typeof AriaCollectionSchema>,
  ): void {
    const collection = AriaCollectionSchema.parse(collectionInput);
    const existingIndex = collections.value.findIndex(
      (summary) => summary.id === collection.id,
    );
    const existing =
      existingIndex >= 0 ? collections.value[existingIndex] : undefined;
    const nextSummary = collectionToSummary(collection, existing?.itemCount ?? 0);

    if (existingIndex >= 0) {
      collections.value = collections.value.map((summary, index) =>
        index === existingIndex ? nextSummary : summary,
      );
      invalidateCollectionsCache();
      return;
    }

    collections.value = [...collections.value, nextSummary];
    invalidateCollectionsCache();
  }

  function setKindFilter(nextFilter: CmsCollectionKindFilter): void {
    kindFilter.value = CmsCollectionKindFilterSchema.parse(nextFilter);
  }

  function setSortBy(nextSort: CmsCollectionSort): void {
    sortBy.value = CmsCollectionSortSchema.parse(nextSort);
  }

  return {
    collections,
    searchQuery,
    kindFilter,
    sortBy,
    isLoading,
    loadError,
    stats,
    filteredCollections,
    filters,
    collectionNames,
    loadCollections,
    upsertCollectionSummary,
    setKindFilter,
    setSortBy,
  };
}
