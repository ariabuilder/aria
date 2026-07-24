import {
  CREDENTIAL_BACKEND_IDS,
  inferenceBackendsAvailableOnPlatform,
} from "./inferenceProviders";
import {
  getProviderDefaultModelId,
  getProviderState,
} from "./inference/inferenceHelpers";
import type {
  AgentAvailability,
  AgentSessionModelOverride,
  AgentSettings,
  ConfiguredBackends,
  InferenceBackendId,
} from "./schemas";

export interface EnabledChatModel {
  provider: InferenceBackendId;
  modelId: string;
  label: string;
}

export interface ResolvedInferenceSelection {
  instanceId: string;
  provider: InferenceBackendId;
  modelId: string;
}

export {
  isProviderEnabled as isInferenceProviderActive,
  isProviderListed as isInferenceProviderListed,
} from "./inference/inferenceHelpers";

function isCredentialBackendConfigured(
  backendId: InferenceBackendId,
  configuredBackends: ConfiguredBackends,
): boolean {
  if (backendId === "workers_ai") {
    return true;
  }

  return configuredBackends[backendId] === true;
}

function getEffectiveEnabledModelIds(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): string[] {
  const state = getProviderState(settings, backendId);
  if (!state) {
    return [];
  }

  return state.enabledModelIds;
}

function isBackendReady(input: {
  settings: AgentSettings;
  platform: AgentAvailability["platform"];
  backendId: InferenceBackendId;
  workersAiAvailable: boolean;
  configuredBackends: ConfiguredBackends;
  sessionModelId?: string;
}): boolean {
  const state = getProviderState(input.settings, input.backendId);
  if (!state?.enabled) {
    return false;
  }

  if (input.backendId === "workers_ai") {
    if (input.platform !== "cloudflare" || !input.workersAiAvailable) {
      return false;
    }
  } else if (
    !isCredentialBackendConfigured(input.backendId, input.configuredBackends)
  ) {
    return false;
  }

  if (state.enabledModelIds.length === 0) {
    return false;
  }

  const enabledModelIds = getEffectiveEnabledModelIds(
    input.settings,
    input.backendId,
  );
  if (enabledModelIds.length === 0) {
    return false;
  }

  const defaultModelId = getProviderDefaultModelId(
    input.settings,
    input.backendId,
  );
  const session = input.sessionModelId?.trim();
  const modelId =
    (session && enabledModelIds.includes(session) ? session : undefined) ??
    (defaultModelId && enabledModelIds.includes(defaultModelId)
      ? defaultModelId
      : undefined) ??
    enabledModelIds[0]?.trim();

  return Boolean(modelId && enabledModelIds.includes(modelId));
}

export function listReadyInferenceBackends(input: {
  settings: AgentSettings;
  platform: AgentAvailability["platform"];
  workersAiAvailable: boolean;
  configuredBackends: ConfiguredBackends;
  sessionProvider?: InferenceBackendId;
  sessionModelId?: string;
}): InferenceBackendId[] {
  const backends = inferenceBackendsAvailableOnPlatform(input.platform).map(
    (backend) => backend.id,
  );

  return backends.filter((backendId) => {
    const sessionModelId =
      input.sessionProvider === backendId ? input.sessionModelId : undefined;

    return isBackendReady({
      settings: input.settings,
      platform: input.platform,
      backendId,
      workersAiAvailable: input.workersAiAvailable,
      configuredBackends: input.configuredBackends,
      sessionModelId,
    });
  });
}

export function listEnabledChatModels(
  settings: AgentSettings,
  labels?: Partial<Record<string, string>>,
): EnabledChatModel[] {
  const models: EnabledChatModel[] = [];

  for (const state of Object.values(settings.inference.providerInstances)) {
    if (!state.enabled) {
      continue;
    }
    const backendId = state.backend;

    for (const modelId of getEffectiveEnabledModelIds(settings, backendId)) {
      models.push({
        provider: backendId,
        modelId,
        label: labels?.[`${backendId}:${modelId}`] ?? modelId,
      });
    }
  }

  return models;
}

export function resolveEffectiveModelForBackend(
  settings: AgentSettings,
  backendId: InferenceBackendId,
  sessionModelId?: string,
): string | undefined {
  const enabledModelIds = getEffectiveEnabledModelIds(settings, backendId);
  const session = sessionModelId?.trim();
  if (session && enabledModelIds.includes(session)) {
    return session;
  }

  const defaultModelId = getProviderDefaultModelId(settings, backendId);
  if (defaultModelId && enabledModelIds.includes(defaultModelId)) {
    return defaultModelId;
  }

  return enabledModelIds[0]?.trim();
}

export function resolveRequestInference(input: {
  settings: AgentSettings;
  platform: AgentAvailability["platform"];
  workersAiAvailable: boolean;
  configuredBackends: ConfiguredBackends;
  sessionOverride?: AgentSessionModelOverride;
}): ResolvedInferenceSelection | undefined {
  const ready = listReadyInferenceBackends({
    settings: input.settings,
    platform: input.platform,
    workersAiAvailable: input.workersAiAvailable,
    configuredBackends: input.configuredBackends,
    sessionProvider: input.sessionOverride?.inferenceProvider,
    sessionModelId: input.sessionOverride?.modelId,
  });

  if (ready.length === 0) {
    return undefined;
  }

  const sessionProvider = input.sessionOverride?.inferenceProvider;
  const sessionModelId = input.sessionOverride?.modelId?.trim();

  if (sessionProvider && ready.includes(sessionProvider)) {
    const modelId = resolveEffectiveModelForBackend(
      input.settings,
      sessionProvider,
      sessionModelId,
    );
    if (modelId) {
      const instance = getProviderState(input.settings, sessionProvider);
      if (instance) {
        return { instanceId: instance.id, provider: sessionProvider, modelId };
      }
    }
  }

  const siteDefault = input.settings.inference.default;
  if (siteDefault) {
    const siteDefaultInstance =
      input.settings.inference.providerInstances[siteDefault.instanceId];
    const siteDefaultProvider = siteDefaultInstance?.backend;
    if (siteDefaultProvider && ready.includes(siteDefaultProvider)) {
      const modelId = resolveEffectiveModelForBackend(
        input.settings,
        siteDefaultProvider,
        sessionProvider === siteDefaultProvider
          ? sessionModelId
          : siteDefault.modelId,
      );
      if (modelId) {
        return {
          instanceId: siteDefaultInstance.id,
          provider: siteDefaultProvider,
          modelId,
        };
      }
    }
  }

  const fallbackProvider = ready[0]!;
  const modelId = resolveEffectiveModelForBackend(
    input.settings,
    fallbackProvider,
    sessionProvider === fallbackProvider ? sessionModelId : undefined,
  );

  if (!modelId) {
    return undefined;
  }

  const fallbackInstance = getProviderState(input.settings, fallbackProvider);
  return fallbackInstance
    ? { instanceId: fallbackInstance.id, provider: fallbackProvider, modelId }
    : undefined;
}

export function assertModelAllowed(
  settings: AgentSettings,
  provider: InferenceBackendId,
  modelId: string,
): void {
  const normalizedId = modelId.trim();
  const effectiveIds = getEffectiveEnabledModelIds(settings, provider);
  if (!effectiveIds.includes(normalizedId)) {
    throw new Error(`Model ${modelId} is not enabled for ${provider}`);
  }
}

export function canUseChatInference(input: {
  settings: AgentSettings;
  platform: AgentAvailability["platform"];
  workersAiAvailable: boolean;
  configuredBackends: ConfiguredBackends;
}): boolean {
  return (
    listReadyInferenceBackends({
      settings: input.settings,
      platform: input.platform,
      workersAiAvailable: input.workersAiAvailable,
      configuredBackends: input.configuredBackends,
    }).length > 0
  );
}

export function isAnyCredentialBackendConfigured(
  configuredBackends: ConfiguredBackends,
): boolean {
  return CREDENTIAL_BACKEND_IDS.some(
    (backend) => configuredBackends[backend] === true,
  );
}

/** @deprecated Use listReadyInferenceBackends */
export function listReadyInferenceProviders(input: {
  settings: AgentSettings;
  platform: AgentAvailability["platform"];
  workersAiAvailable: boolean;
  byokConfigured: boolean;
}): InferenceBackendId[] {
  const configuredBackends: ConfiguredBackends = {
    opencode: input.byokConfigured,
    openai: input.byokConfigured,
    anthropic: input.byokConfigured,
    google: input.byokConfigured,
    openrouter: input.byokConfigured,
    openai_compatible: input.byokConfigured,
  };

  return listReadyInferenceBackends({
    settings: input.settings,
    platform: input.platform,
    workersAiAvailable: input.workersAiAvailable,
    configuredBackends,
  });
}

/** @deprecated Use resolveRequestInference */
export function resolveRequestInferenceProvider(input: {
  settings: AgentSettings;
  platform: AgentAvailability["platform"];
  workersAiAvailable: boolean;
  byokConfigured: boolean;
  sessionOverride?: AgentSessionModelOverride;
}): InferenceBackendId | undefined {
  const configuredBackends: ConfiguredBackends = {
    opencode: input.byokConfigured,
    openai: input.byokConfigured,
    anthropic: input.byokConfigured,
    google: input.byokConfigured,
    openrouter: input.byokConfigured,
    openai_compatible: input.byokConfigured,
  };

  return resolveRequestInference({
    settings: input.settings,
    platform: input.platform,
    workersAiAvailable: input.workersAiAvailable,
    configuredBackends,
    sessionOverride: input.sessionOverride,
  })?.provider;
}
