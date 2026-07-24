export { default as AgentFloatingSheet } from "./client/components/AgentFloatingSheet.vue";
export { default as AgentFab } from "./client/components/AgentFab.vue";
export { default as AgentSidebarTrigger } from "./client/components/AgentSidebarTrigger.vue";
export { default as AgentComposerEntry } from "./client/components/AgentComposerEntry.vue";
export { default as AgentChatView } from "./client/components/AgentChatView.vue";
export { default as AgentDockedPanel } from "./client/components/AgentDockedPanel.vue";
export { default as AgentSettingsView } from "./client/settings/AgentSettingsView.vue";
export { default as McpSettingsView } from "./client/settings/McpSettingsView.vue";

export { useAgentPanel } from "./client/composables/useAgentPanel";
export { useAgentAvailability } from "./client/composables/useAgentAvailability";
export { useAgentShellVisibility } from "./client/composables/useAgentShellVisibility";
export { useAgentDockMode } from "./client/composables/useAgentDockMode";
export { useRuntimePlatform } from "./client/composables/useRuntimePlatform";
export { useAgentContext } from "./client/composables/useAgentContext";
export { useAgentSettings } from "./client/composables/useAgentSettings";
export { useAgentSessionPrefs } from "./client/composables/useAgentSessionPrefs";
export { useGlobalAgentShortcuts } from "./client/composables/useGlobalAgentShortcuts";
export { useAriaAgent } from "./client/composables/useAriaAgent";
export { useAgentRuntimeStatus } from "./client/composables/useAgentRuntimeStatus";

export {
  AgentSettingsSchema,
  AgentAvailabilitySchema,
  AgentComposerModeSchema,
  AgentSessionPrefsSchema,
  type AgentSettings,
  type AgentAvailability,
  type AgentComposerMode,
  type AgentSessionPrefs,
} from "./lib/schemas";
