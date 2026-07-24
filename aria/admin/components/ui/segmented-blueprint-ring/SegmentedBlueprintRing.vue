<script setup lang="ts">
import { computed } from "vue";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();

export interface BlueprintRingSegment {
  status: "pass" | "warning" | "error" | "idle";
}

const SEGMENT_COUNT = 7;
const GAP_DEG = 5;

const props = withDefaults(
  defineProps<{
    score: number;
    segments?: BlueprintRingSegment[];
    size?: number;
    loading?: boolean;
  }>(),
  {
    size: 104,
    loading: false,
  },
);

const strokeWidth = 5;

const center = computed(() => props.size / 2);
const radius = computed(() => center.value - strokeWidth * 1.25);
const ariaLabel = computed(() =>
  props.loading
    ? t("settings.discovery.health.loadingLabel")
    : t("settings.discovery.health.scoreLabel", { score: props.score }),
);

const segmentArcs = computed(() => {
  const segmentDeg = (360 - SEGMENT_COUNT * GAP_DEG) / SEGMENT_COUNT;
  const clampedScore = Math.max(0, Math.min(100, props.score));
  const totalFilled = (clampedScore / 100) * SEGMENT_COUNT;
  const items = props.segments ?? [];

  return Array.from({ length: SEGMENT_COUNT }, (_, index) => {
    const start = index * (segmentDeg + GAP_DEG) + GAP_DEG / 2;
    const end = start + segmentDeg;
    const fillRatio = Math.max(0, Math.min(1, totalFilled - index));
    const checkStatus = items[index]?.status;
    const status: BlueprintRingSegment["status"] =
      fillRatio <= 0
        ? "idle"
        : checkStatus && checkStatus !== "idle"
          ? checkStatus
          : "pass";

    return {
      d: describeArc(center.value, center.value, radius.value, start, end),
      fillRatio,
      status,
    };
  });
});

/** 0° = top, increases clockwise. */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleFromTopDeg: number,
): { x: number; y: number } {
  const angleRad = (angleFromTopDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(angleRad),
    y: cy - r * Math.cos(angleRad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function segmentClass(status: BlueprintRingSegment["status"]): string {
  switch (status) {
    case "pass":
      return "discovery-ring-segment--pass";
    case "warning":
      return "discovery-ring-segment--warning";
    case "error":
      return "discovery-ring-segment--error";
    default:
      return "discovery-ring-segment--idle";
  }
}

function fillDashStyle(fillRatio: number): Record<string, string> | undefined {
  if (fillRatio >= 1) return undefined;
  return {
    strokeDasharray: `${fillRatio} ${1 - fillRatio}`,
  };
}
</script>

<template>
  <div
    class="discovery-blueprint-ring"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-busy="loading"
    role="img"
    :aria-label="ariaLabel"
  >
    <div class="discovery-blueprint-ring__grid" aria-hidden="true">
      <div class="discovery-blueprint-ring__grid-line discovery-blueprint-ring__grid-line--h" />
      <div class="discovery-blueprint-ring__grid-line discovery-blueprint-ring__grid-line--v" />
    </div>

    <div
      v-if="loading"
      class="discovery-blueprint-ring__skeleton"
      aria-hidden="true"
    />

    <svg
      v-else
      class="discovery-blueprint-ring__svg"
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      aria-hidden="true"
    >
      <g v-for="(arc, index) in segmentArcs" :key="`segment-${index}`">
        <path
          :d="arc.d"
          fill="none"
          pathLength="1"
          vector-effect="non-scaling-stroke"
          class="discovery-ring-segment discovery-ring-segment--idle"
        />
        <path
          v-if="arc.fillRatio > 0"
          :d="arc.d"
          fill="none"
          pathLength="1"
          vector-effect="non-scaling-stroke"
          :class="['discovery-ring-segment', segmentClass(arc.status)]"
          :style="fillDashStyle(arc.fillRatio)"
        />
      </g>
    </svg>

    <span
      v-if="!loading"
      class="discovery-blueprint-ring__score"
    >
      {{ score }}
    </span>
  </div>
</template>

<style scoped>
.discovery-blueprint-ring {
  position: relative;
  flex-shrink: 0;
  isolation: isolate;
}

.discovery-blueprint-ring__grid {
  pointer-events: none;
  position: absolute;
  inset: 0;
}

.discovery-blueprint-ring__grid-border {
  position: absolute;
  inset: 0;
  border: 1px dashed color-mix(in srgb, var(--primary) 22%, var(--border));
  border-radius: var(--radius-md, 0.375rem);
}

.discovery-blueprint-ring__grid-line {
  position: absolute;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.discovery-blueprint-ring__grid-line--h {
  top: 50%;
  left: 0.625rem;
  right: 0.625rem;
  height: 1px;
  transform: translateY(-50%);
}

.discovery-blueprint-ring__grid-line--v {
  left: 50%;
  top: 0.625rem;
  bottom: 0.625rem;
  width: 1px;
  transform: translateX(-50%);
}

.discovery-blueprint-ring__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.discovery-ring-segment {
  stroke-width: 5;
  stroke-linecap: butt;
  transition: stroke 200ms ease, opacity 200ms ease;
}

.discovery-ring-segment--idle {
  stroke: color-mix(in srgb, var(--muted-foreground) 28%, transparent);
  stroke-dasharray: 3 4;
  opacity: 0.45;
}

.discovery-ring-segment--pass {
  stroke: color-mix(in srgb, var(--primary) 72%, var(--foreground));
  opacity: 0.9;
}

.discovery-ring-segment--warning {
  stroke: color-mix(in srgb, var(--color-amber-400, #fbbf24) 75%, var(--foreground));
  opacity: 0.88;
}

.discovery-ring-segment--error {
  stroke: color-mix(in srgb, var(--color-red-400, #f87171) 75%, var(--foreground));
  opacity: 0.92;
}

.discovery-blueprint-ring__score {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.375rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  pointer-events: none;
}

.discovery-blueprint-ring__skeleton {
  position: absolute;
  inset: 0.75rem;
  border-radius: var(--radius-md, 0.375rem);
  background: color-mix(in srgb, var(--muted) 35%, transparent);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
