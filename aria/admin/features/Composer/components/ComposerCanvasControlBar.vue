<script setup lang="ts">
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
import { useStudioI18n } from "@/i18n";
import PanelHeader from "../../Core/components/PanelHeader.vue";
import StageMarkupPreviewPopover from "../../Stage/components/StageMarkupPreviewPopover.vue";
import CmsPreviewEntryPicker from "../../CMS/components/CmsPreviewEntryPicker.vue";
import type { PageDSL } from "../../../../lib/types/nodes";
import { useComposerCanvasControlBar } from "../composables/useComposerCanvasControlBar";
import { inject } from "vue";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import type { CmsPreviewEntryContext } from "../../CMS/composables/useCmsPreviewEntryContext";

interface Props {
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  currentPage?: PageDSL | null;
  canSave?: boolean;
  canPublish?: boolean;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  isPublishing?: boolean;
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentItemType: "page",
  currentItemSlug: "",
  currentPage: null,
  canSave: false,
  canPublish: false,
  hasUnsavedChanges: false,
  isSaving: false,
  isPublishing: false,
  isLoading: false,
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  save: [];
  publish: [];
  unpublish: [];
  undo: [];
  redo: [];
}>();

const {
  viewport,
  setViewport,
  viewportOptions,
  isViewportStripDisabled,
  isFitMode,
  isMinZoom,
  isMaxZoom,
  toggleScaleMode,
  zoomIn,
  zoomOut,
  selectZoomPreset,
  displayZoom,
  zoomPresets,
  scaleModeTooltipLabel,
  isZoomLabelPulsing,
  canUndo,
  canRedo,
  saveTooltipLabel,
  saveIconClass,
  isSaveDisabled,
  publishTooltipLabel,
  publishIconClass,
  isPublishDisabled,
  showPublishControls,
  showVisitControl,
  livePageHref,
  isVisitDisabled,
  visitTooltipLabel,
  showUnpublishAction,
} = useComposerCanvasControlBar({
  currentItemType: () => props.currentItemType,
  currentItemSlug: () => props.currentItemSlug,
  currentPage: () => props.currentPage,
  canSave: () => props.canSave,
  hasUnsavedChanges: () => props.hasUnsavedChanges,
  isSaving: () => props.isSaving,
  isPublishing: () => props.isPublishing,
  isLoading: () => props.isLoading,
  canPublish: () => props.canPublish,
});

function handlePublishClick(): void {
  if (showUnpublishAction.value) {
    emit("unpublish");
    return;
  }

  emit("publish");
}

const cmsPreviewEntryContext = inject<CmsPreviewEntryContext | null>(
  APP_INJECTION_KEYS.cmsPreviewEntryContext,
  null,
);
</script>

<template>
  <TooltipProvider>
    <PanelHeader test-id="composer-canvas-control-bar" class="overflow-hidden">
      <div
        class="grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2"
      >
        <!-- Left: undo/redo, markup preview -->
        <div class="flex min-w-0 items-center gap-1 justify-self-start">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                :disabled="!canUndo"
                :aria-label="t('composer.canvas.undo')"
                @click="emit('undo')"
              >
                <span :class="[studioIcons.undo, 'size-3.5 shrink-0']" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ t("composer.canvas.undoShortcut") }}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                :disabled="!canRedo"
                :aria-label="t('composer.canvas.redo')"
                @click="emit('redo')"
              >
                <span :class="[studioIcons.redo, 'size-3.5 shrink-0']" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ t("composer.canvas.redoShortcut") }}</TooltipContent>
          </Tooltip>

          <StageMarkupPreviewPopover variant="toolbar" />
        </div>

        <!-- Middle: CMS preview context, viewport, zoom -->
        <div class="flex min-w-0 shrink items-center gap-2 justify-self-center">
          <div
            v-if="cmsPreviewEntryContext?.showCmsEntryHeader.value"
            class="min-w-0 max-w-[20rem]"
          >
            <CmsPreviewEntryPicker
              :collection-id="cmsPreviewEntryContext.templateCollection.value!.id"
              :model-value="cmsPreviewEntryContext.previewEntryId.value"
              @select="cmsPreviewEntryContext.setPreviewEntry"
            />
          </div>

          <div
            v-else-if="cmsPreviewEntryContext?.showCmsListHeader.value"
            class="flex min-w-0 items-center gap-1.5"
          >
            <span
              :class="[studioIcons.databaseLine, 'size-3 shrink-0 text-muted-foreground']"
            />
            <span class="truncate text-xs font-semibold text-foreground">
              {{ cmsPreviewEntryContext.listCollection.value?.label }}
            </span>
          </div>

          <div
            v-if="
              cmsPreviewEntryContext?.showCmsEntryHeader.value ||
              cmsPreviewEntryContext?.showCmsListHeader.value
            "
            class="hidden h-6 w-0 shrink-0 border-l border-dashed border-border/50 sm:block"
            aria-hidden="true"
          />

          <div class="flex items-center gap-0.5">
            <Tooltip v-for="option in viewportOptions" :key="option.id">
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  variant="headerAction"
                  size="icon-sm"
                  class="shrink-0"
                  :class="
                    viewport === option.id
                      ? 'bg-card text-primary'
                      : 'text-muted-foreground'
                  "
                  :disabled="isViewportStripDisabled"
                  :aria-label="option.tooltip"
                  @click="setViewport(option.id)"
                >
                  <span :class="[option.icon, 'size-3.5 shrink-0']" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ option.tooltip }}</TooltipContent>
            </Tooltip>
          </div>

          <div
            class="mx-1 hidden h-4 w-0 shrink-0 border-l border-solid border-border sm:block"
            aria-hidden="true"
          />

          <div class="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="shrink-0"
                  :aria-label="scaleModeTooltipLabel"
                  @click="toggleScaleMode"
                >
                  <span
                    :class="[
                      isFitMode ? studioIcons.fitWidth : studioIcons.actualSize,
                      'size-4 shrink-0',
                    ]"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ scaleModeTooltipLabel }}</TooltipContent>
            </Tooltip>

            <div
              class="flex items-center gap-0"
            >
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="size-5 shrink-0 p-0!"
                    :disabled="isMinZoom"
                    :aria-label="t('composer.canvas.zoomOut')"
                    @click="zoomOut()"
                  >
                    <span
                      :class="[studioIcons.zoomOut, 'size-3 shrink-0']"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{{ t("composer.canvas.zoomOut") }}</TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-5 shrink-0 p-0! px-0! font-mono text-2xs! font-normal! leading-none tabular-nums text-muted-foreground hover:text-foreground"
                    :class="{ 'canvas-zoom-label-pulse': isZoomLabelPulsing }"
                    :aria-label="t('composer.canvas.zoomValue', { value: displayZoom })"
                  >
                    <span class="inline-flex items-baseline tabular-nums">
                      <span class="inline-block w-[3ch] text-right">{{ displayZoom }}</span>
                      <span>%</span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" class="min-w-24">
                  <DropdownMenuItem
                    v-for="preset in zoomPresets"
                    :key="preset"
                    class="flex items-center justify-between gap-3 font-mono text-xs tabular-nums"
                    @click="selectZoomPreset(preset)"
                  >
                    <span>{{ preset }}%</span>
                    <span
                      v-if="displayZoom === preset"
                      :class="[studioIcons.checkLinear, 'size-3.5 text-primary']"
                      aria-hidden="true"
                    />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="size-5 shrink-0 p-0!"
                    :disabled="isMaxZoom"
                    :aria-label="t('composer.canvas.zoomIn')"
                    @click="zoomIn()"
                  >
                    <span
                      :class="[studioIcons.zoomIn, 'size-3 shrink-0']"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{{ t("composer.canvas.zoomIn") }}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <!-- Right: save, publish, link -->
        <div class="flex min-w-0 items-center gap-0.5 justify-self-end">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                :disabled="isSaveDisabled"
                :aria-label="saveTooltipLabel"
                @click="emit('save')"
              >
                <span :class="saveIconClass" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {{ saveTooltipLabel }}
            </TooltipContent>
          </Tooltip>

          <Tooltip v-if="showPublishControls">
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                :disabled="isPublishDisabled"
                :aria-label="publishTooltipLabel"
                @click="handlePublishClick"
              >
                <span :class="publishIconClass" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {{ publishTooltipLabel }}
            </TooltipContent>
          </Tooltip>

          <Tooltip v-if="showVisitControl">
            <TooltipTrigger as-child>
              <a
                v-if="livePageHref && !isVisitDisabled"
                :href="livePageHref"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                :aria-label="visitTooltipLabel"
              >
                <span :class="[studioIcons.linkBold, 'size-4 shrink-0']" aria-hidden="true" />
              </a>
              <Button
                v-else
                type="button"
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                disabled
                :aria-label="visitTooltipLabel"
              >
                <span
                  :class="[studioIcons.linkBold, 'size-4 shrink-0 text-foreground/30']"
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {{ visitTooltipLabel }}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </PanelHeader>
  </TooltipProvider>
</template>
