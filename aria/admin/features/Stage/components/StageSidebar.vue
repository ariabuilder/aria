<script setup lang="ts">
import { ref } from "vue";
import ComposerSidebar from "../../Composer/components/ComposerSidebar.vue";
import ComposerPanel from "../../Composer/components/ComposerPanel.vue";
import ComposerPanelSkeleton from "../../Composer/components/ComposerPanelSkeleton.vue";

import type {
  AppLeftSidebarShellExpose,
  AppLeftSidebarShellListeners,
  AppLeftSidebarShellProps,
} from "../../Core";

interface StageSidebarProps {
  sidebarProps: AppLeftSidebarShellProps;
  sidebarListeners: AppLeftSidebarShellListeners;
}

const props = defineProps<StageSidebarProps>();

const composerSidebarRef = ref<AppLeftSidebarShellExpose | null>(null);

defineExpose<AppLeftSidebarShellExpose>({
  expandAncestorsInLayers(nodeId: string) {
    composerSidebarRef.value?.expandAncestorsInLayers(nodeId);
  },
  openQuickSwitch() {
    composerSidebarRef.value?.openQuickSwitch();
  },
});
</script>

<template>
  <ComposerPanel
    v-if="props.sidebarProps.show && !props.sidebarProps.isPreview"
    data-testid="composer-left-panel"
    bg="background"
    class="relative h-full w-64 min-w-64 max-w-64 shrink-0"
    :aria-busy="props.sidebarProps.isItemTransitioning"
  >
    <div
      class="h-full min-h-0"
      :inert="props.sidebarProps.isItemTransitioning"
      :aria-hidden="props.sidebarProps.isItemTransitioning"
    >
      <ComposerSidebar
        ref="composerSidebarRef"
        :open="props.sidebarProps.open"
        :active-blocks="props.sidebarProps.activeBlocks"
        :show-outlines="props.sidebarProps.showOutlines"
        :wireframe-mode="props.sidebarProps.wireframeMode"
        :has-unsaved-changes="props.sidebarProps.hasUnsavedChanges"
        :current-item-slug="props.sidebarProps.currentItemSlug"
        :current-item-type="props.sidebarProps.currentItemType"
        :current-layout="props.sidebarProps.currentLayout"
        :current-page="props.sidebarProps.currentPage"
        :current-component="props.sidebarProps.currentComponent"
        :available-pages="props.sidebarProps.availablePages"
        :available-layouts="props.sidebarProps.availableLayouts"
        :available-components="props.sidebarProps.availableComponents"
        :editing-tab="props.sidebarProps.editingTab"
        v-on="props.sidebarListeners"
      />
    </div>

    <ComposerPanelSkeleton
      v-if="props.sidebarProps.isItemTransitioning"
      side="left"
    />
  </ComposerPanel>
</template>
