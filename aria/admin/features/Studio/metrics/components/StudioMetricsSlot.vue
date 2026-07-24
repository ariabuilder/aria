<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useStudioMetrics } from "../composables/useStudioMetrics";
import SitePulsePanel from "./SitePulsePanel.vue";
import TrafficSparkline from "./TrafficSparkline.vue";
import { formatCompactCount } from "@/lib/metrics/format";
import { metricsPeriodDescription } from "../../../../../lib/metrics/period";

export type StudioMetricsSlotId =
  | "dashboard"
  | "pages-list"
  | "page-detail-overview";

const props = defineProps<{
  placement: StudioMetricsSlotId;
  slug?: string;
}>();

const { canViewStudioMetrics, isReady: capsReady } = useStudioCapabilities();
const metrics = useStudioMetrics();

const shouldRender = computed(
  () =>
    capsReady.value &&
    canViewStudioMetrics.value &&
    metrics.canShowMetrics.value,
);

onMounted(() => {
  if (!canViewStudioMetrics.value) {
    return;
  }
  void metrics.refreshAvailability(true).then(() => {
    if (metrics.canShowMetrics.value) {
      void metrics.ensureTrafficLoaded();
    }
  });
});

watch(
  () => metrics.canShowMetrics.value,
  (enabled) => {
    if (enabled) {
      void metrics.ensureTrafficLoaded();
    }
  },
);

const pageVisits = computed(() => {
  if (!props.slug) {
    return null;
  }
  return metrics.visitsForSlug(props.slug);
});

const pageSparkline = computed(() => {
  if (!props.slug) {
    return [];
  }
  return metrics.sparklineForSlug(props.slug);
});

const periodDescription = computed(() =>
  metricsPeriodDescription(metrics.period.value),
);
</script>

<template>
  <template v-if="shouldRender">
    <SitePulsePanel
      v-if="placement === 'dashboard'"
      :visits="metrics.siteVisits.value"
      :bandwidth-bytes="metrics.siteBandwidthBytes.value"
      :period="metrics.period.value"
      :hourly-visits="metrics.siteHourlyVisits.value"
      :fetched-at="metrics.siteFetchedAt.value"
      :stale="metrics.siteStale.value"
      :is-loading="metrics.isLoadingSiteTraffic.value"
      :error-message="metrics.trafficError.value"
      @refresh="metrics.refreshTraffic(true)"
    />

    <div
      v-else-if="placement === 'pages-list' && slug"
      class="flex items-center gap-2 text-2xs text-muted-foreground tabular-nums"
    >
      <template v-if="pageVisits !== null">
        <span>{{ formatCompactCount(pageVisits) }} visits · {{ periodDescription }}</span>
        <TrafficSparkline :values="pageSparkline" :width="24" :height="7" />
      </template>
    </div>

    <div
      v-else-if="placement === 'page-detail-overview' && slug"
      class="rounded-md border border-border bg-muted/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
    >
      <div>
        <p class="text-xs font-medium text-foreground">Traffic (live site)</p>
        <p class="text-2xs text-muted-foreground">
          Site traffic in the {{ periodDescription }}
        </p>
      </div>
      <div
        v-if="pageVisits !== null"
        class="flex items-center gap-3"
      >
        <span class="text-xl font-semibold tabular-nums">
          {{ formatCompactCount(pageVisits) }}
        </span>
        <TrafficSparkline :values="pageSparkline" />
      </div>
      <div
        v-else
        class="h-6 w-16 rounded bg-muted/40 animate-pulse"
        aria-busy="true"
      />
    </div>

  </template>
</template>
