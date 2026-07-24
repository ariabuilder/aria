<script setup lang="ts">
import { computed } from "vue";

import { Button } from "@/components/ui/button";
import { CHECKERBOARD_STYLE } from "./checkerboard";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  previewColor: string;
  storedReference: string | null;
  valueMode: "literal" | "reference" | "reference-unresolved";
  resolvedLabel: string | null;
  showDetach: boolean;
  isEyeDropperSupported: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  eyedropper: [];
  copy: [];
  detach: [];
}>();
const { t } = useStudioI18n();

const referenceLabel = computed(() => {
  if (!props.storedReference) {
    return null;
  }

  const match = props.storedReference.match(/^var\(--([^)]+)\)$/);
  return match ? `--${match[1]}` : props.storedReference;
});
</script>

<template>
  <div
    class="flex items-center gap-2 border-b border-border px-3 py-2.5"
  >
    <div
      class="relative size-10 shrink-0 overflow-hidden rounded-md border border-border/50"
      :style="{ background: CHECKERBOARD_STYLE }"
    >
      <div
        class="absolute inset-0"
        :style="{ backgroundColor: previewColor }"
      />
    </div>

    <div class="min-w-0 flex-1">
      <p
        v-if="valueMode === 'reference' || valueMode === 'reference-unresolved'"
        class="truncate font-mono text-xs font-semibold text-foreground"
      >
        {{ referenceLabel }}
      </p>
      <p
        v-else-if="resolvedLabel"
        class="truncate font-mono text-xs text-muted-foreground"
      >
        {{ resolvedLabel }}
      </p>
      <p
        v-if="valueMode === 'reference-unresolved'"
        class="text-2xs text-amber-600 dark:text-amber-400"
      >
        {{ t("colorPicker.unresolved") }}
      </p>
      <button
        v-if="showDetach"
        type="button"
        class="mt-0.5 text-2xs text-primary hover:underline"
        @click="emit('detach')"
      >
        {{ t("colorPicker.editCustom") }}
      </button>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <Button
        v-if="isEyeDropperSupported"
        type="button"
        variant="sidebar-action"
        size="xs"
        class="size-7! shrink-0 p-0!"
        :title="t('colorPicker.pickFromScreen')"
        :aria-label="t('colorPicker.pickFromScreen')"
        :disabled="disabled"
        @click="emit('eyedropper')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-3.5 shrink-0"
          aria-hidden="true"
        >
          <path
            d="M4 20l.75-3.5L17 4.25a1.5 1.5 0 0 1 2.12 0l.63.63a1.5 1.5 0 0 1 0 2.12L7.5 19.25 4 20z"
          />
          <path d="M13 6l5 5" />
        </svg>
      </Button>
      <Button
        type="button"
        variant="sidebar-action"
        size="xs"
        class="size-7! shrink-0 px-1.5! text-2xs!"
        :title="t('colorPicker.copyColor')"
        :disabled="disabled"
        @click="emit('copy')"
      >
        {{ t("colorPicker.copy") }}
      </Button>
    </div>
  </div>
</template>
