<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { z } from "zod";
import type { ComponentPublicInstance } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FlickeringNavItem from "@/features/Studio/core/components/FlickeringNavItem.vue";
import type { ComponentGroup } from "@/lib/schemas/componentGrouping";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";

const GroupNameSchema = z.string().trim().min(1);

export type ComponentsGroupNavVariant = "sidebar" | "rail";

const props = withDefaults(
  defineProps<{
    variant: ComponentsGroupNavVariant;
    groups: readonly ComponentGroup[];
    groupCounts: Readonly<Record<string, number>>;
    allCount: number;
    activeFilter: string;
    canUpdateGrouping: boolean;
    enableDropTargets?: boolean;
    isDropTarget?: (targetId: string | null) => boolean;
    registerNavButton?: (
      key: string,
      el: Element | ComponentPublicInstance | null,
    ) => void;
    onNavItemEnter?: (key: string) => void;
  }>(),
  {
    enableDropTargets: false,
    isDropTarget: () => false,
    registerNavButton: undefined,
    onNavItemEnter: undefined,
  },
);

const emit = defineEmits<{
  selectAll: [];
  selectGroup: [groupId: string];
  createGroup: [name: string];
  renameGroup: [groupId: string, name: string];
  deleteGroup: [groupId: string];
  dragOver: [targetId: string | null, event: DragEvent];
  dragLeave: [targetId: string | null];
  drop: [targetId: string | null, event: DragEvent];
}>();

const sortedGroups = computed(() =>
  [...props.groups].sort((a, b) => a.name.localeCompare(b.name)),
);

const activeGroupId = computed(() => {
  if (!props.activeFilter.startsWith("group:")) {
    return null;
  }
  return props.activeFilter.slice("group:".length);
});

const isAllActive = computed(() => props.activeFilter === "all");

const renamingGroupId = ref<string | null>(null);
const renameInputValue = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);

const isCreatingGroup = ref(false);
const newGroupName = ref("");
const newGroupInputRef = ref<HTMLInputElement | null>(null);

const groupToDelete = ref<{ id: string; name: string } | null>(null);

function startRename(groupId: string, currentName: string): void {
  renamingGroupId.value = groupId;
  renameInputValue.value = currentName;
  void nextTick(() => {
    const input = renameInputRef.value;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  });
}

function cancelRename(): void {
  renamingGroupId.value = null;
  renameInputValue.value = "";
}

function submitRename(): void {
  const groupId = renamingGroupId.value;
  if (!groupId) {
    return;
  }
  const parsed = GroupNameSchema.safeParse(renameInputValue.value.trim());
  if (parsed.success) {
    emit("renameGroup", groupId, parsed.data);
  }
  cancelRename();
}

function openDeleteDialog(groupId: string): void {
  const group = props.groups.find((item) => item.id === groupId);
  if (group) {
    groupToDelete.value = { id: group.id, name: group.name };
  }
}

function closeDeleteDialog(): void {
  groupToDelete.value = null;
}

function confirmDeleteGroup(): void {
  if (!groupToDelete.value) {
    return;
  }
  emit("deleteGroup", groupToDelete.value.id);
  closeDeleteDialog();
}

function startCreateGroup(): void {
  if (!props.canUpdateGrouping) {
    return;
  }
  isCreatingGroup.value = true;
  newGroupName.value = "";
  void nextTick(() => {
    newGroupInputRef.value?.focus();
  });
}

function cancelCreateGroup(): void {
  isCreatingGroup.value = false;
  newGroupName.value = "";
}

function submitCreateGroup(): void {
  const parsed = GroupNameSchema.safeParse(newGroupName.value.trim());
  if (!parsed.success) {
    isCreatingGroup.value = false;
    return;
  }
  emit("createGroup", parsed.data);
  isCreatingGroup.value = false;
  newGroupName.value = "";
}

function rowClass(_targetId: string | null, isActive: boolean): string {
  return cn(
    "w-full !justify-start px-3 py-1.5 h-auto text-left transition-colors",
    isActive ? "!text-primary" : "",
  );
}

function isGroupFilterActive(groupId: string): boolean {
  return props.activeFilter === `group:${groupId}`;
}

const registeredNavEls = new Map<string, Element | ComponentPublicInstance | null>();

function bindNavRef(key: string) {
  return (el: Element | ComponentPublicInstance | null) => {
    if (registeredNavEls.get(key) === el) {
      return;
    }

    registeredNavEls.set(key, el);
    props.registerNavButton?.(key, el);
  };
}

function onNavEnter(key: string): void {
  props.onNavItemEnter?.(key);
}

defineExpose({ startCreateGroup });
</script>

<template>
  <div :class="variant === 'rail' ? 'flex flex-col' : 'flex flex-col gap-0'">
    <template v-if="variant === 'sidebar'">
      <Button
        variant="ghost"
        :class="rowClass(null, isAllActive)"
        @click="emit('selectAll')"
        @dragover.prevent="
          enableDropTargets && emit('dragOver', null, $event)
        "
        @dragleave="enableDropTargets && emit('dragLeave', null)"
        @drop.prevent="enableDropTargets && emit('drop', null, $event)"
      >
        All Components
      </Button>

      <Button
        v-for="group in sortedGroups"
        :key="group.id"
        variant="ghost"
        :class="rowClass(group.id, activeGroupId === group.id)"
        :title="group.name"
        @click="emit('selectGroup', group.id)"
      >
        <span class="truncate">{{ group.name }}</span>
      </Button>
    </template>

    <template v-else>
      <FlickeringNavItem
        :ref="bindNavRef('all')"
        :active="isAllActive"
        :drop-highlight="isDropTarget('__all__')"
        @click="emit('selectAll')"
        @mouseenter="onNavEnter('all')"
        @dragover.prevent="
          enableDropTargets && emit('dragOver', null, $event)
        "
        @dragleave="enableDropTargets && emit('dragLeave', null)"
        @drop.prevent="enableDropTargets && emit('drop', null, $event)"
        class="py-4.5"
      >
        <span class="min-w-0 truncate">All Components</span>
        <span class="shrink-0 text-2xs tabular-nums text-muted-foreground/60">
          {{ allCount }}
        </span>
      </FlickeringNavItem>

      <FlickeringNavItem
        v-for="group in sortedGroups"
        :key="group.id"
        :ref="bindNavRef(`group:${group.id}`)"
        row-as="div"
        :active="isGroupFilterActive(group.id)"
        :drop-highlight="isDropTarget(group.id)"
        class="group"
        @mouseenter="onNavEnter(`group:${group.id}`)"
        @dragover.prevent="
          enableDropTargets && emit('dragOver', group.id, $event)
        "
        @dragleave="enableDropTargets && emit('dragLeave', group.id)"
        @drop.prevent="enableDropTargets && emit('drop', group.id, $event)"
        @click="
          renamingGroupId !== group.id && emit('selectGroup', group.id)
        "
      >
        <template v-if="renamingGroupId === group.id">
          <input
            ref="renameInputRef"
            v-model="renameInputValue"
            type="text"
            class="min-w-0 flex-1 bg-transparent text-sm outline-none"
            @click.stop
            @keydown.enter.prevent="submitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="submitRename"
          />
        </template>
        <template v-else>
          <span class="min-w-0 truncate" :title="group.name">
            {{ group.name }}
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <template v-if="canUpdateGrouping">
              <Button
                variant="ghost"
                size="sm"
                class="pointer-events-none size-6 shrink-0 p-0! text-muted-foreground opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-foreground"
                :aria-label="`Rename ${group.name}`"
                @click.stop="startRename(group.id, group.name)"
              >
                <span :class="[studioIcons.penLine, 'size-3.5']" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="pointer-events-none size-6 shrink-0 p-0! text-muted-foreground opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-destructive"
                :aria-label="`Delete ${group.name}`"
                @click.stop="openDeleteDialog(group.id)"
              >
                <span :class="[studioIcons.trash, 'size-3.5']" />
              </Button>
            </template>
            <span class="ml-2 text-2xs tabular-nums text-muted-foreground/40">
              {{ groupCounts[group.id] ?? 0 }}
            </span>

          </div>
        </template>
      </FlickeringNavItem>

      <div
        v-if="canUpdateGrouping && isCreatingGroup"
        class="border-b border-dashed border-border/50 px-6 py-3"
      >
        <input
          ref="newGroupInputRef"
          v-model="newGroupName"
          type="text"
          placeholder="Group name"
          class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          @keydown.enter.prevent="submitCreateGroup"
          @keydown.esc.prevent="cancelCreateGroup"
          @blur="submitCreateGroup"
        />
        <p class="mt-1 text-2xs text-muted-foreground/50">
          Enter to create, Esc to cancel.
        </p>
      </div>

      <div
        v-if="canUpdateGrouping"
        class="border-b border-dashed border-border/50 px-3 py-2"
      >
        <Button
          variant="ghost"
          size="sm"
          class="w-full justify-start gap-2 px-3 text-muted-foreground"
          @click="startCreateGroup"
        >
          <span :class="[studioIcons.folderAdd, 'size-4']" />
          New group
        </Button>
      </div>
    </template>

    <Dialog
      :open="groupToDelete !== null"
      @update:open="(open) => !open && closeDeleteDialog()"
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete group</DialogTitle>
          <DialogDescription>
            Delete
            <span class="font-medium text-foreground">{{
              groupToDelete?.name
            }}</span>
            ? Components stay available; only the group is removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" @click="closeDeleteDialog">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" @click="confirmDeleteGroup">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
