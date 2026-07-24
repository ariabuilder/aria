import { ref } from "vue";
import { actions } from "astro:actions";
import { unwrapCatalogModelsPayload } from "./agentActionResults";
import {
  catalogModelId,
  type OpencodePlan,
} from "../../lib/inference/opencodeProviders";
import type { CatalogModel } from "../../lib/schemas";

const modelsByPlan = ref<Record<OpencodePlan, CatalogModel[]>>({
  zen: [],
  go: [],
});
const isLoading = ref(false);
const error = ref<string | null>(null);
const lastFetchedAt: Record<OpencodePlan, number> = { zen: 0, go: 0 };

export function useOpencodeModels() {
  async function refreshPlan(
    plan: OpencodePlan,
    force = false,
  ): Promise<CatalogModel[]> {
    const now = Date.now();
    if (
      !force &&
      modelsByPlan.value[plan].length > 0 &&
      now - lastFetchedAt[plan] < 5 * 60_000
    ) {
      return modelsByPlan.value[plan];
    }

    const { data, error: actionError } = await actions.agent.listOpencodeModels(
      { plan },
    );
    if (actionError) {
      throw actionError;
    }
    const payload = unwrapCatalogModelsPayload(data);
    modelsByPlan.value = {
      ...modelsByPlan.value,
      [plan]: payload.models,
    };
    lastFetchedAt[plan] = now;
    return modelsByPlan.value[plan];
  }

  async function refreshPlanSafe(
    plan: OpencodePlan,
    force = false,
  ): Promise<CatalogModel[]> {
    try {
      return await refreshPlan(plan, force);
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to load OpenCode models";
      return [];
    }
  }

  async function refreshAll(force = false): Promise<CatalogModel[]> {
    isLoading.value = true;
    error.value = null;
    try {
      const [zen, go] = await Promise.all([
        refreshPlanSafe("zen", force),
        refreshPlanSafe("go", force),
      ]);
      if (zen.length === 0 && go.length === 0 && !error.value) {
        error.value = "No OpenCode models returned for Zen or Go.";
      }
      return allModels();
    } finally {
      isLoading.value = false;
    }
  }

  function allModels(): CatalogModel[] {
    const merged = [
      ...modelsByPlan.value.zen.map((model) => ({
        id: catalogModelId("zen", model.id),
        name: model.name,
      })),
      ...modelsByPlan.value.go.map((model) => ({
        id: catalogModelId("go", model.id),
        name: model.name,
      })),
    ];
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }

  function modelsForPlan(plan: OpencodePlan): CatalogModel[] {
    if (plan === "go") {
      return modelsByPlan.value.go.map((model) => ({
        id: catalogModelId("go", model.id),
        name: model.name,
      }));
    }

    return modelsByPlan.value.zen.map((model) => ({
      id: catalogModelId("zen", model.id),
      name: model.name,
    }));
  }

  return {
    isLoading,
    error,
    refreshAll,
    refreshPlan: refreshPlanSafe,
    allModels,
    modelsForPlan,
  };
}
