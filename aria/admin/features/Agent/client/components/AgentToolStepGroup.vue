<script setup lang="ts">
import type { AgentToolStep } from "../../lib/schemas";
import AgentToolStepRow from "./AgentToolStepRow.vue";

const props = defineProps<{
  steps: AgentToolStep[];
  defaultCollapsed?: boolean;
}>();

const readSteps = props.steps.filter((step) => step.isReadTool);
const writeSteps = props.steps.filter((step) => !step.isReadTool);
</script>

<template>
  <div v-if="steps.length" class="space-y-2">
    <details
      v-if="readSteps.length"
      class="rounded-md border border-border/50 bg-muted/30 px-2 py-1"
      :open="!defaultCollapsed"
    >
      <summary class="cursor-pointer text-xs font-medium text-muted-foreground">
        Inspecting site… ({{ readSteps.length }} checks)
      </summary>
      <div class="mt-1 space-y-1">
        <AgentToolStepRow
          v-for="step in readSteps"
          :key="step.id"
          :step="step"
        />
      </div>
    </details>
    <AgentToolStepRow
      v-for="step in writeSteps"
      :key="step.id"
      :step="step"
    />
  </div>
</template>
