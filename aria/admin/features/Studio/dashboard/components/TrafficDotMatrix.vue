<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBandwidthBytes, formatCompactCount } from "@/lib/metrics/format";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { MetricsPeriod } from "../../../../../lib/metrics/types";
import DashboardFrame from "./DashboardFrame.vue";

type MetricKey = "visits" | "requests" | "bandwidth";

interface GraphPoint {
  value: number;
  timestamp?: string;
}

interface GraphCoordinate extends GraphPoint {
  x: number;
  y: number;
}

const props = defineProps<{
  visits: number;
  requests: number;
  bandwidthBytes: number;
  hourlyVisits: readonly number[];
  hourlyRequests: readonly number[];
  hourlyBandwidthBytes: readonly number[];
  hourlyTimestamps: readonly string[];
  period: MetricsPeriod;
  canShowMetrics: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  stale?: boolean;
}>();

const emit = defineEmits<{
  periodChange: [period: MetricsPeriod];
  refresh: [];
  configure: [];
}>();

const { t } = useStudioI18n();
const activeMetric = ref<MetricKey>("visits");
const chartWidth = 1000;
const chartHeight = 240;
const chartTop = 16;
const chartBottom = 220;

const metrics = computed(() => [
  {
    id: "visits" as const,
    label: t("dashboard.traffic.visits"),
    value: props.visits,
    series: props.hourlyVisits,
  },
  {
    id: "requests" as const,
    label: t("dashboard.traffic.requests"),
    value: props.requests,
    series: props.hourlyRequests,
  },
  {
    id: "bandwidth" as const,
    label: t("dashboard.traffic.bandwidth"),
    value: props.bandwidthBytes,
    series: props.hourlyBandwidthBytes,
  },
]);

const selectedMetric = computed(
  () => metrics.value.find((metric) => metric.id === activeMetric.value)!,
);

function bucketSeries(
  values: readonly number[],
  timestamps: readonly string[],
): GraphPoint[] {
  const sourceLength = values.length;
  if (sourceLength === 0) {
    return Array.from({ length: 36 }, () => ({ value: 0 }));
  }

  const targetLength = Math.min(48, sourceLength);
  return Array.from({ length: targetLength }, (_, index) => {
    const start = Math.floor((index * sourceLength) / targetLength);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * sourceLength) / targetLength),
    );
    const bucket = values.slice(start, end);
    const value = bucket.reduce((sum, item) => sum + item, 0) / bucket.length;
    return {
      value,
      timestamp: timestamps[Math.min(end - 1, timestamps.length - 1)],
    };
  });
}

const points = computed(() =>
  bucketSeries(selectedMetric.value.series, props.hourlyTimestamps),
);

const maxValue = computed(() =>
  Math.max(0, ...points.value.map((point) => point.value)),
);

const graphPoints = computed<GraphCoordinate[]>(() => {
  const divisor = Math.max(1, points.value.length - 1);
  const graphHeight = chartBottom - chartTop;

  return points.value.map((point, index) => ({
    ...point,
    x: (index / divisor) * chartWidth,
    y:
      maxValue.value > 0
        ? chartBottom - (point.value / maxValue.value) * graphHeight
        : chartBottom,
  }));
});

function buildSmoothPath(coordinates: readonly GraphCoordinate[]): string {
  const first = coordinates[0];
  if (!first) return "";
  if (coordinates.length === 1) return `M ${first.x} ${first.y}`;

  return coordinates.slice(1).reduce((path, point, index) => {
    const previous = coordinates[index]!;
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${first.x} ${first.y}`);
}

const linePath = computed(() => buildSmoothPath(graphPoints.value));
const areaPath = computed(() => {
  const first = graphPoints.value[0];
  const last = graphPoints.value.at(-1);
  if (!first || !last || !linePath.value) return "";
  return `${linePath.value} L ${last.x} ${chartHeight} L ${first.x} ${chartHeight} Z`;
});
const gridLines = [
  chartTop,
  chartTop + 51,
  chartTop + 102,
  chartTop + 153,
  chartBottom,
];
const markerStep = computed(() =>
  Math.max(1, Math.ceil(graphPoints.value.length / 8)),
);

const periods: MetricsPeriod[] = ["24h", "7d", "30d"];

function formatMetricValue(metric: MetricKey, value: number): string {
  return metric === "bandwidth"
    ? formatBandwidthBytes(value)
    : formatCompactCount(Math.round(value));
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return t("dashboard.traffic.noData");
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).format(date);
}

const axisLabels = computed(() => {
  const withTimestamps = points.value.filter((point) => point.timestamp);
  if (withTimestamps.length === 0) {
    return [props.period, t("dashboard.traffic.now")];
  }
  return [
    formatTimestamp(withTimestamps[0]?.timestamp),
    formatTimestamp(withTimestamps.at(-1)?.timestamp),
  ];
});
</script>

<template>
  <DashboardFrame class="min-h-[22rem]">
    <div class="flex flex-wrap items-start justify-between gap-5 px-5 pt-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h2 class="m-0 text-sm font-medium text-foreground">
            {{ t("dashboard.traffic.title") }}
          </h2>
          <span
            class="h-1.5 w-1.5 rounded-full bg-primary"
            :class="{ 'animate-pulse': isLoading }"
            aria-hidden="true"
          />
        </div>
        <p class="mt-1 text-2xs text-muted-foreground">
          {{ t("dashboard.traffic.cloudflare") }}
        </p>
      </div>

      <TooltipProvider :delay-duration="250">
        <div class="flex items-center gap-2">
          <div
            class="flex overflow-hidden rounded-md border border-border/60 bg-background"
          >
            <Button
              v-for="periodOption in periods"
              :key="periodOption"
              variant="ghost"
              size="xs"
              :class="[
                'h-7! rounded-none border-0 border-r border-border/60 px-2.5! font-mono text-2xs last:border-r-0',
                period === periodOption
                  ? 'bg-primary/12! text-foreground'
                  : 'text-muted-foreground',
              ]"
              :aria-pressed="period === periodOption"
              @click="emit('periodChange', periodOption)"
            >
              {{ periodOption }}
            </Button>
          </div>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon-sm"
                class="size-7! rounded-md border-border/60"
                :disabled="isLoading || !canShowMetrics"
                :aria-label="t('dashboard.traffic.refresh')"
                @click="emit('refresh')"
              >
                <span
                  :class="[studioIcons.refresh, 'size-3.5']"
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{
              t("dashboard.traffic.refresh")
            }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>

    <Tabs v-model="activeMetric" class="mt-4 w-full gap-0">
      <TabsList
        class="grid! h-auto! w-full! min-w-0 grid-cols-3 rounded-none border-y border-border/50 bg-transparent p-0!"
      >
        <TabsTrigger
          v-for="metric in metrics"
          :key="metric.id"
          :value="metric.id"
          class="group h-auto! w-full min-w-0 justify-start! rounded-none border-0 border-r border-border/50 bg-transparent px-5! py-3! text-left whitespace-normal! last:border-r-0 data-[state=active]:bg-primary/6 data-[state=active]:shadow-none"
        >
          <span class="flex w-full min-w-0 flex-col items-start gap-1">
            <span class="text-2xs text-muted-foreground">
              {{ metric.label }}
            </span>
            <span
              class="truncate font-mono text-xl font-medium leading-none tabular-nums text-foreground"
            >
              {{ formatMetricValue(metric.id, metric.value) }}
            </span>
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <div class="relative flex min-h-0 flex-1 flex-col px-5 pb-4 pt-4">
      <div
        class="traffic-chart relative min-h-[12rem] flex-1"
        role="img"
        :aria-label="`${selectedMetric.label}: ${formatMetricValue(activeMetric, selectedMetric.value)}`"
      >
        <svg
          class="absolute inset-0 size-full overflow-visible"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="dashboard-traffic-area"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stop-color="currentColor" stop-opacity="0.28" />
              <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
            </linearGradient>
          </defs>
          <line
            v-for="lineY in gridLines"
            :key="lineY"
            class="traffic-chart__grid-line"
            x1="0"
            :y1="lineY"
            :x2="chartWidth"
            :y2="lineY"
          />
          <path
            v-if="canShowMetrics && maxValue > 0"
            class="traffic-chart__area"
            :d="areaPath"
          />
          <path
            v-if="canShowMetrics && maxValue > 0"
            class="traffic-chart__line"
            :d="linePath"
          />
          <circle
            v-for="(point, index) in graphPoints"
            v-show="
              canShowMetrics &&
              point.value > 0 &&
              (index % markerStep === 0 || index === graphPoints.length - 1)
            "
            :key="`${point.x}:${point.y}`"
            class="traffic-chart__point"
            :cx="point.x"
            :cy="point.y"
            r="4"
          />
        </svg>

        <span
          class="pointer-events-none absolute inset-x-0 bottom-0 border-b border-border/50"
          aria-hidden="true"
        />

        <TooltipProvider
          v-if="canShowMetrics && !errorMessage && maxValue > 0"
          :delay-duration="80"
        >
          <div
            class="pointer-events-none absolute inset-0 grid"
            :style="{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
            }"
          >
            <Tooltip v-for="(point, index) in points" :key="index">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="pointer-events-auto h-full min-w-0 cursor-crosshair focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  :aria-label="`${formatTimestamp(point.timestamp)}, ${formatMetricValue(activeMetric, point.value)}`"
                />
              </TooltipTrigger>
              <TooltipContent class="font-mono text-2xs">
                {{ formatTimestamp(point.timestamp) }} ·
                {{ formatMetricValue(activeMetric, point.value) }}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <div
          v-if="isLoading"
          class="absolute inset-0 grid grid-cols-6 items-end gap-4 bg-background/80 px-2 py-4 backdrop-blur-[1px]"
          aria-busy="true"
        >
          <Skeleton
            v-for="height in [35, 58, 43, 72, 52, 66]"
            :key="height"
            class="w-full rounded-sm"
            :style="{ height: `${height}%` }"
          />
        </div>

        <div
          v-else-if="!canShowMetrics || errorMessage"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/66 px-6 text-center"
        >
          <p
            v-if="errorMessage"
            class="max-w-lg text-xs leading-relaxed text-muted-foreground"
            role="status"
          >
            {{ errorMessage }}
          </p>
          <Button
            variant="outline"
            size="xs"
            class="rounded-md"
            @click="emit('configure')"
          >
            <span :class="[studioIcons.chart, 'size-3.5']" aria-hidden="true" />
            {{ t("dashboard.traffic.configure") }}
          </Button>
        </div>
      </div>

      <div
        class="mt-3 flex items-center justify-between font-mono text-3xs text-muted-foreground/55"
      >
        <span>{{ axisLabels[0] }}</span>
        <span v-if="stale">{{ t("dashboard.traffic.cached") }}</span>
        <span>{{ axisLabels[1] }}</span>
      </div>
    </div>
  </DashboardFrame>
</template>

<style scoped>
.traffic-chart {
  color: var(--primary);
}

.traffic-chart__grid-line {
  stroke: color-mix(in oklch, var(--border) 85%, var(--foreground) 15%);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.traffic-chart__area {
  fill: url(#dashboard-traffic-area);
  transition: d 360ms cubic-bezier(0.16, 1, 0.3, 1);
}

.traffic-chart__line {
  fill: none;
  stroke: color-mix(in oklch, var(--primary) 88%, var(--foreground) 12%);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(
    0 0 5px color-mix(in oklch, var(--primary) 32%, transparent)
  );
  vector-effect: non-scaling-stroke;
  transition: d 360ms cubic-bezier(0.16, 1, 0.3, 1);
}

.traffic-chart__point {
  fill: var(--background);
  stroke: color-mix(in oklch, var(--primary) 84%, var(--foreground) 16%);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

@media (prefers-reduced-motion: reduce) {
  .traffic-chart__area,
  .traffic-chart__line {
    transition: none;
  }
}
</style>
