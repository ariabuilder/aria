<script setup lang="ts">
import { computed } from "vue";
import { useAdapterMetrics } from "../composables/useAdapterMetrics";
import {
  AdapterMetricsLayoutSchema,
  type AdapterMetricsLayout,
} from "@/features/Studio/dashboard/schemas/dashboard";
import CloudflareEdgeStatusCard from "./CloudflareEdgeStatusCard.vue";
import StorageBindingsGrid from "./StorageBindingsGrid.vue";
import DashboardRailSkeletons from "@/features/Studio/dashboard/components/DashboardRailSkeletons.vue";

const props = withDefaults(
  defineProps<{
    layout?: AdapterMetricsLayout;
  }>(),
  {
    layout: "stack",
  },
);

const parsedLayout = computed(() =>
  AdapterMetricsLayoutSchema.parse(props.layout),
);

const { metrics, isLoading } = useAdapterMetrics();
</script>

<template>
  <div v-if="parsedLayout === 'stack'" class="space-y-6">
    <section aria-labelledby="cloudflare-status-heading">
      <h2
        id="cloudflare-status-heading"
        class="text-sm font-medium text-foreground"
      >
        Cloudflare Status
      </h2>
      <p class="text-2xs text-muted-foreground mt-1 mb-3 max-w-prose">
        Your site runs on Cloudflare's global edge — protected, cached, and
        delivered close to every visitor.
      </p>
      <CloudflareEdgeStatusCard
        :metrics="metrics"
        :is-loading="isLoading"
      />
    </section>

    <section aria-labelledby="storage-bindings-heading">
      <h2
        id="storage-bindings-heading"
        class="text-sm font-medium text-foreground"
      >
        Storage bindings
      </h2>
      <p class="text-2xs text-muted-foreground mt-1 mb-3 max-w-prose">
        Live connections to your database, cache, and media bucket on
        Cloudflare.
      </p>
      <StorageBindingsGrid
        :storage="metrics?.storage"
        :is-loading="isLoading"
      />
    </section>
  </div>

  <div v-else>
    <DashboardRailSkeletons
      v-if="isLoading"
      variant="infra-pipeline"
    />

    <CloudflareEdgeStatusCard
      v-else
      :metrics="metrics"
      :is-loading="isLoading"
      variant="pipeline"
      borderless
    />
  </div>
</template>
