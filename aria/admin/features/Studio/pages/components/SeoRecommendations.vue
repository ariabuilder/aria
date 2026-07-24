<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioIcons } from "@/lib/icons";
import { useAgentPanel } from "@/features/Agent/client/composables/useAgentPanel";
import { useAgentAvailability } from "@/features/Agent/client/composables/useAgentAvailability";
import {
  buildSeoImprovementPrompt,
  buildSeoStudioShellContext,
  canShowSeoAgentLauncher,
  isAgentInferenceReady,
} from "@/features/Agent/lib/seoAgent";
import type { AgentSeoContext } from "@/features/Agent/lib/schemas";
import { useSettingsDialog } from "@/features/Studio/settings";
import { useStudioI18n } from "@/i18n";

export interface Recommendation {
  id: string;
  type: "improvement" | "warning" | "ai";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionLabel?: string;
}

interface Props {
  recommendations: Recommendation[];
  pageSlug?: string;
  pageTitle?: string;
  agentSeoContext?: AgentSeoContext | null;
}

const props = defineProps<Props>();
const agentPanel = useAgentPanel();
const availabilityState = useAgentAvailability();
const settingsDialog = useSettingsDialog();
const { t } = useStudioI18n();

const showEnableMessage = computed(
  () => !canShowSeoAgentLauncher(availabilityState.availability.value),
);

onMounted(() => {
  void availabilityState.refresh();
});

function openAgentSettings(): void {
  settingsDialog.open("agent");
}

function openSeoAgent(): void {
  if (!props.pageSlug) return;

  const availability = availabilityState.availability.value;
  if (!canShowSeoAgentLauncher(availability)) {
    return;
  }

  const autoSend = isAgentInferenceReady(availability);
  const seoContext = props.agentSeoContext ?? {
    pageSlug: props.pageSlug,
    pageTitle: props.pageTitle,
    field: "general" as const,
  };

  agentPanel.open({
    seoContext,
    shellContext: buildSeoStudioShellContext(
      props.pageSlug,
      props.pageTitle,
    ),
    seed: buildSeoImprovementPrompt(props.pageTitle, props.pageSlug),
    composerMode: "agent",
    autoSend,
    focusComposer: !autoSend,
  });
}

function getRecommendationIcon(type: Recommendation["type"]): string {
  switch (type) {
    case "improvement": return studioIcons.trendUp;
    case "warning": return studioIcons.warning;
    case "ai": return studioIcons.sparkles;
  }
}

const priorityColor: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-primary",
};
</script>

<template>
  <section class="grid gap-3">
    <div class="flex min-h-7 items-center justify-between gap-3">
      <h2 class="m-0 text-sm font-medium text-muted-foreground">
        {{ t("pages.seo.recommendations") }}
      </h2>
      <Button
        v-if="!showEnableMessage"
        variant="outline"
        size="xs"
        :disabled="!pageSlug"
        @click="openSeoAgent"
      >
        <span :class="[studioIcons.sparkles, 'mr-1.5 size-3']" />
        {{ t("pages.seo.askAi") }}
      </Button>
    </div>

    <div
      v-if="showEnableMessage"
      class="rounded-md border border-dashed border-border/70 bg-sidebar/30 px-4 py-3 text-sm text-muted-foreground"
    >
      <Button
        variant="link"
        size="sm"
        class="h-auto px-0 text-sm"
        @click="openAgentSettings"
      >
        {{ t("pages.seo.enableAi") }}
      </Button>
    </div>

    <div
      v-else-if="recommendations.length === 0"
      class="rounded-md border border-dashed border-border/70 bg-sidebar/30 px-4 py-3 text-sm text-muted-foreground"
    >
      {{ t("pages.seo.noRecommendations") }}
    </div>

    <div
      v-else
      class="divide-y divide-dashed divide-border/70 rounded-md border border-dashed border-border/70 bg-sidebar/30"
    >
      <div
        v-for="rec in recommendations"
        :key="rec.id"
        class="flex min-h-10 items-start gap-3 px-4 py-3"
      >
        <span
          :class="[
            getRecommendationIcon(rec.type),
            'size-4 shrink-0 mt-0.5',
            rec.type === 'ai'
              ? 'text-primary'
              : (priorityColor[rec.priority] ?? 'text-primary'),
          ]"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <p class="m-0 min-w-0 truncate text-xs font-medium text-foreground">
              {{ rec.title }}
            </p>
            <Badge
              variant="outline"
              size="xs"
              class="uppercase tracking-wider"
              :class="priorityColor[rec.priority] ?? 'text-muted-foreground'"
            >
              {{ rec.priority }}
            </Badge>
          </div>
          <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">
            {{ rec.description }}
          </p>
          <Button
            v-if="rec.actionLabel"
            variant="link"
            size="sm"
            class="h-9 px-0 text-xs"
          >
            {{ rec.actionLabel }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
