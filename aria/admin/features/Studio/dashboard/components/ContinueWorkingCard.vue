<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import PagePreviewFrame from "@/features/Studio/pages/components/PagePreviewFrame.vue";
import {
  ContinueWorkingItemSchema,
  type ContinueWorkingItem,
} from "../schemas/dashboard";
import DashboardFrame from "./DashboardFrame.vue";

interface Props {
  item: ContinueWorkingItem | null;
}

const props = defineProps<Props>();

const router = useStudioRouter();
const { t } = useStudioI18n();

const parsedItem = computed(() => {
  if (!props.item) return null;
  const result = ContinueWorkingItemSchema.safeParse(props.item);
  return result.success ? result.data : null;
});

const lastEditedLabel = computed(() => {
  if (!parsedItem.value?.lastEditedAt)
    return t("dashboard.continue.neverEdited");
  return formatRelativeTime(parsedItem.value.lastEditedAt);
});

const statusDotColor = computed((): string => {
  switch (parsedItem.value?.pageStatus) {
    case "published":
      return "var(--published)";
    case "draft":
      return "var(--draft)";
    case "archived":
      return "var(--archived)";
    case "scheduled":
      return "oklch(0.588 0.158 241.966)";
    default:
      return "var(--muted-foreground)";
  }
});

function resumeEditing(): void {
  if (!parsedItem.value) return;
  router.startEditing("page", parsedItem.value.pageSlug);
}
</script>

<template>
  <DashboardFrame class="group flex h-full flex-col overflow-hidden">
    <div class="flex items-start justify-between gap-3 px-4 py-4">
      <div class="min-w-0 flex-1">
        <p class="m-0 text-xs text-muted-foreground/80">
          {{ t("dashboard.continue.title") }}
        </p>
        <h2
          v-if="parsedItem"
          class="m-0 mt-0.5 truncate text-base font-medium text-foreground"
        >
          {{ parsedItem.pageTitle }}
        </h2>
        <h2
          v-else
          class="m-0 mt-0.5 text-sm font-medium text-muted-foreground"
        >
          {{ t("dashboard.continue.empty") }}
        </h2>
      </div>

      <div class="flex shrink-0 items-center gap-4">
        <span
          v-if="parsedItem"
          class="hidden text-xs tabular-nums text-muted-foreground/80 sm:inline"
        >
          {{ lastEditedLabel }}
        </span>
        <Button
          v-if="parsedItem"
          variant="outline"
          size="sm"
          class="group-hover:bg-primary/10 group-hover:text-primary"
          @click="resumeEditing"
        >
          <span :class="[studioIcons.edit, 'size-3.5']" aria-hidden="true" />
          {{ t("dashboard.continue.edit") }}
        </Button>
      </div>
    </div>

    <button
      v-if="parsedItem"
      type="button"
      class="relative aspect-video w-full cursor-pointer overflow-hidden text-left hover:brightness-110 transition-all duration-200 ease-out group"
      :aria-label="t('dashboard.continue.editInComposer')"
      @click="resumeEditing"
    >
      <PagePreviewFrame
        :key="`${parsedItem.pageSlug}:${parsedItem.snapshotUrl ?? ''}`"
        class="absolute inset-0"
        :page-id="parsedItem.pageId"
        :page-slug="parsedItem.pageSlug"
        :page-status="parsedItem.pageStatus"
        :snapshot-url="parsedItem.snapshotUrl"
        :thumbnail-url="parsedItem.thumbnailUrl"
        :inert="true"
        item-type="page"
        viewport="desktop"
        thumbnail-fit="cover"
        thumbnail-position="top"
      />

      <div
        class="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-sm border border-border/50 bg-background/90 px-2 py-0.5 backdrop-blur-sm"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: statusDotColor }"
          aria-hidden="true"
        />
        <span class="text-2xs capitalize text-muted-foreground">
          {{ t(`dashboard.status.${parsedItem.pageStatus}`) }}
        </span>
      </div>

    </button>

    <div
      v-else
      class="flex aspect-video items-center justify-center border-t border-border/50 bg-muted/15 px-5 text-center text-xs text-muted-foreground"
    >
      {{ t("dashboard.continue.empty") }}
    </div>
  </DashboardFrame>
</template>
