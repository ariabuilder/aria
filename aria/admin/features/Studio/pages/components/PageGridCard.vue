<script setup lang="ts">
import {
  computed,
  nextTick,
  watch,
  ref,
  type ComponentPublicInstance,
} from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";
import PageActionsCell from "./PageActionsCell.vue";
import PagePreviewFrame from "@/features/Studio/pages/components/PagePreviewFrame.vue";
import type { Page } from "@/composables/useBuilderData";
import { resolvePagePreviewStage } from "../composables/resolvePagePreviewStage";
import { useInjectedPrewarmBuilder } from "@/features/Core/composables/useAppInjectedRuntime";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { formatCompactCount } from "@/lib/metrics/format";
import { metricsPeriodDescription } from "../../../../../lib/metrics/period";
import TrafficSparkline from "@/features/Studio/metrics/components/TrafficSparkline.vue";
import {
  cmsPageUsageDetailLabels,
  cmsPageUsageBadgeLabels,
  type CmsPageUsage,
} from "../../../../../lib/cms/pageUsage";
import { useStudioI18n } from "@/i18n";

const prewarmBuilder = useInjectedPrewarmBuilder();
const { t } = useStudioI18n();
let hasPrewarmed = false;
function prewarmBuilderOnce(): void {
  if (hasPrewarmed) return;
  hasPrewarmed = true;
  void prewarmBuilder();
}

interface Props {
  page: Page;
  isThumbnailPending?: boolean;
  thumbnailRefreshToken?: string | null;
  isRenaming?: boolean;
  editingTitle?: string;
  trafficVisits?: number | null;
  trafficSparkline?: readonly number[];
  cmsUsages?: readonly CmsPageUsage[];
}

const props = withDefaults(defineProps<Props>(), {
  isThumbnailPending: false,
  thumbnailRefreshToken: null,
  isRenaming: false,
  editingTitle: "",
  trafficVisits: null,
  trafficSparkline: () => [],
  cmsUsages: () => [],
});

const emit = defineEmits<{
  edit: [slug: string];
  rename: [slug: string];
  duplicate: [slug: string];
  publish: [slug: string];
  unpublish: [slug: string];
  archive: [slug: string];
  unarchive: [slug: string];
  delete: [slug: string];
  view: [slug: string];
  prefetch: [slug: string];
  cancelPrefetch: [slug: string];
  regenerateThumbnail: [slug: string];
  updateEditingTitle: [value: string];
  confirmRename: [];
  cancelRename: [];
  renameKeydown: [event: KeyboardEvent];
}>();

type RenameInputRef =
  | HTMLInputElement
  | (ComponentPublicInstance & { $el?: HTMLInputElement });

const renameInputRef = ref<RenameInputRef | null>(null);

function setRenameInputRef(
  value: Element | ComponentPublicInstance | null,
): void {
  if (value instanceof HTMLInputElement) {
    renameInputRef.value = value;
    return;
  }
  renameInputRef.value = value as
    | (ComponentPublicInstance & { $el?: HTMLInputElement })
    | null;
}

const renameModel = computed({
  get: () => props.editingTitle,
  set: (value: string | number) => emit("updateEditingTitle", String(value)),
});

const isModified = computed(
  () =>
    props.page.status === "published" && props.page.isModifiedSincePublish,
);

const cmsUsageBadgeLabelsList = computed(() =>
  cmsPageUsageBadgeLabels(props.cmsUsages),
);
const cmsUsageDetailLabelsList = computed(() =>
  cmsPageUsageDetailLabels(props.cmsUsages),
);

const primaryCmsLabel = computed(
  () => cmsUsageBadgeLabelsList.value[0] ?? null,
);

const extraCmsLabels = computed(() => cmsUsageBadgeLabelsList.value.slice(1));

const extraCmsCount = computed(() => extraCmsLabels.value.length);
const primaryCmsDetail = computed(
  () => cmsUsageDetailLabelsList.value[0] ?? primaryCmsLabel.value,
);

const lastEditedLabel = computed(() => {
  if (!props.page.updatedAt) {
    return null;
  }

  return formatRelativeTime(props.page.updatedAt);
});

const statusDotColor = computed((): string => {
  switch (props.page.status) {
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

const statusLabel = computed(() => {
  const translatedStatus = (() => {
    switch (props.page.status) {
      case "published":
        return t("pages.status.published");
      case "draft":
        return t("pages.status.draft");
      case "scheduled":
        return t("pages.status.scheduled");
      default:
        return t("pages.status.archived");
    }
  })();
  if (isModified.value) {
    return `${translatedStatus} · ${t("pages.status.modified")}`;
  }
  return translatedStatus;
});

watch(
  () => props.isRenaming,
  async (renaming) => {
    if (!renaming) return;
    await nextTick();
    const inputElement =
      renameInputRef.value instanceof HTMLInputElement
        ? renameInputRef.value
        : renameInputRef.value?.$el;
    if (!inputElement) return;
    inputElement.focus();
    inputElement.select();
  },
);

function openPreviewInNewTab(): void {
  const publicPath = props.page.slug === "index" ? "/" : `/${props.page.slug}`;
  const previewPath =
    props.page.status === "draft" ||
    props.page.status === "scheduled" ||
    props.page.systemRole === "cms-entry"
      ? `${publicPath}?preview=1`
      : publicPath;
  window.open(previewPath, "_blank");
}

function prewarmAndPrefetch(): void {
  prewarmBuilderOnce();
  emit("prefetch", props.page.slug);
}

const previewActions = computed(() => {
  if (props.page.status === "archived") {
    return [
      {
        key: "preview",
        icon: studioIcons.eye,
        label: t("pages.action.preview"),
        disabled: false,
        handler: openPreviewInNewTab,
      },
      {
        key: "open",
        icon: studioIcons.settings,
        label: t("pages.action.open"),
        disabled: false,
        handler: () => emit("edit", props.page.slug),
      },
      {
        key: "unarchive",
        icon: studioIcons.archived,
        label: t("pages.action.unarchive"),
        disabled: false,
        handler: () => emit("unarchive", props.page.slug),
      },
    ] as const;
  }

  return [
    {
      key: "edit",
      icon: studioIcons.edit,
      label: t("pages.action.editInComposer"),
      disabled: false,
      handler: () => emit("view", props.page.slug),
    },
    {
      key: "preview",
      icon: studioIcons.eye,
      label: t("pages.action.preview"),
      disabled: false,
      handler: openPreviewInNewTab,
    },
    {
      key: "open",
      icon: studioIcons.settings,
      label: t("pages.action.open"),
      disabled: false,
      handler: () => emit("edit", props.page.slug),
    },
  ] as const;
});
</script>

<template>
  <article
    class="group relative cursor-pointer overflow-hidden rounded-lg border border-solid border-border/50 bg-card/80 shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-border hover:shadow-md"
    @mouseenter="prewarmAndPrefetch"
    @mouseleave="emit('cancelPrefetch', page.slug)"
    @focusin="prewarmAndPrefetch"
    @focusout="emit('cancelPrefetch', page.slug)"
    @click="emit('edit', page.slug)"
  >
    <div class="relative aspect-video overflow-hidden bg-muted/25">
      <PagePreviewFrame
        :key="`${page.slug}:${page.snapshotUrl ?? ''}:${props.thumbnailRefreshToken ?? ''}`"
        class="absolute inset-0"
        :page-id="page.id"
        :page-slug="page.slug"
        :page-status="resolvePagePreviewStage(page)"
        :snapshot-url="page.snapshotUrl"
        :thumbnail-url="page.thumbnailUrl"
        :thumbnail-refresh-token="props.thumbnailRefreshToken"
        :inert="true"
        item-type="page"
        viewport="desktop"
        thumbnail-fit="cover"
        thumbnail-position="top"
      />

      <!-- Status chip (top-left) -->
      <div
        class="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2 py-0.5 backdrop-blur-sm"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: statusDotColor }"
          aria-hidden="true"
        />
        <span class="text-2xs capitalize text-muted-foreground">
          {{ statusLabel }}
        </span>
      </div>

      <!-- Actions menu (top-right, hover-only) -->
      <div
        class="preview-actions absolute right-3 top-3 z-30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        @click.stop
      >
        <PageActionsCell
          :page="page"
          @open="emit('edit', page.slug)"
          @edit-in-composer="emit('view', page.slug)"
          @rename="emit('rename', page.slug)"
          @duplicate="emit('duplicate', page.slug)"
          @publish="emit('publish', page.slug)"
          @unpublish="emit('unpublish', page.slug)"
          @archive="emit('archive', page.slug)"
          @unarchive="emit('unarchive', page.slug)"
          @regenerate-thumbnail="emit('regenerateThumbnail', page.slug)"
          @delete="emit('delete', page.slug)"
        />
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

      <!-- Pending overlay: shown while a new thumbnail is being captured -->
      <div
        v-if="props.isThumbnailPending"
        class="absolute inset-0 z-10 flex items-center justify-center bg-muted/60 backdrop-blur-[1px]"
      >
        <span
          :class="[studioIcons.loading, 'size-5 animate-spin text-muted-foreground']"
          aria-hidden="true"
        />
      </div>
    </div>

    <div class="space-y-2 p-3.5">
      <!-- Inline rename mode -->
      <template v-if="isRenaming">
        <div class="flex min-w-0 items-center gap-2">
          <Input
            :ref="setRenameInputRef"
            v-model="renameModel"
            plain
            :placeholder="t('cms.title')"
            spellcheck="false"
            class="h-5! min-w-0 flex-1 border-0 bg-transparent p-0 text-sm! font-medium leading-5 text-foreground caret-primary outline-none"
            @keydown="emit('renameKeydown', $event)"
            @click.stop
          />
          <div
            class="flex shrink-0 items-center gap-2"
            @click.stop
            @dblclick.stop
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-4! p-0! text-muted-foreground hover:text-emerald-500"
              :aria-label="t('pages.action.confirmRename')"
              @mousedown.prevent="emit('confirmRename')"
            >
              <span
                :class="[studioIcons.check, 'size-4 shrink-0']"
                aria-hidden="true"
              />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="size-4! p-0! text-muted-foreground hover:text-destructive"
              :aria-label="t('pages.action.cancelRename')"
              @mousedown.prevent="emit('cancelRename')"
            >
              <span
                :class="[studioIcons.close, 'size-4 shrink-0']"
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
      </template>

      <!-- Normal mode -->
      <template v-else>
        <h2 class="m-0 min-w-0 truncate text-sm font-medium capitalize text-foreground">
          {{ page.title }}
        </h2>

        <div
          class="flex min-w-0 items-center justify-between gap-3 text-2xs text-muted-foreground"
        >
          <div class="flex min-w-0 flex-1 items-center gap-1.5 truncate">
            <TooltipProvider v-if="primaryCmsLabel" :delay-duration="0">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    class="truncate rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5"
                    @click.stop
                  >
                    {{ primaryCmsLabel }}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" class="max-w-xs">
                  {{ primaryCmsDetail }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider v-if="extraCmsCount > 0" :delay-duration="0">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    class="shrink-0 cursor-default rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 tabular-nums"
                    @click.stop
                  >
                    +{{ extraCmsCount }}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" class="max-w-xs">
                  <ul class="m-0 list-none space-y-0.5 p-0">
                    <li
                      v-for="(label, index) in extraCmsLabels"
                      :key="label"
                    >
                      {{ label }} - {{ cmsUsageDetailLabelsList[index + 1] ?? label }}
                    </li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <span
              v-if="trafficVisits !== null"
              class="inline-flex shrink-0 items-center gap-1 tabular-nums"
            >
              <span
                >{{ formatCompactCount(trafficVisits) }} {{ t("pages.visits") }} ·
                {{ metricsPeriodDescription("7d") }}</span
              >
              <TrafficSparkline
                v-if="trafficSparkline.length > 0"
                :values="trafficSparkline"
                :width="24"
                :height="7"
              />
            </span>
          </div>

          <span v-if="lastEditedLabel" class="shrink-0 tabular-nums">
            {{ lastEditedLabel }}
          </span>
        </div>
      </template>
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
