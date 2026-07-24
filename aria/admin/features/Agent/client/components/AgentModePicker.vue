<script setup lang="ts">
import { AGENT_COMPOSER_MODE_DEFINITIONS } from "../../lib/composerMode";
import type { AgentComposerMode } from "../../lib/schemas";
import { useStudioI18n } from "@/i18n";

defineProps<{
  modelValue: AgentComposerMode;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: AgentComposerMode];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <div
    class="grid shrink-0 grid-cols-2 rounded-none border border-border border-dashed border-t-0 bg-background"
    role="group"
    :aria-label="t('agent.composerMode')"
  >
    <button
      v-for="mode in AGENT_COMPOSER_MODE_DEFINITIONS"
      :key="mode.id"
      type="button"
      class="h-8 min-w-[3.25rem] rounded-none px-3 text-xs font-normal transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50"
      :class="
        modelValue === mode.id
          ? 'bg-input/70 text-primary'
          : 'text-muted-foreground hover:text-primary'
      "
      :disabled="disabled"
      :aria-pressed="modelValue === mode.id"
      :title="mode.description"
      @click="emit('update:modelValue', mode.id)"
    >
      {{ mode.label }}
    </button>
  </div>
</template>
