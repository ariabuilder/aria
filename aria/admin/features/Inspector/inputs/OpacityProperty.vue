<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, onMounted, ref, watchEffect } from "vue";
import { z } from "zod";
import BaseProperty from "./BaseProperty.vue";
import { Slider } from "@/components/ui/slider";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { useGlobalStyles } from "../../Design/composables/useGlobalStyles";
import { usePropertySave } from "../../Core";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import {
  buildOpacityVariableReferenceOptions,
  extractVariableReferenceKey,
  isOpacityCompatibleVariableKey,
} from "../../../lib/variableReferences";
import type { VisibilityValue } from "../schemas/visibility.schema";
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

const VARIABLE_INPUT_CLASS =
  "h-9 bg-sidebar border-dashed border-border-70 text-xs";

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { globalStyles, loadGlobalStyles } = useGlobalStyles();

onMounted(() => {
  void loadGlobalStyles();
});

const opacityVariableOptions = computed(() =>
  buildOpacityVariableReferenceOptions(globalStyles.value.variables),
);
const styleTarget = useInspectorStyleTarget({ propertySave });
const opacityOverrides = useInspectorPropertyOverrides({
  propertyKeys: ["opacity"] as const,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();
const opacityCSSValue = ref("1");
const opacityPercentage = ref(100);
const validationError = ref<string | null>(null);
const internalOpen = ref(props.defaultOpen);
const previewOriginOpacity = ref<string | undefined | null>(null);

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);
const opacityInspectorError = computed(
  () => validationError.value ?? targetError.value ?? null,
);

const isOpacityVariable = computed(
  () => extractVariableReferenceKey(opacityCSSValue.value) !== null,
);
const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const defaultVisibility = computed<VisibilityValue>(() => {
  const fallback: VisibilityValue = {
    display: { base: "block" },
    visibility: { base: "visible" },
    opacity: { base: "1" },
  };

  return (getDefault("visibility") as VisibilityValue) ?? fallback;
});

function syncOpacityFromTarget(): void {
  const opacityValue = styleTarget.getStyleValue(
    "opacity",
    "1",
    breakpointName.value,
  );
  const trimmed = (opacityValue ?? "1").trim();
  opacityCSSValue.value = trimmed;

  if (extractVariableReferenceKey(trimmed) !== null) {
    return;
  }

  const parsedOpacity = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsedOpacity)) {
    opacityPercentage.value = 100;
    return;
  }

  opacityPercentage.value = Math.min(
    100,
    Math.max(0, Math.round(parsedOpacity * 100)),
  );
}

watchEffect(() => {
  breakpointName.value;
  selectedNode.value;
  styleTarget.isClassEditing.value;
  styleTarget.activeClassName.value;
  styleTarget.activeClass.value;

  if (previewOriginOpacity.value !== null) {
    return;
  }

  syncOpacityFromTarget();
});

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function validateOpacityCssValue(
  rawValue: string,
): { cssValue: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    validationError.value = t("inspector.validation.invalidOpacity");
    return null;
  }

  const variableKey = extractVariableReferenceKey(trimmed);
  if (variableKey !== null) {
    if (!isOpacityCompatibleVariableKey(variableKey, globalStyles.value.variables)) {
      validationError.value = t("inspector.opacity.incompatibleVariable");
      return null;
    }

    const candidate: VisibilityValue = {
      ...defaultVisibility.value,
      opacity: {
        ...defaultVisibility.value.opacity,
        [breakpointName.value]: trimmed,
      },
    };

    const result = safeParse("visibility", candidate);
    const valid = "success" in result && result.success;

    if (!valid) {
      validationError.value = t("inspector.validation.invalidOpacityConfiguration");
      return null;
    }

    return { cssValue: trimmed };
  }

  const parsedOpacity = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsedOpacity)) {
    validationError.value = t("inspector.validation.invalidOpacity");
    return null;
  }

  const asPercentage = trimmed.includes("%")
    ? Math.round(parsedOpacity)
    : Math.min(100, Math.max(0, Math.round(parsedOpacity * 100)));

  const parsedPercentage = z
    .number()
    .int()
    .min(0)
    .max(100)
    .safeParse(asPercentage);

  if (!parsedPercentage.success) {
    validationError.value = t("inspector.validation.invalidOpacity");
    return null;
  }

  const cssValue = (parsedPercentage.data / 100).toString();
  const candidate: VisibilityValue = {
    ...defaultVisibility.value,
    opacity: {
      ...defaultVisibility.value.opacity,
      [breakpointName.value]: cssValue,
    },
  };

  const result = safeParse("visibility", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidOpacityConfiguration");
    return null;
  }

  return { cssValue };
}

function validateOpacityPercentage(value: number): { cssValue: string } | null {
  const parsedOpacity = z.number().int().min(0).max(100).safeParse(value);
  if (!parsedOpacity.success) {
    validationError.value = "Invalid opacity value.";
    return null;
  }

  return validateOpacityCssValue((parsedOpacity.data / 100).toString());
}

function getCurrentBreakpointOpacityValue(): string | undefined {
  return styleTarget.getResponsiveStyleMap("opacity")[breakpointName.value];
}

function restoreOpacityPreview(
  value: string | undefined = previewOriginOpacity.value ?? undefined,
): void {
  styleTarget.previewStyleProperties({ opacity: value });

  if (value === undefined) {
    syncOpacityFromTarget();
    return;
  }

  opacityCSSValue.value = value;
  if (extractVariableReferenceKey(value) !== null) {
    return;
  }

  const parsedOpacity = Number.parseFloat(value);
  opacityPercentage.value = Number.isFinite(parsedOpacity)
    ? Math.min(100, Math.max(0, Math.round(parsedOpacity * 100)))
    : 100;
}

function revertOpacityToStoredValue(): void {
  previewOriginOpacity.value = null;
  syncOpacityFromTarget();
  const storedOpacity = getCurrentBreakpointOpacityValue();
  restoreOpacityPreview(storedOpacity);
}

async function saveOpacityCssValue(rawValue: string): Promise<boolean> {
  const parsed = validateOpacityCssValue(rawValue);
  if (!parsed) {
    if (hasSaveContext()) {
      revertOpacityToStoredValue();
    }
    return false;
  }

  if (!hasSaveContext()) {
    return false;
  }

  const success = await styleTarget.saveStyleProperties(
    { opacity: parsed.cssValue },
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    validationError.value =
      styleTarget.error.value ?? t("inspector.opacity.saveFailed");
    revertOpacityToStoredValue();
    return false;
  }

  opacityCSSValue.value = parsed.cssValue;
  if (extractVariableReferenceKey(parsed.cssValue) === null) {
    const numericOpacity = Number.parseFloat(parsed.cssValue);
    opacityPercentage.value = Number.isFinite(numericOpacity)
      ? Math.min(100, Math.max(0, Math.round(numericOpacity * 100)))
      : 100;
  }

  previewOriginOpacity.value = null;
  validationError.value = null;
  return true;
}

async function saveOpacityPercentage(value: number): Promise<boolean> {
  const parsed = validateOpacityPercentage(value);
  if (!parsed) {
    return false;
  }

  opacityPercentage.value = value;
  opacityCSSValue.value = parsed.cssValue;
  return saveOpacityCssValue(parsed.cssValue);
}

async function resetCurrentBreakpointOpacity(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const success = await opacityOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    return;
  }

  previewOriginOpacity.value = null;
}

function handleSliderUpdate(value: number[] | undefined): void {
  const nextValue = value?.[0];
  if (typeof nextValue !== "number") {
    return;
  }

  const normalizedValue = Math.min(100, Math.max(0, Math.round(nextValue)));
  const parsed = validateOpacityPercentage(normalizedValue);
  if (!parsed) {
    return;
  }

  if (previewOriginOpacity.value === null) {
    previewOriginOpacity.value = getCurrentBreakpointOpacityValue();
  }

  opacityPercentage.value = normalizedValue;
  opacityCSSValue.value = parsed.cssValue;
  styleTarget.previewStyleProperties({ opacity: parsed.cssValue });
}

function handleSliderCommit(value: number[]): void {
  const nextValue = value[0];
  if (typeof nextValue !== "number") {
    return;
  }

  void saveOpacityPercentage(Math.min(100, Math.max(0, Math.round(nextValue))));
}

</script>

<template>
  <div>
    <BaseProperty
      title="Opacity"
      :open="sectionOpen"
      :defaultOpen="defaultOpen"
      :has-changes="opacityOverrides.overrideBreakpointIds.value.length > 0"
      @update:open="sectionOpen = $event"
    >
      <template #header-actions>
        <InspectorBreakpointIndicators
          :breakpoints="opacityOverrides.overrideBreakpoints.value"
          :current-breakpoint-label="
            opacityOverrides.currentBreakpointLabel.value
          "
          :show-reset="
            sectionOpen && opacityOverrides.hasCurrentBreakpointOverride.value
          "
          @reset="void resetCurrentBreakpointOpacity()"
        />
      </template>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
        <VariableAssignableInput
          v-model="opacityCSSValue"
          data-testid="opacity-input"
          class="flex-1 min-w-0"
          :disabled="isPanelDisabled"
          :options="opacityVariableOptions"
          :input-class="VARIABLE_INPUT_CLASS"
          :placeholder="isOpacityVariable ? t('inspector.opacity.variable') : '100%'"
          @commit="(value) => void saveOpacityCssValue(String(value))"
        >
          <template v-if="!isOpacityVariable" #control>
            <div
              class="flex h-9 items-center px-2 bg-sidebar border border-dashed border-border-70 rounded-sm"
            >
              <Slider
                data-testid="opacity-slider"
                class="w-full"
                :model-value="[opacityPercentage]"
                :min="0"
                :max="100"
                :step="1"
                :disabled="isPanelDisabled"
                @update:model-value="handleSliderUpdate"
                @value-commit="handleSliderCommit"
              />
            </div>
          </template>
        </VariableAssignableInput>

        <span
          v-if="!isOpacityVariable"
          data-testid="opacity-value"
          class="w-10 text-xs text-muted-foreground text-right tabular-nums shrink-0"
        >
          {{ opacityPercentage }}%
        </span>
        </div>
      </div>
    </BaseProperty>

    <div
      v-if="opacityInspectorError"
      data-testid="opacity-inspector-error"
      class="px-2 pb-2 text-xs text-red-500"
    >
      {{ opacityInspectorError }}
    </div>
  </div>
</template>
