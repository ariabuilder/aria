<script setup lang="ts">
/**
 * BreakpointSpectrum - Visual breakpoint scale Displays all breakpoints (defaults +
 * custom) as a vertical stack of colored proportional bars.
 */
import { computed } from "vue";
import { useStudioI18n } from "@/i18n";
import { getBreakpointIconClass } from "../../../composables/breakpointIcons";
import {
  compareBreakpointsLargestFirst,
  computeBreakpointRangeLabel,
  resolveEffectiveBreakpointWidth,
} from "../../../../lib/styles/responsiveBreakpoints";
import type { BreakpointDefinition } from "../../../../lib/types/nodes";
import type { UniversalBreakpointItem } from "../../../../lib/styles/universalDesignSystem";

interface SpectrumItem {
  id: string;
  label: string;
  iconClass: string;
  width: number;
  range: string;
  /** CSS custom property name for the chart colour, e.g. "var(--chart-1)" */
  chartVar: string;
  isCustom: boolean;
  /** Pre-calculated bar width as a percentage string, e.g. "60%". */
  barPercent: string;
}

const props = defineProps<{
  breakpoints: UniversalBreakpointItem[];
}>();

const { t } = useStudioI18n();

const CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

function toBreakpointDefinition(
  breakpoint: UniversalBreakpointItem,
): BreakpointDefinition {
  return {
    name: breakpoint.id,
    minWidth: `${breakpoint.minWidth}px`,
    canvasWidth: breakpoint.canvasWidth,
    label: breakpoint.label,
    order: breakpoint.order,
  };
}

function breakpointLabel(
  breakpoint: Pick<UniversalBreakpointItem, "id" | "label">,
): string {
  switch (breakpoint.id) {
    case "base":
      return t("design.breakpoints.default.base");
    case "laptop":
      return t("design.breakpoints.default.laptop");
    case "tablet":
      return t("design.breakpoints.default.tablet");
    case "mobile":
      return t("design.breakpoints.default.mobile");
    default:
      return breakpoint.label;
  }
}

const items = computed<SpectrumItem[]>(() => {
  const bps = props.breakpoints.filter((bp) => bp.id !== "__new__");
  const definitions = bps.map(toBreakpointDefinition);
  const sorted = [...bps].sort((left, right) =>
    compareBreakpointsLargestFirst(
      {
        name: left.id,
        minWidth: left.minWidth,
        canvasWidth: left.canvasWidth,
        order: left.order,
      },
      {
        name: right.id,
        minWidth: right.minWidth,
        canvasWidth: right.canvasWidth,
        order: right.order,
      },
    ),
  );
  const maxWidth =
    sorted.length > 0
      ? resolveEffectiveBreakpointWidth(toBreakpointDefinition(sorted[0]))
      : 1440;

  return sorted.map((bp, index) => {
    const width = resolveEffectiveBreakpointWidth(toBreakpointDefinition(bp));

    return {
      id: bp.id,
      label: breakpointLabel(bp),
      iconClass: getBreakpointIconClass(bp),
      width,
      range: computeBreakpointRangeLabel(definitions, bp.id),
      chartVar: CHART_VARS[index % CHART_VARS.length],
      isCustom: !bp.isDefault,
      barPercent: `${(width / maxWidth) * 100}%`,
    };
  });
});
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl m-0 font-medium text-foreground select-none">
      {{ t("design.breakpoints.spectrum.title") }}
    </h2>

    <div class="space-y-3">
      <div
        v-for="item in items"
        :key="item.id"
        class="rounded-lg border border-dashed border-border bg-background transition-colors hover:bg-card/50"
      >
        <div class="px-4 py-3.5">
          <!-- Header row -->
          <div class="flex items-center justify-between mb-2.5">
            <div class="flex items-center gap-2 min-w-0">
              <span
                :style="{ color: item.chartVar }"
                :class="[item.iconClass, 'size-4 shrink-0']"
              />
              <span class="text-sm font-semibold text-foreground truncate">
                {{ item.label }}
              </span>
              <span
                v-if="item.isCustom"
                class="text-2xs font-mono uppercase tracking-widest text-muted-foreground/60 shrink-0"
              >
                {{ t("design.breakpoints.spectrum.custom") }}
              </span>
            </div>
            <span
              class="text-xs text-muted-foreground tabular-nums shrink-0 ml-3"
            >
              {{ item.range }}
            </span>
          </div>

          <!-- Proportional bar -->
          <div class="relative h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              :style="{
                width: item.barPercent,
                background: item.chartVar,
              }"
              class="h-full rounded-full transition-all duration-300"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
