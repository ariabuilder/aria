<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, onMounted, ref, watch } from "vue";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import { IconPickerDialog } from "@/components/ui/icon-picker";
import BaseProperty from "./BaseProperty.vue";
import { usePropertySave, useSelectionTreeState } from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useSiteSettings } from "../../../composables/useSiteSettings";
import { findNodeById } from "../../../../lib/blocks/nodeUtils";
import {
  IconReferenceSchema,
  getCanonicalIconIdFromValue,
  getIconClassFromValue,
  parseCanonicalIconId,
} from "../../../../lib/icons/reference";
import { useStudioI18n } from "@/i18n";
import { resolveOneIconSvgData } from "@/lib/iconDataClient";

const DEFAULT_ICON_SIZE = "40px";
const DEFAULT_ICON_SIZE_VALUE = "40";
const DEFAULT_ICON_SIZE_UNIT = "px";
const DEFAULT_ICON_COLOR = "#000000";
const ICON_SIZE_UNITS = ["px", "rem", "em", "%", "vw", "vh"] as const;

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  targetNodeId?: string;
  embedded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
  targetNodeId: undefined,
  embedded: false,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const {
  selectedNode,
  selectedNodeId,
  breakpointName,
  getComputedStyleValue,
  isLoading,
  error,
  previewStyleProperties,
  saveProperty,
  saveProperties,
} = usePropertySave();
const { selectionTreeRootNodes } = useSelectionTreeState();
const {
  enabledIconPacks,
  defaultIconPack,
  loadSettings: loadSiteSettings,
} = useSiteSettings();

const IconValueSchema = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value.length === 0 || !/\s/.test(value), {
    message: "Icon value cannot contain spaces.",
  });
const AriaLabelSchema = z.string().trim().max(200);
const IconSizeSchema = z.string().trim().min(1).max(120);
const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const CONTROL_INPUT_CLASS =
  "h-8 border border-dashed border-border-70 bg-sidebar text-xs";
const VARIABLE_INPUT_CLASS =
  "h-8 border border-dashed border-border-70 bg-sidebar pl-8 text-xs";
const UNIT_SELECT_TRIGGER_CLASS =
  "h-8 w-12 justify-center border border-dashed border-border-70 bg-sidebar px-1.5 text-xs text-muted-foreground hover:border-border focus:ring-0 focus:ring-offset-0";

const iconClass = ref("");
const ariaLabel = ref("");
const colorValue = ref(DEFAULT_ICON_COLOR);
const sizeValue = ref(DEFAULT_ICON_SIZE_VALUE);
const sizeUnit = ref<(typeof ICON_SIZE_UNITS)[number]>(DEFAULT_ICON_SIZE_UNIT);
const isPickerOpen = ref(false);
const validationError = ref<string | null>(null);
const iconPreviewSvg = ref("");
const isHydratingIconPreview = ref(false);
const iconSizeScrubSession = usePointerScrubSession();

function hasSaveContext(): boolean {
  const targetId = props.targetNodeId ?? selectedNodeId.value;
  return Boolean(
    targetId && props.currentItemType && props.currentItemSlug,
  );
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: isLoading,
});

const resolvedTargetNodeId = computed(
  () => props.targetNodeId ?? selectedNodeId.value,
);
const targetNode = computed(() => {
  const targetId = resolvedTargetNodeId.value;
  if (!targetId) {
    return null;
  }

  if (selectedNode.value?.id === targetId) {
    return selectedNode.value;
  }

  return findNodeById(selectionTreeRootNodes.value, targetId) ?? null;
});
const hasTargetIcon = computed(
  () => targetNode.value?.type?.toLowerCase() === "icon",
);
const hasIcon = computed(() => iconClass.value.trim().length > 0);
const hasIconChanges = computed(
  () =>
    (hasTargetIcon.value && hasIcon.value) ||
    ariaLabel.value.trim().length > 0 ||
    colorValue.value.trim() !== DEFAULT_ICON_COLOR ||
    normalizeIconSize(sizeValue.value) !== DEFAULT_ICON_SIZE,
);
const iconPreviewClass = computed(() => getIconClassFromValue(iconClass.value));
const iconPickerAriaLabel = computed(() =>
  hasIcon.value ? t("inspector.icon.change") : t("inspector.icon.choose"),
);
const hasResolvedIconPreview = computed(() => iconPreviewSvg.value.length > 0);
const basePropertyProps = computed(() => {
  if (props.embedded) {
    return {};
  }

  return {
    open: props.open,
    defaultOpen: props.defaultOpen,
    hasChanges: hasIconChanges.value,
    showReset: hasIconChanges.value,
    resetDisabled: isPanelDisabled.value,
    resetAriaLabel: t("inspector.icon.reset"),
    title: "Icon",
    "onUpdate:open": (value: boolean) => emit("update:open", value),
    onReset: () => {
      void resetIcon();
    },
  };
});

function normalizeIconSize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_ICON_SIZE;

  if (trimmed.startsWith("var(")) {
    return trimmed;
  }

  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return `${trimmed}${sizeUnit.value}`;
  }

  return trimmed;
}

function parseIconSizeParts(value: string): {
  value: string;
  unit: (typeof ICON_SIZE_UNITS)[number];
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);
  const matchedUnit = match?.[2];
  const unit = ICON_SIZE_UNITS.includes(
    matchedUnit as (typeof ICON_SIZE_UNITS)[number],
  )
    ? (matchedUnit as (typeof ICON_SIZE_UNITS)[number])
    : DEFAULT_ICON_SIZE_UNIT;

  return {
    value: match?.[1] ?? trimmed,
    unit,
  };
}

function syncIconSizeState(cssValue: string): void {
  const parsed = parseIconSizeParts(cssValue);
  sizeValue.value = parsed.value || DEFAULT_ICON_SIZE_VALUE;
  sizeUnit.value = parsed.unit;
}

function getIconSizeValue(): string {
  return (
    getComputedStyleValue(
      "width",
      undefined,
      breakpointName.value,
      resolvedTargetNodeId.value ?? undefined,
    ) ??
    getComputedStyleValue(
      "height",
      undefined,
      breakpointName.value,
      resolvedTargetNodeId.value ?? undefined,
    ) ??
    getComputedStyleValue(
      "fontSize",
      DEFAULT_ICON_SIZE,
      breakpointName.value,
      resolvedTargetNodeId.value ?? undefined,
    ) ??
    DEFAULT_ICON_SIZE
  );
}

function getCurrentBreakpointIconSize(): string | undefined {
  return targetNode.value?.styles?.width?.[breakpointName.value];
}

async function hydrateIconPreview(value: string): Promise<void> {
  const canonicalId = getCanonicalIconIdFromValue(value);

  if (!canonicalId) {
    iconPreviewSvg.value = "";
    return;
  }

  isHydratingIconPreview.value = true;

  try {
    const svg = (await resolveOneIconSvgData(canonicalId))?.svg ?? "";

    if (getCanonicalIconIdFromValue(iconClass.value) === canonicalId) {
      iconPreviewSvg.value = svg;
    }
  } catch {
    if (getCanonicalIconIdFromValue(iconClass.value) === canonicalId) {
      iconPreviewSvg.value = "";
    }
  } finally {
    isHydratingIconPreview.value = false;
  }
}

watch(
  [targetNode, breakpointName],
  ([node]) => {
    iconClass.value = getIconClassFromValue(node?.props?.icon);
    ariaLabel.value = String(node?.props?.ariaLabel ?? "");
    colorValue.value =
      getComputedStyleValue(
        "color",
        DEFAULT_ICON_COLOR,
        breakpointName.value,
        resolvedTargetNodeId.value ?? undefined,
      ) ?? DEFAULT_ICON_COLOR;
    syncIconSizeState(getIconSizeValue());

    if (!hasTargetIcon.value) {
      iconPreviewSvg.value = "";
    }
  },
  { immediate: true, deep: true },
);

watch(
  iconClass,
  (nextValue) => {
    void hydrateIconPreview(nextValue);
  },
  { immediate: true },
);

function buildIconPayload(
  value: string,
): string | z.infer<typeof IconReferenceSchema> {
  const canonicalId = getCanonicalIconIdFromValue(value);
  if (!canonicalId) {
    return value;
  }

  const parsed = parseCanonicalIconId(canonicalId);
  if (!parsed) {
    return value;
  }

  return {
    id: parsed.id,
    pack: parsed.pack,
    name: parsed.name,
    source: "iconify",
    version: "2026-02-25-snapshot",
  };
}

const saveIcon = async (value: string) => {
  const parsed = IconValueSchema.safeParse(value);
  if (!parsed.success) {
    validationError.value =
      parsed.error.issues[0]?.message ?? t("inspector.validation.invalidIcon");
    return;
  }

  const next = parsed.data;
  const nextPayload = buildIconPayload(next);
  const currentPayload = targetNode.value?.props?.icon;

  if (JSON.stringify(currentPayload) === JSON.stringify(nextPayload)) return;
  if (
    !hasTargetIcon.value ||
    !resolvedTargetNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  )
    return;

  const success = await saveProperty(
    "icon",
    nextPayload,
    props.currentItemType,
    props.currentItemSlug,
    resolvedTargetNodeId.value,
  );

  if (success) {
    validationError.value = null;
    iconClass.value = getIconClassFromValue(nextPayload) || next;
  }
};

function previewIconColor(value: string): void {
  const next = value.trim();
  if (!next) {
    return;
  }

  if (!hasTargetIcon.value || !resolvedTargetNodeId.value) {
    return;
  }

  colorValue.value = next;
  previewStyleProperties({ color: next }, resolvedTargetNodeId.value);
}

async function persistIconColor(value: string): Promise<void> {
  const next = value.trim();
  if (!next) {
    validationError.value = t("inspector.validation.invalidIconColor");
    return;
  }

  if (
    !hasTargetIcon.value ||
    !resolvedTargetNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }

  const previousColor =
    getComputedStyleValue(
      "color",
      DEFAULT_ICON_COLOR,
      breakpointName.value,
      resolvedTargetNodeId.value,
    ) ?? DEFAULT_ICON_COLOR;

  if (next === previousColor) {
    colorValue.value = next;
    return;
  }

  colorValue.value = next;

  const success = await saveProperty(
    "color",
    next,
    props.currentItemType,
    props.currentItemSlug,
    resolvedTargetNodeId.value,
  );

  if (!success) {
    previewStyleProperties(
      { color: previousColor },
      resolvedTargetNodeId.value,
    );
    colorValue.value = previousColor;
    return;
  }

  validationError.value = null;
}

function previewIconSize(nextSize: string): void {
  previewStyleProperties(
    {
      width: nextSize,
      height: nextSize,
      fontSize: nextSize,
    },
    resolvedTargetNodeId.value ?? undefined,
  );
}

async function saveIconSize(rawValue: string): Promise<void> {
  const parsed = IconSizeSchema.safeParse(rawValue);
  if (!parsed.success) {
    validationError.value = t("inspector.validation.invalidIconSize");
    return;
  }

  const normalizedSize = normalizeIconSize(parsed.data);
  const previousSize = getIconSizeValue();

  if (normalizedSize === previousSize) {
    syncIconSizeState(normalizedSize);
    return;
  }

  if (
    !hasTargetIcon.value ||
    !resolvedTargetNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }

  previewIconSize(normalizedSize);
  syncIconSizeState(normalizedSize);

  const success = await saveProperties(
    {
      width: normalizedSize,
      height: normalizedSize,
      fontSize: normalizedSize,
    },
    props.currentItemType,
    props.currentItemSlug,
    resolvedTargetNodeId.value,
  );

  if (!success) {
    previewIconSize(previousSize);
    syncIconSizeState(previousSize);
    return;
  }

  validationError.value = null;
}

function resolveScrubOrigin(value: string): {
  startValue: number;
  unit: string;
} {
  const trimmed = value.trim();
  const match = normalizeIconSize(trimmed).match(
    /^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/,
  );

  if (!match) {
    return { startValue: 0, unit: "px" };
  }

  return {
    startValue: Number.parseFloat(match[1] ?? "0"),
    unit: match[2] ?? sizeUnit.value,
  };
}

function formatScrubDisplayValue(value: number, unit: string): string {
  return String(value);
}

function handleSizeMouseDown(event: MouseEvent): void {
  if (
    !hasTargetIcon.value ||
    !resolvedTargetNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }

  const { startValue, unit } = resolveScrubOrigin(sizeValue.value);
  const originRawValue = getCurrentBreakpointIconSize();
  const originDisplayValue = getIconSizeValue();

  function restoreSize(): void {
    const restored = originRawValue ?? originDisplayValue;
    previewIconSize(restored);
    syncIconSizeState(restored);
  }
  iconSizeScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const formatted = formatScrubDisplayValue(nextValue, unit);
      const normalized = normalizeIconSize(formatted);

      sizeValue.value = formatted;
      previewIconSize(normalized);
    },
    onCancel: () => {
      restoreSize();
    },
    onCommit: () => {
      void saveIconSize(sizeValue.value);
    },
  });
}

async function handleSizeUnitChange(value: unknown): Promise<void> {
  if (typeof value !== "string") return;
  if (!ICON_SIZE_UNITS.includes(value as (typeof ICON_SIZE_UNITS)[number])) {
    return;
  }

  sizeUnit.value = value as (typeof ICON_SIZE_UNITS)[number];
  await saveIconSize(sizeValue.value);
}

const saveAriaLabel = async (value: string) => {
  const parsed = AriaLabelSchema.safeParse(value);
  if (!parsed.success) {
    validationError.value = t("inspector.validation.invalidAriaLabel");
    return;
  }

  const next = parsed.data;
  if (next === ariaLabel.value) return;
  if (
    !hasTargetIcon.value ||
    !resolvedTargetNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  )
    return;

  const success = await saveProperty(
    "ariaLabel",
    next,
    props.currentItemType,
    props.currentItemSlug,
    resolvedTargetNodeId.value,
  );

  if (success) {
    validationError.value = null;
    ariaLabel.value = next;
  }
};

const handleIconSelect = async (value: string) => {
  await saveIcon(value);
};

const resetIcon = async (): Promise<void> => {
  if (
    !hasTargetIcon.value ||
    !resolvedTargetNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  )
    return;

  const success = await saveProperties(
    {
      icon: "",
      ariaLabel: undefined,
      color: undefined,
      width: DEFAULT_ICON_SIZE,
      height: DEFAULT_ICON_SIZE,
      fontSize: DEFAULT_ICON_SIZE,
    },
    props.currentItemType,
    props.currentItemSlug,
    resolvedTargetNodeId.value,
  );

  if (success) {
    validationError.value = null;
    iconClass.value = "";
    ariaLabel.value = "";
    colorValue.value = DEFAULT_ICON_COLOR;
    sizeValue.value = DEFAULT_ICON_SIZE_VALUE;
    sizeUnit.value = DEFAULT_ICON_SIZE_UNIT;
  }
};

onMounted(async () => {
  try {
    await loadSiteSettings();
  } catch {
    // Keep inspector usable with composable defaults if settings fetch fails.
  }
});
</script>

<template>
  <component :is="embedded ? 'div' : BaseProperty" v-bind="basePropertyProps">
    <div class="space-y-3">
      <div :class="PROPERTY_ROW_CLASS" data-testid="icon-class-row">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.icon.label") }}</label>
        <div class="flex items-center gap-2">
          <Input
            data-testid="icon-class-input"
            :value="iconClass"
            @blur="
              (e: Event) => void saveIcon((e.target as HTMLInputElement).value)
            "
            :placeholder="studioIcons.starLine"
            :class="`${CONTROL_INPUT_CLASS} flex-1`"
            :disabled="isPanelDisabled"
          />
          <Button
            data-testid="icon-picker-trigger"
            variant="outline"
            size="icon-sm"
            class="h-8 w-8 shrink-0 border-dashed border-border-70 bg-sidebar hover:bg-sidebar-80"
            :title="iconPickerAriaLabel"
            :aria-label="iconPickerAriaLabel"
            :disabled="isPanelDisabled"
            @click="isPickerOpen = true"
          >
            <span
              v-if="hasResolvedIconPreview"
              data-testid="icon-picker-trigger-svg"
              aria-hidden="true"
              class="flex size-4 items-center justify-center shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              v-html="iconPreviewSvg"
            />
            <span
              v-else-if="hasIcon"
              data-testid="icon-picker-trigger-icon"
              aria-hidden="true"
              :class="[iconPreviewClass, 'size-4 shrink-0 text-foreground']"
            />
            <span
              v-else
              data-testid="icon-picker-trigger-fallback"
              aria-hidden="true"
              :class="[studioIcons.magnifier, 'size-4 shrink-0']"
            />
          </Button>
        </div>
      </div>

      <div :class="PROPERTY_ROW_CLASS" data-testid="icon-color-row">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.shadow.color") }}</label>
        <ColorField
          v-model="colorValue"
          layout="unified"
          show-variables
          show-alpha
          show-design-colors
          content-side="left"
          content-align="center"
          class="min-w-0 w-full"
          data-testid="icon-color-input"
          contrast-against="#ffffff"
          :disabled="isPanelDisabled"
          @preview="previewIconColor"
          @update:model-value="colorValue = $event"
          @commit="persistIconColor"
        />
      </div>

      <div :class="PROPERTY_ROW_CLASS" data-testid="icon-size-row">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.border.size") }}</label>
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div class="relative flex items-center">
            <button
              type="button"
              class="absolute left-1.5 top-1/2 z-10 flex size-5 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground"
              :title="t('inspector.icon.dragResize')"
              :aria-label="t('inspector.icon.dragResize')"
              :disabled="isPanelDisabled"
              @mousedown="handleSizeMouseDown"
            >
              <span :class="[studioIcons.arrowExpand, 'size-3.5']" />
            </button>
            <VariableAssignableInput
              v-model="sizeValue"
              data-testid="icon-size-input"
              class="w-full"
              :disabled="isPanelDisabled"
              :input-class="VARIABLE_INPUT_CLASS"
              placeholder="40"
              @update:model-value="sizeValue = String($event)"
              @commit="(value) => void saveIconSize(String(value))"
            />
          </div>
          <Select
            :model-value="sizeUnit"
            :disabled="isPanelDisabled"
            @update:model-value="handleSizeUnitChange"
          >
            <SelectTrigger hide-icon :class="UNIT_SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="end"
              class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
            >
              <SelectItem
                v-for="unit in ICON_SIZE_UNITS"
                :key="unit"
                :value="unit"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ unit }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div :class="PROPERTY_ROW_CLASS" data-testid="icon-aria-row">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.icon.aria") }}</label>
        <Input
          data-testid="icon-aria-input"
          :value="ariaLabel"
          @blur="
            (e: Event) =>
              void saveAriaLabel((e.target as HTMLInputElement).value)
          "
          :placeholder="t('inspector.icon.description')"
          :class="CONTROL_INPUT_CLASS"
          :disabled="isPanelDisabled"
        />
      </div>

      <div v-if="validationError" class="text-xs text-destructive">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-destructive">
        {{ error }}
      </div>
    </div>
  </component>

  <IconPickerDialog
    :open="isPickerOpen"
    :title="t('inspector.icon.select')"
    :description="t('inspector.icon.selectDescription')"
    :value="iconClass"
    :enabled-packs="enabledIconPacks"
    :default-pack="defaultIconPack"
    @update:open="isPickerOpen = $event"
    @select="handleIconSelect"
  />
</template>
