<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import type {
  BuilderNode,
  PageDSL,
  LayoutDSL,
} from "../../../../lib/types/nodes";
import type { EditableItemType } from "../types/router";
import type { ReorderOperation } from "../../../types/app";
import { nextStartupInstanceId, traceStartup } from "@/lib/startupTrace";
import { useShellModeTransition } from "../composables/useShellModeTransition";

import StageViewport from "../../Stage/components/StageViewport.vue";
import StageCanvasRuntime from "../../Stage/components/StageCanvasRuntime.vue";
import StageLoadState from "../../Stage/components/StageLoadState.vue";
import EmptyComponentState from "../../Stage/components/EmptyComponentState.vue";
import type { StageSelectBlockInput } from "../../Stage/types";

const props = defineProps<{
  show: boolean;
  page: PageDSL | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  isLoading: boolean;
  isItemTransitioning: boolean;
  loadError: string | null;
  showOutlines: boolean;
  wireframeMode: boolean;
  currentLayout: LayoutDSL | null;
  stageKey: string;
  currentItemType: EditableItemType;
  currentItemSlug: string;
  headerComponent: string | undefined;
  footerComponent: string | undefined;
  expandedBlocks: BuilderNode[];
  pageSlug: string | null;
  showEmptyComponentState: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  redo: [];
  "background-click": [];
  "update:show-outlines": [value: boolean];
  "update:wireframe-mode": [value: boolean];
  "stage-ready": [];
  "select-block": [selection: StageSelectBlockInput];
  "add-block": [block: BuilderNode, parentId: string | null];
  "delete-block": [nodeId: string];
  "duplicate-block": [nodeId: string];
  "detach-component": [nodeId: string];
  "replace-block-with-component": [nodeId: string, componentSlug: string];
  "edit-component": [componentId: string];
  "reorder-block": [operation: ReorderOperation];
  "open-picker": [slotName: string];
  "edit-layout-region": [regionId: string];
  "add-first-element": [];
}>();

const canvasShellInstanceId = nextStartupInstanceId("app-canvas-shell");
const shellTransition = useShellModeTransition();
const showCanvasPreloader = computed(
  () =>
    props.isItemTransitioning &&
    !props.loadError &&
    !shellTransition.isActive.value,
);

const stageRuntimeRef = ref<InstanceType<typeof StageCanvasRuntime> | null>(
  null,
);
const stageIframeRef = computed(() => {
  return stageRuntimeRef.value?.stageIframeRef || null;
});

// Once shown, keep the tree alive (v-show) so iframe stays warm
const hasBeenShown = ref(false);
watch(
  () => props.show,
  (val) => {
    traceStartup("app-canvas-shell:visibility", {
      instanceId: canvasShellInstanceId,
      show: val,
      hasBeenShown: hasBeenShown.value,
      stageKey: props.stageKey,
      currentItemType: props.currentItemType,
      currentItemSlug: props.currentItemSlug,
    });

    if (val) hasBeenShown.value = true;
  },
  { immediate: true },
);

watch(
  () => props.stageKey,
  (stageKey, previousStageKey) => {
    traceStartup("app-canvas-shell:stage-key", {
      instanceId: canvasShellInstanceId,
      stageKey,
      previousStageKey,
      currentItemType: props.currentItemType,
      currentItemSlug: props.currentItemSlug,
    });
  },
  { immediate: true },
);

onMounted(() => {
  traceStartup("app-canvas-shell:mounted", {
    instanceId: canvasShellInstanceId,
    stageKey: props.stageKey,
    currentItemType: props.currentItemType,
    currentItemSlug: props.currentItemSlug,
  });
});

onUnmounted(() => {
  traceStartup("app-canvas-shell:unmounted", {
    instanceId: canvasShellInstanceId,
    stageKey: props.stageKey,
    currentItemType: props.currentItemType,
    currentItemSlug: props.currentItemSlug,
  });
});

defineExpose({
  stageIframeRef,
});
</script>

<template>
  <div class="relative h-full w-full">
    <StageViewport
      v-if="hasBeenShown"
      v-show="props.show"
      :page="props.page"
      :disable-canvas-scaling="false"
      :left-sidebar-open="props.leftSidebarOpen"
      :right-sidebar-open="props.rightSidebarOpen"
      :on-toggle-left-sidebar="props.onToggleLeftSidebar"
      :on-toggle-right-sidebar="props.onToggleRightSidebar"
      :is-loading="props.isLoading"
      :show-outlines="props.showOutlines"
      :wireframe-mode="props.wireframeMode"
      :current-layout="props.currentLayout"
      @undo="emit('undo')"
      @redo="emit('redo')"
      @background-click="emit('background-click')"
      @update:show-outlines="emit('update:show-outlines', $event)"
      @update:wireframe-mode="emit('update:wireframe-mode', $event)"
    >
      <template #canvas>
        <StageCanvasRuntime
          ref="stageRuntimeRef"
          :stage-key="props.stageKey"
          :current-item-type="props.currentItemType"
          :current-item-slug="props.currentItemSlug"
          :header-component="props.headerComponent"
          :footer-component="props.footerComponent"
          :expanded-blocks="props.expandedBlocks"
          :is-loading="props.isLoading"
          :load-error="props.loadError"
          :show-outlines="props.showOutlines"
          :wireframe-mode="props.wireframeMode"
          :page-slug="props.pageSlug"
          :current-layout="props.currentLayout"
          @ready="emit('stage-ready')"
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
      </template>
    </StageViewport>

    <div
      v-if="showCanvasPreloader"
      class="absolute inset-0 z-50 bg-background"
    >
      <StageLoadState :is-loading="true" :load-error="null" />
    </div>

    <EmptyComponentState
      v-if="props.showEmptyComponentState"
      :item-type="props.currentItemType as 'page' | 'component'"
      :item-slug="props.currentItemSlug"
      @add-first-element="emit('add-first-element')"
    />
  </div>
</template>
