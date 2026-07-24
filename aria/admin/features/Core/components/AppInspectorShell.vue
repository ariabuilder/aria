<script setup lang="ts">
import { defineAsyncComponent, toRef } from "vue";
import ComposerPanel from "../../Composer/components/ComposerPanel.vue";
import ComposerPanelSkeleton from "../../Composer/components/ComposerPanelSkeleton.vue";
import { useInspectorDocumentPath } from "../../Inspector/composables/useInspectorDocumentPath";
import type { LayoutDSL } from "../../../../lib/types/nodes";
import type { EditableItemType } from "../types/router";
import type { LayoutInspectorMetadata } from "../types/layout";

const InspectorPanel = defineAsyncComponent(
  () => import("../../Inspector/components/InspectorPanel.vue"),
);

const props = defineProps<{
  show: boolean;
  isPreview: boolean;
  isItemTransitioning: boolean;
  rightSidebarOpen?: boolean;
  currentItemType: EditableItemType;
  currentItemSlug: string;
  currentLayoutSlug: string | undefined;
  currentLayout: LayoutDSL | null;
  layoutMetadata: LayoutInspectorMetadata | undefined;
}>();

const emit = defineEmits<{
  "update-layout": [layoutSlug: string];
  "update-layout-metadata": [metadata: LayoutInspectorMetadata];
  "detach-instance": [nodeId: string];
  "edit-component": [componentId: string];
}>();

useInspectorDocumentPath(
  toRef(() => props.currentItemType),
  toRef(() => props.currentItemSlug),
);
</script>

<template>
  <ComposerPanel
    v-if="props.show && !props.isPreview && props.rightSidebarOpen !== false"
    data-testid="composer-inspector-panel"
    class="relative h-full w-70 min-w-70 max-w-70 shrink-0"
    :aria-busy="props.isItemTransitioning"
  >
    <div
      class="h-full min-h-0"
      :inert="props.isItemTransitioning"
      :aria-hidden="props.isItemTransitioning"
    >
      <InspectorPanel
        :current-item-type="props.currentItemType"
        :current-item-slug="props.currentItemSlug"
        :current-layout-slug="props.currentLayoutSlug"
        :current-layout="props.currentLayout"
        :layout-metadata="props.layoutMetadata"
        @update-layout="emit('update-layout', $event)"
        @update-layout-metadata="emit('update-layout-metadata', $event)"
        @detach-instance="emit('detach-instance', $event)"
        @edit-component="emit('edit-component', $event)"
      />
    </div>

    <ComposerPanelSkeleton v-if="props.isItemTransitioning" side="right" />
  </ComposerPanel>
</template>
