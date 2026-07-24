<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  POSITION_OPTIONS_3X3,
  POSITION_PREVIEW_DOT_COUNT,
  getPositionOption,
  isPositionPreviewDotActive,
} from "../constants/positionOptions";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    disabled?: boolean;
    previewKeyPrefix?: string;
    label?: string;
  }>(),
  {
    disabled: false,
    previewKeyPrefix: "position",
    label: "Position",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const selectedPositionOption = computed(() =>
  getPositionOption(props.modelValue),
);
const triggerLabel = computed(
  () => selectedPositionOption.value?.label ?? props.label,
);
const open = ref(false);

function selectPosition(value: string): void {
  emit("update:modelValue", value);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        data-testid="position-trigger"
        class="flex h-9 w-full cursor-pointer items-center justify-between rounded-sm border border-dashed border-border/70 bg-background/80 px-2.5 text-xs text-foreground shadow-none transition-colors hover:border-border hover:bg-sidebar/80 focus-visible:border-primary/50 focus-visible:bg-sidebar/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary/50 data-[state=open]:bg-sidebar/80 dark:bg-sidebar/70 dark:hover:bg-sidebar"
        :disabled="disabled"
        :aria-label="`Image position: ${triggerLabel}`"
      >
        <span class="truncate text-xs font-medium text-foreground">
          {{ triggerLabel }}
        </span>
        <span
          aria-hidden="true"
          class="grid size-7 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-sm border border-solid border-border/60 bg-sidebar/70 p-1 text-primary shadow-inner dark:bg-background/30"
        >
          <span
            v-for="dotIndex in POSITION_PREVIEW_DOT_COUNT"
            :key="`${previewKeyPrefix}-preview-${dotIndex}`"
            :class="[
              'h-1 w-1 rounded-full transition-colors',
              selectedPositionOption &&
              isPositionPreviewDotActive(selectedPositionOption, dotIndex)
                ? 'bg-current'
                : 'bg-muted-foreground/25',
            ]"
          />
        </span>
      </button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      side="bottom"
      :side-offset="6"
      data-testid="position-content"
      class="w-[10.75rem] rounded-md border border-solid border-border/70 bg-background p-2 text-foreground shadow-xl dark:bg-sidebar dark:shadow-none"
    >
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="option in POSITION_OPTIONS_3X3"
          :key="option.value"
          type="button"
          :title="option.label"
          :aria-pressed="selectedPositionOption?.value === option.value"
          :data-testid="`${previewKeyPrefix}-option-${option.value}`"
          class="flex h-12 w-12 items-center justify-center rounded-sm border border-solid p-0 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          :class="
            selectedPositionOption?.value === option.value
              ? 'border-primary/70 bg-primary/10 text-primary'
              : 'border-border/50 bg-sidebar/45 text-muted-foreground hover:border-border hover:bg-sidebar/80 hover:text-foreground dark:bg-background/25 dark:hover:bg-background/45'
          "
          @click="selectPosition(option.value)"
        >
          <span class="sr-only">{{ option.label }}</span>
          <span
            aria-hidden="true"
            class="grid grid-cols-3 grid-rows-3 gap-0.5"
          >
            <span
              v-for="dotIndex in POSITION_PREVIEW_DOT_COUNT"
              :key="`${option.value}-${dotIndex}`"
              :class="[
                'h-1.5 w-1.5 rounded-full transition-colors',
                isPositionPreviewDotActive(option, dotIndex)
                  ? 'bg-current'
                  : 'bg-muted-foreground/25',
              ]"
            />
          </span>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
