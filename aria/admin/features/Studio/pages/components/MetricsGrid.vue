<script setup lang="ts">
import { computed } from "vue";
import { CircularProgress } from "@/components/ui/circular-progress";
import { studioIcons } from "@/lib/icons";

/**
 * Props for the MetricsGrid component.
 * Displays page metrics in a 4-column grid.
 */
interface Props {
  sectionCount: number;
  componentCount: number;
  mediaCount: number;
  seoScore: number;
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
});

/**
 * Computes the color class for the SEO score based on its value.
 * - 80+: emerald (good)
 * - 50-79: amber (moderate)
 * - 0-49: red (poor)
 */
const seoScoreColor = computed<string>(() => {
  if (props.seoScore >= 80) return "text-emerald-400";
  if (props.seoScore >= 50) return "text-amber-400";
  return "text-red-400";
});
</script>

<template>
  <div
    v-if="isLoading"
    class="grid grid-cols-2 gap-3 lg:grid-cols-4"
  >
    <div
      v-for="i in 4"
      :key="i"
      class="rounded-lg border border-border bg-card/50 p-4"
    >
      <div class="mb-2 flex items-center gap-2">
        <div class="size-8 animate-pulse rounded-md bg-muted/40" />
        <div class="h-7 w-10 animate-pulse rounded bg-muted/40" />
      </div>
      <div class="h-3 w-16 animate-pulse rounded bg-muted/30" />
    </div>
  </div>

  <div v-else class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <!-- Sections -->
    <div class="rounded-lg border border-border bg-card/50 p-4">
      <div class="flex items-center gap-2 mb-2">
        <div
          class="size-8 rounded-md bg-primary/10 flex items-center justify-center"
        >
          <span :class="[studioIcons.list, 'size-4 text-primary']" />
        </div>
        <span class="text-2xl font-semibold text-foreground">{{
          sectionCount
        }}</span>
      </div>
      <span class="text-xs text-muted-foreground">Sections</span>
    </div>

    <!-- Components -->
    <div class="rounded-lg border border-border bg-card/50 p-4">
      <div class="flex items-center gap-2 mb-2">
        <div
          class="size-8 rounded-md bg-purple-500/10 flex items-center justify-center"
        >
          <span :class="[studioIcons.component, 'size-4 text-purple-400']" />
        </div>
        <span class="text-2xl font-semibold text-foreground">{{
          componentCount
        }}</span>
      </div>
      <span class="text-xs text-muted-foreground">Components</span>
    </div>

    <!-- Media -->
    <div class="rounded-lg border border-border bg-card/50 p-4">
      <div class="flex items-center gap-2 mb-2">
        <div
          class="size-8 rounded-md bg-blue-500/10 flex items-center justify-center"
        >
          <span :class="[studioIcons.image, 'size-4 text-blue-400']" />
        </div>
        <span class="text-2xl font-semibold text-foreground">{{
          mediaCount
        }}</span>
      </div>
      <span class="text-xs text-muted-foreground">Media</span>
    </div>

    <!-- SEO Score -->
    <div class="rounded-lg border border-border bg-card/50 p-4">
      <div class="flex items-center gap-3 mb-2">
        <CircularProgress :value="seoScore" :size="32" :stroke-width="3" />
        <div>
          <span class="text-2xl font-semibold" :class="seoScoreColor">
            {{ seoScore }}
          </span>
          <span class="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span class="text-xs text-muted-foreground">SEO Score</span>
    </div>
  </div>
</template>
