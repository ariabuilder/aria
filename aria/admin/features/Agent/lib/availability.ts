import type { SessionUser } from "../../../../lib/auth/types";
import { hasEffectiveCapability } from "../../../../lib/auth/hasEffectiveCapability";
import type { SiteSettings } from "../../../../lib/storage/adapter";
import { resolveRequestInference } from "./inferenceSelection";
import {
  AgentAvailabilitySchema,
  DEFAULT_AGENT_SETTINGS,
  hasEnabledInferenceProvider,
  mergeAgentSettings,
  type AgentAvailability,
  type AgentPlatform,
  type ConfiguredBackends,
} from "./schemas";

export interface ResolveAgentAvailabilityInput {
  platform: AgentPlatform;
  featureEnabled: boolean;
  user: SessionUser | null | undefined;
  siteSettings: SiteSettings | null | undefined;
  workersAiBindingPresent: boolean;
  configuredBackends: ConfiguredBackends;
  durableAgentAvailable: boolean;
}

function resolveEffectiveInferenceBackend(input: {
  platform: AgentPlatform;
  settings: ReturnType<typeof mergeAgentSettings>;
  workersAiBindingPresent: boolean;
  configuredBackends: ConfiguredBackends;
}): AgentAvailability["effectiveInferenceBackend"] {
  const resolved = resolveRequestInference({
    settings: input.settings,
    platform: input.platform,
    workersAiAvailable: input.workersAiBindingPresent,
    configuredBackends: input.configuredBackends,
  });

  return resolved?.provider ?? "unavailable";
}

export function resolveAgentAvailability(
  input: ResolveAgentAvailabilityInput,
): AgentAvailability {
  if (!input.featureEnabled) {
    return AgentAvailabilitySchema.parse({
      canUseStudioAgent: false,
      canShowAgentShell: false,
      platform: input.platform,
      siteEnabled: false,
      mcpEnabled: false,
      durableAgentAvailable: input.durableAgentAvailable,
      workersAiAvailable: input.workersAiBindingPresent,
      configuredBackends: input.configuredBackends,
      effectiveInferenceBackend: "unavailable",
      reason: "feature_off",
    });
  }

  const agentSettings = mergeAgentSettings(
    input.siteSettings?.agent,
    {},
  );

  // Provider instances are the source of truth for whether the agent is
  // active. Adding a provider enables the agent; removing or deactivating
  // every provider disables it.
  const siteEnabled = hasEnabledInferenceProvider(agentSettings);
  const mcpEnabled = agentSettings.mcpEnabled && siteEnabled;

  if (!input.user) {
    return AgentAvailabilitySchema.parse({
      canUseStudioAgent: false,
      canShowAgentShell: false,
      platform: input.platform,
      siteEnabled,
      mcpEnabled,
      durableAgentAvailable: input.durableAgentAvailable,
      workersAiAvailable: input.workersAiBindingPresent,
      configuredBackends: input.configuredBackends,
      effectiveInferenceBackend: "unavailable",
      reason: "unauthenticated",
    });
  }

  const canUseStudioAgent = hasEffectiveCapability(input.user, "useStudioAgent");
  const canShowAgentShell =
    canUseStudioAgent || hasEffectiveCapability(input.user, "viewAgentSettings");

  if (!canUseStudioAgent) {
    return AgentAvailabilitySchema.parse({
      canUseStudioAgent: false,
      canShowAgentShell,
      platform: input.platform,
      siteEnabled,
      mcpEnabled,
      durableAgentAvailable: input.durableAgentAvailable,
      workersAiAvailable: input.workersAiBindingPresent,
      configuredBackends: input.configuredBackends,
      effectiveInferenceBackend: "unavailable",
      reason: "forbidden",
    });
  }

  if (!siteEnabled) {
    return AgentAvailabilitySchema.parse({
      canUseStudioAgent: true,
      canShowAgentShell,
      platform: input.platform,
      siteEnabled: false,
      mcpEnabled: false,
      durableAgentAvailable: input.durableAgentAvailable,
      workersAiAvailable: input.workersAiBindingPresent,
      configuredBackends: input.configuredBackends,
      effectiveInferenceBackend: "unavailable",
      reason: "disabled",
    });
  }

  const effectiveInferenceBackend = resolveEffectiveInferenceBackend({
    platform: input.platform,
    settings: agentSettings,
    workersAiBindingPresent: input.workersAiBindingPresent,
    configuredBackends: input.configuredBackends,
  });

  if (effectiveInferenceBackend === "unavailable") {
    const reason =
      input.platform === "local"
        ? "inference_setup_required"
        : input.workersAiBindingPresent
          ? "inference_setup_required"
          : "workers_ai_unavailable";

    return AgentAvailabilitySchema.parse({
      canUseStudioAgent: true,
      canShowAgentShell,
      platform: input.platform,
      siteEnabled,
      mcpEnabled,
      durableAgentAvailable: input.durableAgentAvailable,
      workersAiAvailable: input.workersAiBindingPresent,
      configuredBackends: input.configuredBackends,
      effectiveInferenceBackend,
      reason,
    });
  }

  return AgentAvailabilitySchema.parse({
    canUseStudioAgent: true,
    canShowAgentShell,
    platform: input.platform,
    siteEnabled,
    mcpEnabled,
    durableAgentAvailable: input.durableAgentAvailable,
    workersAiAvailable: input.workersAiBindingPresent,
    configuredBackends: input.configuredBackends,
    effectiveInferenceBackend,
  });
}

export function defaultAgentSettingsFromSite(
  siteSettings: SiteSettings | null | undefined,
): ReturnType<typeof mergeAgentSettings> {
  return mergeAgentSettings(siteSettings?.agent ?? DEFAULT_AGENT_SETTINGS, {});
}
