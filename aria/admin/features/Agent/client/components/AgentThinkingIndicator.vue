<script setup lang="ts">
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();
</script>

<template>
  <div
    class="flex items-center gap-1.5 py-0.5 text-muted-foreground"
    role="status"
    aria-live="polite"
    :aria-label="t('agent.isThinking')"
  >
    <span class="sr-only">{{ t("agent.thinking") }}</span>
    <span class="agent-thinking-dot" />
    <span class="agent-thinking-dot agent-thinking-dot--delay-1" />
    <span class="agent-thinking-dot agent-thinking-dot--delay-2" />
  </div>
</template>

<style scoped>
.agent-thinking-dot {
  display: block;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 9999px;
  background: color-mix(in oklch, var(--primary) 70%, var(--muted-foreground));
  animation: agent-thinking-pulse 1.15s ease-in-out infinite;
}

.agent-thinking-dot--delay-1 {
  animation-delay: 0.16s;
}

.agent-thinking-dot--delay-2 {
  animation-delay: 0.32s;
}

@keyframes agent-thinking-pulse {
  0%,
  70%,
  100% {
    opacity: 0.28;
    transform: translateY(0) scale(0.88);
  }

  35% {
    opacity: 1;
    transform: translateY(-1px) scale(1);
  }
}
</style>
