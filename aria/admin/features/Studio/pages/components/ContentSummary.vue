<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { getSectionIcon } from "@/lib/sectionIcons";

/**
 * Represents a recently added item displayed in the summary panel.
 */
export interface RecentlyAddedItem {
  name: string;
  /** Section/component type (e.g. "hero", "features") */
  type: string;
  /** Human-readable relative time (e.g. "2 min ago") */
  addedAt: string;
}

interface Props {
  sectionCount: number;
  componentCount: number;
  mediaCount: number;
  customCodeCount: number;
  recentlyAdded?: RecentlyAddedItem[];
}

withDefaults(defineProps<Props>(), {
  recentlyAdded: () => [],
});
</script>

<template>
  <div class="rounded-lg border border-border bg-card/50 p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-foreground">Content Summary</h3>
      <Button variant="ghost" size="sm" class="text-xs h-6 px-2">
        View structure
        <span :class="[studioIcons.chevronRight, 'size-3 ml-1']" />
      </Button>
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-4 gap-3">
      <div class="text-center">
        <div class="flex items-center justify-center gap-1.5 mb-1">
          <span :class="[studioIcons.list, 'size-3.5 text-primary']" />
          <span class="text-lg font-semibold text-foreground">{{ sectionCount }}</span>
        </div>
        <span class="text-2xs text-muted-foreground">Sections</span>
      </div>

      <div class="text-center">
        <div class="flex items-center justify-center gap-1.5 mb-1">
          <span :class="[studioIcons.component, 'size-3.5 text-purple-400']" />
          <span class="text-lg font-semibold text-foreground">{{ componentCount }}</span>
        </div>
        <span class="text-2xs text-muted-foreground">Components</span>
      </div>

      <div class="text-center">
        <div class="flex items-center justify-center gap-1.5 mb-1">
          <span :class="[studioIcons.image, 'size-3.5 text-blue-400']" />
          <span class="text-lg font-semibold text-foreground">{{ mediaCount }}</span>
        </div>
        <span class="text-2xs text-muted-foreground">Media</span>
      </div>

      <div class="text-center">
        <div class="flex items-center justify-center gap-1.5 mb-1">
          <span :class="[studioIcons.code, 'size-3.5 text-amber-400']" />
          <span class="text-lg font-semibold text-foreground">{{ customCodeCount }}</span>
        </div>
        <span class="text-2xs text-muted-foreground">Custom Code</span>
      </div>
    </div>

    <!-- Recently added -->
    <div v-if="recentlyAdded.length > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-medium text-foreground">Recently Added</h4>
        <Button variant="ghost" size="sm" class="text-xs h-6 px-2">
          View all
        </Button>
      </div>

      <div class="space-y-1.5">
        <div
          v-for="item in recentlyAdded.slice(0, 3)"
          :key="item.name"
          class="flex items-center justify-between text-xs"
        >
          <div class="flex items-center gap-2">
            <span :class="[getSectionIcon(item.type), 'size-3 text-muted-foreground']" />
            <span class="text-foreground">{{ item.name }}</span>
          </div>
          <span class="text-muted-foreground">{{ item.addedAt }}</span>
        </div>
      </div>
    </div>

    <!-- Tip -->
    <div class="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
      <span :class="[studioIcons.info, 'size-4 text-primary shrink-0 mt-0.5']" />
      <div>
        <p class="text-xs text-foreground">
          <span class="font-medium">Tip:</span> Drag sections to reorder
        </p>
        <p class="text-2xs text-muted-foreground mt-0.5">
          Changes are autosaved and published instantly.
        </p>
      </div>
    </div>
  </div>
</template>
