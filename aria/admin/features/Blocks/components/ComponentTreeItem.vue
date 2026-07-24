<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { studioIcons } from "@/lib/icons";

defineOptions({ name: "ComponentTreeItem" });

interface ComponentItem {
  slug: string;
  name: string;
  type?: string;
  description?: string;
  category?: string;
  parent?: string;
  order?: number;
  children?: ComponentItem[];
  isExpanded?: boolean;
}

interface Props {
  modelValue: ComponentItem[];
  currentItemSlug?: string;
  currentItemType?: string;
  depth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: ComponentItem[]): void;
  (e: "select", slug: string): void;
  (e: "toggleExpand", slug: string): void;
  (e: "duplicate", slug: string): void;
  (e: "delete", slug: string): void;
  (e: "rename", slug: string, newName: string): void;
  (e: "dragstart", component: ComponentItem, event: DragEvent): void;
  (e: "dragend", event: DragEvent): void;
}>();

const handleSelect = (slug: string) => emit("select", slug);
const handleToggleExpand = (slug: string) => emit("toggleExpand", slug);
const handleDuplicate = (slug: string) => emit("duplicate", slug);

const editingSlug = ref<string | null>(null);
const editingName = ref("");
const originalName = ref("");
const renameInput = ref<HTMLInputElement | null>(null);

const startRename = async (component: ComponentItem) => {
  if (component.type === "folder") return;
  editingSlug.value = component.slug;
  editingName.value = component.name || component.slug;
  originalName.value = component.name || component.slug;
  await nextTick();
  // Find and focus the input
  const input = document.querySelector(
    `input[data-rename-slug="${component.slug}"]`,
  ) as HTMLInputElement;
  if (input) {
    input.focus();
    input.select();
  }
};

const cancelRename = () => {
  editingSlug.value = null;
  editingName.value = "";
  originalName.value = "";
};

const finishRename = (slug: string) => {
  const newName = editingName.value.trim();
  if (newName && newName !== originalName.value) {
    emit("rename", slug, newName);
  }
  cancelRename();
};

const handleKeydown = (e: KeyboardEvent, slug: string) => {
  if (e.key === "Enter") {
    e.preventDefault();
    finishRename(slug);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelRename();
  }
};

const deleteConfirmOpen = ref(false);
const deleteTarget = ref<{ slug: string; name: string } | null>(null);

const confirmDelete = () => {
  if (deleteTarget.value) {
    emit("delete", deleteTarget.value.slug);
    deleteConfirmOpen.value = false;
    deleteTarget.value = null;
  }
};

const openDeleteConfirm = (component: ComponentItem) => {
  deleteTarget.value = {
    slug: component.slug,
    name: component.name || component.slug,
  };
  deleteConfirmOpen.value = true;
};

const updateChildren = (
  component: ComponentItem,
  newChildren: ComponentItem[],
) => {
  const updatedList = [...props.modelValue];
  const index = updatedList.findIndex((c) => c.slug === component.slug);
  if (index !== -1) {
    updatedList[index] = { ...component, children: newChildren };
    emit("update:modelValue", updatedList);
  }
};
</script>

<template>
  <div>
    <div
      v-for="component in modelValue"
      :key="component.slug"
      :data-slug="component.slug"
      class="group/item"
    >
      <!-- Component/Folder Item -->
      <div class="flex items-center gap-1 relative">
        <!-- Expand/Collapse Button -->
        <button
          v-if="
            component.type === 'folder' &&
            component.children &&
            component.children.length > 0
          "
          @click.stop="handleToggleExpand(component.slug)"
          class="absolute left-0 z-10 p-1 hover:bg-accent rounded transition-colors"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.chevronRight, 'w-3 h-3 text-muted-foreground transition-transform duration-200']"
            :class="{ 'rotate-90': component.isExpanded }"
          />
        </button>

        <!-- Component Button -->
        <ContextMenu>
          <ContextMenuTrigger class="flex-1 min-w-0">
            <button
              :draggable="component.type !== 'folder'"
              class="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors w-full"
              :class="{
                'pl-6':
                  component.type === 'folder' &&
                  component.children &&
                  component.children.length > 0,
                'bg-primary text-primary-foreground hover:bg-primary/90':
                  currentItemType === 'component' &&
                  currentItemSlug === component.slug,
                'text-muted-foreground': !(
                  currentItemType === 'component' &&
                  currentItemSlug === component.slug
                ),
                'cursor-move': component.type !== 'folder',
              }"
              @click="
                component.type === 'folder'
                  ? handleToggleExpand(component.slug)
                  : handleSelect(component.slug)
              "
              @dblclick.stop="startRename(component)"
              @dragstart.stop="emit('dragstart', component, $event)"
              @dragend.stop="emit('dragend', $event)"
            >
              <span
                v-if="component.type === 'folder'"
                aria-hidden="true"
                :class="[studioIcons.folder, 'w-3.5 h-3.5 flex-shrink-0 opacity-50']"
              />
              <span
                v-else
                aria-hidden="true"
                class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground"
                :class="{
                  'text-primary-foreground':
                    currentItemType === 'component' &&
                    currentItemSlug === component.slug,
                }"
              />
              <input
                v-if="editingSlug === component.slug"
                v-model="editingName"
                :data-rename-slug="component.slug"
                @blur="finishRename(component.slug)"
                @keydown="handleKeydown($event, component.slug)"
                class="flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 text-sm outline-none text-foreground"
                @click.stop
              />
              <span
                v-else
                class="truncate overflow-hidden text-ellipsis whitespace-nowrap min-w-0 flex-1"
              >
                {{ component.name || component.slug }}
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-sidebar">
            <ContextMenuItem @select="startRename(component)">
              <span
                aria-hidden="true"
                :class="[studioIcons.penLine, 'w-4 h-4 mr-2 shrink-0']"
              />
              Rename
            </ContextMenuItem>
            <ContextMenuItem @select="handleDuplicate(component.slug)">
              <span
                aria-hidden="true"
                :class="[studioIcons.copy, 'w-4 h-4 mr-2 shrink-0']"
              />
              Duplicate
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              @select="openDeleteConfirm(component)"
              class="text-destructive focus:text-destructive"
            >
              <span
                aria-hidden="true"
                :class="[studioIcons.trashBin, 'w-4 h-4 mr-2 shrink-0']"
              />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <!-- Action Buttons (visible on hover, only for components, not folders) -->
        <div
          v-if="component.type !== 'folder'"
          class="opacity-0 group-hover/item:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0"
        >
          <button
            @click.stop="handleDuplicate(component.slug)"
            class="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Duplicate component"
          >
            <span
              aria-hidden="true"
              :class="[studioIcons.copy, 'w-3 h-3 shrink-0']"
            />
          </button>
          <button
            @click.stop="openDeleteConfirm(component)"
            class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete component"
          >
            <span
              aria-hidden="true"
              :class="[studioIcons.trashBin, 'w-3 h-3 shrink-0']"
            />
          </button>
        </div>
      </div>

      <!-- Children -->
      <div
        v-if="
          component.type === 'folder' &&
          component.isExpanded &&
          component.children &&
          component.children.length > 0
        "
        class="pl-4 ml-2 border-l border-border space-y-0.5"
      >
        <ComponentTreeItem
          :model-value="component.children || []"
          @update:model-value="
            (newChildren) => updateChildren(component, newChildren)
          "
          :current-item-slug="currentItemSlug"
          :current-item-type="currentItemType"
          :depth="depth + 1"
          @select="handleSelect"
          @toggle-expand="handleToggleExpand"
          @duplicate="handleDuplicate"
          @delete="(slug) => emit('delete', slug)"
          @rename="(slug, newName) => emit('rename', slug, newName)"
        />
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="deleteConfirmOpen" @update:open="deleteConfirmOpen = $event">
      <DialogContent class="sm:max-w-[425px]" @keydown.enter="confirmDelete">
        <DialogHeader>
          <DialogTitle>Delete Component</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{{ deleteTarget?.name }}"? This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteConfirmOpen = false">
            Cancel
          </Button>
          <Button variant="destructive" @click="confirmDelete"> Delete </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
