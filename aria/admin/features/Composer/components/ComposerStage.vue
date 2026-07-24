<script setup lang="ts">
import { ref } from "vue";
import DesignStage from "../../Design/components/DesignStage.vue";
import StageFrame from "../../Stage/components/StageFrame.vue";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import type { StageSelectBlockInput } from "../../Stage/types";

const props = defineProps<{
  activeView?: "builder" | "options" | "styles";
  currentItemType: "page" | "layout" | "component";
  currentItemSlug?: string;
  headerComponent?: string;
  footerComponent?: string;
  expandedBlocks: BuilderNode[]; // Expanded tree with component references resolved
  showOutlines?: boolean;
  wireframeMode?: boolean;
  pageSlug?: string | null;
  currentLayout?: LayoutDSL | null;
}>();

const emit = defineEmits<{
  closeStyles: [];
  selectBlock: [selection: StageSelectBlockInput];
  addBlock: [block: BuilderNode, parentId: string | null];
  deleteBlock: [id: string];
  duplicateBlock: [nodeId: string];
  detachComponent: [nodeId: string];
  replaceBlockWithComponent: [nodeId: string, componentSlug: string];
  editComponent: [componentId: string];
  reorderBlock: [
    operation: {
      sourceParentId: string | null;
      sourceIndex: number;
      targetParentId: string | null;
      targetIndex: number;
    },
  ];
  openPicker: [slotName: string];
  editLayoutRegion: [regionId: string];
  ready: [];
}>();

// Expose StageFrame ref for cross-iframe drag-drop
const stageFrameRef = ref<InstanceType<typeof StageFrame> | null>(null);
defineExpose({ stageFrameRef });

</script>

<template>
  <div class="relative w-full h-full flex flex-col">
    <DesignStage
      v-if="props.activeView === 'styles'"
      key="styles"
      @close="emit('closeStyles')"
    />

    <div v-else key="builder" class="relative w-full h-full flex flex-col">
      <StageFrame
        ref="stageFrameRef"
        :blocks="props.expandedBlocks"
        :current-layout="props.currentLayout"
        :current-item-type="props.currentItemType"
        :current-item-slug="props.currentItemSlug"
        :show-outlines="props.showOutlines"
        :wireframe-mode="props.wireframeMode"
        @ready="emit('ready')"
        @select-block="(id) => emit('selectBlock', id)"
        @add-block="(block, parentId) => emit('addBlock', block, parentId)"
        @delete-block="(id) => emit('deleteBlock', id)"
        @duplicate-block="(nodeId) => emit('duplicateBlock', nodeId)"
        @detach-component="(nodeId) => emit('detachComponent', nodeId)"
        @replace-block-with-component="
          (nodeId, componentSlug) =>
            emit('replaceBlockWithComponent', nodeId, componentSlug)
        "
        @edit-component="(componentId) => emit('editComponent', componentId)"
        @reorder-block="(operation) => emit('reorderBlock', operation)"
        @open-picker="(slotName) => emit('openPicker', slotName)"
      />
    </div>
  </div>
</template>
