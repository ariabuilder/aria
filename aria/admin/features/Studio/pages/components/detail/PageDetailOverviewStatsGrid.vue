<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { STATUS_SURFACE } from "@/lib/statusTokens";
import { studioIcons } from "@/lib/icons";
import { formatCompactCount } from "@/lib/metrics/format";
import { metricsPeriodDescription } from "../../../../../../lib/metrics/period";
import TrafficSparkline from "@/features/Studio/metrics/components/TrafficSparkline.vue";
import { useStudioMetrics } from "@/features/Studio/metrics/composables/useStudioMetrics";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  pageSlug?: string;
  status: "draft" | "published" | "scheduled" | "archived";
  statusLabel: string;
  statusDescription: string;
  statusDotClass: string;
  statusSurfaceClass: string;
  editorName?: string;
  lastEdited?: string;
  seoScore: number;
}>();

const { canViewStudioMetrics, isReady: capsReady } = useStudioCapabilities();
const metrics = useStudioMetrics();
const { t } = useStudioI18n();

const periodDescription = computed(() =>
  metricsPeriodDescription(metrics.period.value),
);

const canRenderTraffic = computed(
  () =>
    capsReady.value &&
    canViewStudioMetrics.value &&
    metrics.canShowMetrics.value,
);

const pageVisits = computed(() => {
  if (!props.pageSlug || !canRenderTraffic.value) {
    return null;
  }
  return metrics.visitsForSlug(props.pageSlug);
});

const pageSparkline = computed(() => {
  if (!props.pageSlug || !canRenderTraffic.value) {
    return [];
  }
  return metrics.sparklineForSlug(props.pageSlug);
});

const isTrafficLoading = computed(
  () =>
    Boolean(props.pageSlug) &&
    canRenderTraffic.value &&
    (metrics.isLoadingAvailability.value ||
      metrics.isLoadingPagesTraffic.value ||
      pageVisits.value === null),
);

const trafficUnavailableLabel = computed(() => {
  if (!capsReady.value) return t("pages.overview.stats.checkingAccess");
  if (!canViewStudioMetrics.value) return t("pages.overview.stats.unavailable");
  if (!metrics.canShowMetrics.value) return t("pages.overview.stats.notEnabled");
  if (!props.pageSlug) return t("pages.overview.stats.noSlug");
  return t("pages.overview.stats.unavailable");
});

const seoLabel = computed(() => {
  if (props.seoScore >= 80) return t("pages.overview.stats.good");
  if (props.seoScore >= 50) return t("pages.overview.stats.needsWork");
  return t("pages.overview.stats.poor");
});

const seoToneClass = computed(() => {
  if (props.seoScore >= 80) return STATUS_SURFACE.success;
  if (props.seoScore >= 50) return STATUS_SURFACE.warning;
  return "border-destructive/30 text-destructive";
});

const seoRingClass = computed(() => {
  if (props.seoScore >= 80) return "stroke-emerald-500";
  if (props.seoScore >= 50) return "stroke-amber-400";
  return "stroke-destructive";
});

const statusIcon = computed(() => {
  if (props.status === "published") return studioIcons.published;
  if (props.status === "scheduled") return studioIcons.scheduled;
  if (props.status === "archived") return studioIcons.archived;
  return studioIcons.draft;
});

const seoCircumference = 2 * Math.PI * 16;
const seoOffset = computed(
  () =>
    seoCircumference -
    (Math.max(0, Math.min(props.seoScore, 100)) / 100) * seoCircumference,
);

async function ensureTraffic(): Promise<void> {
  if (!canViewStudioMetrics.value) {
    return;
  }
  await metrics.refreshAvailability(true);
  if (metrics.canShowMetrics.value) {
    await metrics.ensureTrafficLoaded();
  }
}

onMounted(() => {
  void ensureTraffic();
});

watch(
  () => metrics.canShowMetrics.value,
  (enabled) => {
    if (enabled) {
      void metrics.ensureTrafficLoaded();
    }
  },
);
</script>

<template>
  <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Card class="bg-card/20">
      <CardHeader class="px-4 pt-4 pb-0">
        <div class="flex items-center gap-2">
          <span
            :class="[statusIcon, 'size-4 text-muted-foreground']"
            aria-hidden="true"
          />
          <CardTitle class="text-sm font-semibold">{{ t("pages.overview.stats.status") }}</CardTitle>
        </div>
      </CardHeader>
      <CardContent class="grid gap-3 px-4 pb-4 pt-3">
        <div
          class="inline-flex h-7 w-fit items-center gap-2 rounded-md border px-2.5 text-xs font-medium"
          :class="statusSurfaceClass"
        >
          <span class="size-1.5 rounded-full" :class="statusDotClass" />
          {{ statusLabel }}
        </div>
        <p class="m-0 text-xs leading-snug text-muted-foreground">
          {{ statusDescription }}
        </p>
      </CardContent>
    </Card>

    <Card class="bg-card/20">
      <CardHeader class="px-4 pt-4 pb-0">
        <div class="flex items-center gap-2">
          <span
            :class="[studioIcons.history, 'size-4 text-muted-foreground']"
            aria-hidden="true"
          />
          <CardTitle class="text-sm font-semibold">{{ t("pages.overview.stats.lastUpdated") }}</CardTitle>
        </div>
      </CardHeader>
      <CardContent class="grid gap-1 px-4 pb-4 pt-3">
        <p class="m-0 text-lg font-semibold leading-tight text-foreground">
          {{ lastEdited || t("pages.overview.stats.noEdits") }}
        </p>
        <p class="m-0 text-xs leading-snug text-muted-foreground">
          <template v-if="editorName">{{ t("pages.overview.stats.by", { name: editorName }) }}</template>
          <template v-else>{{ t("pages.overview.stats.editorUnknown") }}</template>
        </p>
      </CardContent>
    </Card>

    <Card class="bg-card/20">
      <CardHeader class="px-4 pt-4 pb-0">
        <div class="flex items-center gap-2">
          <span
            :class="[studioIcons.chart, 'size-4 text-muted-foreground']"
            aria-hidden="true"
          />
          <CardTitle class="text-sm font-semibold">{{ t("pages.overview.stats.traffic") }}</CardTitle>
        </div>
      </CardHeader>
      <CardContent class="grid gap-2 px-4 pb-4 pt-3">
        <template v-if="isTrafficLoading">
          <div class="h-7 w-20 animate-pulse rounded bg-muted/50" />
          <div class="h-3 w-28 animate-pulse rounded bg-muted/35" />
        </template>
        <template v-else-if="pageVisits !== null">
          <div class="flex items-end justify-between gap-3">
            <p class="m-0 text-2xl font-semibold leading-none tabular-nums">
              {{ formatCompactCount(pageVisits) }}
            </p>
            <TrafficSparkline
              v-if="pageSparkline.length > 0"
              :values="pageSparkline"
              :width="52"
              :height="18"
            />
          </div>
          <p class="m-0 text-xs leading-snug text-muted-foreground">
            {{ t("pages.overview.stats.visitsIn", { period: periodDescription }) }}
          </p>
        </template>
        <template v-else>
          <p class="m-0 text-lg font-semibold leading-tight text-foreground">
            {{ trafficUnavailableLabel }}
          </p>
          <p class="m-0 text-xs leading-snug text-muted-foreground">
            {{ t("pages.overview.stats.trafficMetrics") }}
          </p>
        </template>
      </CardContent>
    </Card>

    <Card class="bg-card/20">
      <CardHeader class="px-4 pt-4 pb-0">
        <div class="flex items-center gap-2">
          <span
            :class="[studioIcons.search, 'size-4 text-muted-foreground']"
            aria-hidden="true"
          />
          <CardTitle class="text-sm font-semibold">{{ t("pages.detail.tabs.seo") }}</CardTitle>
        </div>
      </CardHeader>
      <CardContent class="flex items-center gap-3 px-4 pb-4 pt-3">
        <div class="relative size-11 shrink-0">
          <svg class="size-11 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              class="stroke-border"
              stroke-width="3"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              :class="seoRingClass"
              stroke-width="3"
              stroke-linecap="round"
              :stroke-dasharray="seoCircumference"
              :stroke-dashoffset="seoOffset"
            />
          </svg>
          <span
            class="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-foreground"
          >
            {{ seoScore }}
          </span>
        </div>
        <div class="min-w-0">
          <div
            class="mb-1 inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium"
            :class="seoToneClass"
          >
            {{ seoLabel }}
          </div>
          <p class="m-0 text-xs leading-snug text-muted-foreground">
            {{ t("pages.overview.stats.seoScore") }}
          </p>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
