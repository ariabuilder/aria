<!-- Undo/redo history list with jump-to-state. -->
<script setup lang="ts">
import { computed } from "vue";
import {
  useHistoryState,
  type OperationSummary,
} from "../composables/useHistoryState";
import { getOperationLabel } from "../composables/useHistory";
import { useHistoryControls } from "../composables/useHistoryControls";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

// Props & Emits

const props = withDefaults(
  defineProps<{
    /** Maximum height for the panel (CSS value) */
    maxHeight?: string;
    showHeader?: boolean;
    compact?: boolean;
  }>(),
  {
    maxHeight: "300px",
    showHeader: true,
    compact: false,
  },
);

const {
  canUndo,
  canRedo,
  operations,
  currentIndex,
  undoCount,
  redoCount,
  lastFailure,
} = useHistoryState();
const { handleUndo, handleRedo, handleJumpTo, clearFailure } =
  useHistoryControls();

/**
 * Operations with visual metadata for rendering
 */
const operationsWithState = computed(() => {
  return operations.value
    .map((op, index) => ({
      ...op,
      index,
      isCurrent: index === currentIndex.value,
      isPast: index < currentIndex.value,
      isFuture: index > currentIndex.value,
    }))
    .reverse();
});

const isEmpty = computed(() => operations.value.length === 0);

/**
 * Format timestamp as relative time (e.g., "2m ago", "just now")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  return new Date(timestamp).toLocaleTimeString();
}

async function jumpToHistoryIndex(index: number): Promise<void> {
  if (index === currentIndex.value) return;
  await handleJumpTo(index);
}

function formatFailureTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
</script>

<template>
  <div class="history-panel flex flex-col h-full bg-background rounded-lg p-3">
    <!-- Header -->
    <div
      v-if="showHeader"
      class="flex items-center justify-between border-b border-border border-dashed pb-2"
    >
      <div class="flex items-center gap-2 text-sm font-medium text-foreground">
        <span class="i-hugeicons:time-schedule size-4" />
        <span>History</span>
        <span v-if="!isEmpty" class="text-xs text-muted-foreground">
          ({{ operations.length }})
        </span>
      </div>

      <TooltipProvider>
        <div class="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                :disabled="!canUndo"
                @click="handleUndo"
              >
                <span class="i-hugeicons:undo size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Undo {{ undoCount > 0 ? `(${undoCount})` : "" }}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                :disabled="!canRedo"
                @click="handleRedo"
              >
                <span class="i-hugeicons:redo size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Redo {{ redoCount > 0 ? `(${redoCount})` : "" }}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>

    <!-- Empty State -->
    <div
      v-if="isEmpty"
      class="flex flex-col items-center justify-center py-8 text-center"
    >
      <span class="i-hugeicons:time-schedule size-8 text-muted-foreground mb-2" />
      <p class="text-sm text-foreground leading-0">No history yet</p>
      <p class="text-xs text-muted-foreground mt-1">Changes will appear here</p>
    </div>

    <!-- Failure diagnostics -->
    <div
      v-if="lastFailure"
      class="mx-3 my-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
      role="alert"
      aria-live="polite"
    >
      <div class="flex items-start gap-2">
        <span
          class="i-hugeicons:alert-01 size-4 mt-0.5 text-destructive shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium text-destructive">
            {{ lastFailure.phase.toUpperCase() }} failed
          </p>
          <p class="text-xs text-foreground wrap-break-word">
            {{ lastFailure.message }}
          </p>
          <p class="text-[11px] text-muted-foreground mt-1">
            {{
              lastFailure.operationDescription ||
              lastFailure.operationType ||
              "Unknown operation"
            }}
            ·
            {{ formatFailureTime(lastFailure.timestamp) }}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-6"
          @click="clearFailure"
        >
          <span class="i-hugeicons:cancel-circle size-3.5" />
        </Button>
      </div>
    </div>

    <!-- Operations List -->
    <ScrollArea v-else class="flex-1" :style="{ maxHeight: maxHeight }">
      <div class="py-1">
        <button
          v-for="op in operationsWithState"
          :key="`${op.index}-${op.timestamp}`"
          class="w-full px-2 py-2 flex items-center gap-2 text-left transition-colors"
          :class="[
            op.isCurrent ? 'bg-card text-muted-foreground' : 'hover:bg-muted',
            op.isFuture ? 'opacity-50' : '',
            compact ? 'py-1.5' : 'py-2',
          ]"
          @click="jumpToHistoryIndex(op.index)"
        >
          <!-- Current indicator -->
          <span
            v-if="op.isCurrent"
            class="i-hugeicons:arrow-right-01 size-3.5 text-primary shrink-0"
          />
          <span v-else class="size-3.5 shrink-0" />

          <!-- Operation info -->
          <div class="flex-1 min-w-0">
            <div
              class="text-sm font-medium truncate"
              :class="compact ? 'text-xs' : 'text-sm'"
            >
              {{ op.description || getOperationLabel(op.type) }}
            </div>
            <div
              v-if="!compact"
              class="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"
            >
              <span class="i-hugeicons:clock-01 size-3" />
              {{ formatRelativeTime(op.timestamp) }}
            </div>
          </div>

          <!-- State indicator -->
          <span
            class="text-2xs shrink-0"
            :class="[
              op.isCurrent
                ? 'text-primary font-medium'
                : op.isFuture
                  ? 'text-muted-foreground/50'
                  : 'text-muted-foreground',
            ]"
          >
            {{ op.isCurrent ? "Current" : op.isFuture ? "Redo" : "" }}
          </span>
        </button>
      </div>
    </ScrollArea>
  </div>
</template>

<style scoped>
.history-panel {
  min-height: 100px;
}
</style>
