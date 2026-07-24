<script setup lang="ts">
import { computed, ref } from "vue";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    orientation?: "horizontal" | "vertical";
    gradientStyle?: Record<string, string>;
    disabled?: boolean;
    ariaLabel?: string;
    showThumb?: boolean;
  }>(),
  {
    min: 0,
    max: 100,
    orientation: "horizontal",
    gradientStyle: undefined,
    disabled: false,
    ariaLabel: undefined,
    showThumb: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
  dragStart: [];
  dragEnd: [];
}>();

const trackRef = ref<HTMLElement | null>(null);

const percentage = computed(() => {
  const range = props.max - props.min;
  if (range <= 0) return 0;
  return ((props.modelValue - props.min) / range) * 100;
});

const thumbStyle = computed(() => {
  if (props.orientation === "vertical") {
    return { bottom: `${percentage.value}%` };
  }
  return { left: `${percentage.value}%` };
});

function valueFromPointer(clientX: number, clientY: number): number {
  const element = trackRef.value;
  if (!element) {
    return props.modelValue;
  }

  const rect = element.getBoundingClientRect();
  if (props.orientation === "vertical") {
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    const ratio = 1 - y / rect.height;
    return props.min + ratio * (props.max - props.min);
  }

  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const ratio = x / rect.width;
  return props.min + ratio * (props.max - props.min);
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) {
    return;
  }

  const element = trackRef.value;
  if (!element) {
    return;
  }

  element.setPointerCapture(event.pointerId);
  emit("dragStart");
  emit("update:modelValue", valueFromPointer(event.clientX, event.clientY));
}

function onPointerMove(event: PointerEvent): void {
  if (!trackRef.value?.hasPointerCapture(event.pointerId)) {
    return;
  }

  emit("update:modelValue", valueFromPointer(event.clientX, event.clientY));
}

function onPointerUp(event: PointerEvent): void {
  const element = trackRef.value;
  if (!element?.hasPointerCapture(event.pointerId)) {
    return;
  }

  element.releasePointerCapture(event.pointerId);
  emit("dragEnd");
}
</script>

<template>
  <div
    ref="trackRef"
    class="relative touch-none select-none"
    :class="
      orientation === 'vertical'
        ? 'h-full w-2 shrink-0 cursor-ns-resize'
        : 'h-2 w-full cursor-ew-resize'
    "
    :style="gradientStyle"
    role="slider"
    :aria-label="ariaLabel ?? t('colorPicker.slider')"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="Math.round(modelValue)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      v-if="showThumb"
      class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-1 border-white bg-white shadow-md ring-1 ring-primary"
      :class="orientation === 'vertical' ? 'left-1/2' : 'top-1/2'"
      :style="thumbStyle"
    />
  </div>
</template>
