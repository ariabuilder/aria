<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { useCanvasSignalBridge, usePropertySave } from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorStyleTargetWithGlobalDefaults } from "../composables/useInspectorStyleTargetWithGlobalDefaults";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import {
  extractScrubNumericAndUnit,
  formatPropertySaveError,
  isScrubbableCssLength,
  isValidSpacingCssValue,
} from "../../../lib/cssLengthValues";
import type { SpacingValue } from "../schemas/spacing.schema";
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

const propertySave = usePropertySave();
const { signalSpacingPreviewStart, signalSpacingPreviewEnd } =
  useCanvasSignalBridge();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { styleTarget, globalDefaults } = useInspectorStyleTargetWithGlobalDefaults({
  propertySave,
});
const { safeParse, getDefault } = usePropertySchema();

type SpacingKey =
  | "marginTop"
  | "marginRight"
  | "marginBottom"
  | "marginLeft"
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "paddingLeft";

type SpacingUpdates = Partial<Record<SpacingKey, string | undefined>>;

const SPACING_SECTION_STYLE_KEYS = [
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const satisfies readonly SpacingKey[];

const spacingOverrides = useInspectorPropertyOverrides({
  propertyKeys: SPACING_SECTION_STYLE_KEYS,
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

const isMarginLinked = ref(true);
const isPaddingLinked = ref(true);

const marginTop = ref("0");
const marginRight = ref("0");
const marginBottom = ref("0");
const marginLeft = ref("0");
const paddingTop = ref("0");
const paddingRight = ref("0");
const paddingBottom = ref("0");
const paddingLeft = ref("0");
const validationError = ref<string | null>(null);

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);
const spacingInspectorError = computed(
  () => validationError.value ?? targetError.value ?? null,
);

const defaultSpacing = computed<SpacingValue>(() => {
  const fallback: SpacingValue = {
    marginTop: { base: "0" },
    marginRight: { base: "0" },
    marginBottom: { base: "0" },
    marginLeft: { base: "0" },
    paddingTop: { base: "0" },
    paddingRight: { base: "0" },
    paddingBottom: { base: "0" },
    paddingLeft: { base: "0" },
  };

  const resolved = getDefault("spacing");
  return (resolved as SpacingValue) ?? fallback;
});

const spacingPreviewQueue = useStylePreviewQueue<
  Record<SpacingKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncSpacingRefsFromTarget,
});

const spacingScrubSession = usePointerScrubSession();

function getDefaultSpacingValue(key: SpacingKey): string {
  const globalValue = globalDefaults.globalStyleDefaults.value[key];
  if (typeof globalValue === "string" && globalValue.trim().length > 0) {
    return globalValue;
  }

  const spacingDefaults = defaultSpacing.value[key];
  return spacingDefaults?.base ?? "0";
}

const resetCurrentBreakpointSpacing = async () => {
  if (!hasSaveContext()) {
    return;
  }

  await spacingOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
};

const hasSpacingChanges = computed(() =>
  SPACING_SECTION_STYLE_KEYS.some((propertyName) => {
    const value = styleTarget.getResponsiveStyleMap(propertyName);

    return Object.entries(value).some(([breakpoint, entry]) => {
      if (entry === undefined) {
        return false;
      }

      return String(entry) !== getDefaultSpacingValue(propertyName);
    });
  }),
);

function getStyleValue(key: SpacingKey): string {
  return (
    styleTarget.getStyleValue(
      key,
      getDefaultSpacingValue(key),
      breakpointName.value,
    ) ?? getDefaultSpacingValue(key)
  );
}

function syncSpacingRefsFromTarget(): void {
  marginTop.value = getStyleValue("marginTop");
  marginRight.value = getStyleValue("marginRight");
  marginBottom.value = getStyleValue("marginBottom");
  marginLeft.value = getStyleValue("marginLeft");
  paddingTop.value = getStyleValue("paddingTop");
  paddingRight.value = getStyleValue("paddingRight");
  paddingBottom.value = getStyleValue("paddingBottom");
  paddingLeft.value = getStyleValue("paddingLeft");

  isMarginLinked.value =
    marginTop.value === marginBottom.value &&
    marginLeft.value === marginRight.value;
  isPaddingLinked.value =
    paddingTop.value === paddingBottom.value &&
    paddingLeft.value === paddingRight.value;
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncSpacingRefsFromTarget();
  },
  { deep: true, immediate: true },
);

function normalizeSpacingValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "0";

  if (trimmed.startsWith("var(")) return trimmed;

  if (/^calc\(/i.test(trimmed)) return trimmed;

  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return `${Math.round(numeric)}px`;
  }

  if (isValidSpacingCssValue(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function buildSpacingCandidate(
  nextKey: SpacingKey,
  nextValue: string,
): SpacingValue {
  const currentValues: Record<SpacingKey, string> = {
    marginTop: getStyleValue("marginTop"),
    marginRight: getStyleValue("marginRight"),
    marginBottom: getStyleValue("marginBottom"),
    marginLeft: getStyleValue("marginLeft"),
    paddingTop: getStyleValue("paddingTop"),
    paddingRight: getStyleValue("paddingRight"),
    paddingBottom: getStyleValue("paddingBottom"),
    paddingLeft: getStyleValue("paddingLeft"),
  };

  currentValues[nextKey] = nextValue;

  return {
    ...defaultSpacing.value,
    marginTop: {
      ...defaultSpacing.value.marginTop,
      [breakpointName.value]: currentValues.marginTop,
    },
    marginRight: {
      ...defaultSpacing.value.marginRight,
      [breakpointName.value]: currentValues.marginRight,
    },
    marginBottom: {
      ...defaultSpacing.value.marginBottom,
      [breakpointName.value]: currentValues.marginBottom,
    },
    marginLeft: {
      ...defaultSpacing.value.marginLeft,
      [breakpointName.value]: currentValues.marginLeft,
    },
    paddingTop: {
      ...defaultSpacing.value.paddingTop,
      [breakpointName.value]: currentValues.paddingTop,
    },
    paddingRight: {
      ...defaultSpacing.value.paddingRight,
      [breakpointName.value]: currentValues.paddingRight,
    },
    paddingBottom: {
      ...defaultSpacing.value.paddingBottom,
      [breakpointName.value]: currentValues.paddingBottom,
    },
    paddingLeft: {
      ...defaultSpacing.value.paddingLeft,
      [breakpointName.value]: currentValues.paddingLeft,
    },
  };
}

function validateSpacing(key: SpacingKey, value: string): boolean {
  if (!isValidSpacingCssValue(value)) {
    validationError.value =
      t("inspector.validation.spacingHelp");
    return false;
  }

  const candidate = buildSpacingCandidate(key, value);
  const result = safeParse("spacing", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidSpacing");
    return false;
  }

  return true;
}

async function saveSpacing(key: SpacingKey, rawValue: string): Promise<void> {
  if (!hasSaveContext()) return;

  const nextValue = normalizeSpacingValue(rawValue);
  const currentValue = getStyleValue(key);
  if (currentValue === nextValue) return;

  if (!validateSpacing(key, nextValue)) return;

  const success = await styleTarget.saveStyleProperty(
    key,
    nextValue,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    validationError.value = formatPropertySaveError(
      styleTarget.error.value ?? t("inspector.validation.saveSpacing"),
    );
    syncSpacingRefsFromTarget();
    return;
  }

  validationError.value = null;

  switch (key) {
    case "marginTop":
      marginTop.value = nextValue;
      break;
    case "marginRight":
      marginRight.value = nextValue;
      break;
    case "marginBottom":
      marginBottom.value = nextValue;
      break;
    case "marginLeft":
      marginLeft.value = nextValue;
      break;
    case "paddingTop":
      paddingTop.value = nextValue;
      break;
    case "paddingRight":
      paddingRight.value = nextValue;
      break;
    case "paddingBottom":
      paddingBottom.value = nextValue;
      break;
    case "paddingLeft":
      paddingLeft.value = nextValue;
      break;
  }
}

function validateSpacingUpdates(
  updates: Partial<Record<SpacingKey, string>>,
): boolean {
  const currentValues: Record<SpacingKey, string> = {
    marginTop: getStyleValue("marginTop"),
    marginRight: getStyleValue("marginRight"),
    marginBottom: getStyleValue("marginBottom"),
    marginLeft: getStyleValue("marginLeft"),
    paddingTop: getStyleValue("paddingTop"),
    paddingRight: getStyleValue("paddingRight"),
    paddingBottom: getStyleValue("paddingBottom"),
    paddingLeft: getStyleValue("paddingLeft"),
  };

  for (const [key, value] of Object.entries(updates) as Array<
    [SpacingKey, string]
  >) {
    if (!isValidSpacingCssValue(value)) {
      validationError.value =
        t("inspector.validation.spacingHelp");
      return false;
    }

    currentValues[key] = value;
  }

  const candidate: SpacingValue = {
    ...defaultSpacing.value,
    marginTop: {
      ...defaultSpacing.value.marginTop,
      [breakpointName.value]: currentValues.marginTop,
    },
    marginRight: {
      ...defaultSpacing.value.marginRight,
      [breakpointName.value]: currentValues.marginRight,
    },
    marginBottom: {
      ...defaultSpacing.value.marginBottom,
      [breakpointName.value]: currentValues.marginBottom,
    },
    marginLeft: {
      ...defaultSpacing.value.marginLeft,
      [breakpointName.value]: currentValues.marginLeft,
    },
    paddingTop: {
      ...defaultSpacing.value.paddingTop,
      [breakpointName.value]: currentValues.paddingTop,
    },
    paddingRight: {
      ...defaultSpacing.value.paddingRight,
      [breakpointName.value]: currentValues.paddingRight,
    },
    paddingBottom: {
      ...defaultSpacing.value.paddingBottom,
      [breakpointName.value]: currentValues.paddingBottom,
    },
    paddingLeft: {
      ...defaultSpacing.value.paddingLeft,
      [breakpointName.value]: currentValues.paddingLeft,
    },
  };

  const result = safeParse("spacing", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidSpacing");
    return false;
  }

  return true;
}

async function saveSpacingBatch(
  updates: Partial<Record<SpacingKey, string>>,
  options: { compareAgainst?: Partial<Record<SpacingKey, string>> } = {},
): Promise<boolean> {
  if (!hasSaveContext()) {
    return false;
  }

  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [
      key,
      normalizeSpacingValue(value),
    ]),
  ) as Partial<Record<SpacingKey, string>>;

  const changedUpdates = Object.fromEntries(
    Object.entries(normalizedUpdates).filter(([key, value]) => {
      const baselineValue =
        options.compareAgainst?.[key as SpacingKey] ??
        getStyleValue(key as SpacingKey);
      return baselineValue !== value;
    }),
  ) as Partial<Record<SpacingKey, string>>;

  if (Object.keys(changedUpdates).length === 0) {
    return true;
  }

  if (!validateSpacingUpdates(changedUpdates)) {
    return false;
  }

  const success = await styleTarget.saveStyleProperties(
    changedUpdates,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    validationError.value = formatPropertySaveError(
      styleTarget.error.value ?? t("inspector.validation.saveSpacing"),
    );
    syncSpacingRefsFromTarget();
    return false;
  }

  validationError.value = null;
  syncSpacingRefsFromTarget();
  return true;
}

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

async function commitMarginY(val: string) {
  await saveSpacingBatch({
    marginTop: val,
    marginBottom: val,
  });
}

async function commitMarginX(val: string) {
  await saveSpacingBatch({
    marginLeft: val,
    marginRight: val,
  });
}

async function commitPaddingY(val: string) {
  await saveSpacingBatch({
    paddingTop: val,
    paddingBottom: val,
  });
}

async function commitPaddingX(val: string) {
  await saveSpacingBatch({
    paddingLeft: val,
    paddingRight: val,
  });
}

function setSpacingRefValue(key: SpacingKey, value: string): void {
  switch (key) {
    case "marginTop":
      marginTop.value = value;
      break;
    case "marginRight":
      marginRight.value = value;
      break;
    case "marginBottom":
      marginBottom.value = value;
      break;
    case "marginLeft":
      marginLeft.value = value;
      break;
    case "paddingTop":
      paddingTop.value = value;
      break;
    case "paddingRight":
      paddingRight.value = value;
      break;
    case "paddingBottom":
      paddingBottom.value = value;
      break;
    case "paddingLeft":
      paddingLeft.value = value;
      break;
  }
}

function getCurrentBreakpointSpacingValue(key: SpacingKey): string | undefined {
  return styleTarget.getResponsiveStyleMap(key)[breakpointName.value];
}

function cancelPendingSpacingPreview(): void {
  spacingPreviewQueue.cancel();
}

function flushPendingSpacingPreview(): void {
  spacingPreviewQueue.flush();
}

function queueSpacingPreview(updates: SpacingUpdates): void {
  spacingPreviewQueue.queue(updates);
}

function restoreSpacingPreview(updates: SpacingUpdates): void {
  spacingPreviewQueue.restore(updates);
}

function getRefValue(key: SpacingKey) {
  switch (key) {
    case "marginTop":
      return marginTop.value;
    case "marginRight":
      return marginRight.value;
    case "marginBottom":
      return marginBottom.value;
    case "marginLeft":
      return marginLeft.value;
    case "paddingTop":
      return paddingTop.value;
    case "paddingRight":
      return paddingRight.value;
    case "paddingBottom":
      return paddingBottom.value;
    case "paddingLeft":
      return paddingLeft.value;
  }
}

function handleMouseDown(keys: SpacingKey[], e: MouseEvent) {
  if (!(e.target instanceof HTMLInputElement)) return;
  if (!hasSaveContext()) return;

  const input = e.target;
  const initialValue = input.value;
  if (!isScrubbableCssLength(initialValue)) {
    return;
  }

  const scrubParts = extractScrubNumericAndUnit(initialValue);
  if (!scrubParts) {
    return;
  }

  const startVal = scrubParts.numeric;
  const unit = scrubParts.unit;
  const originSnapshot = styleTarget.captureAuthoredStylePreviewSnapshot(keys);
  const originDisplayValues = Object.fromEntries(
    keys.map((key) => [key, getStyleValue(key)]),
  ) as Partial<Record<SpacingKey, string>>;

  let spacingPreviewSignaled = false;

  spacingScrubSession.start({
    event: e,
    onStart: () => {
      if (selectedNodeId.value) {
        signalSpacingPreviewStart({ nodeId: selectedNodeId.value });
        spacingPreviewSignaled = true;
      }
    },
    onCleanup: () => {
      if (spacingPreviewSignaled && selectedNodeId.value) {
        signalSpacingPreviewEnd({ nodeId: selectedNodeId.value });
        spacingPreviewSignaled = false;
      }
    },
    onMove: ({ deltaX }) => {
      const newVal = Math.round(startVal + deltaX);
      const formatted = `${newVal}${unit}`;
      const previewUpdates: Partial<Record<SpacingKey, string>> = {};

      keys.forEach((key) => {
        setSpacingRefValue(key, formatted);
        previewUpdates[key] = formatted;
      });

      queueSpacingPreview(previewUpdates);
    },
    onCancel: () => {
      styleTarget.restoreAuthoredStylePreviewSnapshot(keys, originSnapshot);
    },
    onCommit: () => {
      flushPendingSpacingPreview();
      const finalVal = getRefValue(keys[0]);
      void saveSpacingBatch(
        Object.fromEntries(keys.map((key) => [key, finalVal])) as Partial<
          Record<SpacingKey, string>
        >,
        {
          compareAgainst: originDisplayValues,
        },
      ).then((success) => {
        if (!success) {
          styleTarget.restoreAuthoredStylePreviewSnapshot(keys, originSnapshot);
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
    :has-changes="spacingOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Spacing"
    icon="spacing"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="spacingOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="
          spacingOverrides.currentBreakpointLabel.value
        "
        :show-reset="
          sectionOpen && spacingOverrides.hasCurrentBreakpointOverride.value
        "
        @reset="void resetCurrentBreakpointSpacing()"
      />
    </template>

    <div class="space-y-4 pb-4">
      <!-- MARGIN -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.spacing.margin") }}</label
          >
          <button
            @click="isMarginLinked = !isMarginLinked"
            class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted transition-colors"
            :class="
              isMarginLinked
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground'
            "
            :title="t('inspector.spacing.toggleSides')"
          >
            <span
              :class="isMarginLinked  ? studioIcons.link : studioIcons.unlink02"
              class="size-3.5"
            />
          </button>
        </div>

        <!-- Linked (Y / X) -->
        <div v-if="isMarginLinked" class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpDown, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="marginTop"
              @commit="commitMarginY"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.axisY')"
              @mousedown="
                (e: MouseEvent) =>
                  handleMouseDown(['marginTop', 'marginBottom'], e)
              "
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowLeftRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="marginLeft"
              @commit="commitMarginX"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.axisX')"
              @mousedown="
                (e: MouseEvent) =>
                  handleMouseDown(['marginLeft', 'marginRight'], e)
              "
            />
          </div>
        </div>

        <!-- Unlinked (4 sides) -->
        <div v-else class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronUp, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="marginTop"
              @commit="(val) => saveSpacing('marginTop', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.top')"
              @mousedown="(e: MouseEvent) => handleMouseDown(['marginTop'], e)"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronDown, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="marginBottom"
              @commit="(val) => saveSpacing('marginBottom', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.bottom')"
              @mousedown="
                (e: MouseEvent) => handleMouseDown(['marginBottom'], e)
              "
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronLeft, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="marginLeft"
              @commit="(val) => saveSpacing('marginLeft', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.left')"
              @mousedown="(e: MouseEvent) => handleMouseDown(['marginLeft'], e)"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="marginRight"
              @commit="(val) => saveSpacing('marginRight', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.right')"
              @mousedown="
                (e: MouseEvent) => handleMouseDown(['marginRight'], e)
              "
            />
          </div>
        </div>
      </div>

      <div class="h-px bg-border-70 w-full"></div>

      <!-- PADDING -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.spacing.padding") }}</label
          >
          <button
            @click="isPaddingLinked = !isPaddingLinked"
            class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted transition-colors"
            :class="
              isPaddingLinked
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground'
            "
            :title="t('inspector.spacing.toggleSides')"
          >
            <span
              :class="[
                isPaddingLinked ? studioIcons.link : studioIcons.unlink,
                'size-3.5',
              ]"
            />
          </button>
        </div>

        <!-- Linked (Y / X) -->
        <div v-if="isPaddingLinked" class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpDown, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="paddingTop"
              @commit="commitPaddingY"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.axisY')"
              @mousedown="
                (e: MouseEvent) =>
                  handleMouseDown(['paddingTop', 'paddingBottom'], e)
              "
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowLeftRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="paddingLeft"
              @commit="commitPaddingX"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.axisX')"
              @mousedown="
                (e: MouseEvent) =>
                  handleMouseDown(['paddingLeft', 'paddingRight'], e)
              "
            />
          </div>
        </div>

        <!-- Unlinked (4 sides) -->
        <div v-else class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronUp, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="paddingTop"
              @commit="(val) => saveSpacing('paddingTop', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.top')"
              @mousedown="(e: MouseEvent) => handleMouseDown(['paddingTop'], e)"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronDown, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="paddingBottom"
              @commit="(val) => saveSpacing('paddingBottom', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.bottom')"
              @mousedown="
                (e: MouseEvent) => handleMouseDown(['paddingBottom'], e)
              "
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronLeft, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="paddingLeft"
              @commit="(val) => saveSpacing('paddingLeft', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.left')"
              @mousedown="
                (e: MouseEvent) => handleMouseDown(['paddingLeft'], e)
              "
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.chevronRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="paddingRight"
              @commit="(val) => saveSpacing('paddingRight', val)"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 text-xs pl-8 bg-sidebar border-border-70 border-dashed cursor-ew-resize focus:cursor-text"
              :placeholder="t('inspector.spacing.right')"
              @mousedown="
                (e: MouseEvent) => handleMouseDown(['paddingRight'], e)
              "
            />
          </div>
        </div>
      </div>

      <div
        v-if="spacingInspectorError"
        data-testid="spacing-inspector-error"
        class="text-xs text-red-500"
      >
        {{ spacingInspectorError }}
      </div>
    </div>
  </BaseProperty>
</template>
