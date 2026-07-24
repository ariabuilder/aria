<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useStudioI18n } from "@/i18n";

import type { Component } from "@/composables/useBuilderData";
import ComponentsGroupNavShell from "@/features/Studio/components/components/ComponentsGroupNavShell.vue";
import { useDragDrop } from "@/composables/useDragDrop";
import { useComposerComponentLibrary } from "../composables/useComposerComponentLibrary";
import { useComposerComponentInsert } from "../composables/useComposerComponentInsert";
import ComposerComponentGroupFlyout from "./ComposerComponentGroupFlyout.vue";

const props = defineProps<{
  components: readonly Component[];
  searchQuery?: string;
}>();

const emit = defineEmits<{
  "add-element": [payload: import("@/types/app").AddElementPayload];
}>();
const { t } = useStudioI18n();

const library = useComposerComponentLibrary({
  components: () => props.components,
});

watch(
  () => props.searchQuery,
  (value) => {
    library.setSearchQuery(value ?? "");
  },
  { immediate: true },
);

const insert = useComposerComponentInsert({
  onInsert: (payload) => emit("add-element", payload),
});

const { isDragging, dragSource } = useDragDrop();

const flyoutOpen = ref(false);
const flyoutAnchorRect = ref<DOMRect | null>(null);
const hoveredGroupKey = ref<string | null>(null);
const closeAfterDrag = ref(false);

const canReadGrouping = computed(() => library.grouping.canReadGrouping.value);

const isComponentsDragActive = computed(
  () => isDragging.value && dragSource.value === "components",
);

const flyoutComponents = computed(() => {
  if (!flyoutOpen.value) {
    return [];
  }

  if (hoveredGroupKey.value === "all") {
    return library.filteredComponents.value;
  }

  const groupId = hoveredGroupKey.value?.startsWith("group:")
    ? hoveredGroupKey.value.slice("group:".length)
    : null;

  if (!groupId) {
    return library.filteredComponents.value;
  }

  const effectiveAssignments = library.grouping.buildEffectiveAssignments(
    props.components.map((component) => ({
      id: component.id,
      name: component.name,
      category: component.category,
    })),
  );

  return library.filteredComponents.value.filter(
    (component) => effectiveAssignments[component.id] === groupId,
  );
});

const flyoutGroupLabel = computed(() => {
  if (hoveredGroupKey.value === "all") {
    return t("components.sidebar.all");
  }

  const groupId = hoveredGroupKey.value?.startsWith("group:")
    ? hoveredGroupKey.value.slice("group:".length)
    : null;

  if (!groupId) {
    return t("components.title");
  }

  const group = library.grouping.customGroups.value.find(
    (item) => item.id === groupId,
  );
  return group?.name ?? t("components.title");
});

function openFlyoutForKey(key: string, anchorRect: DOMRect | null): void {
  closeAfterDrag.value = false;
  hoveredGroupKey.value = key;
  flyoutOpen.value = true;
  flyoutAnchorRect.value = anchorRect;
}

function closeFlyout(): void {
  if (isComponentsDragActive.value) {
    closeAfterDrag.value = true;
    return;
  }

  flyoutOpen.value = false;
  hoveredGroupKey.value = null;
  flyoutAnchorRect.value = null;
  closeAfterDrag.value = false;
}

function handleNavItemEnter(key: string, anchorRect: DOMRect | null): void {
  if (key === "all") {
    library.selectAll();
  } else if (key.startsWith("group:")) {
    library.selectGroup(key.slice("group:".length));
  }

  openFlyoutForKey(key, anchorRect);
}

function handleSelectAll(): void {
  library.selectAll();
}

function handleSelectGroup(groupId: string): void {
  library.selectGroup(groupId);
}

function handleFlyoutDragStart(id: string, event: DragEvent): void {
  closeAfterDrag.value = false;
  const component = flyoutComponents.value.find((item) => item.id === id);
  insert.handleDragStart(id, event, component?.name);
}

function handleFlyoutDragEnd(): void {
  insert.handleDragEnd();
  if (closeAfterDrag.value) {
    closeAfterDrag.value = false;
    flyoutOpen.value = false;
    hoveredGroupKey.value = null;
    flyoutAnchorRect.value = null;
  }
}

watch(isComponentsDragActive, (active, wasActive) => {
  if (wasActive && !active && closeAfterDrag.value) {
    closeAfterDrag.value = false;
    flyoutOpen.value = false;
    hoveredGroupKey.value = null;
    flyoutAnchorRect.value = null;
  }
});

onBeforeUnmount(() => {
  closeAfterDrag.value = false;
  flyoutOpen.value = false;
  hoveredGroupKey.value = null;
  flyoutAnchorRect.value = null;
});

defineExpose({
  closeFlyout,
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="!canReadGrouping"
      class="px-3 py-4 text-sm text-muted-foreground"
    >
      Component groups are unavailable for your account.
    </div>

    <ComponentsGroupNavShell
      v-else
      :groups="library.grouping.customGroups.value"
      :group-counts="library.groupCounts.value"
      :all-count="library.allCount.value"
      :active-filter="library.activeFilter.value"
      :can-update-grouping="false"
      :enable-drop-targets="false"
      @nav-item-enter="handleNavItemEnter"
      @select-all="handleSelectAll"
      @select-group="handleSelectGroup"
    />

    <ComposerComponentGroupFlyout
      :open="flyoutOpen"
      :anchor-rect="flyoutAnchorRect"
      :group-label="flyoutGroupLabel"
      :components="flyoutComponents"
      @close="closeFlyout"
      @insert="insert.insertComponent"
      @dragstart="handleFlyoutDragStart"
      @dragend="handleFlyoutDragEnd"
    />
  </div>
</template>
