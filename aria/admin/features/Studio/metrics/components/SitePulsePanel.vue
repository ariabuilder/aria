<script setup lang="ts">
import { computed } from "vue";
import { formatBandwidthBytes } from "@/lib/metrics/format";
import {
  metricsPeriodDescription,
  metricsPeriodLabel,
} from "../../../../../lib/metrics/period";
import type { MetricsPeriod } from "../../../../../lib/metrics/types";
import TrafficSparkline from "./TrafficSparkline.vue";
import TrafficStat from "./TrafficStat.vue";

const props = defineProps<{
  visits: number;
  bandwidthBytes: number;
  period: MetricsPeriod;
  hourlyVisits: readonly number[];
  fetchedAt?: string;
  stale?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const periodLabel = computed(() => metricsPeriodLabel(props.period));
const periodDescription = computed(() =>
  metricsPeriodDescription(props.period),
);

const asOfLabel = computed(() => {
  if (!props.fetchedAt) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(props.fetchedAt));
  } catch {
    return null;
  }
});

const chartValues = computed(() => [...props.hourlyVisits]);
</script>

<template>
  <div
    class="rounded-md border border-solid border-border/50 bg-sidebar px-4 py-4"
  >
    <div class="flex items-start justify-between gap-2 mb-4">
      <div>
        <h2 class="text-lg font-medium text-foreground">Site traffic</h2>
        <p class="text-xs text-muted-foreground mt-0.5 capitalize">
          {{ periodDescription }}
        </p>
      </div>
      <button
        type="button"
        class="text-2xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
        :disabled="isLoading"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>

    <div
      v-if="isLoading"
      class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 items-stretch min-h-[5.5rem]"
      aria-busy="true"
    >
      <div class="flex items-end gap-6 self-end pb-1">
        <div class="h-10 w-14 rounded bg-muted/40 animate-pulse" />
        <div class="h-10 w-16 rounded bg-muted/40 animate-pulse" />
      </div>
      <div class="min-h-[5.5rem] rounded bg-muted/40 animate-pulse" />
    </div>

    <p
      v-else-if="errorMessage"
      class="text-xs text-destructive/90 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <template v-else>
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 items-stretch min-h-[5.5rem]"
      >
        <div class="flex items-end gap-6 self-end shrink-0">
          <TrafficStat label="Visits" :value="visits" :period="periodLabel" />
          <div class="min-w-0">
            <p class="text-2xs uppercase tracking-wide text-muted-foreground">
              Bandwidth
            </p>
            <p class="text-lg font-semibold text-foreground">
              {{ formatBandwidthBytes(bandwidthBytes) }}
            </p>
          </div>
        </div>
        <div class="relative min-h-[5.5rem] min-w-0 self-stretch">
          <TrafficSparkline
            :values="chartValues"
            responsive
            area
            class="absolute inset-0 h-full w-full"
          />
        </div>
      </div>

      <p
        v-if="visits === 0"
        class="text-xs text-muted-foreground mt-3"
      >
        No visits in this period for your site host.
      </p>

      <p
        v-if="asOfLabel"
        class="text-xs text-muted-foreground/70 mt-3"
      >
        As of {{ asOfLabel }}
      </p>
    </template>
  </div>
</template>
