<script setup lang="ts">
import { TOOLBAR_ICONS } from "../../../composables/useCanvasOverlays";
import { studioIcons } from "@/lib/icons";
import { useSelectionToolbarCms } from "../composables/useSelectionToolbarCms";
import CmsQuickPicker from "./CmsQuickPicker.vue";
import { useStudioI18n } from "@/i18n";

const {
  showLoopButton,
  showLinkButton,
  showImageButton,
  showTextButton,
  isLoopActive,
  isLinkActive,
  isImageActive,
  isTextActive,
} = useSelectionToolbarCms();
const { t } = useStudioI18n();
</script>

<template>
  <template
    v-if="showLoopButton || showLinkButton || showImageButton || showTextButton"
  >
  <div
            class="mx-1.5 h-2.5 shrink-0 border-l border-solid border-muted-foreground/30"
            aria-hidden="true"
          />


    <div class="flex items-center gap-0 px-0" @click.stop>
      <CmsQuickPicker
        v-if="showLoopButton"
        mode="loop"
        :icon="TOOLBAR_ICONS.loop"
        :active="isLoopActive"
        :label="t('composer.toolbar.cmsLoop')"
        data-action="activate-loop"
      />

      <div v-if="showTextButton" class="flex items-center gap-0">
        <CmsQuickPicker
          mode="field"
          kind="text"
          :icon="studioIcons.inspectorTabProps"
          :label="t('composer.toolbar.cmsText')"
          :active="isTextActive"
        />
      </div>

      <div v-if="showImageButton" class="flex items-center gap-0">
        <CmsQuickPicker
          mode="field"
          kind="image"
          :icon="studioIcons.scanImage"
          :label="t('composer.toolbar.cmsImage')"
          :active="isImageActive"
        />
      </div>

      <div v-if="showLinkButton" class="flex items-center gap-0">
        <CmsQuickPicker
          mode="field"
          kind="link"
          :icon="studioIcons.link"
          :label="t('composer.toolbar.cmsLink')"
          :active="isLinkActive"
        />
      </div>
    </div>
  </template>
</template>
