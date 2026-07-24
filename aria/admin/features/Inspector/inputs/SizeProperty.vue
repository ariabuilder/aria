<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { usePropertySave } from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorStyleTargetWithGlobalDefaults } from "../composables/useInspectorStyleTargetWithGlobalDefaults";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import type { SizeMode, SizeValue } from "../schemas/size.schema";
import { inferSizeModeFromCSSValue } from "../../../../lib/layout/resolveSizingCss";
import { useStudioI18n } from "@/i18n";

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

const SIZE_MODE_GROUP_CLASS =
  "flex rounded-md border border-border/70 bg-background/75 p-0.5 shadow-[inset_0_0_0_1px_rgb(var(--color-foreground)/0.03)] dark:bg-sidebar/55";
const SIZE_MODE_BUTTON_CLASS =
  "flex h-7 flex-1 items-center justify-center rounded-sm border border-transparent text-xs font-medium capitalize text-foreground/75 transition-colors hover:bg-sidebar/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-45 dark:text-muted-foreground dark:hover:text-foreground";
const ACTIVE_SIZE_MODE_BUTTON_CLASS =
  "border-primary/70 bg-primary/10! text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.16)] dark:bg-primary/15!";

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { styleTarget } = useInspectorStyleTargetWithGlobalDefaults({
  propertySave,
});
const { safeParse, getDefault } = usePropertySchema();

type SizeKey = keyof SizeValue;
type DimensionKey = "width" | "height";
type SizingModeKey = "widthSizing" | "heightSizing";

const SIZE_SECTION_STYLE_KEYS = [
  "width",
  "height",
  "widthSizing",
  "heightSizing",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
] as const satisfies readonly SizeKey[];

const sizeOverrides = useInspectorPropertyOverrides({
  propertyKeys: SIZE_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});

const internalOpen = ref(props.defaultOpen);
const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const widthMode = ref<SizeMode>("hug");
const heightMode = ref<SizeMode>("hug");

// Prevent the sync watch from resetting the mode when the user has explicitly
// clicked "exact" but hasn't committed a CSS value yet. The lock is cleared
// once a save succeeds (applySizeRefs) or the node/context changes.
const widthModeLocked = ref(false);
const heightModeLocked = ref(false);

const widthInput = ref("");
const heightInput = ref("");
const minWidth = ref("0");
const minHeight = ref("0");
const maxWidth = ref("none");
const maxHeight = ref("none");

const validationError = ref<string | null>(null);

type SizePreviewUpdates = Partial<Record<SizeKey, string | undefined>>;

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

const defaultSize = computed<SizeValue>(() => {
  const fallback: SizeValue = {
    width: { base: "auto" },
    height: { base: "auto" },
    widthSizing: { base: "hug" },
    heightSizing: { base: "hug" },
    minWidth: { base: "0" },
    minHeight: { base: "0" },
    maxWidth: { base: "none" },
    maxHeight: { base: "none" },
  };

  const resolved = getDefault("size");
  return (resolved as SizeValue) ?? fallback;
});

const sizePreviewQueue = useStylePreviewQueue<
  Record<SizeKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncSizeRefsFromTarget,
});

const sizeScrubSession = usePointerScrubSession();

function getStyleValue(key: SizeKey): string {
  const defaults: Record<SizeKey, string> = {
    width: "auto",
    height: "auto",
    widthSizing: "hug",
    heightSizing: "hug",
    minWidth: "0",
    minHeight: "0",
    maxWidth: "none",
    maxHeight: "none",
  };

  return (
    styleTarget.getStyleValue(key, defaults[key], breakpointName.value) ??
    defaults[key]
  );
}

function getSizingModeKey(axis: DimensionKey): SizingModeKey {
  return axis === "width" ? "widthSizing" : "heightSizing";
}

function getDimensionMode(axis: DimensionKey): SizeMode {
  const storedAtBreakpoint = getCurrentBreakpointSizeValue(
    getSizingModeKey(axis),
  );
  if (
    storedAtBreakpoint === "hug" ||
    storedAtBreakpoint === "fill" ||
    storedAtBreakpoint === "exact"
  ) {
    return storedAtBreakpoint;
  }

  return inferSizeModeFromCSSValue(getStyleValue(axis));
}

function parseModeFromValue(value: string): SizeMode {
  return inferSizeModeFromCSSValue(value);
}

function formatExactInputValue(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (
    trimmed === "auto" ||
    trimmed === "fit-content" ||
    trimmed === "min-content" ||
    trimmed === "max-content"
  ) {
    return "";
  }

  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) {
    return pxMatch[1] ?? "";
  }

  return trimmed;
}

function normalizeValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "auto";

  if (trimmed.startsWith("var(")) return trimmed;

  const keywords = [
    "auto",
    "none",
    "100%",
    "fit-content",
    "min-content",
    "max-content",
  ];
  if (keywords.includes(trimmed)) return trimmed;

  // Bare number → append px
  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return `${Math.round(numeric)}px`;
  }

  return trimmed;
}

function syncSizeRefsFromTarget(): void {
  const widthValue = getStyleValue("width");
  const heightValue = getStyleValue("height");

  widthInput.value = formatExactInputValue(widthValue);
  heightInput.value = formatExactInputValue(heightValue);
  minWidth.value = getStyleValue("minWidth");
  minHeight.value = getStyleValue("minHeight");
  maxWidth.value = getStyleValue("maxWidth");
  maxHeight.value = getStyleValue("maxHeight");

  if (!widthModeLocked.value) {
    widthMode.value = getDimensionMode("width");
  }
  if (!heightModeLocked.value) {
    heightMode.value = getDimensionMode("height");
  }
}

// Clear mode locks whenever the selected node identity, breakpoint, or class
// context changes so that the next syncSizeRefsFromTarget gets a clean slate.
watch(
  [
    () => selectedNode.value?.id,
    breakpointName,
    styleTarget.isClassEditing,
    () => styleTarget.activeClass.value,
  ],
  () => {
    widthModeLocked.value = false;
    heightModeLocked.value = false;
  },
);

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncSizeRefsFromTarget();
  },
  { deep: true, immediate: true },
);

function buildSizeCandidate(nextKey: SizeKey, nextValue: string): SizeValue {
  const current: Record<SizeKey, string> = {
    width: getStyleValue("width"),
    height: getStyleValue("height"),
    widthSizing: getStyleValue("widthSizing"),
    heightSizing: getStyleValue("heightSizing"),
    minWidth: getStyleValue("minWidth"),
    minHeight: getStyleValue("minHeight"),
    maxWidth: getStyleValue("maxWidth"),
    maxHeight: getStyleValue("maxHeight"),
  };

  current[nextKey] = nextValue;

  return {
    ...defaultSize.value,
    width: {
      ...defaultSize.value.width,
      [breakpointName.value]: current.width,
    },
    height: {
      ...defaultSize.value.height,
      [breakpointName.value]: current.height,
    },
    widthSizing: {
      ...defaultSize.value.widthSizing,
      [breakpointName.value]: current.widthSizing,
    },
    heightSizing: {
      ...defaultSize.value.heightSizing,
      [breakpointName.value]: current.heightSizing,
    },
    minWidth: {
      ...defaultSize.value.minWidth,
      [breakpointName.value]: current.minWidth,
    },
    minHeight: {
      ...defaultSize.value.minHeight,
      [breakpointName.value]: current.minHeight,
    },
    maxWidth: {
      ...defaultSize.value.maxWidth,
      [breakpointName.value]: current.maxWidth,
    },
    maxHeight: {
      ...defaultSize.value.maxHeight,
      [breakpointName.value]: current.maxHeight,
    },
  };
}

function validateSize(key: SizeKey, value: string): boolean {
  const candidate = buildSizeCandidate(key, value);
  const result = safeParse("size", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidSize");
    return false;
  }

  validationError.value = null;
  return true;
}

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) return true;
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

async function saveSize(key: SizeKey, rawValue: string): Promise<boolean> {
  if (key === "width") {
    return saveSizeBatch({
      width: rawValue,
      widthSizing: "exact",
    });
  }

  if (key === "height") {
    return saveSizeBatch({
      height: rawValue,
      heightSizing: "exact",
    });
  }

  return saveSizeBatch(
    { [key]: rawValue },
    props.currentItemType,
    props.currentItemSlug,
  );
}

function applySizeRefs(updates: Partial<Record<SizeKey, string>>): void {
  for (const [propertyName, nextValue] of Object.entries(updates)) {
    switch (propertyName as SizeKey) {
      case "width":
        widthInput.value = formatExactInputValue(nextValue);
        if (getStyleValue("widthSizing") === "exact") {
          widthMode.value = "exact";
        }
        widthModeLocked.value = false;
        break;
      case "height":
        heightInput.value = formatExactInputValue(nextValue);
        if (getStyleValue("heightSizing") === "exact") {
          heightMode.value = "exact";
        }
        heightModeLocked.value = false;
        break;
      case "widthSizing":
        widthMode.value = nextValue as SizeMode;
        widthModeLocked.value = false;
        break;
      case "heightSizing":
        heightMode.value = nextValue as SizeMode;
        heightModeLocked.value = false;
        break;
      case "minWidth":
        minWidth.value = nextValue;
        break;
      case "minHeight":
        minHeight.value = nextValue;
        break;
      case "maxWidth":
        maxWidth.value = nextValue;
        break;
      case "maxHeight":
        maxHeight.value = nextValue;
        break;
    }
  }
}

async function saveSizeBatch(
  updates: Partial<Record<SizeKey, string | undefined>>,
  itemType: Props["currentItemType"] = props.currentItemType,
  itemSlug: Props["currentItemSlug"] = props.currentItemSlug,
  options?: {
    compareAgainst?: Partial<Record<SizeKey, string>>;
  },
): Promise<boolean> {
  if (!hasSaveContext()) return false;

  const normalizedEntries = Object.entries(updates).map(([key, value]) => [
    key as SizeKey,
    value === undefined ? undefined : normalizeValue(value),
  ]);

  const normalizedUpdates = Object.fromEntries(
    normalizedEntries.filter(([, value]) => value !== undefined),
  ) as Partial<Record<SizeKey, string>>;

  const clearedUpdates = Object.fromEntries(
    normalizedEntries.filter(([, value]) => value === undefined),
  ) as Partial<Record<SizeKey, undefined>>;

  const hasChanges = normalizedEntries.some(([key, nextValue]) => {
    const sizeKey = key as SizeKey;
    const storedValue = getCurrentBreakpointSizeValue(sizeKey);
    const currentValue =
      options?.compareAgainst?.[sizeKey] ??
      storedValue ??
      getStyleValue(sizeKey);
    if (nextValue === undefined) {
      return storedValue !== undefined;
    }
    return currentValue !== nextValue;
  });

  if (!hasChanges) {
    return true;
  }

  for (const [key, nextValue] of normalizedEntries) {
    if (nextValue === undefined) {
      continue;
    }
    if (!validateSize(key as SizeKey, nextValue)) {
      return false;
    }
  }

  const savePayload = {
    ...normalizedUpdates,
    ...clearedUpdates,
  };

  const success = await styleTarget.saveStyleProperties(
    savePayload,
    itemType,
    itemSlug,
  );

  if (!success) {
    return false;
  }

  applySizeRefs(normalizedUpdates);
  return true;
}

async function setWidthMode(mode: SizeMode): Promise<void> {
  widthMode.value = mode;
  if (mode === "exact") {
    widthInput.value = formatExactInputValue(getStyleValue("width"));
    widthModeLocked.value = true;
    return;
  }

  widthModeLocked.value = false;
  await saveSizeBatch({
    widthSizing: mode,
    width: undefined,
  });
}

async function setHeightMode(mode: SizeMode): Promise<void> {
  heightMode.value = mode;
  if (mode === "exact") {
    heightInput.value = formatExactInputValue(getStyleValue("height"));
    heightModeLocked.value = true;
    return;
  }

  heightModeLocked.value = false;
  await saveSizeBatch({
    heightSizing: mode,
    height: undefined,
  });
}

async function resetCurrentBreakpointSize(): Promise<void> {
  if (!hasSaveContext()) return;
  widthModeLocked.value = false;
  heightModeLocked.value = false;
  await sizeOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
}

function getRefValue(key: SizeKey): string {
  switch (key) {
    case "width":
      return widthInput.value;
    case "height":
      return heightInput.value;
    case "minWidth":
      return minWidth.value;
    case "minHeight":
      return minHeight.value;
    case "maxWidth":
      return maxWidth.value;
    case "maxHeight":
      return maxHeight.value;
  }
}

function setRefValue(key: SizeKey, val: string): void {
  switch (key) {
    case "width":
      widthInput.value = val;
      break;
    case "height":
      heightInput.value = val;
      break;
    case "minWidth":
      minWidth.value = val;
      break;
    case "minHeight":
      minHeight.value = val;
      break;
    case "maxWidth":
      maxWidth.value = val;
      break;
    case "maxHeight":
      maxHeight.value = val;
      break;
  }
}

function getCurrentBreakpointSizeValue(key: SizeKey): string | undefined {
  return styleTarget.getResponsiveStyleMap(key)[breakpointName.value];
}

function cancelPendingSizePreview(): void {
  sizePreviewQueue.cancel();
}

function flushPendingSizePreview(): void {
  sizePreviewQueue.flush();
}

function queueSizePreview(updates: SizePreviewUpdates): void {
  sizePreviewQueue.queue(updates);
}

function restoreSizePreview(updates: SizePreviewUpdates): void {
  sizePreviewQueue.restore(updates);
}

function previewSizeInput(key: SizeKey, rawValue: string): void {
  queueSizePreview({ [key]: normalizeValue(rawValue) });
}

async function commitSizeInput(key: SizeKey, rawValue: string): Promise<void> {
  const originalValue = getCurrentBreakpointSizeValue(key);

  flushPendingSizePreview();
  const success = await saveSize(key, rawValue);

  if (!success) {
    restoreSizePreview({ [key]: originalValue });
  }
}

function resolveScrubOrigin(value: string): {
  startValue: number;
  unit: string;
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);

  if (!match) {
    return { startValue: 0, unit: "px" };
  }

  return {
    startValue: Number.parseFloat(match[1] ?? "0"),
    unit: match[2] ?? "px",
  };
}

function formatScrubDisplayValue(value: number, unit: string): string {
  return unit === "px" ? String(value) : `${value}${unit}`;
}

function handleMouseDown(keys: SizeKey[], e: MouseEvent): void {
  if (!(e.target instanceof HTMLInputElement)) return;
  if (!hasSaveContext()) return;

  const input = e.target;
  const { startValue, unit } = resolveScrubOrigin(input.value);
  const originRawValues = Object.fromEntries(
    keys.map((key) => [key, getCurrentBreakpointSizeValue(key)]),
  ) as SizePreviewUpdates;
  const originDisplayValues = Object.fromEntries(
    keys.map((key) => [key, getStyleValue(key)]),
  ) as Partial<Record<SizeKey, string>>;

  sizeScrubSession.start({
    event: e,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const formatted = formatScrubDisplayValue(nextValue, unit);
      const previewUpdates: Partial<Record<SizeKey, string>> = {};

      keys.forEach((key) => {
        setRefValue(key, formatted);
        previewUpdates[key] = normalizeValue(formatted);
      });

      queueSizePreview(previewUpdates);
    },
    onCancel: () => {
      restoreSizePreview(originRawValues);
    },
    onCommit: () => {
      flushPendingSizePreview();
      const finalValue = getRefValue(keys[0]!);
      void saveSizeBatch(
        {
          ...Object.fromEntries(keys.map((key) => [key, finalValue])),
          ...(keys.includes("width") ? { widthSizing: "exact" as const } : {}),
          ...(keys.includes("height") ? { heightSizing: "exact" as const } : {}),
        } as Partial<Record<SizeKey, string>>,
        props.currentItemType,
        props.currentItemSlug,
        { compareAgainst: originDisplayValues },
      ).then((success) => {
        if (!success) {
          restoreSizePreview(originRawValues);
        }
      });
    },
  });
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="props.defaultOpen"
    :has-changes="sizeOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Size"
    icon="dimensions"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="sizeOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="sizeOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen && sizeOverrides.hasCurrentBreakpointOverride.value
        "
        @reset="void resetCurrentBreakpointSize()"
      />
    </template>

    <div class="space-y-4 pb-4">
      <!-- WIDTH -->
      <div class="space-y-2">
        <label
          class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.size.width") }}</label
        >

        <!-- Mode pill -->
        <div :class="SIZE_MODE_GROUP_CLASS" data-testid="size-width-mode-group">
          <button
            v-for="mode in ['hug', 'fill', 'exact'] as const"
            :key="mode"
            type="button"
            :data-testid="`size-width-mode-${mode}`"
            :class="[
              SIZE_MODE_BUTTON_CLASS,
              widthMode === mode && ACTIVE_SIZE_MODE_BUTTON_CLASS,
            ]"
            @click="setWidthMode(mode)"
          >
            {{ t(`inspector.size.mode.${mode}` as const) }}
          </button>
        </div>

        <!-- Exact input -->
        <div v-if="widthMode === 'exact'" class="relative flex items-center">
          <span
            :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowLeftRight, 'size-3.5 z-10 pointer-events-none']"
          />
          <VariableAssignableInput
            v-model="widthInput"
            @update:model-value="(val) => previewSizeInput('width', val)"
            @commit="(val) => void commitSizeInput('width', val)"
            :disabled="isPanelDisabled"
            class="w-full"
            input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
            :placeholder="t('inspector.size.width')"
            @mousedown="(e: MouseEvent) => handleMouseDown(['width'], e)"
          />
        </div>
      </div>

      <!-- HEIGHT -->
      <div class="space-y-2">
        <label
          class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.size.height") }}</label
        >

        <!-- Mode pill -->
        <div :class="SIZE_MODE_GROUP_CLASS" data-testid="size-height-mode-group">
          <button
            v-for="mode in ['hug', 'fill', 'exact'] as const"
            :key="mode"
            type="button"
            :data-testid="`size-height-mode-${mode}`"
            :class="[
              SIZE_MODE_BUTTON_CLASS,
              heightMode === mode && ACTIVE_SIZE_MODE_BUTTON_CLASS,
            ]"
            @click="setHeightMode(mode)"
          >
            {{ t(`inspector.size.mode.${mode}` as const) }}
          </button>
        </div>

        <!-- Exact input -->
        <div v-if="heightMode === 'exact'" class="relative flex items-center">
          <span
            :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpDown, 'size-3.5 z-10 pointer-events-none']"
          />
          <VariableAssignableInput
            v-model="heightInput"
            @commit="(val) => saveSize('height', val)"
            :disabled="isPanelDisabled"
            class="w-full"
            input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
            :placeholder="t('inspector.size.height')"
            @mousedown="(e: MouseEvent) => handleMouseDown(['height'], e)"
          />
        </div>
      </div>

      <div class="h-px bg-border/70 w-full" />

      <!-- MIN / MAX -->
      <div class="space-y-3">
        <label
          class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.size.constraints") }}</label
        >

        <!-- Min row -->
        <div class="space-y-1.5">
          <span
            class="text-3xs text-muted-foreground/60 uppercase tracking-widest"
            >{{ t("inspector.size.minWidth") }}</span
          >
          <div class="grid grid-cols-2 gap-2">
            <!-- Min Width -->
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowLeftRight, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="minWidth"
                @update:model-value="(val) => previewSizeInput('minWidth', val)"
                @commit="(val) => void commitSizeInput('minWidth', val)"
                :disabled="isPanelDisabled"
                class="w-full"
                input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
                :placeholder="t('inspector.size.minWidth')"
                @mousedown="(e: MouseEvent) => handleMouseDown(['minWidth'], e)"
              />
            </div>

            <!-- Min Height -->
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpDown, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="minHeight"
                @commit="(val) => saveSize('minHeight', val)"
                :disabled="isPanelDisabled"
                class="w-full"
                input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
                :placeholder="t('inspector.size.minHeight')"
                @mousedown="
                  (e: MouseEvent) => handleMouseDown(['minHeight'], e)
                "
              />
            </div>
          </div>
        </div>

        <!-- Max row -->
        <div class="space-y-1.5">
          <span
            class="text-3xs text-muted-foreground/60 uppercase tracking-widest"
            >{{ t("inspector.size.maxWidth") }}</span
          >
          <div class="grid grid-cols-2 gap-2">
            <!-- Max Width -->
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowLeftRight, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="maxWidth"
                @update:model-value="(val) => previewSizeInput('maxWidth', val)"
                @commit="(val) => void commitSizeInput('maxWidth', val)"
                :disabled="isPanelDisabled"
                class="w-full"
                input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
                :placeholder="t('inspector.size.maxWidth')"
                @mousedown="(e: MouseEvent) => handleMouseDown(['maxWidth'], e)"
              />
            </div>

            <!-- Max Height -->
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpDown, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="maxHeight"
                @commit="(val) => saveSize('maxHeight', val)"
                :disabled="isPanelDisabled"
                class="w-full"
                input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
                :placeholder="t('inspector.size.maxHeight')"
                @mousedown="
                  (e: MouseEvent) => handleMouseDown(['maxHeight'], e)
                "
              />
            </div>
          </div>
        </div>
      </div>

      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="targetError" class="text-xs text-red-500">
        {{ targetError }}
      </div>
    </div>
  </BaseProperty>
</template>
