<script setup lang="ts">
import { computed } from "vue";
import { useCapabilities } from "@/composables/useCapabilities";
import SettingsReadOnlyNotice from "@/features/Studio/settings/components/SettingsReadOnlyNotice.vue";
import AgentMcpSettings from "./AgentMcpSettings.vue";

const { hasCapability } = useCapabilities();
const canEdit = computed(() => hasCapability("editAgentSettings"));
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 pb-8">
    <SettingsReadOnlyNotice v-if="!canEdit" />
    <AgentMcpSettings :can-edit="canEdit" />
  </div>
</template>
