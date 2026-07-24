<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-picker";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { usePropertySave } from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorStyleTargetWithGlobalDefaults } from "../composables/useInspectorStyleTargetWithGlobalDefaults";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import type { BorderStyle, BorderValue } from "../schemas/border.schema";
import type { CornerValue } from "../schemas/corner.schema";
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

const BORDER_STYLE_OPTIONS = [
  "none",
  "hidden",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
] as const;

const BORDER_WIDTH_UNITS = ["px", "rem", "em", "vw", "vh"] as const;

const BORDER_UNIT_SELECT_TRIGGER_CLASS =
  "h-8 w-12 justify-center rounded-sm border border-dashed border-border-70 bg-sidebar px-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground focus:ring-0 focus:ring-offset-0";

const BORDER_STYLE_SELECT_TRIGGER_CLASS =
  "h-8 w-full border border-dashed border-border-70 bg-sidebar px-2 text-xs hover:border-border focus:ring-0 focus:ring-offset-0";

type CornerKey =
  | "borderTopLeftRadius"
  | "borderTopRightRadius"
  | "borderBottomRightRadius"
  | "borderBottomLeftRadius";

type BorderSectionStyleKey =
  | "borderWidth"
  | "borderColor"
  | "borderStyle"
  | "borderRadius"
  | CornerKey;

const BORDER_SECTION_STYLE_KEYS = [
  "borderWidth",
  "borderColor",
  "borderStyle",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const satisfies readonly BorderSectionStyleKey[];

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { styleTarget } = useInspectorStyleTargetWithGlobalDefaults({
  propertySave,
});
const borderOverrides = useInspectorPropertyOverrides({
  propertyKeys: BORDER_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();

const borderWidthValue = ref("1");
const borderWidthUnit = ref<(typeof BORDER_WIDTH_UNITS)[number]>("px");
const borderColor = ref("transparent");
const borderStyle = ref<BorderStyle>("solid");
const isLinked = ref(true);
const topLeft = ref("0");
const topRight = ref("0");
const bottomRight = ref("0");
const bottomLeft = ref("0");
const linkedRadiusInput = ref("0");
const validationError = ref<string | null>(null);
const internalOpen = ref(props.defaultOpen);

type BorderPreviewUpdates = Partial<
  Record<BorderSectionStyleKey, string | undefined>
>;

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);
const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});
const defaultBorder = computed<BorderValue>(() => {
  const fallback: BorderValue = {
    borderWidth: { base: "0" },
    borderStyle: { base: "solid" },
    borderColor: { base: "transparent" },
  };

  return (getDefault("border") as BorderValue) ?? fallback;
});

const defaultCorner = computed<CornerValue>(() => {
  const fallback: CornerValue = {
    borderRadius: { base: "0" },
  };

  return (getDefault("corner") as CornerValue) ?? fallback;
});

const borderPreviewQueue = useStylePreviewQueue<
  Record<BorderSectionStyleKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncBorderValues,
});

const borderScrubSession = usePointerScrubSession();

function getResponsiveStyleMap(
  propertyName: BorderSectionStyleKey,
): Record<string, string | undefined> {
  return styleTarget.getResponsiveStyleMap(propertyName);
}

function getStyleValue(key: BorderSectionStyleKey, fallback: string): string {
  return (
    styleTarget.getStyleValue(key, fallback, breakpointName.value) ?? fallback
  );
}

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function parseBorderWidthValue(value: string): {
  value: string;
  unit: (typeof BORDER_WIDTH_UNITS)[number];
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?[\d.]+)([a-z%]+)?$/i);

  if (!match) {
    return {
      value: trimmed || "0",
      unit: "px",
    };
  }

  const nextUnit = match[2]?.toLowerCase();

  return {
    value: match[1] || "0",
    unit: BORDER_WIDTH_UNITS.includes(
      nextUnit as (typeof BORDER_WIDTH_UNITS)[number],
    )
      ? (nextUnit as (typeof BORDER_WIDTH_UNITS)[number])
      : "px",
  };
}

function buildBorderWidthValue(value: string, unit: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return `0${unit}`;
  }

  if (/^-?[\d.]+$/.test(trimmed)) {
    return `${trimmed}${unit}`;
  }

  return trimmed;
}

function normalizeRadius(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "0";

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${Math.round(Number(trimmed))}px`;
  }

  return trimmed;
}

function parseRadiusNumber(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRadiusInput(value: string): string {
  const parsed = parseRadiusNumber(value);
  if (parsed == null) {
    return value;
  }

  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

function syncBorderValues(): void {
  const parsedBorderWidth = parseBorderWidthValue(
    getStyleValue("borderWidth", "1px"),
  );
  borderWidthValue.value = parsedBorderWidth.value;
  borderWidthUnit.value = parsedBorderWidth.unit;
  borderColor.value = getStyleValue("borderColor", "transparent");

  const style = getStyleValue("borderStyle", "solid");
  if (BORDER_STYLE_OPTIONS.includes(style as BorderStyle)) {
    borderStyle.value = style as BorderStyle;
  } else {
    borderStyle.value = "solid";
  }

  topLeft.value = getStyleValue("borderTopLeftRadius", "0");
  topRight.value = getStyleValue("borderTopRightRadius", "0");
  bottomRight.value = getStyleValue("borderBottomRightRadius", "0");
  bottomLeft.value = getStyleValue("borderBottomLeftRadius", "0");

  isLinked.value =
    topLeft.value === topRight.value &&
    topLeft.value === bottomRight.value &&
    topLeft.value === bottomLeft.value;

  linkedRadiusInput.value = formatRadiusInput(topLeft.value);
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncBorderValues();
  },
  { deep: true, immediate: true },
);

function validateBorder(next: {
  borderWidth: string;
  borderColor: string;
  borderStyle: BorderStyle;
}): boolean {
  const candidate: BorderValue = {
    ...defaultBorder.value,
    borderWidth: {
      ...defaultBorder.value.borderWidth,
      [breakpointName.value]: next.borderWidth,
    },
    borderColor: {
      ...defaultBorder.value.borderColor,
      [breakpointName.value]: next.borderColor,
    },
    borderStyle: {
      ...defaultBorder.value.borderStyle,
      [breakpointName.value]: next.borderStyle,
    },
  };

  const result = safeParse("border", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidBorder");
    return false;
  }

  validationError.value = null;
  return true;
}

function validateCorners(next: Record<CornerKey, string>): boolean {
  const candidate: CornerValue = {
    ...defaultCorner.value,
    borderTopLeftRadius: {
      ...defaultCorner.value.borderTopLeftRadius,
      [breakpointName.value]: next.borderTopLeftRadius,
    },
    borderTopRightRadius: {
      ...defaultCorner.value.borderTopRightRadius,
      [breakpointName.value]: next.borderTopRightRadius,
    },
    borderBottomRightRadius: {
      ...defaultCorner.value.borderBottomRightRadius,
      [breakpointName.value]: next.borderBottomRightRadius,
    },
    borderBottomLeftRadius: {
      ...defaultCorner.value.borderBottomLeftRadius,
      [breakpointName.value]: next.borderBottomLeftRadius,
    },
  };

  const result = safeParse("corner", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidRadius");
    return false;
  }

  validationError.value = null;
  return true;
}

async function persistBorder(next: {
  borderWidth: string;
  borderColor: string;
  borderStyle: BorderStyle;
}): Promise<boolean> {
  if (!hasSaveContext()) return false;
  if (!validateBorder(next)) return false;

  const currentWidth = getStyleValue("borderWidth", "1px");
  const currentColor = getStyleValue("borderColor", "transparent");
  const currentStyle = getStyleValue("borderStyle", "solid");

  if (
    currentWidth === next.borderWidth &&
    currentColor === next.borderColor &&
    currentStyle === next.borderStyle
  ) {
    return true;
  }

  const success = await styleTarget.saveStyleProperties(
    {
      borderWidth: next.borderWidth,
      borderColor: next.borderColor,
      borderStyle: next.borderStyle,
    },
    props.currentItemType,
    props.currentItemSlug,
  );
  if (!success) return false;

  syncBorderValues();
  return true;
}

async function persistCorners(
  next: Record<CornerKey, string>,
): Promise<boolean> {
  if (!hasSaveContext()) return false;
  if (!validateCorners(next)) return false;

  const current = {
    borderTopLeftRadius: getStyleValue("borderTopLeftRadius", "0"),
    borderTopRightRadius: getStyleValue("borderTopRightRadius", "0"),
    borderBottomRightRadius: getStyleValue("borderBottomRightRadius", "0"),
    borderBottomLeftRadius: getStyleValue("borderBottomLeftRadius", "0"),
  };

  if (
    current.borderTopLeftRadius === next.borderTopLeftRadius &&
    current.borderTopRightRadius === next.borderTopRightRadius &&
    current.borderBottomRightRadius === next.borderBottomRightRadius &&
    current.borderBottomLeftRadius === next.borderBottomLeftRadius
  ) {
    return true;
  }

  const success = await styleTarget.saveStyleProperties(
    next,
    props.currentItemType,
    props.currentItemSlug,
  );
  if (!success) return false;

  syncBorderValues();
  return true;
}

async function persistBorderWidth(nextBorderWidth: string): Promise<boolean> {
  if (!hasSaveContext()) return false;

  const normalizedWidth = buildBorderWidthValue(
    parseBorderWidthValue(nextBorderWidth).value,
    parseBorderWidthValue(nextBorderWidth).unit,
  );

  const currentWidth = getStyleValue("borderWidth", "1px");
  if (currentWidth === normalizedWidth) {
    return true;
  }

  if (
    !validateBorder({
      borderWidth: normalizedWidth,
      borderColor: borderColor.value,
      borderStyle: borderStyle.value,
    })
  ) {
    return false;
  }

  const success = await styleTarget.saveStyleProperties(
    { borderWidth: normalizedWidth },
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    return false;
  }

  syncBorderValues();
  return true;
}

async function resetCurrentBreakpointBorder(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const success = await borderOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
  if (!success) return;

  syncBorderValues();
}

function buildBorderColorPreviewUpdates(
  nextColor: string,
): BorderPreviewUpdates {
  return {
    borderWidth: buildBorderWidthValue(
      borderWidthValue.value,
      borderWidthUnit.value,
    ),
    borderColor: nextColor.trim() || "transparent",
    borderStyle: borderStyle.value,
  };
}

function previewBorderColor(value: string): void {
  if (!hasSaveContext()) {
    return;
  }

  borderColor.value = value;
  queueBorderPreview(buildBorderColorPreviewUpdates(value));
}

async function persistBorderColor(value: string): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  flushPendingBorderPreview();
  borderColor.value = value;
  await persistBorder(buildBorderColorPreviewUpdates(value));
}

async function onWidthBlur(event: Event | string): Promise<void> {
  const nextWidth = buildBorderWidthValue(
    typeof event === "string"
      ? event
      : (event.target as HTMLInputElement).value,
    borderWidthUnit.value,
  );

  await persistBorderWidth(nextWidth);
}

async function onWidthUnitChange(value: unknown): Promise<void> {
  if (typeof value !== "string") return;
  if (
    !BORDER_WIDTH_UNITS.includes(value as (typeof BORDER_WIDTH_UNITS)[number])
  ) {
    return;
  }

  borderWidthUnit.value = value as (typeof BORDER_WIDTH_UNITS)[number];

  await persistBorder({
    borderWidth: buildBorderWidthValue(
      borderWidthValue.value,
      borderWidthUnit.value,
    ),
    borderColor: borderColor.value,
    borderStyle: borderStyle.value,
  });
}

async function onStyleChange(value: unknown): Promise<void> {
  if (typeof value !== "string") return;
  if (!BORDER_STYLE_OPTIONS.includes(value as BorderStyle)) return;

  await persistBorder({
    borderWidth: buildBorderWidthValue(
      borderWidthValue.value,
      borderWidthUnit.value,
    ),
    borderColor: borderColor.value,
    borderStyle: value as BorderStyle,
  });
}

async function onLinkedRadiusBlur(event: Event | string): Promise<void> {
  const value = normalizeRadius(
    typeof event === "string"
      ? event
      : (event.target as HTMLInputElement).value,
  );
  await persistCorners({
    borderTopLeftRadius: value,
    borderTopRightRadius: value,
    borderBottomRightRadius: value,
    borderBottomLeftRadius: value,
  });
}

async function onCornerBlur(
  key: CornerKey,
  event: Event | string,
): Promise<void> {
  const value = normalizeRadius(
    typeof event === "string"
      ? event
      : (event.target as HTMLInputElement).value,
  );
  await persistCorners({
    borderTopLeftRadius:
      key === "borderTopLeftRadius" ? value : normalizeRadius(topLeft.value),
    borderTopRightRadius:
      key === "borderTopRightRadius" ? value : normalizeRadius(topRight.value),
    borderBottomRightRadius:
      key === "borderBottomRightRadius"
        ? value
        : normalizeRadius(bottomRight.value),
    borderBottomLeftRadius:
      key === "borderBottomLeftRadius"
        ? value
        : normalizeRadius(bottomLeft.value),
  });
}

const onTopLeftBlur = (event: Event | string) =>
  onCornerBlur("borderTopLeftRadius", event);
const onTopRightBlur = (event: Event | string) =>
  onCornerBlur("borderTopRightRadius", event);
const onBottomRightBlur = (event: Event | string) =>
  onCornerBlur("borderBottomRightRadius", event);
const onBottomLeftBlur = (event: Event | string) =>
  onCornerBlur("borderBottomLeftRadius", event);

function setCornerRefValue(key: CornerKey, value: string): void {
  switch (key) {
    case "borderTopLeftRadius":
      topLeft.value = value;
      break;
    case "borderTopRightRadius":
      topRight.value = value;
      break;
    case "borderBottomRightRadius":
      bottomRight.value = value;
      break;
    case "borderBottomLeftRadius":
      bottomLeft.value = value;
      break;
  }
}

function getCurrentBreakpointBorderValue(
  key: BorderSectionStyleKey,
): string | undefined {
  return styleTarget.getResponsiveStyleMap(key)[breakpointName.value];
}

function cancelPendingBorderPreview(): void {
  borderPreviewQueue.cancel();
}

function flushPendingBorderPreview(): void {
  borderPreviewQueue.flush();
}

function queueBorderPreview(updates: BorderPreviewUpdates): void {
  borderPreviewQueue.queue(updates);
}

function restoreBorderPreview(updates: BorderPreviewUpdates): void {
  borderPreviewQueue.restore(updates);
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

function handleBorderWidthMouseDown(event: MouseEvent): void {
  if (!hasSaveContext()) return;

  const { startValue, unit } = resolveScrubOrigin(borderWidthValue.value);
  const previewUnit =
    borderWidthUnit.value || (unit as (typeof BORDER_WIDTH_UNITS)[number]);
  const originRawValues = {
    borderWidth: getCurrentBreakpointBorderValue("borderWidth"),
  };
  const originDisplayValue = getStyleValue("borderWidth", "1px");

  borderScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const displayValue = formatScrubDisplayValue(nextValue, previewUnit);
      borderWidthValue.value = displayValue;
      queueBorderPreview({
        borderWidth: buildBorderWidthValue(displayValue, previewUnit),
      });
    },
    onCancel: () => {
      restoreBorderPreview(originRawValues);
    },
    onCommit: () => {
      flushPendingBorderPreview();
      const finalValue = buildBorderWidthValue(
        borderWidthValue.value,
        previewUnit,
      );
      void persistBorderWidth(finalValue).then((success) => {
        if (!success) {
          borderWidthValue.value =
            parseBorderWidthValue(originDisplayValue).value;
          restoreBorderPreview(originRawValues);
        }
      });
    },
  });
}

function handleLinkedRadiusMouseDown(event: MouseEvent): void {
  if (!hasSaveContext()) return;

  const { startValue, unit } = resolveScrubOrigin(linkedRadiusInput.value);
  const originRawValues = {
    borderTopLeftRadius: getCurrentBreakpointBorderValue("borderTopLeftRadius"),
    borderTopRightRadius: getCurrentBreakpointBorderValue(
      "borderTopRightRadius",
    ),
    borderBottomRightRadius: getCurrentBreakpointBorderValue(
      "borderBottomRightRadius",
    ),
    borderBottomLeftRadius: getCurrentBreakpointBorderValue(
      "borderBottomLeftRadius",
    ),
  };
  const originDisplayValues = {
    borderTopLeftRadius: getStyleValue("borderTopLeftRadius", "0"),
    borderTopRightRadius: getStyleValue("borderTopRightRadius", "0"),
    borderBottomRightRadius: getStyleValue("borderBottomRightRadius", "0"),
    borderBottomLeftRadius: getStyleValue("borderBottomLeftRadius", "0"),
  };

  borderScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const displayValue = formatScrubDisplayValue(nextValue, unit);
      const normalizedValue = normalizeRadius(displayValue);

      linkedRadiusInput.value = displayValue;
      topLeft.value = displayValue;
      topRight.value = displayValue;
      bottomRight.value = displayValue;
      bottomLeft.value = displayValue;

      queueBorderPreview({
        borderTopLeftRadius: normalizedValue,
        borderTopRightRadius: normalizedValue,
        borderBottomRightRadius: normalizedValue,
        borderBottomLeftRadius: normalizedValue,
      });
    },
    onCancel: () => {
      restoreBorderPreview(originRawValues);
    },
    onCommit: () => {
      flushPendingBorderPreview();
      const normalizedValue = normalizeRadius(linkedRadiusInput.value);
      void persistCorners({
        borderTopLeftRadius: normalizedValue,
        borderTopRightRadius: normalizedValue,
        borderBottomRightRadius: normalizedValue,
        borderBottomLeftRadius: normalizedValue,
      }).then((success) => {
        if (!success) {
          topLeft.value = originDisplayValues.borderTopLeftRadius;
          topRight.value = originDisplayValues.borderTopRightRadius;
          bottomRight.value = originDisplayValues.borderBottomRightRadius;
          bottomLeft.value = originDisplayValues.borderBottomLeftRadius;
          linkedRadiusInput.value = formatRadiusInput(
            originDisplayValues.borderTopLeftRadius,
          );
          restoreBorderPreview(originRawValues);
        }
      });
    },
  });
}

function handleCornerMouseDown(key: CornerKey, event: MouseEvent): void {
  if (!hasSaveContext()) return;

  const cornerRefValue =
    key === "borderTopLeftRadius"
      ? topLeft.value
      : key === "borderTopRightRadius"
        ? topRight.value
        : key === "borderBottomRightRadius"
          ? bottomRight.value
          : bottomLeft.value;
  const { startValue, unit } = resolveScrubOrigin(cornerRefValue);
  const originRawValues = {
    [key]: getCurrentBreakpointBorderValue(key),
  } as BorderPreviewUpdates;
  const originDisplayValue =
    key === "borderTopLeftRadius"
      ? topLeft.value
      : key === "borderTopRightRadius"
        ? topRight.value
        : key === "borderBottomRightRadius"
          ? bottomRight.value
          : bottomLeft.value;

  borderScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const displayValue = formatScrubDisplayValue(nextValue, unit);
      setCornerRefValue(key, displayValue);
      queueBorderPreview({ [key]: normalizeRadius(displayValue) });
    },
    onCancel: () => {
      restoreBorderPreview(originRawValues);
    },
    onCommit: () => {
      flushPendingBorderPreview();
      const nextValue = normalizeRadius(
        key === "borderTopLeftRadius"
          ? topLeft.value
          : key === "borderTopRightRadius"
            ? topRight.value
            : key === "borderBottomRightRadius"
              ? bottomRight.value
              : bottomLeft.value,
      );
      void persistCorners({
        borderTopLeftRadius:
          key === "borderTopLeftRadius"
            ? nextValue
            : normalizeRadius(topLeft.value),
        borderTopRightRadius:
          key === "borderTopRightRadius"
            ? nextValue
            : normalizeRadius(topRight.value),
        borderBottomRightRadius:
          key === "borderBottomRightRadius"
            ? nextValue
            : normalizeRadius(bottomRight.value),
        borderBottomLeftRadius:
          key === "borderBottomLeftRadius"
            ? nextValue
            : normalizeRadius(bottomLeft.value),
      }).then((success) => {
        if (!success) {
          setCornerRefValue(key, originDisplayValue);
          restoreBorderPreview(originRawValues);
        }
      });
    },
  });
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="borderOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Border"
    icon="border"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="borderOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="borderOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen && borderOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="border-reset-breakpoint"
        @reset="void resetCurrentBreakpointBorder()"
      />
    </template>

    <div class="space-y-2 py-1">
      <div class="grid grid-cols-[72px_1fr] items-center">
        <label
          class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.border.color") }}</label
        >
        <ColorField
          v-model="borderColor"
          layout="unified"
          show-variables
          show-alpha
          show-design-colors
          content-side="left"
          content-align="center"
          class="min-w-0 w-full"
          data-testid="border-color-input"
          contrast-against="#ffffff"
          :disabled="isPanelDisabled"
          @preview="previewBorderColor"
          @update:model-value="borderColor = $event"
          @commit="persistBorderColor"
        />
      </div>

      <div class="grid grid-cols-[72px_1fr] gap-0 items-start">
        <label
          class="mt-3 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.border.size") }}</label
        >
        <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.strokeCenter, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="borderWidthValue"
              data-testid="border-width-input"
              @commit="onWidthBlur"
              @mousedown="handleBorderWidthMouseDown"
              :placeholder="t('inspector.border.width')"
              class="w-full"
              input-class="h-8 w-full pl-8 bg-sidebar border-border-70 border-dashed text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>

          <Select
            :model-value="borderWidthUnit"
            @update:model-value="onWidthUnitChange"
          >
            <SelectTrigger
              hide-icon
              :class="BORDER_UNIT_SELECT_TRIGGER_CLASS"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="end"
              class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
            >
              <SelectItem
                v-for="unit in BORDER_WIDTH_UNITS"
                :key="unit"
                :value="unit"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ unit }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.border.type") }}</label
        >
        <div>
          <Select
            :model-value="borderStyle"
            @update:model-value="onStyleChange"
          >
            <SelectTrigger :class="BORDER_STYLE_SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{{ t("inspector.border.style.none") }}</SelectItem>
              <SelectItem value="hidden">{{ t("inspector.border.style.hidden") }}</SelectItem>
              <SelectItem value="solid">{{ t("inspector.border.style.solid") }}</SelectItem>
              <SelectItem value="dashed">{{ t("inspector.border.style.dashed") }}</SelectItem>
              <SelectItem value="dotted">{{ t("inspector.border.style.dotted") }}</SelectItem>
              <SelectItem value="double">{{ t("inspector.border.style.double") }}</SelectItem>
              <SelectItem value="groove">{{ t("inspector.border.style.groove") }}</SelectItem>
              <SelectItem value="ridge">{{ t("inspector.border.style.ridge") }}</SelectItem>
              <SelectItem value="inset">{{ t("inspector.border.style.inset") }}</SelectItem>
              <SelectItem value="outset">{{ t("inspector.border.style.outset") }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
            >{{ t("inspector.border.radius") }}</label
          >

          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted transition-colors"
            :class="
              isLinked ? 'bg-muted text-foreground' : 'text-muted-foreground'
            "
            :disabled="isPanelDisabled"
            @click.stop="isLinked = !isLinked"
          >
            <span
              aria-hidden="true"
              class="size-3.5 shrink-0"
              :class="isLinked  ? studioIcons.link : studioIcons.unlink02"
            />
          </button>
        </div>

        <div v-if="isLinked" class="grid grid-cols-1 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.rounding, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="linkedRadiusInput"
              data-testid="border-linked-radius-input"
              @commit="onLinkedRadiusBlur"
              @mousedown="handleLinkedRadiusMouseDown"
              :placeholder="t('inspector.border.radius')"
              input-class="h-8 w-full pl-8 bg-sidebar border-border-70 border-dashed text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpLeft, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="topLeft"
              data-testid="border-top-left-radius-input"
              @commit="onTopLeftBlur"
              @mousedown="
                (event: MouseEvent) =>
                  handleCornerMouseDown('borderTopLeftRadius', event)
              "
              :placeholder="t('inspector.border.topLeft')"
              input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="topRight"
              data-testid="border-top-right-radius-input"
              @commit="onTopRightBlur"
              @mousedown="
                (event: MouseEvent) =>
                  handleCornerMouseDown('borderTopRightRadius', event)
              "
              :placeholder="t('inspector.border.topRight')"
              input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowDownRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="bottomRight"
              data-testid="border-bottom-right-radius-input"
              @commit="onBottomRightBlur"
              @mousedown="
                (event: MouseEvent) =>
                  handleCornerMouseDown('borderBottomRightRadius', event)
              "
              :placeholder="t('inspector.border.bottomRight')"
              input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowDownLeft, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="bottomLeft"
              data-testid="border-bottom-left-radius-input"
              @commit="onBottomLeftBlur"
              @mousedown="
                (event: MouseEvent) =>
                  handleCornerMouseDown('borderBottomLeftRadius', event)
              "
              :placeholder="t('inspector.border.bottomLeft')"
              input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
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
