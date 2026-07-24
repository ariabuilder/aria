<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";

import BaseProperty from "./BaseProperty.vue";
import IconProperty from "./IconProperty.vue";
import LinkProperty from "./LinkProperty.vue";
import {
  useSelectedNodeState,
  useSelectionTreeState,
  useStageSignalBridge,
} from "../../Core";
import { createIconListItemNode } from "../../../../lib/blocks/listNodes";
import { findNodeById, getNodePath } from "../../../../lib/blocks/nodeUtils";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { useStudioI18n } from "@/i18n";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  targetNodeId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
  targetNodeId: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const internalOpen = ref(props.defaultOpen);
const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const { selectedNode } = useSelectedNodeState();
const { selectionTreeRootNodes } = useSelectionTreeState();
const { signalAddBlock } = useStageSignalBridge();

const targetNode = computed<BuilderNode | null>(() => {
  if (!props.targetNodeId) {
    return selectedNode.value?.type?.toLowerCase() === "list"
      ? selectedNode.value
      : null;
  }

  return findNodeById(selectionTreeRootNodes.value, props.targetNodeId) ?? null;
});

const canAddListItem = computed(
  () => targetNode.value?.type?.toLowerCase() === "list",
);

function findFirstIconNode(
  node: BuilderNode | null | undefined,
): BuilderNode | null {
  if (!node) {
    return null;
  }

  if (node.type?.toLowerCase() === "icon") {
    return node;
  }

  for (const child of node.children) {
    const nested = findFirstIconNode(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function findListItemIconNode(
  node: BuilderNode | null | undefined,
): BuilderNode | null {
  if (!node || node.type?.toLowerCase() !== "listitem") {
    return null;
  }

  return (
    node.children.find((child) => child.type?.toLowerCase() === "icon") ??
    findFirstIconNode(node)
  );
}

function findFirstListItemNode(
  node: BuilderNode | null | undefined,
): BuilderNode | null {
  if (!node) {
    return null;
  }

  if (node.type?.toLowerCase() === "listitem") {
    return node;
  }

  for (const child of node.children) {
    const nested = findFirstListItemNode(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

const activeListItemNode = computed<BuilderNode | null>(() => {
  const listNode = targetNode.value;
  if (!listNode) {
    return null;
  }

  const selected = selectedNode.value;
  const fallbackItem = findFirstListItemNode(listNode);
  if (!selected) {
    return fallbackItem;
  }

  if (selected.id === listNode.id) {
    return fallbackItem;
  }

  if (selected.type?.toLowerCase() === "listitem") {
    return selected;
  }

  const path = getNodePath(selectionTreeRootNodes.value, selected.id);
  if (!path.includes(listNode.id)) {
    return fallbackItem;
  }

  for (const ancestorId of [...path].reverse()) {
    const ancestor = findNodeById(selectionTreeRootNodes.value, ancestorId);
    if (ancestor?.type?.toLowerCase() === "listitem") {
      return ancestor;
    }

    if (ancestorId === listNode.id) {
      break;
    }
  }

  return fallbackItem;
});

const activeIconNode = computed<BuilderNode | null>(() => {
  const listNode = targetNode.value;
  if (!listNode) {
    return null;
  }

  const selected = selectedNode.value;
  const fallbackIcon = findFirstIconNode(listNode);
  if (!selected) {
    return fallbackIcon;
  }

  if (selected.id === listNode.id) {
    return fallbackIcon;
  }

  const selectedType = selected.type?.toLowerCase();
  if (selectedType === "icon") {
    return selected;
  }

  if (selectedType === "listitem") {
    return findListItemIconNode(selected) ?? fallbackIcon;
  }

  const path = getNodePath(selectionTreeRootNodes.value, selected.id);
  if (!path.includes(listNode.id)) {
    return fallbackIcon;
  }

  for (const ancestorId of [...path].reverse()) {
    const ancestor = findNodeById(selectionTreeRootNodes.value, ancestorId);
    if (ancestor?.type?.toLowerCase() === "listitem") {
      return findListItemIconNode(ancestor) ?? fallbackIcon;
    }

    if (ancestorId === listNode.id) {
      break;
    }
  }

  return fallbackIcon;
});

const activeIconNodeId = computed(() => activeIconNode.value?.id);
const activeListItemNodeId = computed(() => activeListItemNode.value?.id);
const activeIconLabel = computed(
  () => activeIconNode.value?.metadata?.label ?? t("inspector.iconList.itemIcon"),
);

function addListItem(): void {
  const listNode = targetNode.value;
  if (!listNode) {
    return;
  }

  const nextItemNumber = listNode.children.length + 1;
  const nextBlock = createIconListItemNode(`List item ${nextItemNumber}`, {
    label: `Item ${nextItemNumber}`,
  });

  signalAddBlock({
    block: nextBlock,
    parentId: listNode.id,
  });
}
</script>

<template>
  <BaseProperty
    title="Icon List"
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    @update:open="sectionOpen = $event"
  >
    <div class="space-y-3">
      <div
        v-if="canAddListItem || activeIconNodeId"
        data-testid="icon-list-header-row"
        class="flex items-center justify-between gap-3"
      >
        <p
          v-if="activeIconNodeId"
          data-testid="icon-list-active-icon-label"
          class="min-w-0 truncate text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {{ t("inspector.iconList.editing", { icon: activeIconLabel }) }}
        </p>

        <div v-else class="min-w-0" />

        <Button
          v-if="canAddListItem"
          data-testid="icon-list-add-item-button"
          type="button"
          variant="default"
          size="sm"
          class="shrink-0 text-xs font-medium"
          @click="addListItem"
        >
          {{ t("inspector.list.addItem") }}
        </Button>
      </div>

      <div v-if="activeIconNodeId" class="space-y-3">
        <IconProperty
          embedded
          :current-item-type="props.currentItemType"
          :current-item-slug="props.currentItemSlug"
          :target-node-id="activeIconNodeId"
        />
      </div>

      <div
        v-if="activeListItemNodeId"
        class="space-y-3 border-t border-dashed border-border/50 pt-3"
      >
        <LinkProperty
          embedded
          :current-item-type="props.currentItemType"
          :current-item-slug="props.currentItemSlug"
          :target-node-id="activeListItemNodeId"
          :show-scope-control="true"
          default-scope="row"
        />
      </div>

      <p v-else class="text-xs text-muted-foreground">
        {{ t("inspector.iconList.empty") }}
      </p>
    </div>
  </BaseProperty>
</template>
