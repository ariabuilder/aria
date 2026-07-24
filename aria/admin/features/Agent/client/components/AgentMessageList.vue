<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import AgentMessageMarkdown from "./AgentMessageMarkdown.vue";
import AgentActivityIndicator from "./AgentActivityIndicator.vue";
import AgentToolStepGroup from "./AgentToolStepGroup.vue";
import type { AgentActivityState } from "../../lib/activity";
import type { AgentChatMessage } from "../../lib/schemas";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  messages: AgentChatMessage[];
  isStreaming?: boolean;
  activity?: AgentActivityState | null;
}>();

const scrollerRef = ref<HTMLElement | null>(null);
const { t } = useStudioI18n();

watch(
  () =>
    [
      props.messages.map((message) => message.content).join("\0"),
      props.messages
        .map((message) => JSON.stringify(message.toolSteps))
        .join("\0"),
      props.isStreaming,
      props.activity?.label ?? "",
    ].join("\0"),
  async () => {
    await nextTick();
    const scroller = scrollerRef.value;
    if (!scroller) {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  },
  { flush: "post" },
);

function isThinkingMessage(message: AgentChatMessage, index: number): boolean {
  return (
    props.isStreaming === true &&
    message.role === "assistant" &&
    index === props.messages.length - 1
  );
}
</script>

<template>
  <div
    ref="scrollerRef"
    class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4 py-4"
    @wheel.stop
  >
    <div
      v-for="(message, index) in messages"
      :key="message.id"
      class="rounded-sm px-3 py-0 text-xs"
      :class="[
        message.role === 'user'
          ? 'ml-8 bg-card/30 border-0.5 border-border/50 text-foreground'
          : 'mr-8 bg-card/30 border-0.5 border-primary/20 text-foreground',
        message.role === 'assistant' &&
        isStreaming &&
        index === messages.length - 1
          ? 'ring-1 ring-primary/20'
          : '',
      ]"
    >
      <AgentActivityIndicator
        v-if="activity && isThinkingMessage(message, index)"
        :activity="activity"
        :class="[
          message.content.trim() || message.toolSteps?.length
            ? 'mb-2'
            : '',
        ]"
      />
      <template v-if="message.role === 'assistant'">
        <AgentToolStepGroup
          v-if="message.toolSteps?.length"
          :steps="message.toolSteps"
          :default-collapsed="true"
          class="mb-2"
        />
        <AgentMessageMarkdown :content="message.content" />
        <p v-if="message.stopped" class="mt-1 text-2xs text-muted-foreground">
          {{ t("agent.stopped") }}
        </p>
      </template>
      <p v-else class="whitespace-pre-wrap text-balance">
        {{ message.content }}
      </p>
    </div>
  </div>
</template>
