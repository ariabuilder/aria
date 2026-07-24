<script setup lang="ts">
/**
 * InspectorEmpty - Empty State Component
 *
 * Shown when no element is selected in the canvas.
 *
 * @component
 */
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full p-8 text-center">
    <!-- Icon -->
    <div
      class="w-16 h-16 mb-4 bg-linear-to-br from-muted to-accent rounded-xl flex items-center justify-center"
    >
      <span
        aria-hidden="true"
        :class="[studioIcons.cursorLine, 'size-8 shrink-0 text-muted-foreground']"
      />
    </div>

    <!-- Title -->
    <h3 class="text-lg font-semibold text-foreground mb-2">{{ t("inspector.empty.title") }}</h3>

    <!-- Description -->
    <p class="text-sm text-muted-foreground max-w-xs">
      {{ t("inspector.empty.description") }}
    </p>

    <!-- Hints -->
    <div class="mt-6 space-y-2 text-xs text-muted-foreground">
      <div class="flex items-center gap-2">
        <kbd
          class="px-1.5 py-0.5 bg-muted rounded border border-border font-mono"
        >
          Click
        </kbd>
        <span>{{ t("inspector.empty.selectElement") }}</span>
      </div>
      <div class="flex items-center gap-2">
        <kbd
          class="px-1.5 py-0.5 bg-muted rounded border border-border font-mono"
        >
          Esc
        </kbd>
        <span>{{ t("inspector.empty.deselect") }}</span>
      </div>
      <div class="flex items-center gap-2">
        <kbd
          class="px-1.5 py-0.5 bg-muted rounded border border-border font-mono"
        >
          ↑↓
        </kbd>
        <span>{{ t("inspector.empty.navigateLayers") }}</span>
      </div>
    </div>
  </div>
</template>
