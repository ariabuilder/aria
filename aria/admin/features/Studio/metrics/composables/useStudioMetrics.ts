/**
 * Studio traffic metrics — singleton availability + traffic data.
 */

import { computed, ref, shallowRef, watch } from "vue";
import { actions } from "astro:actions";
import type { AnalyticsAvailability } from "../../../../../lib/metrics/schemas";
import type { MetricsPeriod } from "../../../../../lib/metrics/types";
import { formatTrafficErrorMessage } from "../../../../../lib/metrics/trafficErrors";

let availabilityPromise: Promise<AnalyticsAvailability> | null = null;
let cachedAvailability: AnalyticsAvailability | null = null;
let cachedAvailabilityAt = 0;

const AVAILABILITY_CACHE_MS = 5 * 60_000; // 5 minutes (was 30s — matches media assets cache duration)

let siteTrafficPromise: Promise<void> | null = null;
let pagesTrafficPromise: Promise<void> | null = null;

const availabilityState = shallowRef<AnalyticsAvailability | null>(null);
const isLoadingAvailability = ref(false);
const availabilityError = ref<string | null>(null);

const period = ref<MetricsPeriod>("7d");
const isLoadingSiteTraffic = ref(false);
const isLoadingPagesTraffic = ref(false);
const trafficError = ref<string | null>(null);

const siteVisits = ref(0);
const siteRequests = ref(0);
const siteBandwidthBytes = ref(0);
const siteHourlyVisits = ref<number[]>([]);
const siteHourlyRequests = ref<number[]>([]);
const siteHourlyBandwidthBytes = ref<number[]>([]);
const siteHourlyTimestamps = ref<string[]>([]);
const siteFetchedAt = ref<string | undefined>();
const siteStale = ref(false);

const visitsBySlug = shallowRef<Record<string, number>>({});
const unmappedVisits = ref(0);
const pagesFetchedAt = ref<string | undefined>();
const pagesStale = ref(false);

async function fetchAvailability(): Promise<AnalyticsAvailability> {
  const { data, error } = await actions.analytics.getMetricsAvailability({});
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("No availability data returned");
  }
  return data;
}

const isCloudflarePlatform = computed(
  () => availabilityState.value?.platform === "cloudflare",
);

const canShowMetrics = computed(
  () => availabilityState.value?.canShowStudioMetrics === true,
);

const availabilityMessage = computed(() => {
  const current = availabilityState.value;
  if (!current || current.canShowStudioMetrics) {
    return null;
  }
  return formatTrafficErrorMessage(current.reason);
});

function clearTrafficDisplayState(): void {
  visitsBySlug.value = {};
  siteVisits.value = 0;
  siteRequests.value = 0;
  siteBandwidthBytes.value = 0;
  siteHourlyVisits.value = [];
  siteHourlyRequests.value = [];
  siteHourlyBandwidthBytes.value = [];
  siteHourlyTimestamps.value = [];
  unmappedVisits.value = 0;
  trafficError.value = null;
  siteFetchedAt.value = undefined;
  siteStale.value = false;
  pagesFetchedAt.value = undefined;
  pagesStale.value = false;
}

watch(canShowMetrics, (enabled) => {
  if (!enabled) {
    clearTrafficDisplayState();
  }
});

export function useStudioMetrics() {
  async function refreshAvailability(force = false): Promise<void> {
    const cacheFresh =
      cachedAvailability &&
      Date.now() - cachedAvailabilityAt < AVAILABILITY_CACHE_MS;
    if (!force && cacheFresh && cachedAvailability) {
      availabilityState.value = cachedAvailability;
      return;
    }

    if (!force && availabilityPromise) {
      try {
        const result = await availabilityPromise;
        availabilityState.value = result;
        cachedAvailability = result;
        cachedAvailabilityAt = Date.now();
      } catch (err) {
        availabilityError.value =
          err instanceof Error
            ? err.message
            : "Failed to load metrics availability";
      }
      return;
    }

    isLoadingAvailability.value = true;
    availabilityError.value = null;
    availabilityPromise = fetchAvailability();

    try {
      const result = await availabilityPromise;
      cachedAvailability = result;
      cachedAvailabilityAt = Date.now();
      availabilityState.value = result;
    } catch (err) {
      availabilityError.value =
        err instanceof Error
          ? err.message
          : "Failed to load metrics availability";
      availabilityState.value = null;
      cachedAvailability = null;
    } finally {
      isLoadingAvailability.value = false;
      availabilityPromise = null;
    }
  }

  async function loadSiteTraffic(force = false): Promise<void> {
    if (!canShowMetrics.value) {
      return;
    }

    if (!force && siteTrafficPromise) {
      await siteTrafficPromise;
      return;
    }

    isLoadingSiteTraffic.value = true;
    trafficError.value = null;

    siteTrafficPromise = (async () => {
      const { data, error } = await actions.analytics.getSiteTraffic({
        period: period.value,
        force,
      });
      if (error) {
        throw error;
      }
      if (!data?.available || !data.metrics) {
        trafficError.value = formatTrafficErrorMessage(data?.reason);
        return;
      }
      siteVisits.value = data.metrics.visits;
      siteRequests.value = data.metrics.requests;
      siteBandwidthBytes.value = data.metrics.bandwidthBytes;
      siteHourlyVisits.value = data.metrics.hourlyVisits ?? [];
      siteHourlyRequests.value = data.metrics.hourlyRequests ?? [];
      siteHourlyBandwidthBytes.value = data.metrics.hourlyBandwidthBytes ?? [];
      siteHourlyTimestamps.value = data.metrics.hourlyTimestamps ?? [];
      siteFetchedAt.value = data.metrics.fetchedAt;
      siteStale.value = data.metrics.stale ?? false;
    })();

    try {
      await siteTrafficPromise;
    } catch (err) {
      trafficError.value =
        err instanceof Error ? err.message : "Failed to load site traffic";
    } finally {
      isLoadingSiteTraffic.value = false;
      siteTrafficPromise = null;
    }
  }

  async function loadPagesTraffic(force = false): Promise<void> {
    if (!canShowMetrics.value) {
      return;
    }

    if (!force && pagesTrafficPromise) {
      await pagesTrafficPromise;
      return;
    }

    isLoadingPagesTraffic.value = true;
    trafficError.value = null;

    pagesTrafficPromise = (async () => {
      const { data, error } = await actions.analytics.getPagesTraffic({
        period: period.value,
        force,
      });
      if (error) {
        throw error;
      }
      if (!data?.available) {
        trafficError.value = formatTrafficErrorMessage(data?.reason);
        return;
      }
      visitsBySlug.value = data.bySlug ?? {};
      unmappedVisits.value = data.unmappedVisits ?? 0;
      pagesFetchedAt.value = data.fetchedAt;
      pagesStale.value = data.stale ?? false;
    })();

    try {
      await pagesTrafficPromise;
    } catch (err) {
      trafficError.value =
        err instanceof Error ? err.message : "Failed to load page traffic";
    } finally {
      isLoadingPagesTraffic.value = false;
      pagesTrafficPromise = null;
    }
  }

  async function ensureTrafficLoaded(): Promise<void> {
    if (!cachedAvailability) {
      await refreshAvailability();
    }
    if (!canShowMetrics.value) {
      return;
    }
    await Promise.all([loadSiteTraffic(), loadPagesTraffic()]);
  }

  async function refreshTraffic(force = false): Promise<void> {
    await refreshAvailability(force);
    if (!canShowMetrics.value) {
      return;
    }
    await Promise.all([loadSiteTraffic(force), loadPagesTraffic(force)]);
  }

  function visitsForSlug(slug: string): number | null {
    if (!canShowMetrics.value) {
      return null;
    }
    if (isLoadingPagesTraffic.value && !(slug in visitsBySlug.value)) {
      return null;
    }
    return visitsBySlug.value[slug] ?? 0;
  }

  function sparklineForSlug(slug: string): number[] {
    void slug;
    return siteHourlyVisits.value.slice(-7);
  }

  function clearMetricsSessionCache(): void {
    cachedAvailability = null;
    cachedAvailabilityAt = 0;
    availabilityState.value = null;
    availabilityPromise = null;
    siteTrafficPromise = null;
    pagesTrafficPromise = null;
    visitsBySlug.value = {};
    siteVisits.value = 0;
    siteRequests.value = 0;
    siteBandwidthBytes.value = 0;
    siteHourlyVisits.value = [];
    siteHourlyRequests.value = [];
    siteHourlyBandwidthBytes.value = [];
    siteHourlyTimestamps.value = [];
    unmappedVisits.value = 0;
    trafficError.value = null;
    siteFetchedAt.value = undefined;
    siteStale.value = false;
    pagesFetchedAt.value = undefined;
    pagesStale.value = false;
  }

  return {
    availability: computed(() => availabilityState.value),
    availabilityMessage,
    isCloudflarePlatform,
    canShowMetrics,
    period,
    isLoadingAvailability: computed(() => isLoadingAvailability.value),
    availabilityError: computed(() => availabilityError.value),
    isLoadingSiteTraffic: computed(() => isLoadingSiteTraffic.value),
    isLoadingPagesTraffic: computed(() => isLoadingPagesTraffic.value),
    trafficError: computed(() => trafficError.value),
    siteVisits: computed(() => siteVisits.value),
    siteRequests: computed(() => siteRequests.value),
    siteBandwidthBytes: computed(() => siteBandwidthBytes.value),
    siteHourlyVisits: computed(() => siteHourlyVisits.value),
    siteHourlyRequests: computed(() => siteHourlyRequests.value),
    siteHourlyBandwidthBytes: computed(() => siteHourlyBandwidthBytes.value),
    siteHourlyTimestamps: computed(() => siteHourlyTimestamps.value),
    siteFetchedAt: computed(() => siteFetchedAt.value),
    siteStale: computed(() => siteStale.value),
    visitsBySlug: computed(() => visitsBySlug.value),
    unmappedVisits: computed(() => unmappedVisits.value),
    refreshAvailability,
    ensureTrafficLoaded,
    refreshTraffic,
    visitsForSlug,
    sparklineForSlug,
    clearMetricsSessionCache,
  };
}
