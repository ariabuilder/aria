<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useResponsiveTarget } from "@/composables/useResponsiveTarget";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

import type { InspectorOverrideBreakpoint } from "../composables/useInspectorPropertyOverrides";

interface Props {
  breakpoints: readonly InspectorOverrideBreakpoint[];
  currentBreakpointLabel: string;
  showReset?: boolean;
  resetTestId?: string;
}

withDefaults(defineProps<Props>(), {
  showReset: false,
  resetTestId: undefined,
});
const { t } = useStudioI18n();

const { setTargetBreakpoint } = useResponsiveTarget();

function handleBreakpointClick(breakpointId: string): void {
  setTargetBreakpoint(breakpointId);
}

defineEmits<{
  reset: [];
}>();
</script>

<template>
  <div
    v-if="breakpoints.length > 0 || showReset"
    class="inline-flex items-center gap-1"
  >
    <div
      v-if="breakpoints.length > 0"
      class="inline-flex items-center gap-0.5"
      :aria-label="t('inspector.breakpoints.overrides')"
    >
      <TooltipProvider v-for="breakpoint in breakpoints" :key="breakpoint.id">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              :data-testid="`breakpoint-indicator-${breakpoint.id}`"
              type="button"
              class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-sidebar-foreground-70 transition-colors hover:bg-sidebar-foreground-10 hover:text-sidebar-foreground"
              :class="breakpoint.isCurrent ? 'text-primary' : 'opacity-70'"
              :aria-label="t('inspector.breakpoints.override', { breakpoint: breakpoint.label })"
              :aria-pressed="breakpoint.isCurrent ? 'true' : 'false'"
              @click.stop="handleBreakpointClick(breakpoint.id)"
            >
              <span
                aria-hidden="true"
                :class="[breakpoint.iconClass, 'size-3.5 shrink-0']"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" class="text-xs">
            {{ t("inspector.breakpoints.overridesOn", { breakpoint: breakpoint.label }) }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <TooltipProvider v-if="showReset">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            :data-testid="resetTestId"
            class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-sidebar-foreground-70 transition-colors hover:bg-sidebar-foreground-10 hover:text-sidebar-foreground"
            :aria-label="t('inspector.breakpoints.reset', { breakpoint: currentBreakpointLabel })"
            @click.stop="$emit('reset')"
          >
            <span
              aria-hidden="true"
              :class="[studioIcons.close, 'size-3.5 shrink-0']"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" class="text-xs">
          {{ t("inspector.breakpoints.reset", { breakpoint: currentBreakpointLabel }) }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
