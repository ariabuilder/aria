<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";
import { useAgentPanel } from "../composables/useAgentPanel";
import { useAriaAgent } from "../composables/useAriaAgent";
import { useAgentRuntimeStatus } from "../composables/useAgentRuntimeStatus";
import { useAgentDockMode } from "../composables/useAgentDockMode";
import AgentChatView from "./AgentChatView.vue";
import { useStudioI18n } from "@/i18n";

const AGENT_PANEL_WIDTH = "min(520px, calc(100vw - 2rem))";

const panel = useAgentPanel();
const agent = useAriaAgent();
const agentRuntime = useAgentRuntimeStatus();
const dockMode = useAgentDockMode();
const { t } = useStudioI18n();

const chatViewRef = ref<InstanceType<typeof AgentChatView> | null>(null);

const isOpen = computed(() => panel.isOpen.value);
</script>

<template>
  <div
    :class="[
      'agent-composer-panel-anchor fixed bottom-5 right-5 z-40',
      isOpen ? 'pointer-events-auto' : 'pointer-events-none',
    ]"
  >
    <aside
      :class="[
        'agent-composer-panel flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background/98 text-muted-foreground shadow-lg backdrop-blur-md',
        isOpen ? 'agent-composer-panel--open' : 'agent-composer-panel--closed',
      ]"
      :style="{ width: AGENT_PANEL_WIDTH, height: '70vh' }"
      :inert="!isOpen"
      role="complementary"
      :aria-label="t('agent.title')"
    >
      <div
        class="flex items-center justify-between border-dashed border-b border-border/50 bg-background px-4 py-1 shrink-0"
      >
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="text-sm font-serif font-semibold">{{ t("agent.title") }}</h2>
          <span
            v-if="agentRuntime.isWorking.value"
            class="agent-streaming-pulse"
            aria-hidden="true"
          />
        </div>
        <TooltipProvider>
          <div class="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :aria-label="t('agent.dock')"
                  @click="dockMode.dock()"
                >
                  <span :class="[studioIcons.minimize, 'size-3.5 shrink-0']" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ t("agent.dock") }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :aria-label="t('agent.copyConversation')"
                  :disabled="agent.messages.value.length === 0"
                  @click="chatViewRef?.copyConversation()"
                >
                  <span :class="[studioIcons.copy, 'size-3.5 shrink-0']" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ t("common.copy") }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :aria-label="t('agent.newConversation')"
                  @click="chatViewRef?.clearChat()"
                >
                  <span :class="[studioIcons.add, 'size-3.5 shrink-0']" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ t("agent.newConversation") }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :aria-label="t('agent.close')"
                  @click="chatViewRef?.close()"
                >
                  <span :class="[studioIcons.close, 'size-3.5 shrink-0']" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ t("agent.close") }}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <AgentChatView ref="chatViewRef" />
    </aside>
  </div>
</template>

<style scoped>
.agent-composer-panel {
  transform-origin: right center;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.agent-composer-panel--open {
  transform: translateX(0);
}

.agent-composer-panel--closed {
  transform: translateX(calc(100% + 1.5rem));
}

.agent-streaming-pulse {
  width: 0.45rem;
  height: 0.45rem;
  flex-shrink: 0;
  border-radius: 9999px;
  background: color-mix(in oklch, var(--primary) 75%, white);
  box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 45%, transparent);
  animation: agent-streaming-pulse 1.4s ease-out infinite;
}

@keyframes agent-streaming-pulse {
  0% {
    opacity: 0.85;
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 40%, transparent);
  }
  70% {
    opacity: 1;
    box-shadow: 0 0 0 0.35rem
      color-mix(in oklch, var(--primary) 0%, transparent);
  }
  100% {
    opacity: 0.85;
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 0%, transparent);
  }
}
</style>
