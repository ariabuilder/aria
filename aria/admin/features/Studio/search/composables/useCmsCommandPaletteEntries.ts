import { actions } from "astro:actions";
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { z } from "zod";
import { SearchCmsResponseSchema } from "../../../../../lib/cms/actionSchemas";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import {
  CommandPaletteCmsCollectionItemSchema,
  CommandPaletteCmsEntryItemSchema,
  type CommandPaletteCmsCollectionItem,
  type CommandPaletteCmsEntryItem,
} from "../schemas/commandPalette";

export interface UseCmsCommandPaletteEntriesReturn {
  entries: Ref<CommandPaletteCmsEntryItem[]>;
  collections: Ref<CommandPaletteCmsCollectionItem[]>;
  isLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  visibleEntries: ComputedRef<readonly CommandPaletteCmsEntryItem[]>;
  visibleCollections: ComputedRef<readonly CommandPaletteCmsCollectionItem[]>;
  loadEntries: () => Promise<void>;
}

const TOTAL_ENTRY_LIMIT = 24;

export function useCmsCommandPaletteEntries(
  searchQuery: Ref<string>,
): UseCmsCommandPaletteEntriesReturn {
  const entries = ref<CommandPaletteCmsEntryItem[]>([]);
  const collections = ref<CommandPaletteCmsCollectionItem[]>([]);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  const visibleEntries = computed(() =>
    z
      .array(CommandPaletteCmsEntryItemSchema)
      .parse(entries.value.slice(0, TOTAL_ENTRY_LIMIT)),
  );
  const visibleCollections = computed(() =>
    z
      .array(CommandPaletteCmsCollectionItemSchema)
      .parse(collections.value.slice(0, TOTAL_ENTRY_LIMIT)),
  );

  async function loadEntries(): Promise<void> {
    const query = searchQuery.value.trim();
    if (!query) {
      entries.value = [];
      collections.value = [];
      isLoading.value = false;
      loadError.value = null;
      return;
    }
    isLoading.value = true;
    loadError.value = null;

    try {
      const { data, error } = await actions.cms.search({
        query,
        limit: TOTAL_ENTRY_LIMIT,
      });
      if (error) throw new Error(error.message);
      const response = SearchCmsResponseSchema.parse(data);
      entries.value = response.results
        .filter((result) => result.entityType === "entry")
        .map((result) =>
          CommandPaletteCmsEntryItemSchema.parse({
            id: result.entityId,
            collectionId: result.collectionId,
            collectionName: result.collectionName,
            collectionLabel: result.collectionLabel,
            title: result.title,
            slug: result.slug,
            locale: result.locale,
            status: result.status,
            updatedAt: result.updatedAt,
          }),
        );
      collections.value = response.results
        .filter((result) => result.entityType === "collection")
        .map((result) =>
          CommandPaletteCmsCollectionItemSchema.parse({
            id: result.entityId,
            name: result.collectionName ?? result.slug,
            label: result.collectionLabel ?? result.title,
          }),
        );
    } catch (err) {
      if (handleActionResultForbidden({ error: err }, "cms.entries.query")) {
        entries.value = [];
        collections.value = [];
        return;
      }
      entries.value = [];
      collections.value = [];
      loadError.value =
        err instanceof Error ? err.message : "Failed to load CMS entries";
    } finally {
      isLoading.value = false;
    }
  }

  let searchDebounce: ReturnType<typeof setTimeout> | undefined;
  watch(
    searchQuery,
    () => {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }
      searchDebounce = setTimeout(() => {
        void loadEntries();
      }, 200);
    },
    { immediate: true },
  );

  return {
    entries,
    collections,
    isLoading,
    loadError,
    visibleEntries,
    visibleCollections,
    loadEntries,
  };
}
