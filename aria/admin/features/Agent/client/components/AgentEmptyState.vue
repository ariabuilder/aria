<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  useAgentEmptyStateGreeting,
  useAgentSuggestedPrompts,
} from "../composables/useAgentSuggestedPrompts";
import { useAgentContextRef } from "../composables/useAgentContext";
import type { AgentComposerMode } from "../../lib/schemas";

const props = defineProps<{
  composerMode: AgentComposerMode;
  compact?: boolean;
}>();

const emit = defineEmits<{
  selectPrompt: [value: string];
}>();

const context = useAgentContextRef();
const prompts = computed(() =>
  useAgentSuggestedPrompts(context.value, props.composerMode),
);
const greeting = computed(() =>
  useAgentEmptyStateGreeting(context.value, props.composerMode),
);
</script>

<template>
  <div
    :class="[
      'flex h-full flex-col items-center justify-center text-center',
      compact ? 'gap-6 px-10' : 'gap-8 px-10',
    ]"
  >
    <div class="max-w-md space-y-2">
      <h3 class="text-sm text-balance font-medium text-foreground">
        {{ greeting.title }}
      </h3>
      <p class="text-xs text-balance text-muted-foreground">
        {{ greeting.subtitle }}
      </p>
    </div>
    <div
      :class="[
        'gap-3',
        compact ? 'flex flex-col w-full' : 'flex flex-wrap justify-center',
      ]"
    >
      <Button
        v-for="prompt in prompts"
        :key="prompt"
        variant="secondary"
        size="xs"
        :class="[
          'whitespace-normal text-left',
          compact ? 'w-full' : 'max-w-full',
        ]"
        @click="emit('selectPrompt', prompt)"
      >
        {{ prompt }}
      </Button>
    </div>
  </div>
</template>
