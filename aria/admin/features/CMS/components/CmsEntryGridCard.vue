<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import type { CmsEntryRow } from "../lib/entryRow";
import CmsEntryCoverThumb from "./CmsEntryCoverThumb";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  entry: CmsEntryRow;
  coverSupported?: boolean;
}>();

const emit = defineEmits<{
  open: [id: string];
  duplicate: [id: string];
  publish: [id: string];
  unpublish: [id: string];
  archive: [id: string];
  delete: [id: string];
}>();
const { t } = useStudioI18n();

const updatedLabel = computed(() => formatRelativeTime(props.entry.updatedAt));

const statusDotColor = computed((): string => {
  switch (props.entry.status) {
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

const previewActions = computed(
  () =>
    [
      {
        key: "open",
        icon: studioIcons.edit,
        label: t("cms.entries.open"),
        disabled: false,
        handler: () => emit("open", props.entry.id),
      },
      {
        key: "duplicate",
        icon: studioIcons.duplicate,
        label: t("pages.action.duplicate"),
        disabled: false,
        handler: () => emit("duplicate", props.entry.id),
      },
    ] as const,
);
</script>

<template>
  <article
    class="group cursor-pointer overflow-hidden rounded-lg border border-solid border-border/50 bg-card/80 shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-border hover:shadow-md"
    tabindex="0"
    @click="emit('open', entry.id)"
    @keydown.enter.prevent="emit('open', entry.id)"
    @keydown.space.prevent="emit('open', entry.id)"
  >
    <div class="relative aspect-video overflow-hidden bg-muted/25">
      <CmsEntryCoverThumb
        :frontmatter="entry.frontmatter"
        :title="entry.title"
        variant="card"
        :cover-supported="coverSupported !== false"
      />

      <div
        class="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2 py-0.5 backdrop-blur-sm"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: statusDotColor }"
          aria-hidden="true"
        />
        <span class="text-2xs capitalize text-muted-foreground">
          {{ entry.status === "draft" ? t("pages.status.draft")
            : entry.status === "published" ? t("pages.status.published")
            : entry.status === "scheduled" ? t("pages.status.scheduled")
            : t("pages.status.archived") }}
        </span>
      </div>

      <!-- Actions menu (top-right, hover-only) -->
      <div
        class="preview-actions absolute right-3 top-3 z-30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        @click.stop
      >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="sidebar-action" size="icon-sm" class="shrink-0 w-8! h-8!">
              <span
                :class="[studioIcons.moreHorizontal, 'size-4! p-0! shrink-0']"
              />
              <span class="sr-only">{{ t("cms.entries.actions") }}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44" @click.stop>
            <DropdownMenuItem @click="emit('open', entry.id)">
              <span :class="[studioIcons.edit, 'mr-2 size-3.5 shrink-0']" />
              {{ t("cms.entries.open") }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('duplicate', entry.id)">
              <span :class="[studioIcons.duplicate, 'mr-2 size-3.5 shrink-0']" />
              {{ t("pages.action.duplicate") }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="entry.status !== 'published'"
              @click="emit('publish', entry.id)"
            >
              <span :class="[studioIcons.published, 'mr-2 size-3.5 shrink-0']" />
              {{ t("pages.action.publish") }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="entry.status === 'published'"
              @click="emit('unpublish', entry.id)"
            >
              <span :class="[studioIcons.unpublish, 'mr-2 size-3.5 shrink-0']" />
              {{ t("pages.action.unpublish") }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="entry.status !== 'archived'"
              @click="emit('archive', entry.id)"
            >
              <span :class="[studioIcons.archive, 'mr-2 size-3.5 shrink-0']" />
              {{ t("pages.action.archive") }}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              @click="emit('delete', entry.id)"
            >
              <span :class="[studioIcons.trash, 'mr-2 size-3.5 shrink-0']" />
              {{ t("common.delete") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- Hover action overlay -->
      <div
        class="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      >
        <div
          class="action-overlay flex items-center gap-1 rounded-lg border border-dashed border-border bg-input p-0.5 opacity-0 translate-y-2.5 scale-92 shadow-xs backdrop-blur-md transition duration-200 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
        >
          <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
            <Tooltip v-for="action in previewActions" :key="action.key">
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  variant="card-action-primary"
                  size="icon"
                  class="pointer-events-auto size-8!"
                  :class="action.disabled ? 'cursor-wait opacity-60' : ''"
                  :aria-label="action.label"
                  :disabled="action.disabled"
                  @click.stop="action.handler()"
                >
                  <span
                    :class="[action.icon, 'size-4.5 shrink-0']"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {{ action.label }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>

    <div class="space-y-2 p-3.5">
      <h2 class="m-0 min-w-0 truncate text-sm font-medium text-foreground">
        {{ entry.title || t("cms.entries.untitled") }}
      </h2>

      <div class="flex min-w-0 items-center justify-between gap-3 text-2xs text-muted-foreground">
        <span class="truncate">{{ entry.locale }}</span>
        <span class="shrink-0 tabular-nums">
          {{ updatedLabel }}
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.preview-actions :deep(button) {
  background-color: color-mix(in oklch, var(--sidebar) 88%, transparent) !important;
  backdrop-filter: blur(4px);
  border-color: color-mix(in oklch, var(--border) 65%, transparent) !important;
}

.preview-actions :deep(button:hover),
.preview-actions :deep(button[data-state="open"]) {
  background-color: var(--sidebar) !important;
  border-color: var(--border) !important;
  border-style: solid !important;
  color: var(--foreground) !important;
}

@media (hover: none) {
  .action-overlay {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .preview-actions {
    opacity: 1;
  }
}
</style>
