<script setup lang="ts">
import { ref } from "vue";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HeadingLevel } from "../../Inspector/schemas/text.schema";
import { useStudioI18n } from "@/i18n";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const satisfies readonly HeadingLevel[];

const props = defineProps<{
  modelValue: HeadingLevel;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [level: HeadingLevel];
}>();

const open = ref(false);
const { t } = useStudioI18n();

function selectLevel(level: HeadingLevel): void {
  if (level === props.modelValue) {
    open.value = false;
    return;
  }

  emit("select", level);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="relative size-5 ml-1.5 shrink-0 overflow-hidden rounded-sm border border-border transition-transform hover:border-dashed hover:brightness-105 cursor-pointer disabled:pointer-events-none disabled:opacity-50"
        :disabled="disabled"
        :title="t('composer.toolbar.headingLevel')"
        @click.stop
      >
        <span
          class="absolute inset-0 flex items-center justify-center text-3xs! font-medium! leading-none tracking-tight text-foreground"
        >
          H{{ modelValue }}
        </span>
      </button>
    </PopoverTrigger>

    <PopoverContent
      class="w-auto p-0"
      align="start"
      side="bottom"
      :side-offset="6"
      @click.stop
    >
      <div
        class="flex items-center gap-0.5 p-0.5"
      >
        <button
          v-for="level in HEADING_LEVELS"
          :key="level"
          type="button"
          class="flex h-6 min-w-6 items-center justify-center rounded border px-1 text-3xs! font-medium! tracking-wider transition-all duration-150 ease-out"
          :class="
            modelValue === level
              ? 'border-solid border-primary/70 bg-primary/10 text-foreground shadow-none'
              : 'border-transparent text-muted-foreground hover:border-dashed hover:border-border hover:bg-muted/40 hover:text-foreground'
          "
          @click="selectLevel(level)"
        >
          H{{ level }}
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
