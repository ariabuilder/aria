<script setup lang="ts">
import { computed } from "vue";
import type { AgentToolError } from "../../lib/schemas";
import { sanitizeAgentUserFacingError } from "../../lib/userFacingContent";

const props = defineProps<{
  error: Pick<AgentToolError, "code" | "message" | "suggestedFix">;
}>();

const message = computed(() =>
  sanitizeAgentUserFacingError(props.error.message),
);
const suggestedFix = computed(() =>
  props.error.suggestedFix
    ? sanitizeAgentUserFacingError(props.error.suggestedFix)
    : undefined,
);
</script>

<template>
  <div class="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
    <p class="font-medium">{{ message }}</p>
    <p v-if="suggestedFix" class="mt-1 text-muted-foreground">
      {{ suggestedFix }}
    </p>
  </div>
</template>
