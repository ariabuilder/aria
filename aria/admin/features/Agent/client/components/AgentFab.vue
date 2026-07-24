<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useAgentPanel } from "../composables/useAgentPanel";
import { useAgentRuntimeStatus } from "../composables/useAgentRuntimeStatus";
import { useStudioI18n } from "@/i18n";

const panel = useAgentPanel();
const agentRuntime = useAgentRuntimeStatus();
const { t } = useStudioI18n();
</script>

<template>
  <Button
    v-if="!panel.isOpen.value"
    type="button"
    size="icon"
    class="fixed bottom-6 right-6 z-40 size-12 rounded-full shadow-lg"
    :class="{ 'agent-streaming': agentRuntime.isWorking.value }"
    :aria-label="t('agent.open')"
    @click="panel.open()"
  >
    <span :class="[studioIcons.sparkles, 'size-5 shrink-0']" />
    <span
      v-if="
        agentRuntime.isBuilding.value &&
        agentRuntime.completedSectionCount.value > 0
      "
      class="pointer-events-none absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-5 text-primary-foreground"
    >
      {{ agentRuntime.completedSectionCount.value }}
    </span>
  </Button>
</template>

<style scoped>
.agent-streaming {
  animation: agent-pulse 1.2s ease-in-out infinite;
  box-shadow: 0 0 12px var(--primary);
}

@keyframes agent-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}
</style>
