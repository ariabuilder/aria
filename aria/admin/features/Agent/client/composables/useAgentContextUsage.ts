import { computed, type Ref } from "vue";
import { computeAgentContextUsage } from "../../lib/contextUsage";
import type { AgentChatMessage, InferenceBackendId } from "../../lib/schemas";

export function useAgentContextUsage(input: {
  messages: Ref<AgentChatMessage[]>;
  draft: Ref<string>;
  provider: Ref<InferenceBackendId>;
  modelId: Ref<string>;
}) {
  const usage = computed(() =>
    computeAgentContextUsage({
      messages: input.messages.value,
      draft: input.draft.value,
      provider: input.provider.value,
      modelId: input.modelId.value,
    }),
  );

  return {
    usage,
  };
}
