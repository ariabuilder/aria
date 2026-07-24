import { ref } from "vue";
import { actions } from "astro:actions";
import { unwrapCatalogModelsPayload } from "./agentActionResults";
import type { CatalogModel } from "../../lib/schemas";

const models = ref<CatalogModel[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
let lastFetchedAt = 0;

export function useWorkersAiModels() {
  async function refresh(force = false): Promise<CatalogModel[]> {
    const now = Date.now();
    if (!force && models.value.length > 0 && now - lastFetchedAt < 5 * 60_000) {
      return models.value;
    }

    isLoading.value = true;
    error.value = null;
    try {
      const { data, error: actionError } =
        await actions.agent.listWorkersAiModels({});
      if (actionError) {
        throw actionError;
      }
      const payload = unwrapCatalogModelsPayload(data);
      models.value = payload.models;
      lastFetchedAt = now;
      return models.value;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to load Workers AI models";
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  return {
    models,
    isLoading,
    error,
    refresh,
  };
}
