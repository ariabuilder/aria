<script setup lang="ts">
import { computed, ref } from "vue";
import AppCanvasShell from "../Core/components/AppCanvasShell.vue";
import AppInspectorShell from "../Core/components/AppInspectorShell.vue";
import ComposerPanel from "../Composer/components/ComposerPanel.vue";
import ComposerCanvasControlBar from "../Composer/components/ComposerCanvasControlBar.vue";
import StageMarkupPreviewPanel from "./components/StageMarkupPreviewPanel.vue";
import type { StageAppEmits, StageAppProps } from "./types";

const props = defineProps<StageAppProps>();

const emit = defineEmits<StageAppEmits>();

const canvasShellRef = ref<InstanceType<typeof AppCanvasShell> | null>(null);
const canvasAreaRef = ref<HTMLElement | null>(null);

const stageIframeRef = computed(() => {
  return canvasShellRef.value?.stageIframeRef || null;
});

defineExpose({
  stageIframeRef,
});
</script>

<template>
  <main class="relative flex min-h-0 min-w-0 flex-1 gap-1.5 overflow-hidden">
    <ComposerPanel
      v-if="props.hasEnteredEditing"
      data-testid="composer-canvas-panel"
      class="min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <ComposerCanvasControlBar
        v-if="!props.isPreview"
        v-bind="props.canvasControlBar"
        @save="emit('save')"
        @publish="emit('publish')"
        @unpublish="emit('unpublish')"
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
      <div
        ref="canvasAreaRef"
        class="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <StageMarkupPreviewPanel
          v-if="!props.isPreview"
          :anchor-el="canvasAreaRef"
        />
        <AppCanvasShell
          ref="canvasShellRef"
          class="min-h-0 flex-1 overflow-hidden"
          :show="props.show"
          :page="props.page"
          :left-sidebar-open="props.leftSidebarOpen"
          :right-sidebar-open="props.rightSidebarOpen"
          :on-toggle-left-sidebar="props.onToggleLeftSidebar"
          :on-toggle-right-sidebar="props.onToggleRightSidebar"
          :is-loading="props.isLoading"
          :is-item-transitioning="props.isItemTransitioning"
          :load-error="props.loadError"
          :show-outlines="props.showOutlines"
          :wireframe-mode="props.wireframeMode"
          :current-layout="props.currentLayout"
          :stage-key="props.stageKey"
          :current-item-type="props.currentItemType"
          :current-item-slug="props.currentItemSlug"
          :header-component="props.headerComponent"
          :footer-component="props.footerComponent"
          :expanded-blocks="props.expandedBlocks"
          :page-slug="props.pageSlug"
          :show-empty-component-state="props.showEmptyComponentState"
          @undo="emit('undo')"
          @redo="emit('redo')"
          @background-click="emit('background-click')"
          @update:show-outlines="emit('update:show-outlines', $event)"
          @update:wireframe-mode="emit('update:wireframe-mode', $event)"
          @stage-ready="emit('stage-ready')"
          @select-block="emit('select-block', $event)"
          @add-block="(block, parentId) => emit('add-block', block, parentId)"
          @delete-block="emit('delete-block', $event)"
          @duplicate-block="emit('duplicate-block', $event)"
          @detach-component="emit('detach-component', $event)"
          @replace-block-with-component="
            (nodeId, componentSlug) =>
              emit('replace-block-with-component', nodeId, componentSlug)
          "
          @edit-component="emit('edit-component', $event)"
          @reorder-block="emit('reorder-block', $event)"
          @open-picker="emit('open-picker', $event)"
          @edit-layout-region="emit('edit-layout-region', $event)"
          @add-first-element="emit('add-first-element')"
        />
      </div>
    </ComposerPanel>

    <AppInspectorShell
      :show="props.show"
      :is-preview="props.isPreview"
      :is-item-transitioning="props.isItemTransitioning"
      :right-sidebar-open="props.rightSidebarOpen"
      :current-item-type="props.currentItemType"
      :current-item-slug="props.currentItemSlug"
      :current-layout-slug="props.currentLayoutSlug"
      :current-layout="props.currentLayout"
      :layout-metadata="props.layoutMetadata"
      @update-layout="emit('update-layout', $event)"
      @update-layout-metadata="emit('update-layout-metadata', $event)"
      @detach-instance="emit('detach-component', $event)"
      @edit-component="emit('edit-component', $event)"
    />
  </main>
</template>
