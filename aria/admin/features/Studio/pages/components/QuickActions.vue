<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";

interface Props {
  /** Slug of the current page, used for action context. */
  pageSlug: string;
  /** Whether the delete action is allowed (disabled otherwise). Defaults to true. */
  canDelete?: boolean;
}

interface Emits {
  /** Emitted when the user clicks "Duplicate Page". */
  duplicate: [];
  /** Emitted when the user clicks "Move Page". */
  move: [];
  schedule: [];
  /** Emitted when the user clicks "Delete Page". */
  delete: [];
}

withDefaults(defineProps<Props>(), {
  canDelete: true,
});

defineEmits<Emits>();
</script>

<template>
  <div class="px-4 py-3 border-t border-border">
    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
      Quick Actions
    </h3>

    <div class="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        size="sm"
        class="justify-start text-xs h-8"
        @click="$emit('duplicate')"
      >
        <span :class="[studioIcons.duplicate, 'size-3 mr-2']" />
        Duplicate Page
      </Button>

      <Button
        variant="outline"
        size="sm"
        class="justify-start text-xs h-8"
        @click="$emit('move')"
      >
        <span :class="[studioIcons.arrowRight, 'size-3 mr-2']" />
        Move Page
      </Button>

      <Button
        variant="outline"
        size="sm"
        class="justify-start text-xs h-8"
        @click="$emit('schedule')"
      >
        <span :class="[studioIcons.clock, 'size-3 mr-2']" />
        Schedule
      </Button>

      <Button
        variant="outline"
        size="sm"
        class="justify-start text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        :disabled="!canDelete"
        @click="$emit('delete')"
      >
        <span :class="[studioIcons.trash, 'size-3 mr-2']" />
        Delete Page
      </Button>
    </div>
  </div>
</template>
