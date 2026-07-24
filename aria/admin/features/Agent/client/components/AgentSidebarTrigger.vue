<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useAgentPanel } from "../composables/useAgentPanel";
import { useAgentRuntimeStatus } from "../composables/useAgentRuntimeStatus";
import { useStudioI18n } from "@/i18n";

defineProps<{
  collapsed?: boolean;
}>();

const panel = useAgentPanel();
const agentRuntime = useAgentRuntimeStatus();
const { t } = useStudioI18n();
</script>

<template>
  <Button
    type="button"
    variant="sidebar-action"
    size="xs"
    class="relative"
    :class="{ 'agent-streaming': agentRuntime.isWorking.value }"
    :aria-label="t('agent.title')"
    @click="panel.toggle()"
  >
    <span
      :class="[
        studioIcons.sparkles,
        'size-3 shrink-0',
        { 'text-primary': agentRuntime.isWorking.value },
      ]"
    />
    <span
      v-if="
        agentRuntime.isBuilding.value &&
        agentRuntime.completedSectionCount.value > 0
      "
      class="pointer-events-none absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground"
    >
      {{ agentRuntime.completedSectionCount.value }}
    </span>
  </Button>
</template>

<style scoped>
.agent-streaming {
  animation: agent-pulse 1.2s ease-in-out infinite;
}

@keyframes agent-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}
</style>
