<script setup lang="ts">
import { computed, ref } from "vue";
import { colord } from "colord";

import ColorPickerSlider from "./ColorPickerSlider.vue";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    hue: number;
    saturation: number;
    value: number;
    alpha: number;
    showAlpha: boolean;
    previewColor: string;
    disabled?: boolean;
    readOnly?: boolean;
    layout?: "compact" | "unified";
  }>(),
  { layout: "unified" },
);

const emit = defineEmits<{
  "update:hue": [value: number];
  "update:saturation": [value: number];
  "update:value": [value: number];
  "update:alpha": [value: number];
  dragStart: [];
  dragEnd: [];
  surfaceChange: [];
  keydown: [event: KeyboardEvent];
}>();
const { t } = useStudioI18n();

const pickAreaMinHeight = computed(() => "min-h-[120px]");

const saturationRef = ref<HTMLElement | null>(null);
const alphaTrackRef = ref<HTMLElement | null>(null);

const saturationGradient = computed(() => {
  const hueColor = colord({ h: props.hue, s: 100, v: 100 }).toHex();
  return {
    background: `
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, ${hueColor})
    `,
  };
});

const hueGradient = computed(() => ({
  background:
    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
}));

const alphaGradient = computed(() => {
  const color = colord({
    h: props.hue,
    s: props.saturation,
    v: props.value,
  });
  return {
    background: `
      linear-gradient(to right, transparent, ${color.toRgbString()}),
      repeating-conic-gradient(#cccccc 0% 25%, transparent 0% 50%) 50% / 8px 8px
    `,
  };
});

const cursorPosition = computed(() => ({
  left: `${props.saturation}%`,
  top: `${100 - props.value}%`,
}));

const inactive = computed(() => props.disabled || props.readOnly);

function updateSaturationFromPointer(clientX: number, clientY: number): void {
  const element = saturationRef.value;
  if (!element) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

  emit("update:saturation", (x / rect.width) * 100);
  emit("update:value", 100 - (y / rect.height) * 100);
  emit("surfaceChange");
}

function onSaturationPointerDown(event: PointerEvent): void {
  if (inactive.value || event.button !== 0) {
    return;
  }

  const element = saturationRef.value;
  if (!element) {
    return;
  }

  element.setPointerCapture(event.pointerId);
  emit("dragStart");
  updateSaturationFromPointer(event.clientX, event.clientY);
}

function onSaturationPointerMove(event: PointerEvent): void {
  if (!saturationRef.value?.hasPointerCapture(event.pointerId)) {
    return;
  }

  updateSaturationFromPointer(event.clientX, event.clientY);
}

function onSaturationPointerUp(event: PointerEvent): void {
  const element = saturationRef.value;
  if (!element?.hasPointerCapture(event.pointerId)) {
    return;
  }

  element.releasePointerCapture(event.pointerId);
  emit("dragEnd");
}

function onHueChange(value: number): void {
  emit("update:hue", value);
  emit("surfaceChange");
}

function alphaFromPointer(clientX: number): number {
  const element = alphaTrackRef.value;
  if (!element) {
    return props.alpha;
  }

  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  return x / rect.width;
}

function onAlphaPointerDown(event: PointerEvent): void {
  if (inactive.value || event.button !== 0) {
    return;
  }

  const element = alphaTrackRef.value;
  if (!element) {
    return;
  }

  element.setPointerCapture(event.pointerId);
  emit("dragStart");
  emit("update:alpha", alphaFromPointer(event.clientX));
  emit("surfaceChange");
}

function onAlphaPointerMove(event: PointerEvent): void {
  if (!alphaTrackRef.value?.hasPointerCapture(event.pointerId)) {
    return;
  }

  emit("update:alpha", alphaFromPointer(event.clientX));
  emit("surfaceChange");
}

function onAlphaPointerUp(event: PointerEvent): void {
  const element = alphaTrackRef.value;
  if (!element?.hasPointerCapture(event.pointerId)) {
    return;
  }

  element.releasePointerCapture(event.pointerId);
  emit("dragEnd");
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5 overflow-hidden px-2 pt-1.5">
    <div class="relative min-w-0 w-full" :class="pickAreaMinHeight">
      <div
        ref="saturationRef"
        class="absolute inset-0 cursor-crosshair touch-none select-none overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        :class="inactive && 'pointer-events-none opacity-50'"
        :style="saturationGradient"
        tabindex="0"
        @keydown="emit('keydown', $event)"
        @pointerdown="onSaturationPointerDown"
        @pointermove="onSaturationPointerMove"
        @pointerup="onSaturationPointerUp"
        @pointercancel="onSaturationPointerUp"
      >
        <div
          class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-0.5 border-foreground/70 shadow-md ring-2 ring-primary"
          :style="{
            left: cursorPosition.left,
            top: cursorPosition.top,
            backgroundColor: previewColor,
          }"
        />
      </div>
    </div>

    <ColorPickerSlider
      :model-value="hue"
      :min="0"
      :max="360"
      orientation="horizontal"
      :gradient-style="hueGradient"
      :disabled="inactive"
      :aria-label="t('colorPicker.hue')"
      class="overflow-hidden rounded-sm border border-border/50"
      @update:model-value="onHueChange"
      @drag-start="emit('dragStart')"
      @drag-end="emit('dragEnd')"
    />
  </div>

  <div
    v-if="showAlpha"
    class="flex min-w-0 items-center gap-2 px-2 pb-1 pt-0.5"
    :class="inactive && 'pointer-events-none opacity-50'"
  >
    <div
      ref="alphaTrackRef"
      class="relative h-2 min-w-0 flex-1 cursor-ew-resize touch-none select-none overflow-hidden rounded border border-border/50"
      :style="alphaGradient"
      role="slider"
      :aria-label="t('colorPicker.alpha')"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="Math.round(alpha * 100)"
      @pointerdown="onAlphaPointerDown"
      @pointermove="onAlphaPointerMove"
      @pointerup="onAlphaPointerUp"
      @pointercancel="onAlphaPointerUp"
    >
      <div
        class="pointer-events-none absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 border-foreground shadow-md ring-1 ring-primary"
        :style="{
          left: `${alpha * 100}%`,
          backgroundColor: previewColor,
        }"
      />
    </div>
    <span class="w-5 shrink-0 text-right font-mono text-3xs! text-muted-foreground">
      {{ Math.round(alpha * 100) }}%
    </span>
  </div>
</template>
