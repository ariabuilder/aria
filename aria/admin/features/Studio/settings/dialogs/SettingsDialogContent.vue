<script setup lang="ts">
import { computed } from "vue";
import AuthSecurityView from "@/features/Auth/components/settings/SecurityView.vue";
import AuthUsersView from "@/features/Auth/components/settings/UsersView.vue";
import SiteSettingsView from "../components/SiteSettingsView.vue";
import LocalizationView from "../components/LocalizationView.vue";
import AppearanceView from "../components/AppearanceView.vue";
import SEOView from "../components/SEOView.vue";
import AnalyticsView from "../components/AnalyticsView.vue";
import CustomCodeView from "../components/CustomCodeView.vue";
import ImportExportView from "../components/ImportExportView.vue";
import DiscoveryView from "../components/DiscoveryView.vue";
import RedirectsView from "../components/RedirectsView.vue";
import SlugChangeRedirectPrompt from "../components/SlugChangeRedirectPrompt.vue";
import SystemView from "../components/SystemView.vue";
import { AgentSettingsView } from "@/features/Agent";
import McpSettingsView from "@/features/Agent/client/settings/McpSettingsView.vue";
import WebhookSettingsView from "@/features/Integrations/client/WebhookSettingsView.vue";
import { EmailView } from "@/features/Email";
import { useSettingsDialog } from "../composables/useSettingsDialog";

interface Props {
  activeTab:
    | "general"
    | "localization"
    | "appearance"
    | "seo"
    | "discovery"
    | "agent"
    | "mcp"
    | "api"
    | "integrations"
    | "redirects"
    | "analytics"
    | "custom-code"
    | "users"
    | "security"
    | "email"
    | "import-export"
    | "system";
}

const props = defineProps<Props>();
const settingsDialog = useSettingsDialog();

const tabComponents = {
  general: SiteSettingsView,
  localization: LocalizationView,
  appearance: AppearanceView,
  seo: SEOView,
  discovery: DiscoveryView,
  agent: AgentSettingsView,
  mcp: McpSettingsView,
  api: WebhookSettingsView,
  integrations: WebhookSettingsView,
  redirects: RedirectsView,
  analytics: AnalyticsView,
  "custom-code": CustomCodeView,
  users: AuthUsersView,
  security: AuthSecurityView,
  email: EmailView,
  "import-export": ImportExportView,
  system: SystemView,
} as const;

const activeView = computed(() => tabComponents[props.activeTab]);
</script>

<template>
  <Transition name="settings-tab-panel" mode="out-in">
    <div :key="activeTab === 'api' ? 'integrations' : activeTab" class="w-full min-h-0">
      <div
        :class="
          activeTab === 'import-export' ||
          activeTab === 'email' ||
          activeTab === 'agent' ||
          activeTab === 'api' ||
          activeTab === 'integrations' ||
          activeTab === 'discovery' ||
          activeTab === 'redirects' ||
          activeTab === 'system' ||
          (activeTab === 'users' && settingsDialog.isHeaderOverridden.value)
            ? 'px-0 py-0'
            : 'px-12 py-2'
        "
      >
        <component :is="activeView" />
        <SlugChangeRedirectPrompt />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.settings-tab-panel-enter-active,
.settings-tab-panel-leave-active {
  transition:
    opacity 120ms ease-out,
    transform 140ms ease-out;
  will-change: opacity, transform;
}

.settings-tab-panel-enter-from,
.settings-tab-panel-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.settings-tab-panel-enter-to,
.settings-tab-panel-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
