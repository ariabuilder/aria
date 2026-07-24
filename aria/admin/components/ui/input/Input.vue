<script setup lang="ts">
import type { HTMLAttributes, InputHTMLAttributes } from "vue";
import { ref } from "vue";
import { useVModel } from "@vueuse/core";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes["class"];
  plain?: boolean;
  type?: InputHTMLAttributes["type"];
  placeholder?: string;
  disabled?: boolean;
}>();

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});

const inputEl = ref<HTMLInputElement | null>(null);

defineExpose({
  focus: () => inputEl.value?.focus(),
  select: () => inputEl.value?.select(),
});
</script>

<template>
  <input
    ref="inputEl"
    v-bind="$attrs"
    v-model="modelValue"
    data-slot="input"
    :type="props.type ?? 'text'"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :class="
      cn(
        props.plain
          ? 'file:text-foreground placeholder:text-muted-foreground/30 selection:bg-primary/30 selection:text-primary-foreground appearance-none h-9! w-full min-w-0 border-0 rounded-sm bg-input p-0 text-xs shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 file:inline-flex file:h-9.5 file:border-0 file:bg-transparent file:text-xs file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
          : 'file:text-muted-foreground/30 h-9! placeholder:text-muted-foreground/50 focus-placeholder:text-muted-foreground/80 caret-primary focus-visible:border-border focus-active:border-primary/80 focus-active:bg-sidebar selection:bg-primary/30 selection:text-primary-foreground border-border/50 border-solid hover:border-border/50 hover:border-solid w-full min-w-0 rounded-sm border bg-sidebar/40 hover:bg-sidebar/80 px-4 py-1 text-sm shadow-none transition-[color,box-shadow] outline-none file:inline-flex file:h-9.5 file:border-0 file:bg-muted-foreground file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        !props.plain &&
          'focus-visible:shadow-none focus-visible:border-border border-solid focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid h-9!',
        !props.plain &&
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive h-9!',
        props.class,
      )
    "
  />
</template>
