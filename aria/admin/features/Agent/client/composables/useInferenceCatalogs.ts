import { type Ref } from "vue";
import {
  getInferenceBackendDefinition,
  INFERENCE_BACKEND_DEFINITIONS,
  type InferenceBackendDefinition,
} from "../../lib/inferenceProviders";
import { mergeCatalogModels } from "../../lib/inference/catalogMerge";
import { getProviderState } from "../../lib/inference/inferenceHelpers";
import {
  opencodeModelDisplayName,
  stripOpencodeModelPrefix,
} from "../../lib/inference/opencodeProviders";
import type {
  AgentPlatform,
  AgentSettings,
  CatalogModel,
  InferenceBackendId,
} from "../../lib/schemas";
import { useWorkersAiModels } from "./useWorkersAiModels";
import { useOpencodeModels } from "./useOpencodeModels";
import { useOpenAiModels } from "./useOpenAiModels";
import { useAnthropicModels } from "./useAnthropicModels";
import { useGoogleModels } from "./useGoogleModels";
import { useOpenRouterModels } from "./useOpenRouterModels";
import type { AgentAvailability } from "../../lib/schemas";

type AvailabilityRef = Ref<AgentAvailability | null>;

function fallbackCatalogModels(
  backendId: InferenceBackendId,
  settings: AgentSettings,
): CatalogModel[] {
  const definition = getInferenceBackendDefinition(backendId);
  const state = getProviderState(settings, backendId);
  const ids = new Set<string>([
    ...definition.seedModelIds,
    ...(state?.enabledModelIds ?? []),
    ...(state?.defaultModelId ? [state.defaultModelId] : []),
  ]);

  return Array.from(ids)
    .filter(Boolean)
    .map((id) => ({
      id,
      name:
        backendId === "opencode"
          ? opencodeModelDisplayName(stripOpencodeModelPrefix(id))
          : id,
    }));
}

function isBackendListed(
  settings: AgentSettings,
  backendId: InferenceBackendId,
  platform: AgentPlatform,
  isListed: (
    settings: AgentSettings,
    backendId: InferenceBackendId,
    platform: AgentPlatform,
  ) => boolean,
): boolean {
  return isListed(settings, backendId, platform);
}

function isBackendReadyForCatalog(
  backendId: InferenceBackendId,
  platform: AgentPlatform,
  availability: AgentAvailability | null,
  definition: InferenceBackendDefinition,
): boolean {
  if (definition.cloudflareOnly && platform !== "cloudflare") {
    return false;
  }

  if (!definition.requiresCredentials) {
    return platform === "cloudflare";
  }

  if (backendId === "openai_compatible") {
    return availability?.configuredBackends.openai_compatible === true;
  }

  return availability?.configuredBackends[backendId] === true;
}

export function useInferenceCatalogs(input: {
  platform: Ref<AgentPlatform>;
  form: Ref<AgentSettings>;
  availability: AvailabilityRef;
  isInferenceProviderListed: (
    settings: AgentSettings,
    backendId: InferenceBackendId,
    platform: AgentPlatform,
  ) => boolean;
}) {
  const workersAi = useWorkersAiModels();
  const opencodeModels = useOpencodeModels();
  const openAiModels = useOpenAiModels();
  const anthropicModels = useAnthropicModels();
  const googleModels = useGoogleModels();
  const openRouterModels = useOpenRouterModels();

  function canRefreshBackend(backendId: InferenceBackendId): boolean {
    const definition = getInferenceBackendDefinition(backendId);
    if (
      !isBackendListed(
        input.form.value,
        backendId,
        input.platform.value,
        input.isInferenceProviderListed,
      )
    ) {
      return false;
    }

    return isBackendReadyForCatalog(
      backendId,
      input.platform.value,
      input.availability.value,
      definition,
    );
  }

  function needsCredentialsForCatalog(backendId: InferenceBackendId): boolean {
    const definition = getInferenceBackendDefinition(backendId);
    if (!definition.requiresCredentials) {
      return false;
    }

    if (
      !isBackendListed(
        input.form.value,
        backendId,
        input.platform.value,
        input.isInferenceProviderListed,
      )
    ) {
      return false;
    }

    return !isBackendReadyForCatalog(
      backendId,
      input.platform.value,
      input.availability.value,
      definition,
    );
  }

  function catalogErrorForBackend(
    backendId: InferenceBackendId,
  ): string | null {
    if (backendId === "workers_ai") {
      if (input.platform.value !== "cloudflare") {
        return "Workers AI catalog requires Cloudflare runtime.";
      }
      return workersAi.error.value;
    }
    if (backendId === "opencode") {
      return opencodeModels.error.value;
    }
    if (backendId === "openai") {
      return openAiModels.error.value;
    }
    if (backendId === "anthropic") {
      return anthropicModels.error.value;
    }
    if (backendId === "google") {
      return googleModels.error.value;
    }
    if (backendId === "openrouter") {
      return openRouterModels.error.value;
    }
    return null;
  }

  function catalogLoadingForBackend(backendId: InferenceBackendId): boolean {
    if (backendId === "workers_ai") {
      return workersAi.isLoading.value;
    }
    if (backendId === "opencode") {
      return opencodeModels.isLoading.value;
    }
    if (backendId === "openai") {
      return openAiModels.isLoading.value;
    }
    if (backendId === "anthropic") {
      return anthropicModels.isLoading.value;
    }
    if (backendId === "google") {
      return googleModels.isLoading.value;
    }
    if (backendId === "openrouter") {
      return openRouterModels.isLoading.value;
    }
    return false;
  }

  function catalogForBackend(backendId: InferenceBackendId): CatalogModel[] {
    if (backendId === "workers_ai") {
      return mergeCatalogModels(
        workersAi.models.value,
        fallbackCatalogModels(backendId, input.form.value),
      );
    }

    if (backendId === "opencode") {
      return mergeCatalogModels(
        opencodeModels.allModels(),
        fallbackCatalogModels(backendId, input.form.value),
      );
    }

    if (backendId === "openai") {
      return mergeCatalogModels(
        openAiModels.models.value,
        fallbackCatalogModels(backendId, input.form.value),
      );
    }

    if (backendId === "anthropic") {
      return mergeCatalogModels(
        anthropicModels.models.value,
        fallbackCatalogModels(backendId, input.form.value),
      );
    }

    if (backendId === "google") {
      return mergeCatalogModels(
        googleModels.models.value,
        fallbackCatalogModels(backendId, input.form.value),
      );
    }

    if (backendId === "openrouter") {
      return mergeCatalogModels(
        openRouterModels.models.value,
        fallbackCatalogModels(backendId, input.form.value),
      );
    }

    return fallbackCatalogModels(backendId, input.form.value);
  }

  async function refreshCatalogForBackend(
    backendId: InferenceBackendId,
    force = false,
  ): Promise<void> {
    if (!canRefreshBackend(backendId)) {
      return;
    }

    if (backendId === "workers_ai") {
      await workersAi.refresh(force);
      return;
    }

    if (backendId === "opencode") {
      await opencodeModels.refreshAll(force);
      return;
    }

    if (backendId === "openai") {
      await openAiModels.refresh(force);
      return;
    }

    if (backendId === "anthropic") {
      await anthropicModels.refresh(force);
      return;
    }

    if (backendId === "google") {
      await googleModels.refresh(force);
      return;
    }

    if (backendId === "openrouter") {
      await openRouterModels.refresh(force);
    }
  }

  async function refreshListedCatalogs(force = false): Promise<void> {
    await Promise.all(
      INFERENCE_BACKEND_DEFINITIONS.map((definition) =>
        refreshCatalogForBackend(definition.id, force),
      ),
    );
  }

  return {
    catalogForBackend,
    catalogLoadingForBackend,
    catalogErrorForBackend,
    needsCredentialsForCatalog,
    canRefreshBackend,
    refreshCatalogForBackend,
    refreshListedCatalogs,
  };
}
