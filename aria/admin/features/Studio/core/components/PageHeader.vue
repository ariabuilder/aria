<script setup lang="ts">
import { computed, useSlots } from "vue";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ExpandableSearchInput from "./ExpandableSearchInput.vue";

interface Props {
  title: string;
  description?: string;
  icon?: string;
  searchQuery?: string;
  sortBy?: string;
  entityLabelSingular?: string;
  createLabel?: string;
  hideCreate?: boolean;
  /** Extra end padding for dialog close buttons. */
  reserveCloseSpace?: boolean;
  controlsAlign?: "center" | "start";
  /** Tooltip placement for the default search control. */
  searchTooltipSide?: "top" | "bottom" | "left" | "right";
  /** Hide the default search affordance when the view has no searchable content. */
  hideSearch?: boolean;
  /** Keep header tooltips inside modal dialog trees. */
  tooltipPortalled?: boolean;
  /** Render toolbar + actions in one continuous control group. */
  mergeActions?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  hideCreate: false,
  reserveCloseSpace: false,
  controlsAlign: "center",
  searchTooltipSide: "bottom",
  hideSearch: false,
  tooltipPortalled: true,
  mergeActions: false,
});

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  "update:sortBy": [value: string];
  create: [];
}>();

const slots = useSlots();

const hasActions = computed(
  () => Boolean(slots.actions) || !props.hideCreate,
);
const defaultCreateLabel = computed(
  () =>
    props.createLabel ??
    (props.entityLabelSingular ? `New ${props.entityLabelSingular}` : "New"),
);
</script>

<template>
  <div
    :class="
      cn(
        'flex justify-between gap-0 bg-background px-7 pt-7 pb-7 overflow-visible',
        props.controlsAlign === 'start' ? 'items-start' : 'items-center',
        props.reserveCloseSpace && 'pr-14',
        props.class,
      )
    "
  >
    <!-- Title (left) -->
    <div class="flex min-w-0 flex-1 select-none items-center gap-3">
      <div class="min-w-0">
        <slot name="title">
          <h1
            class="truncate text-3xl font-medium font-serif shrink-0 m-0 tracking-tight"
          >
            {{ props.title }}
          </h1>
        </slot>
        <p
          v-if="props.description"
          class="leading-0 text-sm text-muted-foreground/60"
        >
          {{ props.description }}
        </p>
      </div>
    </div>

    <!-- Controls (right) -->
    <TooltipProvider
      :delay-duration="0"
      :skip-delay-duration="0"
      :disable-hoverable-content="true"
      ignore-non-keyboard-focus
    >
      <div
        class="flex shrink-0 items-center justify-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          class="flex shrink-0 items-center gap-0 [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
        >
          <slot v-if="!props.hideSearch" name="search">
            <ExpandableSearchInput
              :model-value="props.searchQuery ?? ''"
              placeholder="Search"
              :tooltip-side="props.searchTooltipSide"
              :tooltip-portalled="props.tooltipPortalled"
              @update:model-value="emit('update:searchQuery', $event)"
            />
          </slot>
          <slot v-else name="search" />
          <slot name="toolbar" />
          <template v-if="props.mergeActions">
            <slot name="actions" />
            <Button
              v-if="!props.hideCreate"
              variant="default"
              size="md"
              @click="emit('create')"
            >
              {{ defaultCreateLabel }}
            </Button>
          </template>
        </div>

        <div
          v-if="hasActions && !props.mergeActions"
          class="flex shrink-0 items-center gap-1.5 pl-2 ml-2"
        >
          <slot name="actions" />
          <Button
            v-if="!props.hideCreate"
            variant="default"
            size="md"
            @click="emit('create')"
          >
            {{ defaultCreateLabel }}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  </div>
</template>
