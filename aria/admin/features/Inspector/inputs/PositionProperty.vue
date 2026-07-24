<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";

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
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import {
  DEFAULT_POSITION,
  PositionModeSchema,
  type PositionMode,
  type PositionValue,
} from "../schemas/position.schema";
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

const POSITION_KEYS = [
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
] as const;

type PositionKey = (typeof POSITION_KEYS)[number];
type PositionFieldKey = Exclude<PositionKey, "position">;
type PositionInsetKey = Exclude<PositionFieldKey, "zIndex">;
type PositionPreviewUpdates = Partial<
  Record<PositionFieldKey, string | undefined>
>;

const POSITION_MODE_OPTIONS: Array<{ value: PositionMode; label: string }> = [
  { value: "static", label: t("inspector.position.mode.static") },
  { value: "relative", label: t("inspector.position.mode.relative") },
  { value: "absolute", label: t("inspector.position.mode.absolute") },
  { value: "fixed", label: t("inspector.position.mode.fixed") },
  { value: "sticky", label: t("inspector.position.mode.sticky") },
];

const OFFSET_FIELDS: Array<{
  key: PositionInsetKey;
  label: string;
  iconClass: string;
  testId: string;
}> = [
  {
    key: "top",
    label: t("inspector.position.top"),
    iconClass: studioIcons.chevronUp,
    testId: "position-top-input",
  },
  {
    key: "right",
    label: t("inspector.position.right"),
    iconClass: studioIcons.chevronRight,
    testId: "position-right-input",
  },
  {
    key: "bottom",
    label: t("inspector.position.bottom"),
    iconClass: studioIcons.chevronDown,
    testId: "position-bottom-input",
  },
  {
    key: "left",
    label: t("inspector.position.left"),
    iconClass: studioIcons.chevronLeft,
    testId: "position-left-input",
  },
];

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const positionOverrides = useInspectorPropertyOverrides({
  propertyKeys: POSITION_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();

const internalOpen = ref(props.defaultOpen);
const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const positionMode = ref<PositionMode>("static");
const topValue = ref("auto");
const rightValue = ref("auto");
const bottomValue = ref("auto");
const leftValue = ref("auto");
const zIndexValue = ref("auto");
const validationError = ref<string | null>(null);

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

const defaultPosition = computed<PositionValue>(() => {
  const resolved = getDefault("position");
  return (resolved as PositionValue) ?? DEFAULT_POSITION;
});

const positionPreviewQueue = useStylePreviewQueue<
  Record<PositionFieldKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
});

const positionScrubSession = usePointerScrubSession();

const isInsetEditable = computed(() => positionMode.value !== "static");

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function getDefaultPositionValue(key: PositionKey, breakpoint: string): string {
  const defaults = defaultPosition.value[key];
  return (
    defaults?.[breakpoint] ?? defaults?.default ?? DEFAULT_POSITION[key].default
  );
}

function getStyleValue(key: PositionKey): string {
  return (
    styleTarget.getStyleValue(
      key,
      getDefaultPositionValue(key, breakpointName.value),
      breakpointName.value,
    ) ?? getDefaultPositionValue(key, breakpointName.value)
  );
}

function syncRefsFromTarget(): void {
  const nextPosition = PositionModeSchema.safeParse(getStyleValue("position"));

  positionMode.value = nextPosition.success ? nextPosition.data : "static";
  topValue.value = getStyleValue("top");
  rightValue.value = getStyleValue("right");
  bottomValue.value = getStyleValue("bottom");
  leftValue.value = getStyleValue("left");
  zIndexValue.value = getStyleValue("zIndex");
}

function getRefValue(key: PositionFieldKey): string {
  switch (key) {
    case "top":
      return topValue.value;
    case "right":
      return rightValue.value;
    case "bottom":
      return bottomValue.value;
    case "left":
      return leftValue.value;
    case "zIndex":
      return zIndexValue.value;
  }
}

function setRefValue(key: PositionFieldKey, value: string): void {
  switch (key) {
    case "top":
      topValue.value = value;
      break;
    case "right":
      rightValue.value = value;
      break;
    case "bottom":
      bottomValue.value = value;
      break;
    case "left":
      leftValue.value = value;
      break;
    case "zIndex":
      zIndexValue.value = value;
      break;
  }
}

function getCurrentBreakpointPositionValue(
  key: PositionFieldKey,
): string | undefined {
  return styleTarget.getResponsiveStyleMap(key)[breakpointName.value];
}

function cancelPendingPositionPreview(): void {
  positionPreviewQueue.cancel();
}

function flushPendingPositionPreview(): void {
  positionPreviewQueue.flush();
}

function queuePositionPreview(updates: PositionPreviewUpdates): void {
  positionPreviewQueue.queue(updates);
}

function restorePositionPreview(
  updates: PositionPreviewUpdates,
  displayValues?: Partial<Record<PositionFieldKey, string>>,
): void {
  positionPreviewQueue.restore(updates);

  if (displayValues) {
    for (const [key, value] of Object.entries(displayValues) as Array<
      [PositionFieldKey, string]
    >) {
      setRefValue(key, value);
    }
  }

  syncRefsFromTarget();
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncRefsFromTarget();
  },
  { deep: true, immediate: true },
);

function buildCandidate(
  nextKey: PositionKey,
  nextValue: string,
): PositionValue {
  const current: Record<PositionKey, string> = {
    position: positionMode.value,
    top: topValue.value,
    right: rightValue.value,
    bottom: bottomValue.value,
    left: leftValue.value,
    zIndex: zIndexValue.value,
  };

  current[nextKey] = nextValue;

  return {
    position: {
      ...defaultPosition.value.position,
      [breakpointName.value]: current.position,
    },
    top: {
      ...defaultPosition.value.top,
      [breakpointName.value]: current.top,
    },
    right: {
      ...defaultPosition.value.right,
      [breakpointName.value]: current.right,
    },
    bottom: {
      ...defaultPosition.value.bottom,
      [breakpointName.value]: current.bottom,
    },
    left: {
      ...defaultPosition.value.left,
      [breakpointName.value]: current.left,
    },
    zIndex: {
      ...defaultPosition.value.zIndex,
      [breakpointName.value]: current.zIndex,
    },
  };
}

function normalizePositionValue(
  key: PositionFieldKey,
  value: string,
): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("var(") || trimmed.startsWith("calc(")) {
    return trimmed;
  }

  if (key === "zIndex") {
    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric) && String(numeric) === trimmed) {
      return String(Math.round(numeric));
    }

    return trimmed;
  }

  if (["auto", "inherit", "initial", "unset", "revert"].includes(trimmed)) {
    return trimmed;
  }

  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return `${Math.round(numeric)}px`;
  }

  return trimmed;
}

async function savePositionMode(value: string): Promise<boolean> {
  if (!hasSaveContext()) {
    return false;
  }

  const parsed = PositionModeSchema.safeParse(value);
  if (!parsed.success) {
    validationError.value = t("inspector.validation.invalidPositionMode");
    return false;
  }

  const candidate = buildCandidate("position", parsed.data);
  const validation = safeParse("position", candidate);
  if (!validation.success) {
    validationError.value = t("inspector.validation.invalidPosition");
    return false;
  }

  validationError.value = null;
  positionMode.value = parsed.data;
  const success = await styleTarget.saveStyleProperty(
    "position",
    parsed.data,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    syncRefsFromTarget();
    return false;
  }

  return true;
}

async function savePositionField(
  key: PositionFieldKey,
  rawValue: string,
): Promise<boolean> {
  if (!hasSaveContext()) {
    return false;
  }

  const normalized = normalizePositionValue(key, rawValue);
  const nextValue =
    normalized ?? getDefaultPositionValue(key, breakpointName.value);
  const candidate = buildCandidate(key, nextValue);
  const validation = safeParse("position", candidate);

  if (!validation.success) {
    validationError.value = t("inspector.validation.invalidPosition");
    return false;
  }

  validationError.value = null;

  let success = false;

  if (normalized === undefined) {
    success = await styleTarget.clearStyleProperties(
      [key],
      props.currentItemType,
      props.currentItemSlug,
    );
  } else {
    success = await styleTarget.saveStyleProperty(
      key,
      normalized,
      props.currentItemType,
      props.currentItemSlug,
    );
  }

  if (!success) {
    syncRefsFromTarget();
    return false;
  }

  syncRefsFromTarget();
  return true;
}

function resolveScrubOrigin(
  key: PositionFieldKey,
  value: string,
): { startValue: number; unit: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);
  const fallbackUnit = key === "zIndex" ? "" : "px";

  if (!match) {
    return { startValue: 0, unit: fallbackUnit };
  }

  return {
    startValue: Number.parseFloat(match[1] ?? "0"),
    unit: match[2] ?? fallbackUnit,
  };
}

function formatScrubDisplayValue(value: number, unit: string): string {
  return unit ? `${value}${unit}` : String(value);
}

function handleMouseDown(key: PositionFieldKey, event: MouseEvent): void {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (!hasSaveContext()) {
    return;
  }

  const input = event.target;
  const { startValue, unit } = resolveScrubOrigin(key, input.value);
  const originRawValue = getCurrentBreakpointPositionValue(key);
  const originDisplayValue = getStyleValue(key);
  positionScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const formatted = formatScrubDisplayValue(nextValue, unit);

      setRefValue(key, formatted);
      queuePositionPreview({ [key]: normalizePositionValue(key, formatted) });
    },
    onCancel: () => {
      restorePositionPreview(
        { [key]: originRawValue },
        { [key]: originDisplayValue },
      );
    },
    onCommit: () => {
      flushPendingPositionPreview();

      const finalValue = getRefValue(key);
      void savePositionField(key, finalValue).then((success) => {
        if (!success) {
          restorePositionPreview(
            { [key]: originRawValue },
            { [key]: originDisplayValue },
          );
        }
      });
    },
  });
}

async function resetCurrentBreakpointPosition(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  await positionOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
}
</script>

<template>
  <BaseProperty
    title="Position"
    :open="sectionOpen"
    :defaultOpen="props.defaultOpen"
    :has-changes="positionOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="positionOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="
          positionOverrides.currentBreakpointLabel.value
        "
        :show-reset="
          sectionOpen && positionOverrides.hasCurrentBreakpointOverride.value
        "
        @reset="void resetCurrentBreakpointPosition()"
      />
    </template>

    <div class="space-y-3">
      <div class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
        <label
          class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {{ t("inspector.position.mode") }}
        </label>
        <Select
          data-testid="position-mode-select"
          :model-value="positionMode"
          :disabled="isPanelDisabled"
          @update:model-value="
            (value) => void savePositionMode(String(value ?? ''))
          "
        >
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in POSITION_MODE_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="field in OFFSET_FIELDS"
          :key="field.key"
          class="relative flex items-center"
        >
          <span
            :class="field.iconClass"
            class="pointer-events-none absolute left-2.5 z-10 size-3.5 text-muted-foreground/60"
          />
          <VariableAssignableInput
            :data-testid="field.testId"
            :model-value="
              field.key === 'top'
                ? topValue
                : field.key === 'right'
                  ? rightValue
                  : field.key === 'bottom'
                    ? bottomValue
                    : leftValue
            "
            :disabled="isPanelDisabled || !isInsetEditable"
            class="w-full"
            input-class="h-8 cursor-ew-resize border-dashed border-border-70 bg-sidebar pl-8 text-xs focus:cursor-text"
            :placeholder="field.label"
            @update:model-value="
              (value) => {
                const next = String(value);
                if (field.key === 'top') topValue = next;
                else if (field.key === 'right') rightValue = next;
                else if (field.key === 'bottom') bottomValue = next;
                else leftValue = next;
              }
            "
            @mousedown="
              (event: MouseEvent) => handleMouseDown(field.key, event)
            "
            @commit="
              (value) => void savePositionField(field.key, String(value))
            "
          />
        </div>
      </div>

      <div class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
        <label
          class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {{ t("inspector.position.zIndex") }}
        </label>
        <div class="relative flex items-center">
          <span
            class="pointer-events-none absolute left-2.5 z-10 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60"
          >
            Z
          </span>
          <VariableAssignableInput
            data-testid="position-z-index-input"
            :model-value="zIndexValue"
            :disabled="isPanelDisabled"
            class="w-full"
            input-class="h-8 cursor-ew-resize border-dashed border-border-70 bg-sidebar pl-7 text-xs focus:cursor-text"
            :placeholder="t('inspector.position.auto')"
            @update:model-value="(value) => (zIndexValue = String(value))"
            @mousedown="(event: MouseEvent) => handleMouseDown('zIndex', event)"
            @commit="(value) => void savePositionField('zIndex', String(value))"
          />
        </div>
      </div>

      <p v-if="validationError" class="text-xs text-destructive">
        {{ validationError }}
      </p>

      <p v-if="targetError" class="text-xs text-destructive">
        {{ targetError }}
      </p>
    </div>
  </BaseProperty>
</template>
