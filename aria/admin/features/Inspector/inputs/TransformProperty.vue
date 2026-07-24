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
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import {
  DEFAULT_TRANSFORM,
  TRANSFORM_DEFAULTS,
  cssToTransformState,
  hasUnsupportedTransformFunctions,
  transformOriginStateToCSS,
  transformStateToCSS,
  type TransformState,
  type TransformValue,
} from "../schemas/transform.schema";
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

const TRANSFORM_SECTION_STYLE_KEYS = ["transform", "transformOrigin"] as const;
const LINK_BUTTON_CLASS =
  "flex h-6 w-6 items-center justify-center rounded-sm border border-transparent text-foreground/70 transition-colors hover:border-border/70 hover:bg-sidebar/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 dark:text-muted-foreground dark:hover:text-foreground";
const PRESET_BUTTON_CLASS =
  "flex h-6 min-w-0 items-center justify-center rounded-sm border border-dashed border-border/70 bg-background/75 px-1 text-xs font-medium text-foreground/75 transition-colors hover:border-primary/55 hover:bg-sidebar/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-sidebar/55 dark:text-muted-foreground dark:hover:bg-sidebar/80 dark:hover:text-foreground";
const ACTIVE_PRESET_BUTTON_CLASS =
  "border-primary/70 bg-primary/10! text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.16)] dark:bg-primary/15!";
const STACKED_SECTION_CLASS = "space-y-2";
const AXIS_ROW_CLASS =
  "grid grid-cols-[1fr_auto_1fr] items-center gap-2";
const SECTION_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const SCRUB_INPUT_CLASS =
  "h-8 w-full pl-8 bg-background/75 border-border/70 border-dashed text-xs text-foreground placeholder:text-muted-foreground/75 cursor-ew-resize focus:cursor-text hover:border-border focus-visible:border-primary/50 focus-visible:bg-sidebar/70 focus-visible:ring-1 focus-visible:ring-primary/25 dark:bg-sidebar/55";
const AXIS_LABEL_CLASS =
  "pointer-events-none absolute left-2.5 z-10 size-3.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/50 dark:text-muted-foreground/60";
const ORIGIN_PRESET_CLASS =
  "flex size-6 items-center justify-center rounded-sm border border-dashed border-border/70 bg-background/75 text-foreground/70 transition-colors hover:border-primary/55 hover:bg-sidebar/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-sidebar/55 dark:text-muted-foreground dark:hover:text-foreground";
const ORIGIN_SPLIT_CLASS =
  "grid grid-cols-[auto_1fr] items-start gap-2";
const ORIGIN_AXIS_STACK_CLASS = "flex min-w-0 flex-col gap-2";

type TransformFieldKey =
  | "translateX"
  | "translateY"
  | "rotate"
  | "scaleX"
  | "scaleY"
  | "skewX"
  | "skewY";

type OriginFieldKey = "originX" | "originY";

type TransformStyleKey = (typeof TRANSFORM_SECTION_STYLE_KEYS)[number];

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const transformOverrides = useInspectorPropertyOverrides({
  propertyKeys: TRANSFORM_SECTION_STYLE_KEYS,
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

const translateX = ref(TRANSFORM_DEFAULTS.translateX);
const translateY = ref(TRANSFORM_DEFAULTS.translateY);
const rotate = ref(TRANSFORM_DEFAULTS.rotate);
const scaleX = ref(TRANSFORM_DEFAULTS.scaleX);
const scaleY = ref(TRANSFORM_DEFAULTS.scaleY);
const skewX = ref(TRANSFORM_DEFAULTS.skewX);
const skewY = ref(TRANSFORM_DEFAULTS.skewY);
const originX = ref(TRANSFORM_DEFAULTS.originX);
const originY = ref(TRANSFORM_DEFAULTS.originY);

const linkTranslate = ref(true);
const linkScale = ref(true);
const linkSkew = ref(true);
const validationError = ref<string | null>(null);

const transformPreviewQueue = useStylePreviewQueue<
  Record<(typeof TRANSFORM_SECTION_STYLE_KEYS)[number], string>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
});

const transformScrubSession = usePointerScrubSession();

const defaultTransform = computed<TransformValue>(() => {
  return (getDefault("transform") as TransformValue) ?? DEFAULT_TRANSFORM;
});

const currentTransformValue = computed(
  () =>
    styleTarget.getStyleValue("transform", "none", breakpointName.value) ??
    "none",
);

const currentTransformOriginValue = computed(
  () =>
    styleTarget.getStyleValue(
      "transformOrigin",
      "center center",
      breakpointName.value,
    ) ?? "center center",
);

const unsupportedTransformMessage = computed(() => {
  if (!hasUnsupportedTransformFunctions(currentTransformValue.value)) {
    return null;
  }

  return t("inspector.transform.unsupported");
});

const previewTransformCss = computed(() =>
  transformStateToCSS(getCurrentState()),
);
const previewOriginCss = computed(() =>
  transformOriginStateToCSS(getCurrentState()),
);
const previewOriginAnchorStyle = computed(() => ({
  left: resolveOriginPreviewOffset(originX.value, "x"),
  top: resolveOriginPreviewOffset(originY.value, "y"),
}));
const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function getCurrentState(): TransformState {
  return {
    translateX: translateX.value,
    translateY: translateY.value,
    rotate: rotate.value,
    scaleX: scaleX.value,
    scaleY: scaleY.value,
    skewX: skewX.value,
    skewY: skewY.value,
    originX: originX.value,
    originY: originY.value,
  };
}

function resolveOriginPreviewOffset(value: string, axis: "x" | "y"): string {
  const normalized = value.trim().toLowerCase();
  const keywordOffsets =
    axis === "x"
      ? { left: "0%", center: "50%", right: "100%" }
      : { top: "0%", center: "50%", bottom: "100%" };

  return (
    keywordOffsets[normalized as keyof typeof keywordOffsets] ??
    (normalized || "50%")
  );
}

function applyState(state: TransformState): void {
  translateX.value = state.translateX;
  translateY.value = state.translateY;
  rotate.value = state.rotate;
  scaleX.value = state.scaleX;
  scaleY.value = state.scaleY;
  skewX.value = state.skewX;
  skewY.value = state.skewY;
  originX.value = state.originX;
  originY.value = state.originY;

  linkTranslate.value = state.translateX === state.translateY;
  linkScale.value = state.scaleX === state.scaleY;
  linkSkew.value = state.skewX === state.skewY;
}

function syncRefsFromTarget(): void {
  applyState(
    cssToTransformState(
      currentTransformValue.value,
      currentTransformOriginValue.value,
    ),
  );
}

function buildCandidate(state: TransformState): TransformValue {
  return {
    ...defaultTransform.value,
    transform: {
      ...defaultTransform.value.transform,
      [breakpointName.value]: transformStateToCSS(state),
    },
    transformOrigin: {
      ...defaultTransform.value.transformOrigin,
      [breakpointName.value]: transformOriginStateToCSS(state),
    },
  };
}

function validateTransform(state: TransformState): boolean {
  const result = safeParse("transform", buildCandidate(state));
  if (!("success" in result) || !result.success) {
    validationError.value = t("inspector.validation.invalidTransform");
    return false;
  }

  validationError.value = null;
  return true;
}

function buildTransformStyleUpdates(
  state: TransformState,
  keys: readonly TransformStyleKey[],
): Record<string, string> {
  const updates: Record<string, string> = {};

  for (const key of keys) {
    if (key === "transform") {
      updates.transform = transformStateToCSS(state);
    } else if (key === "transformOrigin") {
      updates.transformOrigin = transformOriginStateToCSS(state);
    }
  }

  return updates;
}

async function saveTransformState(
  state: TransformState,
  keys: readonly TransformStyleKey[] = TRANSFORM_SECTION_STYLE_KEYS,
): Promise<boolean> {
  if (!hasSaveContext()) {
    return false;
  }

  if (!validateTransform(state)) {
    return false;
  }

  const beforeSaveState = getCurrentState();
  const success = await styleTarget.saveStyleProperties(
    buildTransformStyleUpdates(state, keys),
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    restorePreview(beforeSaveState);
    return false;
  }

  return true;
}

function getMirrorKey(key: TransformFieldKey): TransformFieldKey | null {
  switch (key) {
    case "translateX":
      return linkTranslate.value ? "translateY" : null;
    case "translateY":
      return linkTranslate.value ? "translateX" : null;
    case "scaleX":
      return linkScale.value ? "scaleY" : null;
    case "scaleY":
      return linkScale.value ? "scaleX" : null;
    case "skewX":
      return linkSkew.value ? "skewY" : null;
    case "skewY":
      return linkSkew.value ? "skewX" : null;
    default:
      return null;
  }
}

function setTransformField(key: TransformFieldKey, value: string): void {
  switch (key) {
    case "translateX":
      translateX.value = value;
      break;
    case "translateY":
      translateY.value = value;
      break;
    case "rotate":
      rotate.value = value;
      break;
    case "scaleX":
      scaleX.value = value;
      break;
    case "scaleY":
      scaleY.value = value;
      break;
    case "skewX":
      skewX.value = value;
      break;
    case "skewY":
      skewY.value = value;
      break;
  }
}

function setOriginField(key: OriginFieldKey, value: string): void {
  if (key === "originX") {
    originX.value = value;
    return;
  }

  originY.value = value;
}

async function saveTransformField(
  key: TransformFieldKey,
  value: string,
): Promise<void> {
  setTransformField(key, value);
  const mirrorKey = getMirrorKey(key);
  if (mirrorKey) {
    setTransformField(mirrorKey, value);
  }
  await saveTransformState(getCurrentState(), ["transform"]);
}

async function saveOriginField(
  key: OriginFieldKey,
  value: string,
): Promise<void> {
  setOriginField(key, value);
  await saveTransformState(getCurrentState(), ["transformOrigin"]);
}

function cancelPendingPreview(): void {
  transformPreviewQueue.cancel();
}

function flushPendingPreview(): void {
  transformPreviewQueue.flush();
}

function queuePreview(state: TransformState): void {
  transformPreviewQueue.queue({
    transform: transformStateToCSS(state),
    transformOrigin: transformOriginStateToCSS(state),
  });
}

function restorePreview(state: TransformState): void {
  applyState(state);
  transformPreviewQueue.restore({
    transform: transformStateToCSS(state),
    transformOrigin: transformOriginStateToCSS(state),
  });
}

function toggleLink(kind: "translate" | "scale" | "skew"): void {
  if (kind === "translate") {
    linkTranslate.value = !linkTranslate.value;
    if (linkTranslate.value) {
      translateY.value = translateX.value;
      void saveTransformState(getCurrentState(), ["transform"]);
    }
    return;
  }

  if (kind === "scale") {
    linkScale.value = !linkScale.value;
    if (linkScale.value) {
      scaleY.value = scaleX.value;
      void saveTransformState(getCurrentState(), ["transform"]);
    }
    return;
  }

  linkSkew.value = !linkSkew.value;
  if (linkSkew.value) {
    skewY.value = skewX.value;
    void saveTransformState(getCurrentState(), ["transform"]);
  }
}

function resolveScrubConfig(key: TransformFieldKey): {
  defaultValue: number;
  unit: string;
  step: number;
} {
  switch (key) {
    case "translateX":
    case "translateY":
      return { defaultValue: 0, unit: "px", step: 1 };
    case "rotate":
    case "skewX":
    case "skewY":
      return { defaultValue: 0, unit: "deg", step: 1 };
    case "scaleX":
    case "scaleY":
      return { defaultValue: 1, unit: "", step: 0.01 };
  }
}

function parseScrubOrigin(
  value: string,
  defaultValue: number,
  unit: string,
): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return defaultValue;
  }

  const match = unit
    ? trimmed.match(new RegExp(`^(-?\\d+(?:\\.\\d+)?)(?:${unit})?$`, "i"))
    : trimmed.match(/^(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return defaultValue;
  }

  const parsed = Number.parseFloat(match[1] ?? String(defaultValue));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function formatScrubValue(value: number, unit: string): string {
  if (!unit) {
    return String(Number.parseFloat(value.toFixed(2)));
  }

  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded}${unit}`;
}

function handleMouseDown(key: TransformFieldKey, event: MouseEvent): void {
  if (!(event.target instanceof HTMLInputElement) || event.button !== 0) {
    return;
  }

  const originState = getCurrentState();
  const { defaultValue, unit, step } = resolveScrubConfig(key);
  const startValue = parseScrubOrigin(originState[key], defaultValue, unit);
  const mirrorKey = getMirrorKey(key);
  transformScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = startValue + deltaX * step;
      const displayValue = formatScrubValue(nextValue, unit);
      setTransformField(key, displayValue);
      if (mirrorKey) {
        setTransformField(mirrorKey, displayValue);
      }
      queuePreview(getCurrentState());
    },
    onCancel: () => {
      restorePreview(originState);
    },
    onCommit: () => {
      flushPendingPreview();
      void saveTransformState(getCurrentState(), ["transform"]).then((success) => {
        if (!success) {
          restorePreview(originState);
        }
      });
    },
  });
}

async function setOriginPreset(
  nextOriginX: string,
  nextOriginY: string,
): Promise<void> {
  originX.value = nextOriginX;
  originY.value = nextOriginY;
  await saveTransformState(getCurrentState(), ["transformOrigin"]);
}

async function resetCurrentBreakpointTransform(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  await transformOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
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
</script>

<template>
  <BaseProperty
    title="Transform"
    :open="sectionOpen"
    :defaultOpen="props.defaultOpen"
    :has-changes="transformOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="transformOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="
          transformOverrides.currentBreakpointLabel.value
        "
        :show-reset="
          sectionOpen && transformOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="transform-reset-breakpoint"
        @reset="void resetCurrentBreakpointTransform()"
      />
    </template>

    <div class="space-y-3">
      <div
        class="rounded-md border border-border/70 bg-background/65 p-3 shadow-[inset_0_0_0_1px_rgb(var(--color-foreground)/0.02)] dark:bg-sidebar/30"
        data-testid="transform-preview-shell"
      >
        <div class="mb-2">
          <span
            class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {{ t("inspector.transform.preview") }}
          </span>
        </div>
        <div
          class="relative h-28 overflow-hidden rounded-md border border-dashed border-border/70 bg-sidebar/70 shadow-inner dark:bg-background/25"
          data-testid="transform-preview-stage"
        >
          <div
            aria-hidden="true"
            class="absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-border/70"
          />
          <div
            aria-hidden="true"
            class="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-border/70"
          />
          <div
            aria-hidden="true"
            class="absolute inset-4 grid grid-cols-3 grid-rows-3"
          >
            <span
              v-for="dotIndex in 9"
              :key="`transform-preview-origin-dot-${dotIndex}`"
              class="m-auto size-1 rounded-full bg-muted-foreground/35"
            />
          </div>
          <div
            class="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              class="relative z-10 size-10 rounded-sm border border-primary/35 bg-primary/16 shadow-[0_10px_24px_rgb(var(--color-primary)/0.12)] transition-transform dark:bg-primary/18"
              data-testid="transform-preview-subject"
              :style="{
                transform: previewTransformCss,
                transformOrigin: previewOriginCss,
              }"
            >
              <span
                aria-hidden="true"
                class="absolute z-20 size-2.5 rounded-full border border-background bg-primary shadow-[0_0_0_2px_rgb(var(--color-primary)/0.22)] dark:border-sidebar"
                data-testid="transform-preview-origin-anchor"
                :style="{
                  ...previewOriginAnchorStyle,
                  transform: 'translate(-50%, -50%)',
                }"
              />
            </div>
          </div>
        </div>
      </div>

      <div :class="STACKED_SECTION_CLASS">
        <span :class="SECTION_LABEL_CLASS">{{ t("inspector.transform.translate") }}</span>
        <div :class="AXIS_ROW_CLASS">
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">X</span>
            <VariableAssignableInput
              data-testid="transform-translate-x-input"
              :model-value="translateX"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="0px"
              @update:model-value="(value) => (translateX = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('translateX', event)
              "
              @commit="
                (value) =>
                  void saveTransformField('translateX', String(value))
              "
            />
          </div>
          <button
            data-testid="transform-translate-link-toggle"
            type="button"
            :class="[
              LINK_BUTTON_CLASS,
              linkTranslate
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground',
            ]"
            :disabled="isPanelDisabled"
            :title="t('inspector.transform.linkAxes')"
            @click="toggleLink('translate')"
          >
            <span
              aria-hidden="true"
              class="size-3.5 shrink-0"
              :class="linkTranslate ? studioIcons.link : studioIcons.unlink02"
            />
          </button>
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">Y</span>
            <VariableAssignableInput
              data-testid="transform-translate-y-input"
              :model-value="translateY"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="0px"
              @update:model-value="(value) => (translateY = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('translateY', event)
              "
              @commit="
                (value) => void saveTransformField('translateY', String(value))
              "
            />
          </div>
        </div>
      </div>

      <div :class="STACKED_SECTION_CLASS">
        <span :class="SECTION_LABEL_CLASS">{{ t("inspector.transform.rotate") }}</span>
        <div class="space-y-2">
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">R</span>
            <VariableAssignableInput
              data-testid="transform-rotate-input"
              :model-value="rotate"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="0deg"
              @update:model-value="(value) => (rotate = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('rotate', event)
              "
              @commit="
                (value) => void saveTransformField('rotate', String(value))
              "
            />
          </div>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="preset in ['0deg', '45deg', '90deg', '180deg']"
              :key="preset"
              type="button"
              :class="[
                PRESET_BUTTON_CLASS,
                rotate === preset && ACTIVE_PRESET_BUTTON_CLASS,
              ]"
              :disabled="isPanelDisabled"
              @click="
                rotate = preset;
                void saveTransformField('rotate', preset);
              "
            >
              {{ preset.replace("deg", "") }}
            </button>
          </div>
        </div>
      </div>

      <div :class="STACKED_SECTION_CLASS">
        <span :class="SECTION_LABEL_CLASS">{{ t("inspector.transform.scale") }}</span>
        <div :class="AXIS_ROW_CLASS">
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">X</span>
            <VariableAssignableInput
              data-testid="transform-scale-x-input"
              :model-value="scaleX"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="1"
              @update:model-value="(value) => (scaleX = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('scaleX', event)
              "
              @commit="
                (value) => void saveTransformField('scaleX', String(value))
              "
            />
          </div>
          <button
            data-testid="transform-scale-link-toggle"
            type="button"
            :class="[
              LINK_BUTTON_CLASS,
              linkScale
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground',
            ]"
            :disabled="isPanelDisabled"
            :title="t('inspector.transform.linkAxes')"
            @click="toggleLink('scale')"
          >
            <span
              aria-hidden="true"
              class="size-3.5 shrink-0"
              :class="linkScale ? studioIcons.link : studioIcons.unlink02"
            />
          </button>
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">Y</span>
            <VariableAssignableInput
              data-testid="transform-scale-y-input"
              :model-value="scaleY"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="1"
              @update:model-value="(value) => (scaleY = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('scaleY', event)
              "
              @commit="
                (value) => void saveTransformField('scaleY', String(value))
              "
            />
          </div>
        </div>
      </div>

      <div :class="STACKED_SECTION_CLASS">
        <span :class="SECTION_LABEL_CLASS">{{ t("inspector.transform.skew") }}</span>
        <div :class="AXIS_ROW_CLASS">
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">X</span>
            <VariableAssignableInput
              data-testid="transform-skew-x-input"
              :model-value="skewX"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="0deg"
              @update:model-value="(value) => (skewX = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('skewX', event)
              "
              @commit="
                (value) => void saveTransformField('skewX', String(value))
              "
            />
          </div>
          <button
            data-testid="transform-skew-link-toggle"
            type="button"
            :class="[
              LINK_BUTTON_CLASS,
              linkSkew ? 'bg-muted text-foreground' : 'text-muted-foreground',
            ]"
            :disabled="isPanelDisabled"
            :title="t('inspector.transform.linkAxes')"
            @click="toggleLink('skew')"
          >
            <span
              aria-hidden="true"
              class="size-3.5 shrink-0"
              :class="linkSkew ? studioIcons.link : studioIcons.unlink02"
            />
          </button>
          <div class="relative flex items-center">
            <span :class="AXIS_LABEL_CLASS">Y</span>
            <VariableAssignableInput
              data-testid="transform-skew-y-input"
              :model-value="skewY"
              :disabled="isPanelDisabled"
              class="w-full"
              :input-class="SCRUB_INPUT_CLASS"
              placeholder="0deg"
              @update:model-value="(value) => (skewY = String(value))"
              @mousedown="
                (event: MouseEvent) => handleMouseDown('skewY', event)
              "
              @commit="
                (value) => void saveTransformField('skewY', String(value))
              "
            />
          </div>
        </div>
      </div>

      <div :class="STACKED_SECTION_CLASS">
        <span :class="SECTION_LABEL_CLASS">{{ t("inspector.transform.origin") }}</span>
        <div :class="ORIGIN_SPLIT_CLASS">
          <div class="inline-grid grid-cols-3 gap-1">
            <button
              v-for="preset in [
                ['left', 'top'],
                ['center', 'top'],
                ['right', 'top'],
                ['left', 'center'],
                ['center', 'center'],
                ['right', 'center'],
                ['left', 'bottom'],
                ['center', 'bottom'],
                ['right', 'bottom'],
              ]"
              :key="preset.join('-')"
              :data-testid="`transform-origin-${preset.join('-')}`"
              type="button"
              :class="[
                ORIGIN_PRESET_CLASS,
                originX === preset[0] &&
                  originY === preset[1] &&
                  ACTIVE_PRESET_BUTTON_CLASS,
              ]"
              :disabled="isPanelDisabled"
              @click="void setOriginPreset(preset[0], preset[1])"
            >
              <span class="size-1.5 rounded-full bg-current opacity-80" />
            </button>
          </div>
          <div :class="ORIGIN_AXIS_STACK_CLASS">
            <div class="relative flex items-center">
              <span :class="AXIS_LABEL_CLASS">X</span>
              <VariableAssignableInput
                data-testid="transform-origin-x-input"
                :model-value="originX"
                :disabled="isPanelDisabled"
                class="w-full"
                :input-class="SCRUB_INPUT_CLASS"
                :placeholder="t('inspector.transform.center')"
                @update:model-value="(value) => (originX = String(value))"
                @commit="
                  (value) => void saveOriginField('originX', String(value))
                "
              />
            </div>
            <div class="relative flex items-center">
              <span :class="AXIS_LABEL_CLASS">Y</span>
              <VariableAssignableInput
                data-testid="transform-origin-y-input"
                :model-value="originY"
                :disabled="isPanelDisabled"
                class="w-full"
                :input-class="SCRUB_INPUT_CLASS"
                :placeholder="t('inspector.transform.center')"
                @update:model-value="(value) => (originY = String(value))"
                @commit="
                  (value) => void saveOriginField('originY', String(value))
                "
              />
            </div>
          </div>
        </div>
      </div>

      <p
        v-if="unsupportedTransformMessage"
        class="text-xs text-muted-foreground"
      >
        {{ unsupportedTransformMessage }}
      </p>

      <p v-if="validationError" class="text-xs text-destructive">
        {{ validationError }}
      </p>

      <p v-if="targetError" class="text-xs text-destructive">
        {{ targetError }}
      </p>
    </div>
  </BaseProperty>
</template>
