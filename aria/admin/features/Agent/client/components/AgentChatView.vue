<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useAgentPanel } from "../composables/useAgentPanel";
import { useAriaAgent } from "../composables/useAriaAgent";
import { useAgentAvailability } from "../composables/useAgentAvailability";
import { isAgentInferenceReady } from "../../lib/seoAgent";
import AgentMessageList from "./AgentMessageList.vue";
import AgentEmptyState from "./AgentEmptyState.vue";
import AgentSetupEmptyState from "./AgentSetupEmptyState.vue";
import AgentComposer from "./AgentComposer.vue";
import { useStudioI18n } from "@/i18n";

defineProps<{
  compact?: boolean;
}>();

const panel = useAgentPanel();
const availabilityState = useAgentAvailability();
const agent = useAriaAgent();
const { t } = useStudioI18n();

const rootRef = ref<HTMLElement | null>(null);
const draft = ref("");
const composerRef = ref<InstanceType<typeof AgentComposer> | null>(null);

const isOpen = computed(() => panel.isOpen.value);

const showSetup = computed(
  () =>
    availabilityState.needsSetup.value &&
    availabilityState.canUseStudioAgent.value,
);

async function applyPendingPanelOpen(): Promise<void> {
  if (!panel.isOpen.value) {
    return;
  }

  await availabilityState.refresh();
  await agent.agentSettings.loadSettings();

  const seed = panel.consumeSeedPrompt();
  const shouldAutoSend = panel.consumeAutoSend();
  const requestedComposerMode = panel.consumeRequestedComposerMode();
  if (requestedComposerMode) {
    agent.sessionPrefs.setComposerMode(requestedComposerMode);
  }
  if (seed) {
    draft.value = seed;
  }

  if (
    shouldAutoSend &&
    isAgentInferenceReady(availabilityState.availability.value) &&
    !agent.isStreaming.value &&
    draft.value.trim()
  ) {
    await handleSend();
    return;
  }

  if (panel.shouldFocusComposer.value) {
    await nextTick(() => composerRef.value?.focusInput());
  }
}

watch(
  () => panel.openRequestId.value,
  () => {
    void applyPendingPanelOpen();
  },
  { immediate: true },
);

watch(
  () => agent.wsTransport.connectionError.value,
  (message) => {
    if (message) toast.error(message);
  },
);

async function handleSend(): Promise<void> {
  composerRef.value?.stopDictation?.();
  const value = draft.value;
  draft.value = "";
  await agent.sendMessage(value);
}

function handleStop(): void {
  agent.stopGeneration();
}

async function handleSelectPrompt(prompt: string): Promise<void> {
  if (
    showSetup.value ||
    !availabilityState.canUseStudioAgent.value ||
    agent.isStreaming.value
  ) {
    return;
  }
  draft.value = "";
  await agent.sendMessage(prompt);
}

function formatConversationAsMarkdown(): string {
  const messages = agent.messages.value;
  if (messages.length === 0) return "";

  const parts: string[] = ["# Aria Engineer — Conversation\n"];

  for (const message of messages) {
    if (message.role === "user") {
      parts.push(`### You\n${message.content}\n`);
    } else if (message.role === "assistant") {
      parts.push(`### Assistant\n${message.content.trim()}\n`);
    }
  }

  return parts.join("\n");
}

async function handleCopyConversation(): Promise<void> {
  const markdown = formatConversationAsMarkdown();
  if (!markdown) {
    toast.error(t("agent.noMessagesToCopy"));
    return;
  }

  try {
    await navigator.clipboard.writeText(markdown);
    toast.success(t("agent.conversationCopied"));
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = markdown;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    toast.success(t("agent.conversationCopied"));
  }
}

function handleClose(): void {
  panel.close();
}

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !isOpen.value) return;

  const target = event.target as HTMLElement;

  if (
    target.tagName === "TEXTAREA" &&
    rootRef.value?.contains(target) &&
    agent.isStreaming.value
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  handleClose();
}

onMounted(() => {
  window.addEventListener("keydown", handleEscapeKey, true);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleEscapeKey, true);
});

defineExpose({
  copyConversation: handleCopyConversation,
  clearChat: () => agent.clearChat(),
  close: handleClose,
  focusInput: () => composerRef.value?.focusInput(),
});
</script>

<template>
  <div ref="rootRef" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <AgentSetupEmptyState
      v-if="showSetup && availabilityState.availability.value"
      class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      :availability="availabilityState.availability.value"
    />
    <AgentEmptyState
      v-else-if="agent.messages.value.length === 0"
      class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      :composer-mode="agent.sessionPrefs.composerMode.value"
      :compact="compact"
      @select-prompt="void handleSelectPrompt($event)"
    />
    <AgentMessageList
      v-else
      class="min-h-0 flex-1"
      :messages="agent.messages.value"
      :is-streaming="agent.isStreaming.value"
      :activity="agent.activity.value"
    />

    <AgentComposer
      v-if="availabilityState.availability.value"
      ref="composerRef"
      v-model:draft="draft"
      :availability="availabilityState.availability.value"
      :site-settings="agent.agentSettings.agentSettings.value"
      :session-prefs="agent.sessionPrefs"
      :messages="agent.messages.value"
      :disabled="showSetup || !availabilityState.canUseStudioAgent.value"
      :is-streaming="agent.isStreaming.value"
      :error="agent.error.value"
      :compact="compact"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>
