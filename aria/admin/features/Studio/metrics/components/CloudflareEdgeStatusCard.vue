<script setup lang="ts">
import { computed } from "vue";
import { Skeleton } from "@/components/ui/skeleton";
import { studioIcons } from "@/lib/icons";
import type { AdapterMetrics } from "@/lib/storage/adapter";
import {
  EdgePipelineVariantSchema,
  buildEdgePipelineNodes,
  isEdgePipelineNodeActive,
} from "../lib/edgePipeline";
import EdgeProtectionPipeline from "./EdgeProtectionPipeline.vue";

const props = withDefaults(
  defineProps<{
    metrics: AdapterMetrics | null;
    isLoading?: boolean;
    compact?: boolean;
    borderless?: boolean;
    variant?: string;
  }>(),
  {
    isLoading: false,
    compact: false,
    borderless: false,
    variant: "list",
  },
);

const parsedVariant = computed(() => EdgePipelineVariantSchema.parse(props.variant));

const network = computed(() => props.metrics?.network);

const isDegraded = computed(() => network.value?.status === "degraded");

const statusTextClass = computed(() => {
  if (!network.value) return "text-muted-foreground";
  if (network.value.status === "online") return "text-emerald-400";
  if (network.value.status === "degraded") return "text-orange-400";
  return "text-destructive";
});

const statusDotClass = computed(() => {
  if (!network.value) return "bg-muted-foreground/30";
  if (network.value.status === "online") return "bg-emerald-400";
  if (network.value.status === "degraded") return "bg-orange-400";
  return "bg-destructive";
});

function activeClass(active: boolean): string {
  return active ? "text-emerald-400" : "text-muted-foreground";
}

const listRows = computed(() => {
  const n = network.value;
  if (!n) {
    return [];
  }
  return buildEdgePipelineNodes(n).map((node) => ({
    label: node.label,
    icon: node.icon,
    active: isEdgePipelineNodeActive(node),
    statusText: node.tooltip.split(" — ")[1] ?? "Unknown",
  }));
});
</script>

<template>
  <EdgeProtectionPipeline
    v-if="parsedVariant === 'pipeline'"
    :network="network"
    :is-loading="isLoading"
    :degraded="isDegraded"
  />

  <div
    v-else
    :class="[
      'overflow-hidden',
      borderless
        ? ''
        : 'rounded-md border border-border/50 bg-sidebar',
    ]"
  >
    <div
      v-if="!borderless || (borderless && (network || isLoading))"
      :class="[
        'flex items-center justify-between',
        compact ? 'px-3 py-2' : 'border-b border-border px-5 py-3.5 bg-sidebar',
      ]"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          v-if="!borderless"
          :class="[studioIcons.globe, 'w-3.5 h-3.5 opacity-80 shrink-0']"
          aria-hidden="true"
        />
        <span
          :class="[
            compact && !borderless
              ? 'text-2xs font-mono uppercase text-muted-foreground/60'
              : 'text-xs font-medium text-foreground',
          ]"
        >
          {{ compact ? "Network" : "Edge network" }}
        </span>
      </div>
      <div
        v-if="network"
        class="flex items-center gap-1.5 text-xs"
        :class="statusTextClass"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="statusDotClass"
        />
        {{
          network.status === "online"
            ? "Online"
            : network.status === "degraded"
              ? "Degraded"
              : "Offline"
        }}
      </div>
      <Skeleton
        v-else-if="isLoading"
        class="h-4 w-14"
      />
    </div>

    <div v-if="network" class="divide-y divide-border">
      <div
        v-for="row in listRows"
        :key="row.label"
        :class="[
          'flex items-center justify-between',
          compact ? 'px-3 h-10' : 'px-5 py-3',
        ]"
      >
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span :class="[row.icon, 'w-3.5 h-3.5 shrink-0']" />
          {{ row.label }}
        </div>
        <span class="text-xs font-medium" :class="activeClass(row.active)">
          {{ row.statusText }}
        </span>
      </div>
    </div>

    <div
      v-else-if="isLoading"
      :class="compact ? 'px-3' : 'p-5'"
      class="flex flex-col"
    >
      <Skeleton
        v-for="n in 5"
        :key="n"
        class="h-10 w-full rounded-none border-b border-border last:border-b-0"
      />
    </div>
  </div>
</template>
