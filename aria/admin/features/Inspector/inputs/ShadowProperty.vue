<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import { ColorField } from "@/components/ui/color-picker";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { usePropertySave } from "../../Core";
import { useDesignSystem } from "../../Design/composables/useDesignSystem";
import { useGlobalStyles } from "../../Design/composables/useGlobalStyles";
import { resolveColorPickerPreviewValue } from "../../Design/lib/colorPickerValue";
import { buildVariableManagerTokenOptions } from "../../Design/lib/variableManagerTokens";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import type { ShadowValue } from "../schemas/shadow.schema";
import { useStudioI18n } from "@/i18n";

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

const SHADOW_SECTION_STYLE_KEYS = ["boxShadow"] as const;
type ShadowSectionStyleKey = (typeof SHADOW_SECTION_STYLE_KEYS)[number];

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const shadowOverrides = useInspectorPropertyOverrides({
  propertyKeys: SHADOW_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();
const { globalStyles, loadGlobalStyles } = useGlobalStyles();
const { palettes, semanticColors, load: loadDesignSystem } = useDesignSystem();

const shadowX = ref("0");
const shadowY = ref("4");
const shadowBlur = ref("8");
const shadowSpread = ref("0");
const shadowColor = ref("rgba(0, 0, 0, 0.25)");
const validationError = ref<string | null>(null);
const internalOpen = ref(props.defaultOpen);

type ScrubTarget = "x" | "y" | "blur" | "spread";

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

const defaultShadow = computed<ShadowValue>(() => {
  const fallback: ShadowValue = { boxShadow: { base: "none" } };
  return (getDefault("shadow") as ShadowValue) ?? fallback;
});

const variableManagerTokenOptions = computed(() =>
  buildVariableManagerTokenOptions(palettes.value, semanticColors.value),
);

const resolvedShadowColor = computed(() =>
  resolveColorPickerPreviewValue(
    shadowColor.value,
    globalStyles.value.variables,
    variableManagerTokenOptions.value,
    { palettes: palettes.value, semanticColors: semanticColors.value },
  ),
);

const shadowPreviewQueue = useStylePreviewQueue<
  Record<ShadowSectionStyleKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncShadowValues,
});

const shadowScrubSession = usePointerScrubSession();

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) return true;
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function getBoxShadowValue(): string {
  return (
    styleTarget.getStyleValue("boxShadow", "none", breakpointName.value) ??
    "none"
  );
}

function getCurrentBreakpointShadowValue(): string | undefined {
  return styleTarget.getResponsiveStyleMap("boxShadow")[breakpointName.value];
}

function parseBoxShadow(shadow: string): {
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
} {
  if (!shadow || shadow === "none") {
    return {
      x: "0",
      y: "4",
      blur: "8",
      spread: "0",
      color: "rgba(0, 0, 0, 0.25)",
    };
  }

  const match = shadow.match(
    /^(?:inset\s+)?(-?\d+(?:\.\d+)?(?:px|rem|em)?|0)\s+(-?\d+(?:\.\d+)?(?:px|rem|em)?|0)\s+(\d+(?:\.\d+)?(?:px|rem|em)?|0)(?:\s+(-?\d+(?:\.\d+)?(?:px|rem|em)?|0))?\s+(.+)$/,
  );

  if (!match) {
    return {
      x: "0",
      y: "4",
      blur: "8",
      spread: "0",
      color: "rgba(0, 0, 0, 0.25)",
    };
  }

  return {
    x: match[1].replace(/px$/, ""),
    y: match[2].replace(/px$/, ""),
    blur: match[3].replace(/px$/, ""),
    spread: (match[4] ?? "0").replace(/px$/, ""),
    color: match[5],
  };
}

function normalizeLength(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "0px";
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed))
    return `${Math.round(Number(trimmed))}px`;
  return trimmed;
}

function buildBoxShadow(): string {
  const x = normalizeLength(shadowX.value);
  const y = normalizeLength(shadowY.value);
  const blur = normalizeLength(shadowBlur.value);
  const spread = normalizeLength(shadowSpread.value);
  const color = shadowColor.value.trim() || "rgba(0, 0, 0, 0.25)";
  return `${x} ${y} ${blur} ${spread} ${color}`;
}

function validateShadow(boxShadow: string): boolean {
  const candidate: ShadowValue = {
    ...defaultShadow.value,
    boxShadow: {
      ...defaultShadow.value.boxShadow,
      [breakpointName.value]: boxShadow,
    },
  };
  const result = safeParse("shadow", candidate);
  const valid = "success" in result && result.success;
  if (!valid) {
    validationError.value = t("inspector.validation.invalidShadow");
    return false;
  }
  validationError.value = null;
  return true;
}

function syncShadowValues(): void {
  const parsed = parseBoxShadow(getBoxShadowValue());
  shadowX.value = parsed.x;
  shadowY.value = parsed.y;
  shadowBlur.value = parsed.blur;
  shadowSpread.value = parsed.spread;
  shadowColor.value = parsed.color;
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncShadowValues();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  void Promise.all([loadGlobalStyles(), loadDesignSystem()]);
});

async function saveShadow(): Promise<void> {
  if (!hasSaveContext()) return;
  const boxShadow = buildBoxShadow();
  if (!validateShadow(boxShadow)) return;
  if (getBoxShadowValue() === boxShadow) return;
  await styleTarget.saveStyleProperty(
    "boxShadow",
    boxShadow,
    props.currentItemType,
    props.currentItemSlug,
  );
}

function previewShadowColor(value: string): void {
  if (!hasSaveContext()) {
    return;
  }

  shadowColor.value = value;
  queueShadowPreview(buildBoxShadow());
}

async function persistShadowColor(value: string): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  shadowColor.value = value;
  flushPendingPreview();
  await saveShadow();
}

const resetCurrentBreakpointShadow = async (): Promise<void> => {
  if (!hasSaveContext()) return;
  await shadowOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
};

function getScrubRef(target: ScrubTarget): string {
  switch (target) {
    case "x":
      return shadowX.value;
    case "y":
      return shadowY.value;
    case "blur":
      return shadowBlur.value;
    case "spread":
      return shadowSpread.value;
  }
}

function setScrubRef(target: ScrubTarget, val: string): void {
  switch (target) {
    case "x":
      shadowX.value = val;
      break;
    case "y":
      shadowY.value = val;
      break;
    case "blur":
      shadowBlur.value = val;
      break;
    case "spread":
      shadowSpread.value = val;
      break;
  }
}

function resolveScrubOrigin(value: string): { startValue: number } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
  if (!match) return { startValue: 0 };
  const n = Number.parseFloat(match[1] ?? "0");
  return { startValue: Number.isFinite(n) ? n : 0 };
}

function cancelPendingPreview(): void {
  shadowPreviewQueue.cancel();
}

function flushPendingPreview(): void {
  shadowPreviewQueue.flush();
}

function queueShadowPreview(boxShadow: string): void {
  shadowPreviewQueue.queue({ boxShadow });
}

function restoreShadowPreview(originRawValue: string | undefined): void {
  shadowPreviewQueue.restore({ boxShadow: originRawValue });
}

function handleMouseDown(target: ScrubTarget, e: MouseEvent): void {
  if (!hasSaveContext()) return;

  const { startValue } = resolveScrubOrigin(getScrubRef(target));
  const originRawValue = getCurrentBreakpointShadowValue();
  const originDisplayValue = getBoxShadowValue();
  shadowScrubSession.start({
    event: e,
    onMove: ({ deltaX }) => {
      const nextVal = Math.round(startValue + deltaX);
      setScrubRef(target, String(nextVal));
      queueShadowPreview(buildBoxShadow());
    },
    onCancel: () => {
      restoreShadowPreview(originRawValue);
      const parsed = parseBoxShadow(originDisplayValue);
      shadowX.value = parsed.x;
      shadowY.value = parsed.y;
      shadowBlur.value = parsed.blur;
      shadowSpread.value = parsed.spread;
    },
    onCommit: () => {
      flushPendingPreview();
      void saveShadow();
    },
  });
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="props.defaultOpen"
    :has-changes="shadowOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Shadow"
    icon="shadow"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="shadowOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="shadowOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen && shadowOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="shadow-reset-breakpoint"
        @reset="void resetCurrentBreakpointShadow()"
      />
    </template>

    <div class="space-y-3 pb-4">
      <!-- OFFSET -->
      <div>
        <label
          class="block mb-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.shadow.offset") }}</label
        >
        <div class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowLeftRight, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="shadowX"
              @commit="saveShadow"
              @mousedown="(e: MouseEvent) => handleMouseDown('x', e)"
              placeholder="X"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-dashed border-border-70 text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpDown, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="shadowY"
              @commit="saveShadow"
              @mousedown="(e: MouseEvent) => handleMouseDown('y', e)"
              placeholder="Y"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-dashed border-border-70 text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
        </div>
      </div>

      <!-- BLUR / SPREAD -->
      <div>
        <label
          class="block mb-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.shadow.blurSpread") }}</label
        >
        <div class="grid grid-cols-2 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.blur, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="shadowBlur"
              @commit="saveShadow"
              @mousedown="(e: MouseEvent) => handleMouseDown('blur', e)"
              :placeholder="t('inspector.shadow.blur')"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-dashed border-border-70 text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.expandHuge, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="shadowSpread"
              @commit="saveShadow"
              @mousedown="(e: MouseEvent) => handleMouseDown('spread', e)"
              :placeholder="t('inspector.shadow.spread')"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-dashed border-border-70 text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
        </div>
      </div>

      <hr class="border-0 h-px bg-border/70" />

      <!-- COLOR -->
      <div>
        <label
          class="block mb-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.shadow.color") }}</label
        >
        <ColorField
          v-model="shadowColor"
          :resolved-model-value="resolvedShadowColor"
          layout="unified"
          show-variables
          show-alpha
          show-design-colors
          content-side="left"
          content-align="center"
          class="min-w-0 w-full"
          contrast-against="#ffffff"
          :disabled="isPanelDisabled"
          @preview="previewShadowColor"
          @update:model-value="shadowColor = $event"
          @commit="persistShadowColor"
        />
      </div>

      <!-- Errors -->
      <div v-if="validationError" class="text-xs text-destructive px-1">
        {{ validationError }}
      </div>
      <div v-if="targetError" class="text-xs text-destructive px-1">
        {{ targetError }}
      </div>
    </div>
  </BaseProperty>
</template>
