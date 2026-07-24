<script setup lang="ts">
import { OTPInput, type OTPInputProps } from "vue-input-otp";
import { cn } from "@/lib/utils";

interface InputOTPProps extends /* @vue-ignore */ OTPInputProps {
  modelValue?: string;
  /** Custom class for the container element */
  class?: string;
}

defineProps<InputOTPProps>();
defineEmits<{
  "update:modelValue": [value: string];
  complete: [value: string];
}>();
</script>

<template>
  <OTPInput
    :container-class="
      cn(
        'flex items-center gap-2 has-[:disabled]:opacity-50',
        ($props as any).containerClass,
      )
    "
    v-bind="$props"
    @update:model-value="$emit('update:modelValue', $event)"
    @complete="$emit('complete', $event)"
  >
    <slot />
  </OTPInput>
</template>
