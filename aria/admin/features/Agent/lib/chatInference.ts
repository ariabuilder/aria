import {
  listReadyInferenceBackends,
  resolveRequestInference,
} from "./inferenceSelection";
import type {
  AgentAvailability,
  AgentSessionModelOverride,
  AgentSettings,
  InferenceBackendId,
} from "./schemas";

export {
  canUseChatInference,
  isInferenceProviderActive,
  isInferenceProviderListed,
  listEnabledChatModels,
  listReadyInferenceBackends,
  resolveRequestInference,
} from "./inferenceSelection";

export function listAvailableChatInferenceModes(input: {
  platform: AgentAvailability["platform"];
  siteSettings: AgentSettings;
  workersAiAvailable: boolean;
  configuredBackends: AgentAvailability["configuredBackends"];
  sessionProvider?: InferenceBackendId;
  sessionModelId?: string;
}): InferenceBackendId[] {
  return listReadyInferenceBackends({
    settings: input.siteSettings,
    platform: input.platform,
    workersAiAvailable: input.workersAiAvailable,
    configuredBackends: input.configuredBackends,
    sessionProvider: input.sessionProvider,
    sessionModelId: input.sessionModelId,
  });
}

export function resolveActiveChatInference(input: {
  siteSettings: AgentSettings;
  availability: AgentAvailability;
  sessionOverride?: AgentSessionModelOverride;
}): { provider: InferenceBackendId; modelId: string } {
  const resolved = resolveRequestInference({
    settings: input.siteSettings,
    platform: input.availability.platform,
    workersAiAvailable: input.availability.workersAiAvailable,
    configuredBackends: input.availability.configuredBackends,
    sessionOverride: input.sessionOverride,
  });

  if (resolved) {
    return resolved;
  }

  const siteDefault = input.siteSettings.inference.default;
  if (siteDefault) {
    const provider =
      input.siteSettings.inference.providerInstances[siteDefault.instanceId]
        ?.backend;
    if (provider) {
      return {
        provider,
        modelId: siteDefault.modelId,
      };
    }
  }

  return {
    provider: "workers_ai",
    modelId: "@cf/meta/llama-3.2-3b-instruct",
  };
}
