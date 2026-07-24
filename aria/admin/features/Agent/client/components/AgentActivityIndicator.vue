<script setup lang="ts">
import type { AgentActivityState } from "../../lib/activity";

defineProps<{
  activity: AgentActivityState;
}>();
</script>

<template>
  <div
    class="agent-activity-line flex items-center gap-2 py-0.5 text-xs text-muted-foreground"
    role="status"
    aria-live="polite"
    :aria-label="activity.label"
  >
    <span class="agent-activity-pulse" aria-hidden="true" />
    <span class="agent-activity-shimmer" :data-text="activity.label">
      {{ activity.label }}
    </span>
  </div>
</template>

<style scoped>
.agent-activity-pulse {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: color-mix(in oklch, var(--primary) 72%, var(--muted-foreground));
  box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 28%, transparent);
  animation: agent-activity-pulse 1.45s ease-out infinite;
}

.agent-activity-shimmer {
  --agent-shimmer-dur: 1800ms;
  --agent-shimmer-base: var(--muted-foreground);
  --agent-shimmer-highlight: var(--foreground);
  position: relative;
  display: inline-block;
  color: var(--agent-shimmer-base);
}

.agent-activity-shimmer::before {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    transparent 38%,
    var(--agent-shimmer-highlight) 50%,
    transparent 62%,
    transparent 100%
  );
  background-size: 420% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: agent-activity-shimmer var(--agent-shimmer-dur) linear infinite;
}

@keyframes agent-activity-pulse {
  0% {
    opacity: 0.55;
    transform: scale(0.9);
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 25%, transparent);
  }

  70% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 0.35rem transparent;
  }

  100% {
    opacity: 0.55;
    transform: scale(0.9);
    box-shadow: 0 0 0 0 transparent;
  }
}

@keyframes agent-activity-shimmer {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: 0% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-activity-pulse,
  .agent-activity-shimmer::before {
    animation: none !important;
  }
}
</style>
