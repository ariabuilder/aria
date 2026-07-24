import type {
  AgentSettings,
  InferenceBackendId,
  ProviderInstance,
} from "../schemas";

export function getProviderInstance(
  settings: AgentSettings,
  instanceId: string,
): ProviderInstance | undefined {
  return settings.inference.providerInstances[instanceId];
}

export function getInstancesForBackend(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): ProviderInstance[] {
  return Object.values(settings.inference.providerInstances).filter(
    (inst) => inst.backend === backendId,
  );
}

export function getDefaultInstance(
  settings: AgentSettings,
): ProviderInstance | undefined {
  const def = settings.inference.default;
  if (!def) return undefined;
  return settings.inference.providerInstances[def.instanceId];
}

export function isBackendListed(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): boolean {
  return getInstancesForBackend(settings, backendId).length > 0;
}

export function isInstanceEnabled(
  settings: AgentSettings,
  instanceId: string,
): boolean {
  return getProviderInstance(settings, instanceId)?.enabled === true;
}

export function isModelEnabled(
  settings: AgentSettings,
  instanceId: string,
  modelId: string,
): boolean {
  const inst = getProviderInstance(settings, instanceId);
  if (!inst) return false;
  return inst.enabledModelIds.includes(modelId.trim());
}

export function getInstanceDefaultModelId(
  settings: AgentSettings,
  instanceId: string,
): string | undefined {
  const modelId = getProviderInstance(
    settings,
    instanceId,
  )?.defaultModelId?.trim();
  return modelId || undefined;
}

export function countEnabledModels(
  settings: AgentSettings,
  instanceId: string,
): number {
  return getProviderInstance(settings, instanceId)?.enabledModelIds.length ?? 0;
}

export function isSiteDefaultInference(
  settings: AgentSettings,
  instanceId: string,
  modelId?: string,
): boolean {
  const siteDefault = settings.inference.default;
  if (!siteDefault) return false;
  if (siteDefault.instanceId !== instanceId) return false;
  if (modelId !== undefined) {
    return siteDefault.modelId === modelId;
  }
  return true;
}

// Backward-compatible re-exports for files still migrating to instances.
// Each returns the first matching instance for the given backend.
function firstInstance(settings: AgentSettings, backendId: InferenceBackendId) {
  return (
    Object.values(settings.inference.providerInstances).find(
      (inst) => inst.backend === backendId,
    ) ?? null
  );
}

export function getProviderState(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): ProviderInstance | undefined {
  return firstInstance(settings, backendId) ?? undefined;
}

export function isProviderListed(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): boolean {
  return firstInstance(settings, backendId) !== null;
}

export function isProviderEnabled(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): boolean {
  return firstInstance(settings, backendId)?.enabled === true;
}

export function getProviderDefaultModelId(
  settings: AgentSettings,
  backendId: InferenceBackendId,
): string | undefined {
  return firstInstance(settings, backendId)?.defaultModelId ?? undefined;
}
