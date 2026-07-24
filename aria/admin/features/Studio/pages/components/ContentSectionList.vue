<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studioIcons } from "@/lib/icons";
import { getSectionIcon } from "@/lib/sectionIcons";

export interface ContentSection {
  id: string;
  name: string;
  /** Section type (e.g. "hero", "features", "footer") */
  type: string;
  variant?: string;
  status: "published" | "draft";
  isVisible: boolean;
  order: number;
  icon?: string;
  /** ISO-8601 timestamp of last modification */
  lastModified?: string;
}

interface Props {
  sections: ContentSection[];
  /** Whether drag-reorder mode is active */
  isReordering?: boolean;
  /** Whether drag handles are shown (requires pages.reorderSections) */
  showReorderHandles?: boolean;
}

/**
 * Emits for user interactions with the section list.
 */
interface Emits {
  /** Emit new ordering after a drag operation */
  reorder: [newOrder: ContentSection[]];
  /** Toggle section visibility (show/hide) */
  "toggle-visibility": [sectionId: string];
  "toggle-publish": [sectionId: string];
  "open-settings": [sectionId: string];
  "add-section": [];
  duplicate: [sectionId: string];
  delete: [sectionId: string];
}

const props = withDefaults(defineProps<Props>(), {
  isReordering: false,
  showReorderHandles: true,
});

const emit = defineEmits<Emits>();

const localSections = ref<ContentSection[]>([...props.sections]);

/** Toggle drag reorder mode — emits the new order on drag end */
function onDragEnd(): void {
  emit("reorder", localSections.value);
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(section, index) in sections"
      :key="section.id"
      class="group flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
    >
      <div class="flex items-center gap-3 min-w-0">
        <!-- Drag handle -->
        <span
          v-if="showReorderHandles"
          :class="[
            studioIcons.dragHandle,
            'size-4 text-muted-foreground shrink-0',
            isReordering ? 'opacity-100 cursor-grab' : 'opacity-0 group-hover:opacity-60',
          ]"
        />

        <!-- Section icon -->
        <div
          class="size-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0"
        >
          <span :class="[getSectionIcon(section.type), 'size-4 text-primary']" />
        </div>

        <!-- Section info -->
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-foreground truncate">
              {{ section.name }}
            </span>
            <span v-if="section.variant" class="text-xs text-muted-foreground">
              {{ section.variant }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <!-- Status badge -->
        <Badge
          :variant="section.status === 'published' ? 'default' : 'secondary'"
          class="text-xs"
        >
          {{ section.status === "published" ? "Published" : "Draft" }}
        </Badge>

        <!-- Visibility toggle -->
        <Button
          variant="ghost"
          size="sm"
          class="size-7 p-0"
          :title="section.isVisible ? 'Hide section' : 'Show section'"
          @click="emit('toggle-visibility', section.id)"
        >
          <span
            :class="[
              section.isVisible ? studioIcons.eye : studioIcons.eyeOff,
              'size-3.5',
            ]"
          />
        </Button>

        <!-- Actions menu -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="size-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span :class="[studioIcons.moreVertical, 'size-3.5']" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="emit('open-settings', section.id)">
              <span :class="[studioIcons.settings, 'size-3.5 mr-2']" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('toggle-publish', section.id)">
              <span :class="[studioIcons.published, 'size-3.5 mr-2']" />
              {{ section.status === "published" ? "Unpublish" : "Publish" }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('duplicate', section.id)">
              <span :class="[studioIcons.duplicate, 'size-3.5 mr-2']" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              class="text-destructive"
              @click="emit('delete', section.id)"
            >
              <span :class="[studioIcons.trash, 'size-3.5 mr-2']" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- Add section button -->
    <Button
      variant="outline"
      class="w-full border-dashed hover:border-primary hover:bg-primary/5"
      @click="emit('add-section')"
    >
      <span :class="[studioIcons.add, 'size-4 mr-2']" />
      Add Section
    </Button>
  </div>
</template>
