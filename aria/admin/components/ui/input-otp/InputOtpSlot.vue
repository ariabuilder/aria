<script setup lang="ts">
import { computed } from "vue";
import { useVueOTPContext } from "vue-input-otp";
import { cn } from "@/lib/utils";

const props = defineProps<{
  index: number;
  class?: string;
}>();

const otpContext = useVueOTPContext();

const char = computed(() => otpContext.value.slots[props.index]?.char ?? null);
const hasFakeCaret = computed(
  () => otpContext.value.slots[props.index]?.hasFakeCaret ?? false,
);
const isActive = computed(
  () => otpContext.value.slots[props.index]?.isActive ?? false,
);
</script>

<template>
  <div
    :class="
      cn(
        'relative flex h-10 w-10 items-center justify-center border-y bg-background border-r border-border border-dashed text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md',
        isActive && 'z-10 ring-0',
        props.class,
      )
    "
    :data-active="isActive || undefined"
  >
    <template v-if="char">{{ char }}</template>
    <div
      v-if="hasFakeCaret"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div class="animate-caret-blink h-4 w-px bg-foreground duration-1000" />
    </div>
  </div>
</template>
