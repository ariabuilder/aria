<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, defineComponent, h, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import { ColorField } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { usePropertySave } from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import { useStudioI18n } from "@/i18n";
import {
  filterStateToCSS,
  cssToFilterState,
  defaultFilterState,
  FILTER_DEFAULTS,
  type FilterState,
  type FilterValue,
} from "../schemas/filter.schema";

// PROPS & EMITS

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const FILTER_SECTION_STYLE_KEYS = ["filter", "backdropFilter"] as const;

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const filterOverrides = useInspectorPropertyOverrides({
  propertyKeys: FILTER_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();

const fs = ref<FilterState>(defaultFilterState());
const bfs = ref<FilterState>(defaultFilterState());

const validationError = ref<string | null>(null);
const internalOpen = ref(props.defaultOpen);

type ScrubSection = "filter" | "backdrop";
type ScrubField =
  | "blur"
  | "brightness"
  | "contrast"
  | "grayscale"
  | "hueRotate"
  | "invert"
  | "saturate"
  | "sepia"
  | "dropShadowX"
  | "dropShadowY"
  | "dropShadowBlur";

interface FilterSliderConfig {
  min: number;
  max: number;
  step: number;
}

const FILTER_CONTROL_CLASS =
  "grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2";
const FILTER_SLIDER_CLASS = "min-w-0";
const FILTER_INPUT_CLASS =
  "h-8 bg-background/75 border-dashed border-border/70 text-xs cursor-ew-resize focus:cursor-text hover:border-border focus-visible:border-primary/50 dark:bg-sidebar/55";
const FILTER_COMPACT_INPUT_CLASS =
  "h-8 bg-background/75 border-dashed border-border/70 text-xs cursor-ew-resize focus:cursor-text hover:border-border focus-visible:border-primary/50 dark:bg-sidebar/55";

const FilterNumericControl = defineComponent({
  name: "FilterNumericControl",
  inheritAttrs: false,
  props: {
    modelValue: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    inputClass: { type: String, default: FILTER_INPUT_CLASS },
    placeholder: { type: String, default: "" },
    sliderValue: { type: Array as () => number[], required: true },
    sliderDisabled: { type: Boolean, default: false },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, required: true },
  },
  emits: [
    "update:modelValue",
    "commit",
    "scrubStart",
    "sliderUpdate",
    "sliderCommit",
  ],
  setup(componentProps, { attrs, emit }) {
    return () =>
      h("div", { class: FILTER_CONTROL_CLASS }, [
        h(Slider, {
          modelValue: componentProps.sliderValue,
          min: componentProps.min,
          max: componentProps.max,
          step: componentProps.step,
          disabled: componentProps.disabled || componentProps.sliderDisabled,
          class: FILTER_SLIDER_CLASS,
          "aria-hidden": componentProps.sliderDisabled ? "true" : undefined,
          "onUpdate:modelValue": (value: number[] | undefined) =>
            emit("sliderUpdate", value),
          onValueCommit: (value: number[]) => emit("sliderCommit", value),
        }),
        h(VariableAssignableInput, {
          ...attrs,
          modelValue: componentProps.modelValue,
          disabled: componentProps.disabled,
          inputClass: componentProps.inputClass,
          placeholder: componentProps.placeholder,
          class: "w-full",
          "onUpdate:modelValue": (value: string) =>
            emit("update:modelValue", value),
          onCommit: (value: string) => emit("commit", value),
          onMousedown: (event: MouseEvent) => emit("scrubStart", event),
        }),
      ]);
  },
});

type FilterKey =
  | "blur"
  | "brightness"
  | "contrast"
  | "grayscale"
  | "hueRotate"
  | "invert"
  | "saturate"
  | "sepia"
  | "dropShadow";

function filterEffectLabel(key: FilterKey): string {
  const labels = {
    blur: "inspector.filter.blur",
    brightness: "inspector.filter.brightness",
    contrast: "inspector.filter.contrast",
    grayscale: "inspector.filter.grayscale",
    hueRotate: "inspector.filter.hueRotate",
    invert: "inspector.filter.invert",
    saturate: "inspector.filter.saturate",
    sepia: "inspector.filter.sepia",
    dropShadow: "inspector.filter.dropShadow",
  } as const;
  return t(labels[key]);
}

function filterToggleLabel(section: ScrubSection, key: FilterKey): string {
  const effect = section === "backdrop"
    ? t("inspector.filter.backdropEffect", { effect: filterEffectLabel(key) })
    : filterEffectLabel(key);
  return t("inspector.filter.toggle", { effect });
}

function isEnabled(state: FilterState, key: FilterKey): boolean {
  switch (key) {
    case "blur":
      return Number(state.blur) !== FILTER_DEFAULTS.blur;
    case "brightness":
      return Number(state.brightness) !== FILTER_DEFAULTS.brightness;
    case "contrast":
      return Number(state.contrast) !== FILTER_DEFAULTS.contrast;
    case "grayscale":
      return Number(state.grayscale) !== FILTER_DEFAULTS.grayscale;
    case "hueRotate":
      return Number(state.hueRotate) !== FILTER_DEFAULTS.hueRotate;
    case "invert":
      return Number(state.invert) !== FILTER_DEFAULTS.invert;
    case "saturate":
      return Number(state.saturate) !== FILTER_DEFAULTS.saturate;
    case "sepia":
      return Number(state.sepia) !== FILTER_DEFAULTS.sepia;
    case "dropShadow":
      return (
        Number(state.dropShadowX) !== 0 ||
        Number(state.dropShadowY) !== 0 ||
        Number(state.dropShadowBlur) !== 0 ||
        (state.dropShadowColor !== "" &&
          state.dropShadowColor !== "transparent")
      );
  }
}

function defaultValueFor(key: FilterKey): Partial<FilterState> {
  switch (key) {
    case "blur":
      return { blur: "0" };
    case "brightness":
      return { brightness: "100" };
    case "contrast":
      return { contrast: "100" };
    case "grayscale":
      return { grayscale: "0" };
    case "hueRotate":
      return { hueRotate: "0" };
    case "invert":
      return { invert: "0" };
    case "saturate":
      return { saturate: "100" };
    case "sepia":
      return { sepia: "0" };
    case "dropShadow":
      return {
        dropShadowX: "0",
        dropShadowY: "0",
        dropShadowBlur: "0",
        dropShadowColor: "transparent",
      };
  }
}

function enabledInitialFor(key: FilterKey): Partial<FilterState> {
  switch (key) {
    case "blur":
      return { blur: "4" };
    case "brightness":
      return { brightness: "80" };
    case "contrast":
      return { contrast: "120" };
    case "grayscale":
      return { grayscale: "100" };
    case "hueRotate":
      return { hueRotate: "180" };
    case "invert":
      return { invert: "100" };
    case "saturate":
      return { saturate: "150" };
    case "sepia":
      return { sepia: "100" };
    case "dropShadow":
      return {
        dropShadowX: "2",
        dropShadowY: "4",
        dropShadowBlur: "8",
        dropShadowColor: "rgba(0,0,0,0.25)",
      };
  }
}

async function toggleFilter(
  section: ScrubSection,
  key: FilterKey,
): Promise<void> {
  const stateRef = section === "filter" ? fs : bfs;
  if (isEnabled(stateRef.value, key)) {
    stateRef.value = { ...stateRef.value, ...defaultValueFor(key) };
  } else {
    stateRef.value = { ...stateRef.value, ...enabledInitialFor(key) };
  }
  if (section === "filter") await saveFilter();
  else await saveBackdrop();
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (v: boolean) => {
    internalOpen.value = v;
    emit("update:open", v);
  },
});

const defaultFilter = computed<FilterValue>(() => {
  const fallback: FilterValue = {
    filter: { base: "none" },
    backdropFilter: { base: "none" },
  };
  return (getDefault("filter") as FilterValue) ?? fallback;
});

const filterPreviewQueue = useStylePreviewQueue<
  Record<"filter", string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncFilterStates,
});

const backdropPreviewQueue = useStylePreviewQueue<
  Record<"backdropFilter", string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncFilterStates,
});

const filterScrubSession = usePointerScrubSession();

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) return true;
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function getFilterValue(): string {
  return (
    styleTarget.getStyleValue("filter", "none", breakpointName.value) ?? "none"
  );
}

function getBackdropFilterValue(): string {
  return (
    styleTarget.getStyleValue("backdropFilter", "none", breakpointName.value) ??
    "none"
  );
}

function getCurrentBreakpointFilterValue(): string | undefined {
  return styleTarget.getResponsiveStyleMap("filter")[breakpointName.value];
}

function getCurrentBreakpointBackdropValue(): string | undefined {
  return styleTarget.getResponsiveStyleMap("backdropFilter")[
    breakpointName.value
  ];
}

function validateFilter(filter: string, backdropFilter: string): boolean {
  const candidate: FilterValue = {
    ...defaultFilter.value,
    filter: { ...defaultFilter.value.filter, [breakpointName.value]: filter },
    backdropFilter: {
      ...defaultFilter.value.backdropFilter,
      [breakpointName.value]: backdropFilter,
    },
  };
  const result = safeParse("filter", candidate);
  const valid = "success" in result && result.success;
  if (!valid) {
    validationError.value = t("inspector.validation.invalidFilter");
    return false;
  }
  validationError.value = null;
  return true;
}

function syncFilterStates(): void {
  fs.value = cssToFilterState(getFilterValue());
  bfs.value = cssToFilterState(getBackdropFilterValue());
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncFilterStates();
  },
  { deep: true, immediate: true },
);

// COMMIT HANDLERS (write committed value into state before saving)

function commitFilter(field: keyof FilterState, value: string): void {
  fs.value = { ...fs.value, [field]: value };
  void saveFilter();
}

function commitBackdrop(field: keyof FilterState, value: string): void {
  bfs.value = { ...bfs.value, [field]: value };
  void saveBackdrop();
}

async function saveFilter(): Promise<void> {
  if (!hasSaveContext()) return;
  const filter = filterStateToCSS(fs.value);
  const backdropFilter = filterStateToCSS(bfs.value);
  if (!validateFilter(filter, backdropFilter)) return;
  await styleTarget.saveStyleProperty(
    "filter",
    filter,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveBackdrop(): Promise<void> {
  if (!hasSaveContext()) return;
  const filter = filterStateToCSS(fs.value);
  const backdropFilter = filterStateToCSS(bfs.value);
  if (!validateFilter(filter, backdropFilter)) return;
  await styleTarget.saveStyleProperty(
    "backdropFilter",
    backdropFilter,
    props.currentItemType,
    props.currentItemSlug,
  );
}

function previewFilterDropShadowColor(value: string): void {
  if (!hasSaveContext()) {
    return;
  }

  fs.value = { ...fs.value, dropShadowColor: value };
  queuePreview("filter", filterStateToCSS(fs.value));
}

async function persistFilterDropShadowColor(value: string): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  fs.value = { ...fs.value, dropShadowColor: value };
  flushPendingPreview("filter");
  await saveFilter();
}

function previewBackdropDropShadowColor(value: string): void {
  if (!hasSaveContext()) {
    return;
  }

  bfs.value = { ...bfs.value, dropShadowColor: value };
  queuePreview("backdrop", filterStateToCSS(bfs.value));
}

async function persistBackdropDropShadowColor(value: string): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  bfs.value = { ...bfs.value, dropShadowColor: value };
  flushPendingPreview("backdrop");
  await saveBackdrop();
}

const resetCurrentBreakpointFilter = async (): Promise<void> => {
  if (!hasSaveContext()) return;
  await filterOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
};

function cancelPendingPreview(section: ScrubSection): void {
  if (section === "filter") filterPreviewQueue.cancel();
  else backdropPreviewQueue.cancel();
}

function flushPendingPreview(section: ScrubSection): void {
  if (section === "filter") filterPreviewQueue.flush();
  else backdropPreviewQueue.flush();
}

function queuePreview(section: ScrubSection, value: string): void {
  if (section === "filter") {
    filterPreviewQueue.queue({ filter: value });
  } else {
    backdropPreviewQueue.queue({ backdropFilter: value });
  }
}

function getSliderConfig(
  section: ScrubSection,
  field: ScrubField,
): FilterSliderConfig {
  switch (field) {
    case "blur":
      return section === "backdrop"
        ? { min: 0, max: 40, step: 1 }
        : { min: 0, max: 64, step: 1 };
    case "brightness":
    case "contrast":
      return { min: 0, max: 200, step: 1 };
    case "grayscale":
    case "invert":
    case "sepia":
      return { min: 0, max: 100, step: 1 };
    case "hueRotate":
      return { min: 0, max: 360, step: 1 };
    case "saturate":
      return { min: 0, max: 300, step: 1 };
    case "dropShadowX":
    case "dropShadowY":
      return { min: -100, max: 100, step: 1 };
    case "dropShadowBlur":
      return { min: 0, max: 100, step: 1 };
  }
}

function resolveScrubOrigin(value: string): number {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(?:px|deg|%)?$/);
  if (!match) return 0;
  const n = Number.parseFloat(match[1] ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function parseNumericFilterValue(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(?:px|deg|%)?$/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1] ?? "0");
  return Number.isFinite(parsed) ? parsed : null;
}

function clampFilterNumber(value: number, config: FilterSliderConfig): number {
  return Math.min(config.max, Math.max(config.min, value));
}

function formatFilterNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function getStateValue(section: ScrubSection, field: ScrubField): string {
  return (section === "filter" ? fs.value : bfs.value)[field];
}

function setStateValue(
  section: ScrubSection,
  field: ScrubField,
  value: string,
): void {
  if (section === "filter") {
    fs.value = { ...fs.value, [field]: value };
    return;
  }

  bfs.value = { ...bfs.value, [field]: value };
}

function sliderModelValue(section: ScrubSection, field: ScrubField): number[] {
  const config = getSliderConfig(section, field);
  const numericValue = parseNumericFilterValue(getStateValue(section, field));
  return [clampFilterNumber(numericValue ?? config.min, config)];
}

function isSliderDisabled(section: ScrubSection, field: ScrubField): boolean {
  return parseNumericFilterValue(getStateValue(section, field)) === null;
}

function handleSliderUpdate(
  section: ScrubSection,
  field: ScrubField,
  value: number[] | undefined,
): void {
  const nextValue = value?.[0];
  if (nextValue === undefined || !Number.isFinite(nextValue)) return;

  const config = getSliderConfig(section, field);
  setStateValue(
    section,
    field,
    formatFilterNumber(clampFilterNumber(nextValue, config)),
  );
  queuePreview(
    section,
    filterStateToCSS(section === "filter" ? fs.value : bfs.value),
  );
}

function handleSliderCommit(
  section: ScrubSection,
  field: ScrubField,
  value: number[],
): void {
  handleSliderUpdate(section, field, value);
  flushPendingPreview(section);
  if (section === "filter") void saveFilter();
  else void saveBackdrop();
}

function handleMouseDown(
  section: ScrubSection,
  field: ScrubField,
  e: MouseEvent,
): void {
  if (!hasSaveContext()) return;

  const stateRef = section === "filter" ? fs : bfs;
  const parsedStartValue = parseNumericFilterValue(stateRef.value[field]);
  if (parsedStartValue === null) return;

  const config = getSliderConfig(section, field);
  const startValue = resolveScrubOrigin(stateRef.value[field]);
  const originRawValue =
    section === "filter"
      ? getCurrentBreakpointFilterValue()
      : getCurrentBreakpointBackdropValue();
  const originDisplayValue =
    section === "filter" ? getFilterValue() : getBackdropFilterValue();
  filterScrubSession.start({
    event: e,
    onMove: ({ deltaX }) => {
      const nextVal = clampFilterNumber(Math.round(startValue + deltaX), config);
      stateRef.value = { ...stateRef.value, [field]: String(nextVal) };
      queuePreview(section, filterStateToCSS(stateRef.value));
    },
    onCancel: () => {
      if (section === "filter") {
        filterPreviewQueue.restore({ filter: originRawValue });
      } else {
        backdropPreviewQueue.restore({ backdropFilter: originRawValue });
      }
      stateRef.value = cssToFilterState(originDisplayValue);
    },
    onCommit: () => {
      flushPendingPreview(section);
      if (section === "filter") void saveFilter();
      else void saveBackdrop();
    },
  });
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="props.defaultOpen"
    :has-changes="filterOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Filter"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="filterOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="filterOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen && filterOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="filter-reset-breakpoint"
        @reset="void resetCurrentBreakpointFilter()"
      />
    </template>

    <div class="space-y-4 pb-4">
      <!-- FILTER                                                            -->

      <div class="pb-0.5">
        <label
          class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.filter.label") }}</label
        >
      </div>

      <!-- Each row: grid-cols-[72px_1fr] — left = icon+label toggle, right = input -->

      <!-- Blur -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'blur')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'blur')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'blur')"
        >
          <span
            :class="[
              studioIcons.blur,
              'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'blur')
                ? 'text-primary'
                : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("blur") }}
        </button>
        <FilterNumericControl
          v-model="fs.blur"
          :slider-value="sliderModelValue('filter', 'blur')"
          :slider-disabled="isSliderDisabled('filter', 'blur')"
          :min="getSliderConfig('filter', 'blur').min"
          :max="getSliderConfig('filter', 'blur').max"
          :step="getSliderConfig('filter', 'blur').step"
          @commit="(v) => commitFilter('blur', v)"
          @scrub-start="(e: MouseEvent) => handleMouseDown('filter', 'blur', e)"
          @slider-update="(v) => handleSliderUpdate('filter', 'blur', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'blur', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Brightness -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'brightness')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'brightness')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'brightness')"
        >
          <span
            :class="[
              studioIcons.sunLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'brightness') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("brightness") }}
        </button>
        <FilterNumericControl
          v-model="fs.brightness"
          :slider-value="sliderModelValue('filter', 'brightness')"
          :slider-disabled="isSliderDisabled('filter', 'brightness')"
          :min="getSliderConfig('filter', 'brightness').min"
          :max="getSliderConfig('filter', 'brightness').max"
          :step="getSliderConfig('filter', 'brightness').step"
          @commit="(v) => commitFilter('brightness', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('filter', 'brightness', e)
          "
          @slider-update="(v) => handleSliderUpdate('filter', 'brightness', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'brightness', v)"
          placeholder="100"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Contrast -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'contrast')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'contrast')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'contrast')"
        >
          <span
            :class="[
              studioIcons.circleHalf, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'contrast') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("contrast") }}
        </button>
        <FilterNumericControl
          v-model="fs.contrast"
          :slider-value="sliderModelValue('filter', 'contrast')"
          :slider-disabled="isSliderDisabled('filter', 'contrast')"
          :min="getSliderConfig('filter', 'contrast').min"
          :max="getSliderConfig('filter', 'contrast').max"
          :step="getSliderConfig('filter', 'contrast').step"
          @commit="(v) => commitFilter('contrast', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('filter', 'contrast', e)
          "
          @slider-update="(v) => handleSliderUpdate('filter', 'contrast', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'contrast', v)"
          placeholder="100"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Grayscale -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'grayscale')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'grayscale')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'grayscale')"
        >
          <span
            :class="[
              studioIcons.waterdrop, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'grayscale') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("grayscale") }}
        </button>
        <FilterNumericControl
          v-model="fs.grayscale"
          :slider-value="sliderModelValue('filter', 'grayscale')"
          :slider-disabled="isSliderDisabled('filter', 'grayscale')"
          :min="getSliderConfig('filter', 'grayscale').min"
          :max="getSliderConfig('filter', 'grayscale').max"
          :step="getSliderConfig('filter', 'grayscale').step"
          @commit="(v) => commitFilter('grayscale', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('filter', 'grayscale', e)
          "
          @slider-update="(v) => handleSliderUpdate('filter', 'grayscale', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'grayscale', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Hue Rotate -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'hueRotate')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'hueRotate')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'hueRotate')"
        >
          <span
            :class="[
              studioIcons.paletteLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'hueRotate') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("hueRotate") }}
        </button>
        <FilterNumericControl
          v-model="fs.hueRotate"
          :slider-value="sliderModelValue('filter', 'hueRotate')"
          :slider-disabled="isSliderDisabled('filter', 'hueRotate')"
          :min="getSliderConfig('filter', 'hueRotate').min"
          :max="getSliderConfig('filter', 'hueRotate').max"
          :step="getSliderConfig('filter', 'hueRotate').step"
          @commit="(v) => commitFilter('hueRotate', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('filter', 'hueRotate', e)
          "
          @slider-update="(v) => handleSliderUpdate('filter', 'hueRotate', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'hueRotate', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Invert -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'invert')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'invert')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'invert')"
        >
          <span
            :class="[
              studioIcons.layersLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'invert') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("invert") }}
        </button>
        <FilterNumericControl
          v-model="fs.invert"
          :slider-value="sliderModelValue('filter', 'invert')"
          :slider-disabled="isSliderDisabled('filter', 'invert')"
          :min="getSliderConfig('filter', 'invert').min"
          :max="getSliderConfig('filter', 'invert').max"
          :step="getSliderConfig('filter', 'invert').step"
          @commit="(v) => commitFilter('invert', v)"
          @scrub-start="(e: MouseEvent) => handleMouseDown('filter', 'invert', e)"
          @slider-update="(v) => handleSliderUpdate('filter', 'invert', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'invert', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Saturate -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'saturate')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'saturate')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'saturate')"
        >
          <span
            :class="[
              studioIcons.dropLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'saturate') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("saturate") }}
        </button>
        <FilterNumericControl
          v-model="fs.saturate"
          :slider-value="sliderModelValue('filter', 'saturate')"
          :slider-disabled="isSliderDisabled('filter', 'saturate')"
          :min="getSliderConfig('filter', 'saturate').min"
          :max="getSliderConfig('filter', 'saturate').max"
          :step="getSliderConfig('filter', 'saturate').step"
          @commit="(v) => commitFilter('saturate', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('filter', 'saturate', e)
          "
          @slider-update="(v) => handleSliderUpdate('filter', 'saturate', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'saturate', v)"
          placeholder="100"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Sepia -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'sepia')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'sepia')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'sepia')"
        >
          <span
            :class="[
              studioIcons.sunFog, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'sepia') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("sepia") }}
        </button>
        <FilterNumericControl
          v-model="fs.sepia"
          :slider-value="sliderModelValue('filter', 'sepia')"
          :slider-disabled="isSliderDisabled('filter', 'sepia')"
          :min="getSliderConfig('filter', 'sepia').min"
          :max="getSliderConfig('filter', 'sepia').max"
          :step="getSliderConfig('filter', 'sepia').step"
          @commit="(v) => commitFilter('sepia', v)"
          @scrub-start="(e: MouseEvent) => handleMouseDown('filter', 'sepia', e)"
          @slider-update="(v) => handleSliderUpdate('filter', 'sepia', v)"
          @slider-commit="(v) => handleSliderCommit('filter', 'sepia', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Drop Shadow — toggle row, then sub-rows for X/Y/Blur and color when active -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('filter', 'dropShadow')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(fs, 'dropShadow')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('filter', 'dropShadow')"
        >
          <span
            :class="[
              studioIcons.shadow, 'size-3.5 shrink-0 transition-colors',
              isEnabled(fs, 'dropShadow') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("dropShadow") }}
        </button>
        <div />
      </div>
      <template v-if="isEnabled(fs, 'dropShadow')">
        <div class="space-y-1.5">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.filter.offset") }}</label
          >
          <div class="space-y-1.5 rounded-md border border-border/70 bg-muted/25 p-2 dark:bg-sidebar/35">
            <div class="grid grid-cols-[2.25rem_1fr] items-center gap-2">
              <span class="text-[10px] font-semibold text-muted-foreground"
                >X</span
              >
              <FilterNumericControl
                v-model="fs.dropShadowX"
                :slider-value="sliderModelValue('filter', 'dropShadowX')"
                :slider-disabled="isSliderDisabled('filter', 'dropShadowX')"
                :min="getSliderConfig('filter', 'dropShadowX').min"
                :max="getSliderConfig('filter', 'dropShadowX').max"
                :step="getSliderConfig('filter', 'dropShadowX').step"
                @commit="(v) => commitFilter('dropShadowX', v)"
                @scrub-start="
                  (e: MouseEvent) => handleMouseDown('filter', 'dropShadowX', e)
                "
                @slider-update="
                  (v) => handleSliderUpdate('filter', 'dropShadowX', v)
                "
                @slider-commit="
                  (v) => handleSliderCommit('filter', 'dropShadowX', v)
                "
                placeholder="0"
                :input-class="FILTER_COMPACT_INPUT_CLASS"
                :disabled="isPanelDisabled"
              />
            </div>
            <div class="grid grid-cols-[2.25rem_1fr] items-center gap-2">
              <span class="text-[10px] font-semibold text-muted-foreground"
                >Y</span
              >
              <FilterNumericControl
                v-model="fs.dropShadowY"
                :slider-value="sliderModelValue('filter', 'dropShadowY')"
                :slider-disabled="isSliderDisabled('filter', 'dropShadowY')"
                :min="getSliderConfig('filter', 'dropShadowY').min"
                :max="getSliderConfig('filter', 'dropShadowY').max"
                :step="getSliderConfig('filter', 'dropShadowY').step"
                @commit="(v) => commitFilter('dropShadowY', v)"
                @scrub-start="
                  (e: MouseEvent) => handleMouseDown('filter', 'dropShadowY', e)
                "
                @slider-update="
                  (v) => handleSliderUpdate('filter', 'dropShadowY', v)
                "
                @slider-commit="
                  (v) => handleSliderCommit('filter', 'dropShadowY', v)
                "
                placeholder="0"
                :input-class="FILTER_COMPACT_INPUT_CLASS"
                :disabled="isPanelDisabled"
              />
            </div>
            <div class="grid grid-cols-[2.25rem_1fr] items-center gap-2">
              <span class="text-[10px] font-semibold text-muted-foreground"
                >{{ t("inspector.filter.blur") }}</span
              >
              <FilterNumericControl
                v-model="fs.dropShadowBlur"
                :slider-value="sliderModelValue('filter', 'dropShadowBlur')"
                :slider-disabled="isSliderDisabled('filter', 'dropShadowBlur')"
                :min="getSliderConfig('filter', 'dropShadowBlur').min"
                :max="getSliderConfig('filter', 'dropShadowBlur').max"
                :step="getSliderConfig('filter', 'dropShadowBlur').step"
                @commit="(v) => commitFilter('dropShadowBlur', v)"
                @scrub-start="
                  (e: MouseEvent) =>
                    handleMouseDown('filter', 'dropShadowBlur', e)
                "
                @slider-update="
                  (v) => handleSliderUpdate('filter', 'dropShadowBlur', v)
                "
                @slider-commit="
                  (v) => handleSliderCommit('filter', 'dropShadowBlur', v)
                "
                placeholder="0"
                :input-class="FILTER_COMPACT_INPUT_CLASS"
                :disabled="isPanelDisabled"
              />
            </div>
          </div>
        </div>
        <!-- Color -->
        <div class="space-y-1.5">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.filter.color") }}</label
          >
          <ColorField
            v-model="fs.dropShadowColor"
            layout="unified"
            show-variables
            show-alpha
            show-design-colors
            content-side="left"
            content-align="center"
            class="min-w-0 w-full"
            contrast-against="#ffffff"
            :disabled="isPanelDisabled"
            @preview="previewFilterDropShadowColor"
            @update:model-value="fs.dropShadowColor = $event"
            @commit="persistFilterDropShadowColor"
          />
        </div>
      </template>

      <div class="h-px bg-border/70 w-full my-1" />

      <!-- BACKDROP FILTER                                                   -->

      <div class="pb-0.5">
        <label
          class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.filter.backdrop") }}</label
        >
      </div>

      <!-- Blur -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'blur')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'blur')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'blur')"
        >
          <span
            :class="[
              studioIcons.blur, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'blur') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("blur") }}
        </button>
        <FilterNumericControl
          v-model="bfs.blur"
          :slider-value="sliderModelValue('backdrop', 'blur')"
          :slider-disabled="isSliderDisabled('backdrop', 'blur')"
          :min="getSliderConfig('backdrop', 'blur').min"
          :max="getSliderConfig('backdrop', 'blur').max"
          :step="getSliderConfig('backdrop', 'blur').step"
          @commit="(v) => commitBackdrop('blur', v)"
          @scrub-start="(e: MouseEvent) => handleMouseDown('backdrop', 'blur', e)"
          @slider-update="(v) => handleSliderUpdate('backdrop', 'blur', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'blur', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Brightness -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'brightness')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'brightness')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'brightness')"
        >
          <span
            :class="[
              studioIcons.sunLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'brightness') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("brightness") }}
        </button>
        <FilterNumericControl
          v-model="bfs.brightness"
          :slider-value="sliderModelValue('backdrop', 'brightness')"
          :slider-disabled="isSliderDisabled('backdrop', 'brightness')"
          :min="getSliderConfig('backdrop', 'brightness').min"
          :max="getSliderConfig('backdrop', 'brightness').max"
          :step="getSliderConfig('backdrop', 'brightness').step"
          @commit="(v) => commitBackdrop('brightness', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'brightness', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'brightness', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'brightness', v)"
          placeholder="100"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Contrast -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'contrast')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'contrast')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'contrast')"
        >
          <span
            :class="[
              studioIcons.circleHalf, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'contrast') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("contrast") }}
        </button>
        <FilterNumericControl
          v-model="bfs.contrast"
          :slider-value="sliderModelValue('backdrop', 'contrast')"
          :slider-disabled="isSliderDisabled('backdrop', 'contrast')"
          :min="getSliderConfig('backdrop', 'contrast').min"
          :max="getSliderConfig('backdrop', 'contrast').max"
          :step="getSliderConfig('backdrop', 'contrast').step"
          @commit="(v) => commitBackdrop('contrast', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'contrast', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'contrast', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'contrast', v)"
          placeholder="100"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Grayscale -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'grayscale')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'grayscale')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'grayscale')"
        >
          <span
            :class="[
              studioIcons.waterdrop, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'grayscale') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("grayscale") }}
        </button>
        <FilterNumericControl
          v-model="bfs.grayscale"
          :slider-value="sliderModelValue('backdrop', 'grayscale')"
          :slider-disabled="isSliderDisabled('backdrop', 'grayscale')"
          :min="getSliderConfig('backdrop', 'grayscale').min"
          :max="getSliderConfig('backdrop', 'grayscale').max"
          :step="getSliderConfig('backdrop', 'grayscale').step"
          @commit="(v) => commitBackdrop('grayscale', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'grayscale', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'grayscale', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'grayscale', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Hue Rotate -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'hueRotate')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'hueRotate')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'hueRotate')"
        >
          <span
            :class="[
              studioIcons.paletteLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'hueRotate') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("hueRotate") }}
        </button>
        <FilterNumericControl
          v-model="bfs.hueRotate"
          :slider-value="sliderModelValue('backdrop', 'hueRotate')"
          :slider-disabled="isSliderDisabled('backdrop', 'hueRotate')"
          :min="getSliderConfig('backdrop', 'hueRotate').min"
          :max="getSliderConfig('backdrop', 'hueRotate').max"
          :step="getSliderConfig('backdrop', 'hueRotate').step"
          @commit="(v) => commitBackdrop('hueRotate', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'hueRotate', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'hueRotate', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'hueRotate', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Invert -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'invert')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'invert')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'invert')"
        >
          <span
            :class="[
              studioIcons.layersLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'invert') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("invert") }}
        </button>
        <FilterNumericControl
          v-model="bfs.invert"
          :slider-value="sliderModelValue('backdrop', 'invert')"
          :slider-disabled="isSliderDisabled('backdrop', 'invert')"
          :min="getSliderConfig('backdrop', 'invert').min"
          :max="getSliderConfig('backdrop', 'invert').max"
          :step="getSliderConfig('backdrop', 'invert').step"
          @commit="(v) => commitBackdrop('invert', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'invert', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'invert', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'invert', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Saturate -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'saturate')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'saturate')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'saturate')"
        >
          <span
            :class="[
              studioIcons.dropLinear, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'saturate') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("saturate") }}
        </button>
        <FilterNumericControl
          v-model="bfs.saturate"
          :slider-value="sliderModelValue('backdrop', 'saturate')"
          :slider-disabled="isSliderDisabled('backdrop', 'saturate')"
          :min="getSliderConfig('backdrop', 'saturate').min"
          :max="getSliderConfig('backdrop', 'saturate').max"
          :step="getSliderConfig('backdrop', 'saturate').step"
          @commit="(v) => commitBackdrop('saturate', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'saturate', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'saturate', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'saturate', v)"
          placeholder="100"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Sepia -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'sepia')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'sepia')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'sepia')"
        >
          <span
            :class="[
              studioIcons.sunFog, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'sepia') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("sepia") }}
        </button>
        <FilterNumericControl
          v-model="bfs.sepia"
          :slider-value="sliderModelValue('backdrop', 'sepia')"
          :slider-disabled="isSliderDisabled('backdrop', 'sepia')"
          :min="getSliderConfig('backdrop', 'sepia').min"
          :max="getSliderConfig('backdrop', 'sepia').max"
          :step="getSliderConfig('backdrop', 'sepia').step"
          @commit="(v) => commitBackdrop('sepia', v)"
          @scrub-start="
            (e: MouseEvent) => handleMouseDown('backdrop', 'sepia', e)
          "
          @slider-update="(v) => handleSliderUpdate('backdrop', 'sepia', v)"
          @slider-commit="(v) => handleSliderCommit('backdrop', 'sepia', v)"
          placeholder="0"
          :input-class="FILTER_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <!-- Backdrop Drop Shadow -->
      <div class="grid grid-cols-[104px_1fr] gap-3 items-center min-h-8">
        <button
          type="button"
          :title="filterToggleLabel('backdrop', 'dropShadow')"
          class="flex items-center gap-1.5 text-xs text-left transition-colors group"
          :class="
            isEnabled(bfs, 'dropShadow')
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="toggleFilter('backdrop', 'dropShadow')"
        >
          <span
            :class="[
              studioIcons.shadow, 'size-3.5 shrink-0 transition-colors',
              isEnabled(bfs, 'dropShadow') ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
            ]"
          />
          {{ filterEffectLabel("dropShadow") }}
        </button>
        <div />
      </div>
      <template v-if="isEnabled(bfs, 'dropShadow')">
        <div class="space-y-1.5">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.filter.offset") }}</label
          >
          <div class="space-y-1.5 rounded-md border border-border/70 bg-muted/25 p-2 dark:bg-sidebar/35">
            <div class="grid grid-cols-[2.25rem_1fr] items-center gap-2">
              <span class="text-[10px] font-semibold text-muted-foreground"
                >X</span
              >
              <FilterNumericControl
                v-model="bfs.dropShadowX"
                :slider-value="sliderModelValue('backdrop', 'dropShadowX')"
                :slider-disabled="isSliderDisabled('backdrop', 'dropShadowX')"
                :min="getSliderConfig('backdrop', 'dropShadowX').min"
                :max="getSliderConfig('backdrop', 'dropShadowX').max"
                :step="getSliderConfig('backdrop', 'dropShadowX').step"
                @commit="(v) => commitBackdrop('dropShadowX', v)"
                @scrub-start="
                  (e: MouseEvent) =>
                    handleMouseDown('backdrop', 'dropShadowX', e)
                "
                @slider-update="
                  (v) => handleSliderUpdate('backdrop', 'dropShadowX', v)
                "
                @slider-commit="
                  (v) => handleSliderCommit('backdrop', 'dropShadowX', v)
                "
                placeholder="0"
                :input-class="FILTER_COMPACT_INPUT_CLASS"
                :disabled="isPanelDisabled"
              />
            </div>
            <div class="grid grid-cols-[2.25rem_1fr] items-center gap-2">
              <span class="text-[10px] font-semibold text-muted-foreground"
                >Y</span
              >
              <FilterNumericControl
                v-model="bfs.dropShadowY"
                :slider-value="sliderModelValue('backdrop', 'dropShadowY')"
                :slider-disabled="isSliderDisabled('backdrop', 'dropShadowY')"
                :min="getSliderConfig('backdrop', 'dropShadowY').min"
                :max="getSliderConfig('backdrop', 'dropShadowY').max"
                :step="getSliderConfig('backdrop', 'dropShadowY').step"
                @commit="(v) => commitBackdrop('dropShadowY', v)"
                @scrub-start="
                  (e: MouseEvent) =>
                    handleMouseDown('backdrop', 'dropShadowY', e)
                "
                @slider-update="
                  (v) => handleSliderUpdate('backdrop', 'dropShadowY', v)
                "
                @slider-commit="
                  (v) => handleSliderCommit('backdrop', 'dropShadowY', v)
                "
                placeholder="0"
                :input-class="FILTER_COMPACT_INPUT_CLASS"
                :disabled="isPanelDisabled"
              />
            </div>
            <div class="grid grid-cols-[2.25rem_1fr] items-center gap-2">
              <span class="text-[10px] font-semibold text-muted-foreground"
                >{{ t("inspector.filter.blur") }}</span
              >
              <FilterNumericControl
                v-model="bfs.dropShadowBlur"
                :slider-value="sliderModelValue('backdrop', 'dropShadowBlur')"
                :slider-disabled="isSliderDisabled('backdrop', 'dropShadowBlur')"
                :min="getSliderConfig('backdrop', 'dropShadowBlur').min"
                :max="getSliderConfig('backdrop', 'dropShadowBlur').max"
                :step="getSliderConfig('backdrop', 'dropShadowBlur').step"
                @commit="(v) => commitBackdrop('dropShadowBlur', v)"
                @scrub-start="
                  (e: MouseEvent) =>
                    handleMouseDown('backdrop', 'dropShadowBlur', e)
                "
                @slider-update="
                  (v) => handleSliderUpdate('backdrop', 'dropShadowBlur', v)
                "
                @slider-commit="
                  (v) => handleSliderCommit('backdrop', 'dropShadowBlur', v)
                "
                placeholder="0"
                :input-class="FILTER_COMPACT_INPUT_CLASS"
                :disabled="isPanelDisabled"
              />
            </div>
          </div>
        </div>
        <div class="space-y-1.5">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.filter.color") }}</label
          >
          <ColorField
            v-model="bfs.dropShadowColor"
            layout="unified"
            show-variables
            show-alpha
            show-design-colors
            content-side="left"
            content-align="center"
            class="min-w-0 w-full"
            contrast-against="#ffffff"
            :disabled="isPanelDisabled"
            @preview="previewBackdropDropShadowColor"
            @update:model-value="bfs.dropShadowColor = $event"
            @commit="persistBackdropDropShadowColor"
          />
        </div>
      </template>

      <!-- Errors -->
      <div v-if="validationError" class="text-xs text-destructive px-1 pt-1">
        {{ validationError }}
      </div>
      <div v-if="targetError" class="text-xs text-destructive px-1 pt-1">
        {{ targetError }}
      </div>
    </div>
  </BaseProperty>
</template>
