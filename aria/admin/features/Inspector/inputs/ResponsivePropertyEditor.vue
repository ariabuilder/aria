<script setup lang="ts" generic="T extends string | number">
/**
 * Edit a responsive StyleMap property across breakpoints.
 *
 * @example
 * ```vue
 * <ResponsivePropertyEditor
 *   label="Padding"
 *   :value="node.styles.padding"
 *   unit="px"
 *   @update="(val) => updateStyle('padding', val)"
 * />
 * ```
 */
import { ref, computed, watch } from "vue";
import type {
  Responsive,
  BreakpointDefinition,
} from "../../../../lib/types/nodes";
import {
  getResponsiveValue,
  setResponsiveValue,
  getActiveBreakpoints,
  getComputedValue,
  getComputedValueSource,
} from "@/features/Core";
import { getBreakpointIconClass as resolveBreakpointIconClass } from "@/composables/breakpointIcons";
import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import { useResponsiveTarget } from "@/composables/useResponsiveTarget";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Props {
  label: string;
  value?: Responsive<T> | T;
  /** CSS unit (px, rem, %, etc.) */
  unit?: string;
  type?: "text" | "number";
  breakpoints?: BreakpointDefinition[];
  /** Show breakpoint controls */
  showBreakpoints?: boolean;
  placeholder?: string;
  helpText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  unit: "px",
  type: "text",
  showBreakpoints: true,
  placeholder: "Auto",
});

const emit = defineEmits<{
  update: [value: Responsive<T>];
}>();

// Sync with global viewport/breakpoint state (gets activeBreakpoints from settings)
const {
  targetBreakpoint: currentBreakpoint,
  setTargetBreakpoint: setBreakpoint,
} = useResponsiveTarget();
const { activeBreakpoints: settingsBreakpoints } = useCanonicalBreakpoints({
  autoLoad: true,
});

// Use breakpoints from settings if not explicitly provided
const breakpoints = computed(
  () => props.breakpoints || settingsBreakpoints.value,
);

// Active breakpoints (that have values set)
const activeBreakpoints = computed(() => getActiveBreakpoints(props.value));

// Current value for selected breakpoint
const currentValue = ref<T | undefined>(
  getResponsiveValue(props.value, currentBreakpoint.value),
);

// Computed value (with cascade) for selected breakpoint
const computedValue = computed(() =>
  getComputedValue(props.value, currentBreakpoint.value, breakpoints.value),
);

const computedValueSource = computed(() =>
  getComputedValueSource(
    props.value,
    currentBreakpoint.value,
    breakpoints.value,
  ),
);

// Is this breakpoint explicitly set or inherited?
const isInherited = computed(() => {
  if (!props.value || typeof props.value !== "object") return false;
  const responsiveObj = props.value as Responsive<T>;
  return responsiveObj[currentBreakpoint.value] === undefined;
});

// Watch for external value changes
watch(
  () => props.value,
  (newValue) => {
    currentValue.value = getResponsiveValue(newValue, currentBreakpoint.value);
  },
  { deep: true },
);

// Watch for breakpoint changes
watch(currentBreakpoint, (newBreakpoint) => {
  currentValue.value = getResponsiveValue(props.value, newBreakpoint);
});

/**
 * Update value for current breakpoint
 */
const handleValueChange = (newValue: T | undefined) => {
  currentValue.value = newValue;

  const updated = setResponsiveValue(
    props.value,
    currentBreakpoint.value,
    newValue,
  );

  emit("update", updated);
};

/**
 * Clear value for current breakpoint (will inherit from cascade)
 */
const clearBreakpoint = () => {
  handleValueChange(undefined);
};

/**
 * Get icon for breakpoint
 */
const getBreakpointIconClass = (bp: BreakpointDefinition) => {
  return resolveBreakpointIconClass({
    width: Number.parseInt(bp.minWidth, 10),
  });
};

const getBreakpointByName = (breakpointName: string): BreakpointDefinition => {
  return (
    breakpoints.value.find(
      (breakpoint) => breakpoint.name === breakpointName,
    ) ?? {
      name: breakpointName,
      minWidth: "0px",
      label: breakpointName,
    }
  );
};

const currentBreakpointMeta = computed(() =>
  getBreakpointByName(currentBreakpoint.value),
);

const inheritedFromMeta = computed(() => {
  const sourceBreakpoint = computedValueSource.value?.breakpoint;

  if (!isInherited.value || !sourceBreakpoint) {
    return null;
  }

  return getBreakpointByName(sourceBreakpoint);
});

const displayValue = computed(() => {
  if (currentValue.value === undefined || currentValue.value === null) {
    return isInherited.value && computedValue.value
      ? `${computedValue.value}${props.unit} (inherited)`
      : props.placeholder;
  }
  return props.unit ? `${currentValue.value}${props.unit}` : currentValue.value;
});
</script>

<template>
  <div class="space-y-2">
    <!-- Label and breakpoint selector -->
    <div class="flex items-center justify-between">
      <Label class="text-sm font-medium">{{ label }}</Label>

      <Select
        v-if="showBreakpoints"
        :model-value="currentBreakpoint"
        @update:model-value="setBreakpoint"
        class="w-28"
      >
        <SelectTrigger class="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="bp in breakpoints" :key="bp.name" :value="bp.name">
            <div class="flex items-center gap-2">
              <span
                aria-hidden="true"
                :class="[getBreakpointIconClass(bp), 'size-3 shrink-0']"
              />
              <span>{{ bp.label || bp.name }}</span>
              <span
                v-if="activeBreakpoints.includes(bp.name)"
                class="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
              />
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Input field -->
    <div class="flex items-center gap-2">
      <Input
        :model-value="currentValue"
        :type="type"
        :placeholder="placeholder"
        class="flex-1"
        @update:model-value="handleValueChange"
      />

      <!-- Unit label -->
      <span v-if="unit" class="text-xs text-muted-foreground w-8 text-right">
        {{ unit }}
      </span>

      <!-- Clear button (only if value is set for this breakpoint) -->
      <Button
        v-if="!isInherited && currentValue !== undefined"
        variant="ghost"
        size="icon"
        class="h-8 w-8 shrink-0"
        @click="clearBreakpoint"
      >
        <span
          aria-hidden="true"
          :class="[studioIcons.rotateClockwise, 'size-3.5 shrink-0']"
        />
      </Button>
    </div>

    <!-- Inheritance source indicator -->
    <div
      v-if="isInherited && computedValue !== undefined && inheritedFromMeta"
      :title="`Inherits from ${inheritedFromMeta.label || inheritedFromMeta.name}`"
      class="flex items-center gap-1 text-xs text-muted-foreground"
    >
      <span
        :class="[
          getBreakpointIconClass(inheritedFromMeta),
          'size-2.5 shrink-0 text-primary/80',
        ]"
      />
      <span class="h-1.5 w-1.5 rounded-full bg-primary/45" />
      <span
        :class="[
          getBreakpointIconClass(currentBreakpointMeta),
          'size-2.5 shrink-0 text-muted-foreground/55',
        ]"
      />
    </div>

    <!-- Help text -->
    <p v-if="helpText" class="text-xs text-muted-foreground">
      {{ helpText }}
    </p>
  </div>
</template>
