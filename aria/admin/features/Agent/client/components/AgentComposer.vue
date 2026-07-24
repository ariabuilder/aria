<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { studioIcons } from "@/lib/icons";
import { getComposerModeDefinition } from "../../lib/composerMode";
import type {
  AgentAvailability,
  AgentChatMessage,
  AgentSettings,
  InferenceBackendId,
} from "../../lib/schemas";
import type { AgentSessionPrefsController } from "../composables/useAgentSessionPrefs";
import { useAgentContextUsage } from "../composables/useAgentContextUsage";
import { useSelectedBlock } from "../composables/useSelectedBlock";
import AgentContextUsageRing from "./AgentContextUsageRing.vue";
import AgentDictationButton from "./AgentDictationButton.vue";
import AgentModePicker from "./AgentModePicker.vue";
import AgentModelPicker from "./AgentModelPicker.vue";

const props = defineProps<{
  availability: AgentAvailability;
  siteSettings: AgentSettings;
  sessionPrefs: AgentSessionPrefsController;
  messages: AgentChatMessage[];
  draft: string;
  disabled?: boolean;
  isStreaming: boolean;
  error?: string | null;
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  send: [];
  stop: [];
}>();

const composerInputRef = ref<InstanceType<typeof Textarea> | null>(null);
const dictationRef = ref<InstanceType<typeof AgentDictationButton> | null>(
  null,
);

function composerTextareaEl(): HTMLTextAreaElement | null {
  const el = composerInputRef.value?.$el;
  return el instanceof HTMLTextAreaElement ? el : null;
}

const composerMode = computed({
  get: () => props.sessionPrefs.composerMode.value,
  set: (value) => props.sessionPrefs.setComposerMode(value),
});

const placeholder = computed(
  () => getComposerModeDefinition(composerMode.value).placeholder,
);

const selectedBlock = useSelectedBlock();

const canSend = computed(
  () => !props.disabled && props.draft.trim().length > 0 && !props.isStreaming,
);

const activeSelection = computed(() =>
  props.sessionPrefs.resolveEffectiveSelection(
    props.siteSettings,
    props.availability,
  ),
);

const { usage } = useAgentContextUsage({
  messages: toRef(props, "messages"),
  draft: toRef(props, "draft"),
  provider: computed(() => activeSelection.value.provider),
  modelId: computed(() => activeSelection.value.modelId),
});

watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming) {
      dictationRef.value?.stopListening();
    }
  },
);

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.isStreaming) {
    event.preventDefault();
    emit("stop");
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (props.isStreaming) {
      emit("stop");
    } else if (canSend.value) {
      dictationRef.value?.stopListening();
      emit("send");
    }
  }
}

function handleSelectModel(provider: InferenceBackendId, modelId: string): void {
  props.sessionPrefs.setModelSelection(provider, modelId);
}

function handleDictationError(message: string): void {
  toast.error(message);
}

defineExpose({
  focusInput: async (): Promise<void> => {
    await nextTick();
    composerTextareaEl()?.focus();
  },
  stopDictation: (): void => {
    dictationRef.value?.stopListening();
  },
});
</script>

<template>
  <div
    :class="[
      'border-t border-dashed border-border bg-background ',
      compact ? 'p-0' : 'p-3',
    ]"
  >
    <p v-if="error" class="mb-2 text-xs text-destructive">
      {{ error }}
    </p>

    <div
    class="agent-composer-card overflow-hidden bg-input transition-shadow focus-within:border-border focus-within:ring-1 focus-within:ring-ring/40"
    >
      <div class="relative">
        <Textarea
          ref="composerInputRef"
          :model-value="draft"
          rows="2"
          auto-grow
          :class="[
            'max-h-40 w-full resize-none overflow-y-auto rounded-none border-0! bg-transparent! text-xs text-foreground shadow-none! outline-none placeholder:text-muted-foreground hover:bg-transparent! focus-visible:border-0! focus-visible:bg-transparent! focus-visible:ring-0!',
            compact
              ? 'min-h-[4rem]! px-4 py-3 pr-10'
              : 'min-h-[4.5rem]! px-4 py-4 pr-10',
          ]"
          :disabled="disabled"
          :placeholder="placeholder"
          @update:model-value="emit('update:draft', String($event))"
          @keydown="handleKeydown"
        />

        <div :class="['absolute right-2', compact ? 'bottom-1.5' : 'bottom-2']">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            :disabled="!canSend && !isStreaming"
            :class="isStreaming ? 'text-destructive' : ''"
            :aria-label="isStreaming ? 'Stop generation' : 'Send message'"
            @click="isStreaming ? emit('stop') : emit('send')"
          >
            <span
              :class="[
                isStreaming ? studioIcons.element : studioIcons.arrowUp,
                'size-3.5 shrink-0',
              ]"
            />
          </Button>
        </div>
      </div>

      <div
        v-if="selectedBlock"
        class="flex min-w-0 items-center gap-1.5 border-t border-dashed border-border/50 px-2 py-1"
      >
        <span
          :class="[studioIcons.block, 'size-3 shrink-0 text-muted-foreground']"
        />
        <span class="truncate text-xs font-medium text-foreground/80">
          {{ selectedBlock.type }} — {{ selectedBlock.label }}
        </span>
      </div>

      <!-- Default: single-row toolbar (floating sheet) -->
      <div
        v-if="!compact"
        class="flex min-w-0 items-center gap-1 border-t border-dashed border-border px-2 py-1.5"
      >
        <div class="ml-auto flex min-w-0 items-center gap-2">
          <AgentModePicker v-model="composerMode" :disabled="disabled" />
          <AgentModelPicker
            :availability="availability"
            :site-settings="siteSettings"
            :active-provider="activeSelection.provider"
            :active-model-id="activeSelection.modelId"
            :disabled="disabled"
            @select-model="handleSelectModel"
          />
          <div class="flex shrink-0 items-center gap-0.5">
            <AgentContextUsageRing :usage="usage" />
            <AgentDictationButton
              ref="dictationRef"
              :draft="draft"
              :disabled="disabled || isStreaming"
              @update:draft="emit('update:draft', $event)"
              @error="handleDictationError"
            />
          </div>
        </div>
      </div>

      <!-- Compact: mode row, then model/context controls -->
      <div
        v-else
        class="flex flex-col gap-1 border-t border-dashed border-border bg-background pb-1.5"
      >
        <AgentModePicker v-model="composerMode" :disabled="disabled" />
        <div class="flex min-w-0 items-center gap-0">
          <AgentModelPicker
            :availability="availability"
            :site-settings="siteSettings"
            :active-provider="activeSelection.provider"
            :active-model-id="activeSelection.modelId"
            :disabled="disabled"
            @select-model="handleSelectModel"
          />
          <div class="ml-auto flex shrink-0 items-center gap-0.5 pr-3">
            <AgentDictationButton
              ref="dictationRef"
              :draft="draft"
              :disabled="disabled || isStreaming"
              @update:draft="emit('update:draft', $event)"
              @error="handleDictationError"
            />
            <AgentContextUsageRing :usage="usage" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
