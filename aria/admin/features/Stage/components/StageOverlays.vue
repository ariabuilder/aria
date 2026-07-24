<!-- Selection/hover/target markers from composer spot state. -->
<script setup lang="ts">
import { computed } from "vue";
import { useComposer } from "../../../composables/useComposer";
import type { ComposerSpot } from "../../../composables/useComposer";

interface Props {
  canvasScale?: number;
}

const props = withDefaults(defineProps<Props>(), {
  canvasScale: 1,
});

const { spots } = useComposer();

// Compute spots with applied scaling
const scaledSpots = computed(() => {
  const scale = props.canvasScale;
  return spots.value.map((spot) => ({
    ...spot,
    x: spot.x * scale,
    y: spot.y * scale,
    width: spot.width * scale,
    height: spot.height * scale,
  }));
});

// Compute spot styles based on type
const getSpotStyle = (
  spot: ComposerSpot & { x: number; y: number; width: number; height: number },
) => {
  return {
    position: "absolute" as const,
    top: `${spot.y}px`,
    left: `${spot.x}px`,
    width: `${spot.width}px`,
    height: `${spot.height}px`,
    pointerEvents: "none" as const,
  };
};

// Get CSS class based on spot type
const getSpotClass = (type: ComposerSpot["type"]) => {
  return `composer-spot composer-spot--${type}`;
};
</script>

<template>
  <div class="composer-spots-container">
    <div
      v-for="spot in scaledSpots"
      :key="spot.id"
      :class="getSpotClass(spot.type)"
      :style="getSpotStyle(spot)"
    >
      <!-- Selection spot: blue border with handles -->
      <template v-if="spot.type === 'select'">
        <div class="spot-border spot-border--select" />
        <div class="spot-label spot-label--select">Selected</div>
      </template>

      <!-- Hover spot: subtle border -->
      <template v-else-if="spot.type === 'hover'">
        <div class="spot-border spot-border--hover" />
      </template>

      <!-- Target spot: dashed border for drop targets -->
      <template v-else-if="spot.type === 'target'">
        <div class="spot-border spot-border--target" />
        <div class="spot-label spot-label--target">Drop here</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.composer-spots-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}

.composer-spot {
  position: absolute;
  pointer-events: none;
  transition: all 0.15s ease-out;
}

/* Spot borders */
.spot-border {
  position: absolute;
  inset: 0;
  border-radius: 2px;
  pointer-events: none;
}

/* Selection spot */
.spot-border--select {
  border: 2px solid hsl(var(--primary));
  background-color: hsla(var(--primary), 0.05);
  box-shadow: 0 0 0 1px hsla(var(--primary), 0.2);
}

/* Hover spot (subtle, purple) */
.spot-border--hover {
  border: 1px solid hsl(265, 60%, 60%);
  background-color: hsla(265, 60%, 60%, 0.03);
}

/* Target spot (dashed, green for drop zone) */
.spot-border--target {
  border: 2px dashed hsl(142, 76%, 36%);
  background-color: hsla(142, 76%, 36%, 0.05);
  animation: pulse-target 1.5s ease-in-out infinite;
}

/* Spot labels */
.spot-label {
  position: absolute;
  top: -24px;
  left: 0;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.spot-label--select {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.spot-label--target {
  background-color: hsl(142, 76%, 36%);
  color: white;
}

/* Animations */
@keyframes pulse-target {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.02);
  }
}

/* Dark mode adjustments */
:global(.dark) .spot-border--select {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsla(var(--primary), 0.3);
}

:global(.dark) .spot-border--hover {
  border-color: hsl(265, 70%, 70%);
  background-color: hsla(265, 70%, 70%, 0.05);
}

:global(.dark) .spot-border--target {
  border-color: hsl(142, 70%, 45%);
  background-color: hsla(142, 70%, 45%, 0.08);
}
</style>
