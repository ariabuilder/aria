import { computed, ref } from "vue";
import { resolveActiveChatInference } from "../../lib/chatInference";
import { buildSessionModelOverride } from "../../lib/sessionSettings";
import {
  resolveEffectiveModelForBackend,
} from "../../lib/inferenceSelection";
import {
  AgentSessionPrefsSchema,
  DEFAULT_AGENT_SESSION_PREFS,
  parseAgentSessionPrefs,
  type AgentAvailability,
  type AgentComposerMode,
  type AgentSessionModelOverride,
  type AgentSessionPrefs,
  type AgentSettings,
  type InferenceBackendId,
} from "../../lib/schemas";

const STORAGE_KEY = "aria-engineer-session";

function readStoredPrefs(): AgentSessionPrefs {
  if (typeof window === "undefined") {
    return DEFAULT_AGENT_SESSION_PREFS;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_AGENT_SESSION_PREFS;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return parseAgentSessionPrefs(parsed);
  } catch {
    return DEFAULT_AGENT_SESSION_PREFS;
  }
}

function writeStoredPrefs(prefs: AgentSessionPrefs): void {
  const parsed = AgentSessionPrefsSchema.parse(prefs);
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
}

const prefs = ref<AgentSessionPrefs>(readStoredPrefs());

export function useAgentSessionPrefs() {
  const composerMode = computed(() => prefs.value.composerMode);

  function resolveEffectiveSelection(
    siteSettings: AgentSettings,
    availability: AgentAvailability,
  ): { provider: InferenceBackendId; modelId: string } {
    return resolveActiveChatInference({
      siteSettings,
      availability,
      sessionOverride: {
        inferenceProvider: prefs.value.inferenceProvider,
        modelId: prefs.value.modelId,
      },
    });
  }

  const sessionModelOverride = computed((): AgentSessionModelOverride | undefined => {
    return buildSessionModelOverride({
      inferenceProvider: prefs.value.inferenceProvider,
      modelId: prefs.value.modelId,
    });
  });

  function persist(next: AgentSessionPrefs): void {
    const parsed = AgentSessionPrefsSchema.parse(next);
    prefs.value = parsed;
    writeStoredPrefs(parsed);
  }

  function setComposerMode(mode: AgentComposerMode): void {
    persist({
      ...prefs.value,
      composerMode: mode,
    });
  }

  function setModelSelection(
    provider: InferenceBackendId,
    modelId: string,
  ): void {
    persist({
      ...prefs.value,
      inferenceProvider: provider,
      modelId: modelId.trim(),
    });
  }

  function resetToSiteDefaults(): void {
    persist({
      composerMode: prefs.value.composerMode,
    });
  }

  function resolveSessionModelForRequest(
    siteSettings: AgentSettings,
    availability: AgentAvailability,
  ): AgentSessionModelOverride | undefined {
    const active = resolveEffectiveSelection(siteSettings, availability);
    const siteDefault = siteSettings.inference.default;

    return buildSessionModelOverride({
      inferenceProvider: active.provider,
      modelId: active.modelId,
      siteInferenceProvider: siteDefault
        ? siteSettings.inference.providerInstances[siteDefault.instanceId]
            ?.backend
        : undefined,
      siteModelId: siteDefault?.modelId,
    });
  }

  function resolveActiveInferenceProvider(
    siteSettings: AgentSettings,
    availability: AgentAvailability,
  ): InferenceBackendId {
    return resolveEffectiveSelection(siteSettings, availability).provider;
  }

  function resolveEffectiveModelId(
    siteSettings: AgentSettings,
    provider: InferenceBackendId,
  ): string | undefined {
    return resolveEffectiveModelForBackend(
      siteSettings,
      provider,
      prefs.value.inferenceProvider === provider
        ? prefs.value.modelId
        : undefined,
    );
  }

  return {
    prefs,
    composerMode,
    sessionModelOverride,
    setComposerMode,
    setModelSelection,
    resetToSiteDefaults,
    resolveSessionModelForRequest,
    resolveActiveInferenceProvider,
    resolveEffectiveSelection,
    resolveEffectiveModelId,
  };
}

export type AgentSessionPrefsController = ReturnType<
  typeof useAgentSessionPrefs
>;
