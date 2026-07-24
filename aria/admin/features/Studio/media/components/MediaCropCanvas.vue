<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  MediaCropRect,
  MediaFocalPoint,
} from "../../../../../lib/media/transforms/schemas";

const props = defineProps<{
  src: string;
  alt: string;
  modelValue: MediaCropRect;
  aspectRatio?: { width: number; height: number } | null;
  focalPoint?: MediaFocalPoint | null;
  focalMode?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: MediaCropRect];
  sourceDimensions: [value: { width: number; height: number }];
  "update:focalPoint": [value: MediaFocalPoint];
}>();

const frame = ref<HTMLElement | null>(null);
const dragging = ref(false);
const sourceDimensions = ref<{ width: number; height: number } | null>(null);

type DragMode = "move" | "nw" | "ne" | "se" | "sw";
type DragState = {
  mode: DragMode;
  pointerId: number;
  clientX: number;
  clientY: number;
  crop: MediaCropRect;
};

let dragState: DragState | null = null;
let suppressFocalClick = false;
const MIN_SIZE = 0.05;

const cropStyle = computed(() => ({
  left: `${props.modelValue.x * 100}%`,
  top: `${props.modelValue.y * 100}%`,
  width: `${props.modelValue.width * 100}%`,
  height: `${props.modelValue.height * 100}%`,
}));
const focalStyle = computed(() => ({
  left: `${(props.focalPoint?.x ?? 0.5) * 100}%`,
  top: `${(props.focalPoint?.y ?? 0.5) * 100}%`,
}));

const maskStyles = computed(() => {
  const crop = props.modelValue;
  return {
    top: { left: "0", top: "0", right: "0", height: `${crop.y * 100}%` },
    left: {
      left: "0",
      top: `${crop.y * 100}%`,
      width: `${crop.x * 100}%`,
      height: `${crop.height * 100}%`,
    },
    right: {
      left: `${(crop.x + crop.width) * 100}%`,
      top: `${crop.y * 100}%`,
      right: "0",
      height: `${crop.height * 100}%`,
    },
    bottom: {
      left: "0",
      top: `${(crop.y + crop.height) * 100}%`,
      right: "0",
      bottom: "0",
    },
  };
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stable(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizedCrop(crop: MediaCropRect): MediaCropRect {
  const width = clamp(crop.width, MIN_SIZE, 1);
  const height = clamp(crop.height, MIN_SIZE, 1);
  return {
    x: stable(clamp(crop.x, 0, 1 - width)),
    y: stable(clamp(crop.y, 0, 1 - height)),
    width: stable(width),
    height: stable(height),
  };
}

function beginDrag(event: PointerEvent, mode: DragMode): void {
  if (!frame.value) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
    event.pointerId,
  );
  dragging.value = true;
  suppressFocalClick = false;
  dragState = {
    mode,
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    crop: { ...props.modelValue },
  };
}

function updateDrag(event: PointerEvent): void {
  if (!dragState || !frame.value || event.pointerId !== dragState.pointerId) {
    return;
  }

  const bounds = frame.value.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const dx = (event.clientX - dragState.clientX) / bounds.width;
  const dy = (event.clientY - dragState.clientY) / bounds.height;
  if (
    Math.abs(event.clientX - dragState.clientX) > 2 ||
    Math.abs(event.clientY - dragState.clientY) > 2
  ) {
    suppressFocalClick = true;
  }
  const start = dragState.crop;
  let next = { ...start };

  if (dragState.mode === "move") {
    next.x = start.x + dx;
    next.y = start.y + dy;
  } else {
    const lockedRatio =
      props.aspectRatio && sourceDimensions.value
        ? props.aspectRatio.width /
          props.aspectRatio.height /
          (sourceDimensions.value.width / sourceDimensions.value.height)
        : null;

    if (lockedRatio) {
      const west = dragState.mode.includes("w");
      const north = dragState.mode.includes("n");
      const anchorX = west ? start.x + start.width : start.x;
      const anchorY = north ? start.y + start.height : start.y;
      const rawWidth = Math.abs(
        (west ? start.x + dx : start.x + start.width + dx) - anchorX,
      );
      const rawHeight = Math.abs(
        (north ? start.y + dy : start.y + start.height + dy) - anchorY,
      );
      const widthDriven = Math.abs(dx) >= Math.abs(dy) * lockedRatio;
      const maxWidth = west ? anchorX : 1 - anchorX;
      const maxHeight = north ? anchorY : 1 - anchorY;
      let width = widthDriven ? rawWidth : rawHeight * lockedRatio;
      let height = width / lockedRatio;
      if (width > maxWidth) {
        width = maxWidth;
        height = width / lockedRatio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * lockedRatio;
      }
      const maxRatioWidth = Math.min(maxWidth, maxHeight * lockedRatio);
      const minRatioWidth = Math.min(
        maxRatioWidth,
        Math.max(MIN_SIZE, MIN_SIZE * lockedRatio),
      );
      width = clamp(width, minRatioWidth, maxRatioWidth);
      height = width / lockedRatio;
      next = {
        x: west ? anchorX - width : anchorX,
        y: north ? anchorY - height : anchorY,
        width,
        height,
      };
    } else {
      if (dragState.mode.includes("w")) {
        const right = start.x + start.width;
        next.x = clamp(start.x + dx, 0, right - MIN_SIZE);
        next.width = right - next.x;
      }
      if (dragState.mode.includes("e")) {
        next.width = clamp(start.width + dx, MIN_SIZE, 1 - start.x);
      }
      if (dragState.mode.includes("n")) {
        const bottom = start.y + start.height;
        next.y = clamp(start.y + dy, 0, bottom - MIN_SIZE);
        next.height = bottom - next.y;
      }
      if (dragState.mode.includes("s")) {
        next.height = clamp(start.height + dy, MIN_SIZE, 1 - start.y);
      }
    }
  }

  emit("update:modelValue", normalizedCrop(next));
}

function endDrag(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState = null;
  dragging.value = false;
}

function handleKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 0.05 : 0.01;
  const delta = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[event.key];
  if (!delta) return;
  event.preventDefault();
  emit(
    "update:modelValue",
    normalizedCrop({
      ...props.modelValue,
      x: props.modelValue.x + delta[0],
      y: props.modelValue.y + delta[1],
    }),
  );
}

function handleImageLoad(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    sourceDimensions.value = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    emit("sourceDimensions", sourceDimensions.value);
  }
}

function handleFocalClick(event: MouseEvent): void {
  if (suppressFocalClick) {
    suppressFocalClick = false;
    return;
  }
  if (!props.focalMode || !frame.value || dragging.value) return;
  const bounds = frame.value.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  emit("update:focalPoint", {
    x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
  });
}
</script>

<template>
  <div
    class="flex min-h-96 items-center justify-center overflow-hidden bg-background border border-dashed border-border p-2"
  >
    <div
      ref="frame"
      class="relative inline-flex max-h-[62vh] max-w-full select-none"
      @pointermove="updateDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @click="handleFocalClick"
    >
      <img
        :src="src"
        :alt="alt"
        draggable="false"
        class="block max-h-[62vh] max-w-full object-contain"
        @load="handleImageLoad"
      />

      <div
        v-for="(style, key) in maskStyles"
        :key="key"
        class="pointer-events-none absolute bg-black/55"
        :style="style"
      />

      <div
        class="absolute touch-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        :class="dragging ? 'cursor-grabbing' : 'cursor-move'"
        :style="cropStyle"
        role="application"
        tabindex="0"
        aria-label="Image crop. Drag to reposition; use arrow keys for precise movement."
        @pointerdown="beginDrag($event, 'move')"
        @keydown="handleKeydown"
      >
        <span
          class="pointer-events-none absolute inset-x-1/3 top-0 bottom-0 border-x border-white/45"
        />
        <span
          class="pointer-events-none absolute inset-y-1/3 left-0 right-0 border-y border-white/45"
        />
        <button
          v-for="handle in ['nw', 'ne', 'se', 'sw'] as const"
          :key="handle"
          type="button"
          class="absolute size-3 rounded-full border border-black/50 bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :class="{
            '-left-1.5 -top-1.5 cursor-nwse-resize': handle === 'nw',
            '-right-1.5 -top-1.5 cursor-nesw-resize': handle === 'ne',
            '-right-1.5 -bottom-1.5 cursor-nwse-resize': handle === 'se',
            '-left-1.5 -bottom-1.5 cursor-nesw-resize': handle === 'sw',
          }"
          :aria-label="`Resize crop from ${handle.toUpperCase()} corner`"
          @pointerdown.stop="beginDrag($event, handle)"
        />
      </div>

      <span
        v-if="focalPoint"
        class="pointer-events-none absolute z-20 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/80 shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
        :style="focalStyle"
        aria-hidden="true"
      >
        <span
          class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80"
        />
        <span
          class="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/80"
        />
      </span>
    </div>
  </div>
</template>
