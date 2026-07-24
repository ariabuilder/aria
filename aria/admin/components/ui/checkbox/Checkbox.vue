<script setup lang="ts">
import { computed } from "vue";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean | "indeterminate";
    class?: string;
    disabled?: boolean;
    id?: string;
  }>(),
  {
    modelValue: undefined,
  },
);

const emits = defineEmits<{
  "update:modelValue": [payload: boolean | "indeterminate"];
}>();

const isChecked = computed(() => props.modelValue === true);
const isIndeterminate = computed(() => props.modelValue === "indeterminate");

function onClick() {
  if (props.disabled) return;
  if (isIndeterminate.value) {
    emits("update:modelValue", true);
    return;
  }
  emits("update:modelValue", !isChecked.value);
}
</script>

<template>
  <button
    :id="id"
    type="button"
    role="checkbox"
    :aria-checked="isIndeterminate ? 'mixed' : isChecked"
    :disabled="disabled"
    :class="
      cn(
        'peer inline-flex size-4.5! shrink-0 items-center justify-center rounded-sm border border-border/50 border-solid bg-sidebar/40 p-0 m-0 appearance-none shadow-none transition-[color,box-shadow,transform,background-color,border-color] duration-150 ease-out active:scale-95 cursor-pointer select-none outline-none hover:bg-sidebar/80 hover:border-border/70 focus-visible:border-border focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid focus-visible:shadow-none focus-active:border-primary/80 focus-active:bg-sidebar',
        isChecked && 'border-primary bg-sidebar/80 text-foreground',
        disabled && 'cursor-not-allowed opacity-90',
        props.class,
      )
    "
    @click="onClick"
  >
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="scale-50 opacity-0"
      enter-to-class="scale-100 opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="scale-100 opacity-100"
      leave-to-class="scale-75 opacity-0"
    >
      <span
        v-if="isChecked"
        :class="[studioIcons.check, 'size-4.5 origin-center']"
        aria-hidden="true"
      />
    </Transition>
    <slot v-if="!isChecked" />
  </button>
</template>
