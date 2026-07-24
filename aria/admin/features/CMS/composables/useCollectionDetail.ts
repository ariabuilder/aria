import { type Ref, ref, watch } from "vue";
import { AriaCollectionSchema } from "../../../../lib/cms/schemas";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import type { AriaCollection } from "../../../../lib/cms/schemas";
import {
  fetchCollection,
  getCachedCollection,
  hasFreshCollection,
} from "./useCmsDataCache";

export interface UseCollectionDetailReturn {
  collection: Ref<AriaCollection | null>;
  isLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  loadCollection: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
}

export function useCollectionDetail(
  collectionIdOrName: Ref<string>,
): UseCollectionDetailReturn {
  const collection = ref<AriaCollection | null>(null);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  async function loadCollection(
    options: { force?: boolean; silent?: boolean } = {},
  ): Promise<void> {
    const id = collectionIdOrName.value.trim();
    if (!id) {
      collection.value = null;
      return;
    }

    const cached = getCachedCollection(id);
    if (cached) {
      collection.value = AriaCollectionSchema.parse(cached);
      if (!options.force && hasFreshCollection(id)) {
        loadError.value = null;
        isLoading.value = false;
        return;
      }
    }

    isLoading.value = !cached && !options.silent;
    loadError.value = null;

    try {
      collection.value = AriaCollectionSchema.parse(
        await fetchCollection(id, { force: options.force }),
      );
    } catch (err) {
      if (handleActionResultForbidden({ error: err }, "cms.collections.get")) {
        if (!cached) collection.value = null;
        return;
      }
      loadError.value =
        err instanceof Error ? err.message : "Failed to load collection";
      if (!cached) collection.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  watch(
    collectionIdOrName,
    () => {
      void loadCollection();
    },
    { immediate: true },
  );

  return {
    collection,
    isLoading,
    loadError,
    loadCollection,
  };
}

export type UseCollectionDetail = UseCollectionDetailReturn;
