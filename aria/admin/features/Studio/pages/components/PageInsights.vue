<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";

/** A single insight entry displayed in the list. */
export interface InsightItem {
  id: string;
  label: string;
  icon: string;
  /** Severity / outcome level. */
  status: "excellent" | "good" | "warning" | "error";
  /** Numeric score (optional, shown as score/maxScore). */
  score?: number;
  /** Maximum possible score (optional, shown as score/maxScore). */
  maxScore?: number;
  value?: string;
}

interface Props {
  insights: InsightItem[];
}

interface Emits {
  /** Emitted when the user clicks "View all". */
  "view-all": [];
}

defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * Maps an insight status to its Tailwind text-color class.
 * Uses emerald for positive, amber for warning, red for error.
 */
function getStatusColor(status: InsightItem["status"]): string {
  switch (status) {
    case "excellent": return "text-emerald-400";
    case "good": return "text-emerald-400";
    case "warning": return "text-amber-400";
    case "error": return "text-red-400";
  }
}

/**
 * Maps an insight status to a human-readable label.
 */
function getStatusLabel(status: InsightItem["status"]): string {
  switch (status) {
    case "excellent": return "Excellent";
    case "good": return "Good";
    case "warning": return "Needs Attention";
    case "error": return "Failed";
  }
}
</script>

<template>
  <div class="px-4 py-3 border-t border-border">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Page Insights
      </h3>
      <Button variant="ghost" size="sm" class="text-xs h-6 px-2" @click="emit('view-all')">
        View all
      </Button>
    </div>

    <div v-if="insights.length === 0" class="py-2">
      <p class="text-2xs text-muted-foreground">No insights available</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="insight in insights"
        :key="insight.id"
        class="flex items-center justify-between"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span :class="[insight.icon, 'size-3.5 shrink-0', getStatusColor(insight.status)]" />
          <span class="text-xs text-foreground truncate">{{ insight.label }}</span>
        </div>

        <span class="text-xs font-medium shrink-0 ml-2" :class="getStatusColor(insight.status)">
          <template v-if="insight.value !== undefined">
            {{ insight.value }}
          </template>
          <template v-else-if="insight.score !== undefined && insight.maxScore !== undefined">
            {{ insight.score }}/{{ insight.maxScore }}
          </template>
          <template v-else>
            {{ getStatusLabel(insight.status) }}
          </template>
        </span>
      </div>
    </div>
  </div>
</template>
