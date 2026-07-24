/**
 * Fetches and caches adapter identity (AdapterInfo) and live infrastructure
 * metrics (AdapterMetrics). Singleton state shared across dashboard consumers.
 */

import { ref, onMounted, type Ref } from "vue";
import { actions } from "astro:actions";
import type { AdapterInfo, AdapterMetrics } from "@/lib/storage/adapter";
import {
  parseAdapterInfoPayload,
  parseAdapterMetricsPayload,
} from "@/composables/platformActionResults";

export interface AdapterMetricsReturn {
  info: Ref<AdapterInfo | null>;
  metrics: Ref<AdapterMetrics | null>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => Promise<void>;
}

const info = ref<AdapterInfo | null>(null);
const metrics = ref<AdapterMetrics | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

let refreshPromise: Promise<void> | null = null;

async function fetchAdapterMetrics(): Promise<void> {
  isLoading.value = true;
  error.value = null;

  try {
    const [infoResult, metricsResult] = await Promise.allSettled([
      actions.platform.info({}),
      actions.platform.metrics({}),
    ]);

    if (infoResult.status === "fulfilled" && !infoResult.value.error) {
      info.value = parseAdapterInfoPayload(infoResult.value.data);
    }

    if (metricsResult.status === "fulfilled" && !metricsResult.value.error) {
      metrics.value = parseAdapterMetricsPayload(metricsResult.value.data);
    }
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "Failed to load adapter metrics";
  } finally {
    isLoading.value = false;
    refreshPromise = null;
  }
}

export function useAdapterMetrics(): AdapterMetricsReturn {
  async function refresh(): Promise<void> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = fetchAdapterMetrics();
    return refreshPromise;
  }

  onMounted(() => {
    if (!info.value && !refreshPromise) {
      void refresh();
    }
  });

  return { info, metrics, isLoading, error, refresh };
}
