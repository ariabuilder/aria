<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { studioIcons } from "@/lib/icons";
import { useSpeechDictation } from "../composables/useSpeechDictation";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  disabled?: boolean;
  draft: string;
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  error: [message: string];
}>();

const sessionBase = ref("");
const { t } = useStudioI18n();

function mergeTranscript(base: string, addition: string): string {
  const left = base.trim();
  const right = addition.trim();
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return `${left} ${right}`;
}

const dictation = useSpeechDictation({
  onTranscript(text, isFinal) {
    if (isFinal) {
      sessionBase.value = mergeTranscript(sessionBase.value, text);
      emit("update:draft", sessionBase.value);
      return;
    }

    emit("update:draft", mergeTranscript(sessionBase.value, text));
  },
  onError(message) {
    sessionBase.value = "";
    emit("error", message);
  },
});

const tooltipLabel = computed(() => {
  if (!dictation.isSupported) {
    return dictation.unsupportedReason.value ?? t("agent.dictation.unsupported");
  }

  return dictation.isListening.value ? t("agent.dictation.stop") : t("agent.dictation.start");
});

const ariaLabel = computed(() => tooltipLabel.value);

function handleToggle(): void {
  if (!dictation.isSupported) {
    emit(
      "error",
      dictation.unsupportedReason.value ??
        t("agent.dictation.unsupported"),
    );
    return;
  }

  if (!dictation.isListening.value) {
    sessionBase.value = props.draft.trim();
    void dictation.startListening();
    return;
  }

  sessionBase.value = "";
  dictation.stopListening();
}

defineExpose({
  stopListening: () => {
    sessionBase.value = "";
    dictation.stopListening();
  },
});

onUnmounted(() => {
  sessionBase.value = "";
  dictation.stopListening();
});
</script>

<template>
  <HeaderActionTooltip :label="tooltipLabel" side="top">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-9"
      :class="
        dictation.isListening.value
          ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
          : dictation.isSupported
            ? 'text-muted-foreground hover:text-foreground'
            : 'cursor-not-allowed text-muted-foreground/50'
      "
      :disabled="disabled || !dictation.isSupported"
      :aria-label="ariaLabel"
      @click="handleToggle"
    >
      <span
        :class="[
          studioIcons.microphone,
          'size-3.5',
          dictation.isListening.value ? 'animate-pulse' : '',
        ]"
      />
    </Button>
  </HeaderActionTooltip>
</template>
