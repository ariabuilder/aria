import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { useSiteSettings } from "@/composables/useSiteSettings";
import {
  isBackendListed,
  isInstanceEnabled,
} from "../../lib/inference/inferenceHelpers";
import {
  buildInitialProviderInstance,
  getInferenceBackendDefinition,
} from "../../lib/inferenceProviders";
import {
  mergeAgentSettings,
  parseAgentSettings,
  type AgentSettings,
  type AgentSettingsPatch,
  type InferenceBackendId,
} from "../../lib/schemas";
import { coerceSettingsActionData } from "@/composables/settingsActionResults";

const isSaving = ref(false);
const error = ref<string | null>(null);
let saveChain: Promise<void> = Promise.resolve();
let pendingSaveCount = 0;

export function useAgentSettings() {
  const { settings, loadSettings, applySettingsActionResult } =
    useSiteSettings();

  const agentSettings = computed<AgentSettings>(() =>
    mergeAgentSettings(settings.value?.agent, {}),
  );

  function syncAgentSettingsFromServer(data: unknown): void {
    const payload = coerceSettingsActionData(data);
    applySettingsActionResult({
      ...payload,
      agent: payload.agent
        ? parseAgentSettings(payload.agent)
        : settings.value?.agent,
    });
  }

  async function updateAgentSettings(patch: AgentSettingsPatch): Promise<void> {
    const run = async (): Promise<void> => {
      error.value = null;
      try {
        const { data, error: actionError } =
          await actions.settings.updateAgent(patch);
        if (actionError) throw actionError;
        syncAgentSettingsFromServer(data);
      } catch (err) {
        error.value =
          err instanceof Error ? err.message : "Failed to save agent settings";
        throw error.value;
      } finally {
        pendingSaveCount = Math.max(0, pendingSaveCount - 1);
        if (pendingSaveCount === 0) {
          isSaving.value = false;
        }
      }
    };

    pendingSaveCount += 1;
    isSaving.value = true;
    const next = saveChain.then(run, run);
    saveChain = next.catch(() => undefined);
    await next;
  }

  async function createProviderInstance(
    backendId: InferenceBackendId,
  ): Promise<string> {
    const definition = getInferenceBackendDefinition(backendId);
    const existingCount = Object.values(
      agentSettings.value.inference.providerInstances,
    ).filter((inst) => inst.backend === backendId).length;
    const label =
      existingCount > 0
        ? `${definition.label} ${existingCount + 1}`
        : definition.label;

    const instance = buildInitialProviderInstance(backendId, label);

    const patch: AgentSettingsPatch = {
      inference: {
        providerInstances: {
          [instance.id]: instance,
        },
      },
    };

    if (!agentSettings.value.inference.default) {
      patch.inference!.default = {
        instanceId: instance.id,
        modelId: instance.defaultModelId || instance.enabledModelIds[0] || "",
      };
    }

    await updateAgentSettings(patch);
    return instance.id;
  }

  async function disableProviderInstance(instanceId: string): Promise<void> {
    const inst = agentSettings.value.inference.providerInstances[instanceId];
    if (!inst?.enabled) return;

    await updateAgentSettings({
      inference: {
        providerInstances: {
          [instanceId]: { ...inst, enabled: false },
        },
      },
    });
  }

  async function removeProviderInstance(instanceId: string): Promise<void> {
    await updateAgentSettings({
      inference: {
        providerInstances: {
          [instanceId]: null,
        },
      },
    });
  }

  async function setSiteDefaultInference(
    instanceId: string,
    modelId: string,
  ): Promise<void> {
    if (!isInstanceEnabled(agentSettings.value, instanceId)) return;

    await updateAgentSettings({
      inference: {
        default: { instanceId, modelId },
      },
    });
  }

  async function updateProviderInstance(
    instanceId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const current = agentSettings.value.inference.providerInstances[instanceId];
    if (!current) return;

    await updateAgentSettings({
      inference: {
        providerInstances: {
          [instanceId]: { ...current, ...patch },
        },
      },
    });
  }

  async function toggleInstanceModel(
    instanceId: string,
    modelId: string,
    enabled: boolean,
  ): Promise<void> {
    const current = agentSettings.value.inference.providerInstances[instanceId];
    if (!current) return;

    const normalizedId = modelId.trim();
    let enabledModelIds = [...current.enabledModelIds];
    if (enabled) {
      if (!enabledModelIds.includes(normalizedId)) {
        enabledModelIds.push(normalizedId);
      }
    } else {
      enabledModelIds = enabledModelIds.filter((id) => id !== normalizedId);
    }

    let defaultModelId = current.defaultModelId;
    if (
      defaultModelId === normalizedId &&
      !enabledModelIds.includes(normalizedId)
    ) {
      defaultModelId = enabledModelIds[0];
    }
    if (!defaultModelId && enabledModelIds[0]) {
      defaultModelId = enabledModelIds[0];
    }

    const inferencePatch: AgentSettingsPatch = {
      inference: {
        providerInstances: {
          [instanceId]: {
            ...current,
            enabledModelIds,
            defaultModelId,
          },
        },
      },
    };

    const siteDefault = agentSettings.value.inference.default;
    if (
      siteDefault?.instanceId === instanceId &&
      siteDefault.modelId === normalizedId &&
      !enabled
    ) {
      if (enabledModelIds[0]) {
        inferencePatch.inference!.default = {
          instanceId,
          modelId: enabledModelIds[0],
        };
      } else {
        inferencePatch.inference!.default = null;
      }
    }

    await updateAgentSettings(inferencePatch);
  }

  async function setInstanceDefaultModel(
    instanceId: string,
    modelId: string,
  ): Promise<void> {
    const current = agentSettings.value.inference.providerInstances[instanceId];
    if (!current) return;

    const normalizedId = modelId.trim();
    const enabledModelIds = current.enabledModelIds.includes(normalizedId)
      ? current.enabledModelIds
      : [...current.enabledModelIds, normalizedId];

    await updateAgentSettings({
      inference: {
        providerInstances: {
          [instanceId]: {
            ...current,
            defaultModelId: normalizedId,
            enabledModelIds,
          },
        },
      },
    });
  }

  return {
    agentSettings,
    isSaving,
    error,
    loadSettings,
    updateAgentSettings,
    isInferenceProviderListed: (
      settings: AgentSettings,
      backendId: InferenceBackendId,
      platform: "cloudflare" | "local",
    ) => {
      if (
        getInferenceBackendDefinition(backendId).cloudflareOnly &&
        platform !== "cloudflare"
      ) {
        return false;
      }
      return isBackendListed(settings, backendId);
    },
    createProviderInstance,
    disableProviderInstance,
    removeProviderInstance,
    setSiteDefaultInference,
    updateProviderInstance,
    toggleInstanceModel,
    setInstanceDefaultModel,
  };
}
