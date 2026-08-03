<script setup lang="ts">
import { computed, ref } from "vue";
import ComposerStage from "../../Composer/components/ComposerStage.vue";
import StageLoadState from "./StageLoadState.vue";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import type { EditableItemType } from "../../Core/types/router";
import type { ReorderOperation } from "../../../types/app";
import type { StageSelectBlockInput } from "../types";

interface Props {
  stageKey: string;
  currentItemType: EditableItemType;
  currentItemSlug: string;
  headerComponent: string | undefined;
  footerComponent: string | undefined;
  expandedBlocks: BuilderNode[];
  isLoading: boolean;
  loadError: string | null;
  showOutlines: boolean;
  showSelectionSizing: boolean;
  showSelectionToolbar: boolean;
  wireframeMode: boolean;
  pageSlug: string | null;
  currentLayout: LayoutDSL | null;
}

const props = defineProps<Props>();

const canMountStage = computed(
  () =>
    props.stageKey !== "stage-idle" &&
    !props.isLoading &&
    !props.loadError,
);

const emit = defineEmits<{
  ready: [];
  selectBlock: [selection: StageSelectBlockInput];
  addBlock: [block: BuilderNode, parentId: string | null];
  deleteBlock: [nodeId: string];
  duplicateBlock: [nodeId: string];
  detachComponent: [nodeId: string];
  replaceBlockWithComponent: [nodeId: string, componentSlug: string];
  editComponent: [componentId: string];
  reorderBlock: [operation: ReorderOperation];
  openPicker: [slotName: string];
  editLayoutRegion: [regionId: string];
  addFirstElement: [];
}>();

const stageRuntimeRef = ref<InstanceType<typeof ComposerStage> | null>(null);

const stageIframeRef = computed(() => {
  return stageRuntimeRef.value?.stageFrameRef?.iframeRef || null;
});

function handleStageReady(): void {
  emit("ready");
}

defineExpose({
  stageIframeRef,
});
</script>

<template>
  <div class="relative h-full w-full">
    <ComposerStage
      v-if="canMountStage"
      :key="props.stageKey"
      ref="stageRuntimeRef"
      :current-item-type="props.currentItemType"
      :current-item-slug="props.currentItemSlug"
      :header-component="props.headerComponent"
      :footer-component="props.footerComponent"
      :expanded-blocks="props.expandedBlocks"
      :show-outlines="props.showOutlines"
      :show-selection-sizing="props.showSelectionSizing"
      :show-selection-toolbar="props.showSelectionToolbar"
      :wireframe-mode="props.wireframeMode"
      :page-slug="props.pageSlug"
      :current-layout="props.currentLayout"
      @ready="handleStageReady"
      @select-block="emit('selectBlock', $event)"
      @add-block="(block, parentId) => emit('addBlock', block, parentId)"
      @delete-block="emit('deleteBlock', $event)"
      @duplicate-block="emit('duplicateBlock', $event)"
      @detach-component="emit('detachComponent', $event)"
      @replace-block-with-component="
        (nodeId, componentSlug) =>
          emit('replaceBlockWithComponent', nodeId, componentSlug)
      "
      @edit-component="emit('editComponent', $event)"
      @reorder-block="emit('reorderBlock', $event)"
      @open-picker="emit('openPicker', $event)"
      @edit-layout-region="emit('editLayoutRegion', $event)"
    />

    <div v-if="props.loadError" class="absolute inset-0 z-50">
      <StageLoadState
        :is-loading="false"
        :load-error="props.loadError"
      />
    </div>
  </div>
</template>
