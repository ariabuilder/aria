<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useAgentPanel } from "../composables/useAgentPanel";
import { useStudioI18n } from "@/i18n";

const emit = defineEmits<{
  generate: [prompt: string];
}>();

const agentPanel = useAgentPanel();
const { t } = useStudioI18n();

function openAgentWithPrompt(): void {
  const prompt = t("agent.generateSection");
  agentPanel.open({ seed: prompt, composerMode: "agent" });
  emit("generate", prompt);
}
</script>

<template>
  <Button
    type="button"
    variant="outline"
    size="sm"
    class="w-full justify-center gap-2 hover:text-foreground! active:text-foreground! data-[state=active]:text-foreground!"
    @click="openAgentWithPrompt"
  >
    <span :class="[studioIcons.sparkles, 'size-3.5']" />
    {{ t("agent.generateWithAi") }}
  </Button>
</template>
