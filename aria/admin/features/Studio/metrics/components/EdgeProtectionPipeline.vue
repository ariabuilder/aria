<script setup lang="ts">
import { computed } from "vue";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildEdgePipelineNodes,
  isEdgePipelineNodeActive,
  type EdgePipelineNode,
} from "../lib/edgePipeline";
import type { AdapterNetworkMetrics } from "@/lib/storage/adapterMetricsSchemas";

const props = defineProps<{
  network: AdapterNetworkMetrics | undefined;
  isLoading?: boolean;
  degraded?: boolean;
}>();

const nodes = computed(() => buildEdgePipelineNodes(props.network));

type GridItem =
  | { kind: "cell"; node: EdgePipelineNode }
  | { kind: "connector" };

const gridItems = computed((): GridItem[] => {
  const items: GridItem[] = [];
  for (const node of nodes.value) {
    if (items.length > 0) {
      items.push({ kind: "connector" });
    }
    items.push({ kind: "cell", node });
  }
  return items;
});

function connectorIsActive(index: number): boolean {
  const prev = gridItems.value[index - 1];
  const next = gridItems.value[index + 1];
  if (prev?.kind !== "cell" || next?.kind !== "cell") {
    return false;
  }
  return (
    isEdgePipelineNodeActive(prev.node) && isEdgePipelineNodeActive(next.node)
  );
}

const destinationClass = computed(() =>
  props.degraded ? "text-orange-400" : "text-primary",
);

</script>

<template>
  <div
    class="relative flex w-full items-stretch justify-center overflow-hidden rounded-md border border-solid border-border/50 bg-sidebar p-4 md:p-6 dashboard-reveal"
  >
    <div
      class="relative flex h-full w-full flex-col items-center justify-center gap-3"
    >
      <div class="flex w-full items-center justify-between">
        <small class="text-muted-foreground">Visitor traffic</small>
        <small :class="destinationClass">Your site</small>
      </div>

      <div
        v-if="isLoading"
        class="grid w-full items-stretch"
        style="grid-template-columns: 1fr 12px 1fr 12px 1fr 12px 1fr 12px 1fr"
      >
        <template v-for="n in 9" :key="n">
          <Skeleton
            v-if="n % 2 === 1"
            class="h-[62px] w-full rounded-[3px]"
          />
          <div v-else class="bg-border my-auto h-px w-full" />
        </template>
      </div>

      <div
        v-else
        class="grid w-full items-stretch"
        style="grid-template-columns: 1fr 12px 1fr 12px 1fr 12px 1fr 12px 1fr"
      >
        <template v-for="(item, index) in gridItems" :key="index">
          <div
            v-if="item.kind === 'connector'"
            :class="[
              'my-auto h-px w-full transition-colors duration-200',
              connectorIsActive(index) ? 'bg-primary' : 'bg-border',
            ]"
          />

          <div
            v-else
            :title="item.node.tooltip"
            :class="[
              'relative rounded-[3px] transition-colors duration-200',
              isEdgePipelineNodeActive(item.node)
                ? 'bg-primary/5'
                : 'bg-border/15',
              item.node.status === 'unknown' || item.node.status === 'inactive'
                ? 'opacity-50'
                : '',
            ]"
          >
            <svg
              class="pointer-events-none absolute inset-0 z-[1] h-full w-full"
              width="100%"
              height="100%"
              viewBox="0 0 89 62"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect
                x="0.5"
                y="0.5"
                width="88"
                height="61"
                rx="3"
                ry="3"
                fill="none"
                :stroke="
                  isEdgePipelineNodeActive(item.node)
                    ? 'var(--primary)'
                    : 'var(--border)'
                "
                stroke-width="1"
                stroke-dasharray="8,8"
                stroke-linecap="round"
              />
            </svg>

            <div class="relative z-[2] h-full">
              <div
                class="flex flex-col items-center gap-1.5 px-2 py-3"
              >
                <span
                  :class="[
                    item.node.icon,
                    'size-4 shrink-0 transition-colors duration-200',
                    isEdgePipelineNodeActive(item.node)
                      ? 'text-primary'
                      : 'text-muted-foreground',
                  ]"
                  aria-hidden="true"
                />
                <small
                  :class="[
                    'transition-colors duration-200',
                    isEdgePipelineNodeActive(item.node)
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  ]"
                >
                  {{ item.node.label }}
                </small>
              </div>
            </div>
          </div>
        </template>
      </div>

      <small
        class="text-center text-balance text-xs font-light text-muted-foreground/55"
      >
        Protected on Cloudflare's global edge
      </small>
    </div>
  </div>
</template>
