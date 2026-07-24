<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useVModel } from "@vueuse/core";
import { nextTick, onMounted, ref, watch } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  defaultValue?: string | number;
  modelValue?: string | number;
  autoGrow?: boolean;
}>();

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function resizeToContent(): void {
  if (!props.autoGrow || !textareaRef.value) return;

  textareaRef.value.style.height = "auto";
  textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
}

watch(modelValue, async () => {
  if (!props.autoGrow) return;

  await nextTick();
  resizeToContent();
});

onMounted(() => {
  resizeToContent();
});
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="modelValue"
    data-slot="textarea"
    :class="
      cn(
        'min-h-9.5! resize-none placeholder:text-muted-foreground/50 focus-placeholder:text-muted-foreground/80 caret-primary focus-visible:border-border focus-active:border-primary/80 focus-active:bg-sidebar selection:bg-primary/30 selection:text-primary-foreground border-border/50 border-solid hover:border-border/50 hover:border-solid w-full min-w-0 rounded-sm border bg-sidebar/40 hover:bg-sidebar/80 px-4 py-2 text-sm shadow-none transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:shadow-none focus-visible:border-border border-solid focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        props.class,
      )
    "
    @input="resizeToContent"
  />
</template>
