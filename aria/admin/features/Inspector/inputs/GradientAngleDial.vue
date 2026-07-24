<script setup lang="ts">
import { computed, ref } from "vue";

interface Props {
  modelValue: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  commit: [];
}>();

const DIAL_SIZE = 56;
const CENTER = DIAL_SIZE / 2;
const HANDLE_RADIUS = 22;

const dialRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);

function normalizeAngle(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function parseAngle(value: string): number {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? normalizeAngle(parsed) : 180;
}

const angleDegrees = computed(() => parseAngle(props.modelValue));

function degreesToPointerPosition(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: CENTER + Math.sin(radians) * HANDLE_RADIUS,
    y: CENTER - Math.cos(radians) * HANDLE_RADIUS,
  };
}

function pointerPositionToDegrees(x: number, y: number): number {
  const dx = x - CENTER;
  const dy = y - CENTER;
  return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}

const handlePosition = computed(() =>
  degreesToPointerPosition(angleDegrees.value),
);

function setAngle(degrees: number): void {
  emit("update:modelValue", String(Math.round(normalizeAngle(degrees))));
}

function pointerCoordinates(event: PointerEvent): { x: number; y: number } {
  const rect = dialRef.value?.getBoundingClientRect();
  if (!rect) {
    return { x: CENTER, y: CENTER };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled) {
    return;
  }

  const target = dialRef.value;
  if (!target) {
    return;
  }

  isDragging.value = true;
  target.setPointerCapture(event.pointerId);

  const coords = pointerCoordinates(event);
  setAngle(pointerPositionToDegrees(coords.x, coords.y));

  const onPointerMove = (moveEvent: PointerEvent) => {
    const moveCoords = pointerCoordinates(moveEvent);
    setAngle(pointerPositionToDegrees(moveCoords.x, moveCoords.y));
  };

  const onPointerUp = () => {
    isDragging.value = false;
    target.releasePointerCapture(event.pointerId);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", onPointerUp);
    emit("commit");
  };

  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", onPointerUp);
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.disabled) {
    return;
  }

  let delta = 0;
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    delta = event.shiftKey ? 15 : 1;
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    delta = event.shiftKey ? -15 : -1;
  }

  if (delta === 0) {
    return;
  }

  event.preventDefault();
  setAngle(angleDegrees.value + delta);
}

function onKeyUp(event: KeyboardEvent): void {
  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight"
  ) {
    emit("commit");
  }
}
</script>

<template>
  <div
    ref="dialRef"
    role="slider"
    :aria-valuenow="angleDegrees"
    aria-valuemin="0"
    aria-valuemax="360"
    aria-label="Gradient angle"
    data-testid="gradient-angle-dial"
    tabindex="0"
    class="relative shrink-0 cursor-pointer rounded-full border border-dashed border-border/50 bg-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    :class="isDragging ? 'ring-2 ring-primary/30' : ''"
    :style="{ width: `${DIAL_SIZE}px`, height: `${DIAL_SIZE}px` }"
    @pointerdown.prevent="onPointerDown"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
  >
    <svg
      :width="DIAL_SIZE"
      :height="DIAL_SIZE"
      class="pointer-events-none absolute inset-0 text-muted-foreground/60"
      aria-hidden="true"
    >
      <circle
        :cx="CENTER"
        :cy="CENTER"
        :r="HANDLE_RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-dasharray="3 3"
        stroke-width="1"
      />
      <line
        :x1="CENTER"
        :y1="CENTER"
        :x2="handlePosition.x"
        :y2="handlePosition.y"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </svg>
    <span
      class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-accent shadow-sm"
      :style="{ left: `${handlePosition.x}px`, top: `${handlePosition.y}px` }"
      aria-hidden="true"
    />
  </div>
</template>
