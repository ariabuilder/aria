<script setup lang="ts">
import { studioIcons } from "@/lib/icons";

defineProps<{
  tabs: readonly string[];
  activeTab: string;
}>();

defineEmits<{
  "update:activeTab": [tab: string];
}>();
</script>

<template>
  <div
    class="flex h-12 min-w-0 items-stretch overflow-x-auto border-b border-dashed border-border/50 bg-background/70"
    role="tablist"
  >
    <button
      v-for="tab in tabs"
      :key="tab"
      type="button"
      role="tab"
      :aria-selected="activeTab === tab"
      :class="[
        'relative flex shrink-0 items-center gap-2 px-4 text-xs font-serif font-medium transition-colors',
        activeTab === tab
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="$emit('update:activeTab', tab)"
    >
      <span
        v-if="activeTab === tab"
        :class="[studioIcons.arrowRight, 'size-3 text-primary']"
        aria-hidden="true"
      />
      <span>{{ tab }}</span>
      <span
        aria-hidden="true"
        :class="[
          'pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-left bg-primary transition-transform duration-150 ease-out',
          activeTab === tab ? 'scale-x-100' : 'scale-x-0',
        ]"
      />
    </button>
  </div>
</template>
