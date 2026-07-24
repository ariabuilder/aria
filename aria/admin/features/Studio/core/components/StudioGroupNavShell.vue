<script setup lang="ts">
import { computed } from "vue";
import type { ComponentPublicInstance } from "vue";
import { useSlidingNavIndicator } from "@/features/Studio/core/composables/useSlidingNavIndicator";
import SlidingNavIndicator from "./SlidingNavIndicator.vue";
import { resolveButtonEl } from "@/features/Studio/core/utils/resolveButtonEl";
import StudioGroupNavList, {
  type StudioGroup,
} from "./StudioGroupNavList.vue";

const props = defineProps<{
  groups: readonly StudioGroup[];
  groupCounts: Readonly<Record<string, number>>;
  allCount: number;
  activeFilter: string;
  canUpdateGrouping: boolean;
  allLabel: string;
  newGroupLabel: string;
  deleteDialogTitle: string;
  deleteStayAvailableMessage: string;
  groupNamePlaceholder?: string;
  navAriaLabel: string;
  enableDropTargets?: boolean;
  isDropTarget?: (targetId: string | null) => boolean;
}>();

const emit = defineEmits<{
  selectAll: [];
  selectGroup: [groupId: string];
  createGroup: [name: string];
  renameGroup: [groupId: string, name: string];
  deleteGroup: [groupId: string];
  navItemEnter: [key: string, anchorRect: DOMRect | null];
  dragOver: [targetId: string | null, event: DragEvent];
  dragLeave: [targetId: string | null];
  drop: [targetId: string | null, event: DragEvent];
}>();

const navButtonEls = new Map<string, HTMLElement>();
const activeNavKey = computed(() => props.activeFilter);

const {
  navRef: organizerNavRef,
  indicator: navIndicator,
  indicatorAnimated: navIndicatorAnimated,
  registerButton: registerOrganizerNavButton,
  onItemEnter: onOrganizerNavEnter,
  onNavLeave: onOrganizerNavLeave,
  updateIndicator: updateOrganizerNavIndicator,
} = useSlidingNavIndicator({
  enabled: computed(() => true),
  activeKey: activeNavKey,
  hoverOnly: true,
  hideWhenOnActive: true,
});

function resolveNavAnchorRect(key: string): DOMRect | null {
  return navButtonEls.get(key)?.getBoundingClientRect() ?? null;
}

function registerNavButton(
  key: string,
  el: Element | ComponentPublicInstance | null,
): void {
  const resolved = resolveButtonEl(el);
  const existing = navButtonEls.get(key);

  if (resolved) {
    if (existing === resolved) {
      return;
    }
    navButtonEls.set(key, resolved);
  } else {
    if (!existing) {
      return;
    }
    navButtonEls.delete(key);
  }

  registerOrganizerNavButton(key, resolved);
}

function handleNavItemEnter(key: string): void {
  onOrganizerNavEnter(key);
  emit("navItemEnter", key, resolveNavAnchorRect(key));
}

function handleSelectAll(): void {
  emit("selectAll");
  emit("navItemEnter", "all", resolveNavAnchorRect("all"));
}

function handleSelectGroup(groupId: string): void {
  emit("selectGroup", groupId);
  emit("navItemEnter", `group:${groupId}`, resolveNavAnchorRect(`group:${groupId}`));
}

defineExpose({
  resolveNavAnchorRect,
});
</script>

<template>
  <nav
    ref="organizerNavRef"
    class="organizer-nav settings-nav relative min-h-0 flex-1 overflow-y-auto bg-background py-0"
    :aria-label="navAriaLabel"
    @scroll="updateOrganizerNavIndicator"
    @mouseleave="onOrganizerNavLeave"
  >
    <SlidingNavIndicator
      :visible="navIndicator.visible"
      :top="navIndicator.top"
      :height="navIndicator.height"
      :animated="navIndicatorAnimated"
    />

    <StudioGroupNavList
      variant="rail"
      :groups="groups"
      :group-counts="groupCounts"
      :all-count="allCount"
      :active-filter="activeFilter"
      :can-update-grouping="canUpdateGrouping"
      :all-label="allLabel"
      :new-group-label="newGroupLabel"
      :delete-dialog-title="deleteDialogTitle"
      :delete-stay-available-message="deleteStayAvailableMessage"
      :group-name-placeholder="groupNamePlaceholder"
      :enable-drop-targets="enableDropTargets ?? canUpdateGrouping"
      :is-drop-target="isDropTarget"
      :register-nav-button="registerNavButton"
      :on-nav-item-enter="handleNavItemEnter"
      @select-all="handleSelectAll"
      @select-group="handleSelectGroup"
      @create-group="emit('createGroup', $event)"
      @rename-group="(id, name) => emit('renameGroup', id, name)"
      @delete-group="emit('deleteGroup', $event)"
      @drag-over="(id, event) => emit('dragOver', id, event)"
      @drag-leave="(id) => emit('dragLeave', id)"
      @drop="(id, event) => emit('drop', id, event)"
    />
  </nav>
</template>

<style scoped>
.organizer-nav :deep(.settings-nav-item.nav-border-inactive),
.organizer-nav :deep(.settings-nav-item.hover\:nav-border-hover:hover),
.organizer-nav :deep(.sidebar-nav-target.nav-border-inactive),
.organizer-nav :deep(.sidebar-nav-target.hover\:nav-border-hover:hover) {
  box-shadow: inset 2px 0 0 0 transparent !important;
}
</style>
