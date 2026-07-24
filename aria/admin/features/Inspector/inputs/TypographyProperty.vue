<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
/**
 * TypographyProperty - Modern Typography Controls - Font family selector (Custom
 * Fonts + Google Fonts) - Weight selector + Size with.
 */
import { ref, watch, computed, onMounted } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import { ColorField } from "@/components/ui/color-picker";
import { usePropertySave } from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorGlobalStyleDefaults } from "../composables/useInspectorGlobalStyleDefaults";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import {
  FontConfigActionSuccessSchema,
  type CustomFontRecord,
  type EnabledGoogleFontRecord,
  unwrapFontActionResult,
} from "../../Design/composables/typographyActionResults";
import {
  FontWeightSchema,
  TextAlignSchema,
  TextTransformSchema,
  TextWrapSchema,
  type TypographyValue,
  type FontWeight,
  type TextAlign,
  type TextTransform,
  type TextWrap,
} from "../schemas/typography.schema";
import type { HeadingLevel } from "../schemas/text.schema";
import {
  buildContentValidationCandidate,
  getContentHeadingLevel,
  normalizeContentNodeType,
} from "../composables/useContentContract";
import { extractVariableReferenceKey } from "../../../lib/variableReferences";
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

const TYPOGRAPHY_SECTION_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textWrap",
  "color",
] as const;

type TypographySectionStyleKey = (typeof TYPOGRAPHY_SECTION_STYLE_KEYS)[number];
type TypographySelectableValue = TextAlign | TextTransform | TextWrap | "";

const propertySave = usePropertySave();
const { t } = useStudioI18n();

const textContrastBackground = computed(
  () =>
    propertySave.getComputedStyleValue("backgroundColor", "#ffffff") ??
    "#ffffff",
);
const {
  selectedNode,
  selectedNodeId,
  selectedNodeIds,
  breakpointName,
  saveProperties,
} = propertySave;
const globalDefaults = useInspectorGlobalStyleDefaults();
const styleTarget = useInspectorStyleTarget({
  propertySave,
  globalDefaults: {
    isActive: globalDefaults.isGlobalDefaultsActive,
    primaryDefaults: globalDefaults.globalStyleDefaults,
    compareAcrossSelection: globalDefaults.compareGlobalDefaultAcrossSelection,
    coalesceSaveValue: globalDefaults.coalesceSaveStyleValue,
  },
});
const typographyOverrides = useInspectorPropertyOverrides({
  propertyKeys: TYPOGRAPHY_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();

const fontFamily = ref("");
const headingLevel = ref<HeadingLevel>(2);
const fontSize = ref("");
const fontSizeUnit = ref("px");
const fontWeight = ref("400");
const lineHeight = ref("");
const lineHeightUnit = ref("px");
const letterSpacing = ref("");
const letterSpacingUnit = ref("px");
const textAlign = ref<TypographySelectableValue>("left");
const textTransform = ref<TypographySelectableValue>("none");
const textWrap = ref<TypographySelectableValue>("wrap");
const textColor = ref("#FFFFFF");
const validationError = ref<string | null>(null);
const internalOpen = ref(props.defaultOpen);
const isScrubbing = ref(false);
const fontFamilyMixed = ref(false);
const fontSizeMixed = ref(false);
const fontWeightMixed = ref(false);
const lineHeightMixed = ref(false);
const letterSpacingMixed = ref(false);
const textAlignMixed = ref(false);
const textTransformMixed = ref(false);
const textWrapMixed = ref(false);
const textColorMixed = ref(false);
const previewOriginColor = ref<string | undefined | null>(null);

const fontFamilyOpen = ref(false);
const fontSearch = ref("");

type LocalCustomFont = Pick<CustomFontRecord, "id" | "name" | "family">;
const loadedFonts = ref<LocalCustomFont[]>([]);
type GoogleFontOption = { value: string; label: string };
const enabledGoogleFonts = ref<GoogleFontOption[]>([]);

const fontWeights: ReadonlyArray<{ value: FontWeight; label: string }> = [
  { value: "100", label: t("inspector.typography.thin") },
  { value: "200", label: t("inspector.typography.extraLight") },
  { value: "300", label: t("inspector.typography.light") },
  { value: "400", label: t("inspector.typography.regular") },
  { value: "500", label: t("inspector.typography.medium") },
  { value: "600", label: t("inspector.typography.semibold") },
  { value: "700", label: t("inspector.typography.bold") },
  { value: "800", label: t("inspector.typography.extraBold") },
  { value: "900", label: t("inspector.typography.black") },
];

const TEXT_WRAP_OPTIONS: Array<{ value: TextWrap; label: string }> = [
  { value: "wrap", label: t("inspector.typography.wrap") },
  { value: "nowrap", label: t("inspector.typography.noWrap") },
  { value: "balance", label: t("inspector.typography.balance") },
  { value: "pretty", label: t("inspector.typography.pretty") },
];

const units = ["px", "rem", "em", "%", "vw", "vh"] as const;

const TYPOGRAPHY_UNIT_SELECT_TRIGGER_CLASS =
  "h-8 w-12 justify-center border border-dashed border-border-70 bg-sidebar px-1.5 text-xs text-muted-foreground hover:border-border focus:ring-0 focus:ring-offset-0";

const TYPOGRAPHY_WEIGHT_SELECT_TRIGGER_CLASS =
  "h-8 w-full justify-start border-0 bg-transparent px-3 text-xs text-foreground shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0";

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);
const nodeType = computed(() =>
  normalizeContentNodeType(selectedNode.value?.type),
);
const isHeading = computed(() => nodeType.value === "heading");

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const currentFontLabel = computed(() => {
  if (fontFamilyMixed.value) return t("inspector.typography.mixedFonts");
  const customMatch = loadedFonts.value.find(
    (f) => f.family === fontFamily.value,
  );
  if (customMatch) return customMatch.name;
  const googleMatch = enabledGoogleFonts.value.find(
    (f) => f.value === fontFamily.value,
  );
  if (googleMatch) return googleMatch.label;
  return fontFamily.value || t("inspector.typography.selectFont");
});

const filteredCustomFonts = computed(() => {
  if (!fontSearch.value) return loadedFonts.value;
  const q = fontSearch.value.toLowerCase();
  return loadedFonts.value.filter(
    (f) =>
      f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q),
  );
});

const filteredGoogleFonts = computed(() => {
  if (!fontSearch.value) return enabledGoogleFonts.value;
  const q = fontSearch.value.toLowerCase();
  return enabledGoogleFonts.value.filter((f) =>
    f.label.toLowerCase().includes(q),
  );
});

const hasFilteredResults = computed(
  () =>
    filteredCustomFonts.value.length > 0 ||
    filteredGoogleFonts.value.length > 0,
);

const isFontWeightVariable = computed(
  () => extractVariableReferenceKey(fontWeight.value) !== null,
);

const defaultTypography = computed<TypographyValue>(() => {
  const fallback: TypographyValue = {
    fontFamily: { base: "inherit" },
    fontSize: { base: "inherit" },
    fontWeight: { base: "400" },
    lineHeight: { base: "inherit" },
    letterSpacing: { base: "normal" },
    textAlign: { base: "left" },
    textTransform: { base: "none" },
    textDecoration: { base: "none" },
    textWrap: { base: "wrap" },
    color: { base: "inherit" },
  };
  return (getDefault("typography") as TypographyValue) ?? fallback;
});

type TypographyKey = keyof Pick<
  TypographyValue,
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "textAlign"
  | "textTransform"
  | "textWrap"
  | "color"
>;

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) return true;
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function hasEditableTarget(): boolean {
  if (!hasSaveContext()) {
    return false;
  }

  if (styleTarget.isClassEditing.value) {
    return Boolean(styleTarget.activeClass.value);
  }

  return true;
}

function getStyleValue(prop: string, fallback = ""): string {
  const styleValueState = styleTarget.getStyleValueState(
    prop,
    breakpointName.value,
  );

  return styleValueState.isMixed ? "" : (styleValueState.value ?? fallback);
}

function getStyleValueState(prop: TypographySectionStyleKey): {
  value: string | undefined;
  isMixed: boolean;
} {
  return styleTarget.getStyleValueState(prop, breakpointName.value);
}

function getCurrentBreakpointStyleValue(
  prop: TypographySectionStyleKey,
): string | undefined {
  return styleTarget.getResponsiveStyleMap(prop)[breakpointName.value];
}

function normalizeNumericValue(raw: string, unit: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return `0${unit}`;
  if (trimmed.startsWith("var(")) return trimmed;
  // Already has a unit suffix
  if (/[a-zA-Z%]$/.test(trimmed)) return trimmed;
  const n = Number.parseFloat(trimmed);
  if (Number.isFinite(n)) return `${n}${unit}`;
  return trimmed;
}

function validateTypographyProperty(
  key: TypographyKey,
  value: string,
  message = "Invalid typography value.",
): boolean {
  const candidate: TypographyValue = {
    ...defaultTypography.value,
    [key]: {
      ...defaultTypography.value[key],
      [breakpointName.value]: value,
    },
  } as TypographyValue;

  const result = safeParse("typography", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = message;
    return false;
  }

  validationError.value = null;
  return true;
}

function getTextAlignIconClass(value: TextAlign): string {
  switch (value) {
    case "center":
      return studioIcons.alignHorizontalCenter;
    case "right":
      return studioIcons.alignRight;
    case "justify":
      return studioIcons.alignHorizontalSpaceBetween;
    default:
      return studioIcons.alignLeft;
  }
}

watch(
  [
    selectedNode,
    () => selectedNode.value?.props,
    selectedNodeIds,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
    styleTarget.activeClassName,
  ],
  () => {
    if (previewOriginColor.value !== null) {
      styleTarget.previewStyleProperties({
        color: previewOriginColor.value,
      });
      previewOriginColor.value = null;
    }

    const node = selectedNode.value;
    const isClassEditing = styleTarget.isClassEditing.value;
    const activeClass = styleTarget.activeClass.value;

    if (!node) {
      resetValues();
      return;
    }

    if (isClassEditing && !activeClass) {
      resetValues();
      return;
    }

    headingLevel.value = getContentHeadingLevel(node);
    const fontFamilyState = getStyleValueState("fontFamily");
    fontFamilyMixed.value = fontFamilyState.isMixed;
    fontFamily.value = fontFamilyState.isMixed
      ? ""
      : (fontFamilyState.value ?? "");

    const sizeState = getStyleValueState("fontSize");
    fontSizeMixed.value = sizeState.isMixed;
    const sizeRaw = sizeState.isMixed ? "" : (sizeState.value ?? "");
    const sizeMatch = sizeRaw.match(/^([\d.]+)([a-zA-Z%]+)?$/);
    if (sizeMatch) {
      fontSize.value = sizeMatch[1] ?? "";
      fontSizeUnit.value = sizeMatch[2] ?? "px";
    } else {
      fontSize.value = sizeRaw;
    }

    const fontWeightState = getStyleValueState("fontWeight");
    fontWeightMixed.value = fontWeightState.isMixed;
    fontWeight.value = fontWeightState.isMixed
      ? ""
      : (fontWeightState.value ?? "");

    const lineHeightState = getStyleValueState("lineHeight");
    lineHeightMixed.value = lineHeightState.isMixed;
    const lhRaw = lineHeightState.isMixed ? "" : (lineHeightState.value ?? "");
    const lhMatch = lhRaw.match(/^([\d.]+)([a-zA-Z%]+)?$/);
    if (lhMatch) {
      lineHeight.value = lhMatch[1] ?? "";
      lineHeightUnit.value = lhMatch[2] ?? "px";
    } else {
      lineHeight.value = lhRaw;
    }

    const letterSpacingState = getStyleValueState("letterSpacing");
    letterSpacingMixed.value = letterSpacingState.isMixed;
    const lsRaw = letterSpacingState.isMixed
      ? ""
      : (letterSpacingState.value ?? "");
    const lsMatch = lsRaw.match(/^(-?[\d.]+)([a-zA-Z%]+)?$/);
    if (lsMatch) {
      letterSpacing.value = lsMatch[1] ?? "";
      letterSpacingUnit.value = lsMatch[2] ?? "px";
    } else {
      letterSpacing.value = lsRaw;
    }

    const textAlignState = getStyleValueState("textAlign");
    textAlignMixed.value = textAlignState.isMixed;
    textAlign.value = textAlignState.isMixed
      ? ""
      : ((textAlignState.value as TextAlign | undefined) ?? "");

    const textTransformState = getStyleValueState("textTransform");
    textTransformMixed.value = textTransformState.isMixed;
    textTransform.value = textTransformState.isMixed
      ? ""
      : ((textTransformState.value as TextTransform | undefined) ?? "");

    const textWrapState = getStyleValueState("textWrap");
    textWrapMixed.value = textWrapState.isMixed;
    textWrap.value = textWrapState.isMixed
      ? ""
      : ((textWrapState.value as TextWrap | undefined) ?? "wrap");

    const textColorState = getStyleValueState("color");
    textColorMixed.value = textColorState.isMixed;
    textColor.value = textColorState.isMixed
      ? ""
      : (textColorState.value ?? "");
  },
  { immediate: true, flush: "post" },
);

function resetValues(): void {
  headingLevel.value = 2;
  fontFamily.value = "";
  fontSize.value = "";
  fontSizeUnit.value = "px";
  fontWeight.value = "400";
  lineHeight.value = "";
  lineHeightUnit.value = "px";
  letterSpacing.value = "";
  letterSpacingUnit.value = "px";
  textAlign.value = "left";
  textTransform.value = "none";
  textWrap.value = "wrap";
  textColor.value = "#FFFFFF";
  fontFamilyMixed.value = false;
  fontSizeMixed.value = false;
  fontWeightMixed.value = false;
  lineHeightMixed.value = false;
  letterSpacingMixed.value = false;
  textAlignMixed.value = false;
  textTransformMixed.value = false;
  textWrapMixed.value = false;
  textColorMixed.value = false;
}

function validateHeadingLevelUpdate(updates: Record<string, unknown>): boolean {
  const candidate = buildContentValidationCandidate(
    selectedNode.value,
    updates,
  );
  const parsed = safeParse("text", candidate);
  const valid = "success" in parsed && parsed.success;

  if (!valid) {
    validationError.value = "Invalid heading level.";
    return false;
  }

  validationError.value = null;
  return true;
}

async function saveFontFamily(value: string): Promise<void> {
  if (!hasSaveContext()) return;
  if (!validateTypographyProperty("fontFamily", value, "Invalid font family."))
    return;
  fontFamily.value = value;
  fontFamilyOpen.value = false;
  await styleTarget.saveStyleProperty(
    "fontFamily",
    value,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveHeadingLevel(value: unknown): Promise<void> {
  if (!selectedNodeId.value || !isHeading.value) return;
  if (!props.currentItemType || !props.currentItemSlug) return;

  const parsedLevel = Number(value);
  if (!Number.isInteger(parsedLevel) || parsedLevel < 1 || parsedLevel > 6) {
    validationError.value = "Invalid heading level.";
    return;
  }

  const updates = { level: parsedLevel };
  if (!validateHeadingLevelUpdate(updates)) return;
  if (getContentHeadingLevel(selectedNode.value) === parsedLevel) return;

  const success = await saveProperties(
    updates,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    headingLevel.value = parsedLevel as HeadingLevel;
  }
}

async function saveFontSize(raw: string): Promise<void> {
  fontSize.value = raw;
  await saveNumericTypographyBatch({ fontSize: raw });
}

async function saveFontWeight(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed || !hasSaveContext()) return;

  const resolved =
    extractVariableReferenceKey(trimmed) !== null
      ? trimmed
      : FontWeightSchema.safeParse(trimmed).success
        ? FontWeightSchema.parse(trimmed)
        : null;

  if (!resolved) {
    validationError.value = "Invalid font weight.";
    return;
  }

  if (!validateTypographyProperty("fontWeight", resolved)) return;

  fontWeight.value = resolved;
  await styleTarget.saveStyleProperty(
    "fontWeight",
    resolved,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveLineHeight(raw: string): Promise<void> {
  lineHeight.value = raw;
  await saveNumericTypographyBatch({ lineHeight: raw });
}

async function saveLetterSpacing(raw: string): Promise<void> {
  letterSpacing.value = raw;
  await saveNumericTypographyBatch({ letterSpacing: raw });
}

async function saveTextAlign(value: TextAlign): Promise<void> {
  if (!hasSaveContext()) return;
  const parsed = TextAlignSchema.safeParse(value);
  if (!parsed.success) {
    validationError.value = "Invalid text alignment.";
    return;
  }
  if (!validateTypographyProperty("textAlign", parsed.data)) return;
  textAlign.value = parsed.data;
  await styleTarget.saveStyleProperty(
    "textAlign",
    parsed.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveTextTransform(value: TextTransform): Promise<void> {
  if (!hasSaveContext()) return;
  const parsed = TextTransformSchema.safeParse(value);
  if (!parsed.success) {
    validationError.value = "Invalid text transform.";
    return;
  }
  if (!validateTypographyProperty("textTransform", parsed.data)) return;
  textTransform.value = parsed.data;
  await styleTarget.saveStyleProperty(
    "textTransform",
    parsed.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveTextWrap(value: TextWrap): Promise<void> {
  if (!hasSaveContext()) return;
  const parsed = TextWrapSchema.safeParse(value);
  if (!parsed.success) {
    validationError.value = "Invalid text wrap.";
    return;
  }
  if (!validateTypographyProperty("textWrap", parsed.data)) return;
  textWrap.value = parsed.data;
  await styleTarget.saveStyleProperty(
    "textWrap",
    parsed.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

function handleTextWrapChange(value: unknown): void {
  const parsed = TextWrapSchema.safeParse(value);
  if (!parsed.success) return;
  void saveTextWrap(parsed.data);
}

function captureColorPreviewOrigin(): void {
  if (previewOriginColor.value === null) {
    previewOriginColor.value = getCurrentBreakpointStyleValue("color");
  }
}

function previewTextColor(value: string): void {
  if (!hasEditableTarget() || textColorMixed.value) {
    return;
  }

  if (!validateTypographyProperty("color", value, "Invalid text color.")) {
    return;
  }

  captureColorPreviewOrigin();
  textColor.value = value;
  typographyPreviewQueue.queue({ color: value });
}

async function persistTextColor(value: string): Promise<void> {
  if (!hasEditableTarget() || textColorMixed.value) {
    return;
  }

  if (!validateTypographyProperty("color", value, "Invalid text color.")) {
    return;
  }

  flushPendingTypographyPreview();
  textColor.value = value;

  const originRaw = previewOriginColor.value;
  const originDisplay = originRaw === null ? undefined : getStyleValue("color");

  const success = await styleTarget.saveStyleProperty(
    "color",
    value,
    props.currentItemType,
    props.currentItemSlug,
  );

  previewOriginColor.value = null;

  if (!success && originRaw !== undefined) {
    restoreTypographyPreview(
      { color: originRaw },
      originDisplay !== undefined ? { color: originDisplay } : undefined,
    );
  }
}

async function onFontSizeUnitChange(unit: unknown): Promise<void> {
  if (typeof unit !== "string") return;
  fontSizeUnit.value = unit;
  if (!fontSize.value.trim()) return;
  await saveFontSize(fontSize.value);
}

async function onLineHeightUnitChange(unit: unknown): Promise<void> {
  if (typeof unit !== "string") return;
  lineHeightUnit.value = unit;
  if (!lineHeight.value.trim()) return;
  await saveLineHeight(lineHeight.value);
}

async function onLetterSpacingUnitChange(unit: unknown): Promise<void> {
  if (typeof unit !== "string") return;
  letterSpacingUnit.value = unit;
  if (!letterSpacing.value.trim()) return;
  await saveLetterSpacing(letterSpacing.value);
}

const resetCurrentBreakpointTypography = async (): Promise<void> => {
  if (!hasSaveContext()) return;
  await typographyOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
};

type ScrubTarget = "fontSize" | "lineHeight" | "letterSpacing";
type TypographyPreviewKey = ScrubTarget | "color";

const typographyPreviewQueue = useStylePreviewQueue<
  Record<TypographyPreviewKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
});

const typographyScrubSession = usePointerScrubSession();

function syncNumericTypographyRefsFromTarget(): void {
  const sizeState = getStyleValueState("fontSize");
  fontSizeMixed.value = sizeState.isMixed;
  const sizeRaw = sizeState.isMixed ? "" : (sizeState.value ?? "");
  const sizeMatch = sizeRaw.match(/^(-?[\d.]+)([a-zA-Z%]+)?$/);
  if (sizeMatch) {
    fontSize.value = sizeMatch[1] ?? "";
    fontSizeUnit.value = sizeMatch[2] ?? "px";
  } else {
    fontSize.value = sizeRaw;
  }

  const lineHeightState = getStyleValueState("lineHeight");
  lineHeightMixed.value = lineHeightState.isMixed;
  const lhRaw = lineHeightState.isMixed ? "" : (lineHeightState.value ?? "");
  const lhMatch = lhRaw.match(/^(-?[\d.]+)([a-zA-Z%]+)?$/);
  if (lhMatch) {
    lineHeight.value = lhMatch[1] ?? "";
    lineHeightUnit.value = lhMatch[2] ?? "px";
  } else {
    lineHeight.value = lhRaw;
  }

  const letterSpacingState = getStyleValueState("letterSpacing");
  letterSpacingMixed.value = letterSpacingState.isMixed;
  const lsRaw = letterSpacingState.isMixed
    ? ""
    : (letterSpacingState.value ?? "");
  const lsMatch = lsRaw.match(/^(-?[\d.]+)([a-zA-Z%]+)?$/);
  if (lsMatch) {
    letterSpacing.value = lsMatch[1] ?? "";
    letterSpacingUnit.value = lsMatch[2] ?? "px";
  } else {
    letterSpacing.value = lsRaw;
  }
}

function getNormalizedTypographyValue(
  target: ScrubTarget,
  raw: string,
): string {
  switch (target) {
    case "fontSize":
      return normalizeNumericValue(raw, fontSizeUnit.value);
    case "lineHeight":
      return normalizeNumericValue(raw, lineHeightUnit.value);
    case "letterSpacing":
      return normalizeNumericValue(raw, letterSpacingUnit.value);
  }
}

async function saveNumericTypographyBatch(
  updates: Partial<Record<ScrubTarget, string>>,
  itemType: Props["currentItemType"] = props.currentItemType,
  itemSlug: Props["currentItemSlug"] = props.currentItemSlug,
  options?: {
    compareAgainst?: Partial<Record<ScrubTarget, string>>;
  },
): Promise<boolean> {
  if (!hasSaveContext()) return false;

  const normalizedEntries = Object.entries(updates).map(([key, value]) => [
    key as ScrubTarget,
    getNormalizedTypographyValue(key as ScrubTarget, value),
  ]);

  const normalizedUpdates = Object.fromEntries(normalizedEntries) as Partial<
    Record<ScrubTarget, string>
  >;

  const hasChanges = normalizedEntries.some(([key, nextValue]) => {
    const typographyKey = key as ScrubTarget;
    const currentValue =
      options?.compareAgainst?.[typographyKey] ?? getStyleValue(typographyKey);
    return currentValue !== nextValue;
  });

  if (!hasChanges) {
    return true;
  }

  for (const [key, nextValue] of normalizedEntries) {
    const message =
      key === "fontSize"
        ? "Invalid font size."
        : key === "lineHeight"
          ? "Invalid line height."
          : "Invalid letter spacing.";

    if (!validateTypographyProperty(key as TypographyKey, nextValue, message)) {
      return false;
    }
  }

  const success = await styleTarget.saveStyleProperties(
    normalizedUpdates,
    itemType,
    itemSlug,
  );

  if (!success) {
    return false;
  }

  syncNumericTypographyRefsFromTarget();
  return true;
}

function getScrubRef(target: ScrubTarget): string {
  switch (target) {
    case "fontSize":
      return fontSize.value;
    case "lineHeight":
      return lineHeight.value;
    case "letterSpacing":
      return letterSpacing.value;
  }
}

function setScrubRef(target: ScrubTarget, val: string): void {
  switch (target) {
    case "fontSize":
      fontSize.value = val;
      break;
    case "lineHeight":
      lineHeight.value = val;
      break;
    case "letterSpacing":
      letterSpacing.value = val;
      break;
  }
}

function getScrubUnit(target: ScrubTarget): string {
  switch (target) {
    case "fontSize":
      return fontSizeUnit.value;
    case "lineHeight":
      return lineHeightUnit.value;
    case "letterSpacing":
      return letterSpacingUnit.value;
  }
}

function cancelPendingTypographyPreview(): void {
  typographyPreviewQueue.cancel();
  previewOriginColor.value = null;
}

watch(
  [
    selectedNodeId,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
    styleTarget.activeClassName,
  ],
  () => {
    cancelPendingTypographyPreview();
  },
);

function flushPendingTypographyPreview(): void {
  typographyPreviewQueue.flush();
}

function queueTypographyPreview(
  updates: Partial<Record<TypographyPreviewKey, string | undefined>>,
): void {
  typographyPreviewQueue.queue(updates);
}

function restoreTypographyPreview(
  updates: Partial<Record<TypographyPreviewKey, string | undefined>>,
  displayValues?: Partial<Record<TypographyPreviewKey, string>>,
): void {
  typographyPreviewQueue.restore(updates);

  if (displayValues) {
    if (displayValues.fontSize !== undefined) {
      fontSize.value = displayValues.fontSize;
    }
    if (displayValues.lineHeight !== undefined) {
      lineHeight.value = displayValues.lineHeight;
    }
    if (displayValues.letterSpacing !== undefined) {
      letterSpacing.value = displayValues.letterSpacing;
    }
    if (displayValues.color !== undefined) {
      textColor.value = displayValues.color;
    }
  }

  syncNumericTypographyRefsFromTarget();
}

function resolveScrubOrigin(
  value: string,
  fallbackUnit: string,
): { startValue: number; unit: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);

  if (!match) {
    return { startValue: 0, unit: fallbackUnit };
  }

  return {
    startValue: Number.parseFloat(match[1] ?? "0"),
    unit: match[2] ?? fallbackUnit,
  };
}

function formatScrubDisplayValue(value: number, unit: string): string {
  return unit === "px" ? String(value) : `${value}${unit}`;
}

function handleMouseDown(target: ScrubTarget, e: MouseEvent): void {
  if (!(e.target instanceof HTMLInputElement)) return;
  if (!hasSaveContext()) return;

  const { startValue, unit } = resolveScrubOrigin(
    e.target.value,
    getScrubUnit(target),
  );
  const originRawValues = {
    [target]: getCurrentBreakpointStyleValue(target),
  } as Partial<Record<ScrubTarget, string | undefined>>;
  const originDisplayValues = {
    [target]: getStyleValue(target),
  } as Partial<Record<ScrubTarget, string>>;

  typographyScrubSession.start({
    event: e,
    onMove: ({ deltaX }) => {
      const formatted = formatScrubDisplayValue(
        Math.round(startValue + deltaX),
        unit,
      );
      setScrubRef(target, formatted);
      queueTypographyPreview({
        [target]: getNormalizedTypographyValue(target, formatted),
      });
    },
    onCancel: () => {
      restoreTypographyPreview(originRawValues, originDisplayValues);
    },
    onCommit: () => {
      flushPendingTypographyPreview();
      const finalVal = getScrubRef(target);
      void saveNumericTypographyBatch(
        { [target]: finalVal },
        props.currentItemType,
        props.currentItemSlug,
        { compareAgainst: originDisplayValues },
      ).then((success) => {
        if (!success) {
          restoreTypographyPreview(originRawValues, originDisplayValues);
        }
      });
    },
  });
}

onMounted(async () => {
  try {
    const result = unwrapFontActionResult(
      await actions.fonts.getConfig({}),
      FontConfigActionSuccessSchema,
      "Failed to load fonts",
      { source: "TypographyProperty.onMounted" },
    );
    if (!result.success) return;

    loadedFonts.value = result.data.data.customFonts.map((font) => ({
      id: font.id,
      name: font.name,
      family: font.family,
    }));

    enabledGoogleFonts.value = result.data.data.enabledGoogleFonts.map(
      (font: EnabledGoogleFontRecord) => ({
        value: font.family,
        label: font.family,
      }),
    );
  } catch (error) {
    log("error", "[TypographyProperty] Failed to load fonts", { error });
  }
});
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="props.defaultOpen"
    :has-changes="typographyOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Typography"
    icon="typography"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="typographyOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="
          typographyOverrides.currentBreakpointLabel.value
        "
        :show-reset="
          sectionOpen && typographyOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="typography-reset-breakpoint"
        @reset="void resetCurrentBreakpointTypography()"
      />
    </template>

    <div class="space-y-4 pb-4">
      <!-- FONT FAMILY -->
      <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.font") }}</label
        >
        <Popover v-model:open="fontFamilyOpen">
          <PopoverTrigger as-child>
            <Button
              type="button"
              variant="outline"
              class="w-full min-w-0 justify-between px-3 text-left text-xs font-normal"
              :disabled="isPanelDisabled"
            >
              <span
                class="min-w-0 flex-1 truncate"
                :style="{
                  fontFamily: fontFamilyMixed
                    ? 'inherit'
                    : fontFamily || 'inherit',
                }"
              >
                {{ currentFontLabel }}
              </span>
              <span
                :class="[
                  studioIcons.chevronDown,
                  'size-3.5 shrink-0 opacity-50 transition-transform duration-200',
                  { 'rotate-180': fontFamilyOpen },
                ]"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            :side-offset="4"
            class="w-66 p-0 animate-in fade-in-0 zoom-in-95 duration-200"
            @open-auto-focus.prevent
          >
            <div class="p-2 border-b border-dashed border-border-70">
              <div class="relative">
                <span
                  :class="[
                    studioIcons.search,
                    'absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none',
                  ]"
                />
                <input
                  v-model="fontSearch"
                  type="text"
                  :placeholder="t('inspector.typography.searchFonts')"
                  class="w-full h-8 pl-7 pr-3 bg-sidebar border border-dashed border-border-70 rounded-sm text-xs placeholder:text-muted-foreground focus:outline-none focus:border-border transition-colors"
                />
              </div>
            </div>
            <div class="max-h-60 overflow-y-auto p-1">
              <div v-if="filteredCustomFonts.length > 0">
                <div
                  class="px-2 py-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
                >
                  {{ t("inspector.typography.customFonts") }}
                </div>
                <button
                  v-for="font in filteredCustomFonts"
                  :key="font.id"
                  type="button"
                  @click="saveFontFamily(font.family)"
                  class="w-full px-3 py-2 text-xs text-left rounded-sm hover:bg-muted transition-colors"
                  :class="{
                    'bg-muted text-foreground': fontFamily === font.family,
                    'text-muted-foreground': fontFamily !== font.family,
                  }"
                  :style="{ fontFamily: font.family }"
                >
                  {{ font.name }}
                </button>
              </div>
              <div v-if="filteredGoogleFonts.length > 0">
                <div
                  class="px-2 py-1.5 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
                  :class="{
                    'mt-2 border-t border-dashed border-border-70 pt-2':
                      filteredCustomFonts.length > 0,
                  }"
                >
                  {{ t("inspector.typography.googleFonts") }}
                </div>
                <button
                  v-for="font in filteredGoogleFonts"
                  :key="font.value"
                  type="button"
                  @click="saveFontFamily(font.value)"
                  class="w-full px-3 py-2 text-xs text-left rounded-sm hover:bg-muted transition-colors"
                  :class="{
                    'bg-muted text-foreground': fontFamily === font.value,
                    'text-muted-foreground': fontFamily !== font.value,
                  }"
                  :style="{ fontFamily: font.value }"
                >
                  {{ font.label }}
                </button>
              </div>
              <div
                v-if="!hasFilteredResults"
                class="px-3 py-4 text-xs text-muted-foreground text-center"
              >
                {{ t("inspector.typography.noFonts") }}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div v-if="isHeading" class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-3 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.level") }}</label
        >
        <div
          class="flex h-9 rounded-md border border-border/50 bg-background/80 p-0.8 gap-0.5 overflow-hidden"
        >
          <button
            v-for="level in [1, 2, 3, 4, 5, 6]"
            :key="level"
            type="button"
            class="flex-1 rounded-sm border text-xs font-medium tracking-wider transition-all duration-200 ease-out font-serif"
            :class="
              headingLevel === level
                ? 'border-dashed border-primary/70 bg-primary/30 text-primary-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/40 hover:text-foreground'
            "
            :disabled="isPanelDisabled"
            @click="saveHeadingLevel(level)"
          >
            H{{ level }}
          </button>
        </div>
      </div>

      <!-- COLOR -->
      <ColorField
        v-model="textColor"
        :label="t('inspector.typography.color')"
        layout="unified"
        show-variables
        show-alpha
        show-design-colors
        content-side="left"
        content-align="center"
        class="min-w-0 w-full"
        :contrast-against="textContrastBackground"
        :disabled="isPanelDisabled"
        :read-only="textColorMixed"
        :placeholder="textColorMixed ? t('inspector.typography.mixed') : '#000000'"
        @preview="previewTextColor"
        @update:model-value="textColor = $event"
        @commit="persistTextColor"
      />

      <!-- WEIGHT -->
      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.weight") }}</label
        >
        <VariableAssignableInput
          v-model="fontWeight"
          data-testid="typography-font-weight-input"
          :disabled="isPanelDisabled"
          class="w-full"
          input-class="h-8 bg-sidebar border-dashed border-border-70 text-xs cursor-text focus:cursor-text"
          :placeholder="fontWeightMixed ? t('inspector.typography.mixed') : '400'"
          @commit="saveFontWeight"
        >
          <template v-if="!isFontWeightVariable" #control>
            <Select
              :model-value="fontWeightMixed ? undefined : fontWeight"
              :disabled="isPanelDisabled || fontWeightMixed"
              @update:model-value="(v) => saveFontWeight(String(v))"
            >
              <SelectTrigger
                hide-icon
                :class="TYPOGRAPHY_WEIGHT_SELECT_TRIGGER_CLASS"
              >
                <SelectValue
                  :placeholder="fontWeightMixed ? t('inspector.typography.mixed') : t('inspector.typography.selectWeight')"
                />
              </SelectTrigger>
              <SelectContent
                class="border-border-70 bg-sidebar text-foreground shadow-xl"
              >
                <SelectItem
                  v-for="w in fontWeights"
                  :key="w.value"
                  :value="w.value"
                  class="text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
                  :style="{ fontWeight: w.value }"
                  >{{ w.label }}</SelectItem
                >
              </SelectContent>
            </Select>
          </template>
        </VariableAssignableInput>
      </div>

      <!-- SIZE -->
      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.size") }}</label
        >
        <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div class="relative flex items-center">
            <span
              :class="[
                'absolute left-2.5 text-muted-foreground/60',
                studioIcons.textFontSize,
                'size-3.5 z-10 pointer-events-none',
              ]"
            />
            <VariableAssignableInput
              v-model="fontSize"
              @commit="saveFontSize"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-border-70 border-dashed text-xs cursor-ew-resize focus:cursor-text"
              :placeholder="fontSizeMixed ? t('inspector.typography.mixed') : t('inspector.typography.size')"
              @mousedown="(e: MouseEvent) => handleMouseDown('fontSize', e)"
            />
          </div>
          <Select
            :model-value="fontSizeUnit"
            @update:model-value="onFontSizeUnitChange"
            :disabled="isPanelDisabled || fontSizeMixed"
          >
            <SelectTrigger
              hide-icon
              :class="TYPOGRAPHY_UNIT_SELECT_TRIGGER_CLASS"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="end"
              class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
            >
              <SelectItem
                v-for="unit in units"
                :key="unit"
                :value="unit"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
                >{{ unit }}</SelectItem
              >
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- LINE HEIGHT -->
      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.lineHeight") }}</label
        >
        <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div class="relative flex items-center">
            <span
              :class="[
                'absolute left-2.5 text-muted-foreground/60',
                studioIcons.lineHeight,
                'size-3.5 z-10 pointer-events-none',
              ]"
            />
            <VariableAssignableInput
              v-model="lineHeight"
              @commit="saveLineHeight"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-border-70 border-dashed text-xs cursor-ew-resize focus:cursor-text"
              :placeholder="lineHeightMixed ? t('inspector.typography.mixed') : t('inspector.typography.auto')"
              @mousedown="(e: MouseEvent) => handleMouseDown('lineHeight', e)"
            />
          </div>
          <Select
            :model-value="lineHeightUnit"
            @update:model-value="onLineHeightUnitChange"
            :disabled="isPanelDisabled || lineHeightMixed"
          >
            <SelectTrigger
              hide-icon
              :class="TYPOGRAPHY_UNIT_SELECT_TRIGGER_CLASS"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="end"
              class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
            >
              <SelectItem
                v-for="unit in units"
                :key="unit"
                :value="unit"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
                >{{ unit }}</SelectItem
              >
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- SPACING -->
      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.spacing") }}</label
        >
        <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div class="relative flex items-center">
            <span
              :class="[
                'absolute left-2.5 text-muted-foreground/60',
                studioIcons.letterSpacing,
                'size-3.5 z-10 pointer-events-none',
              ]"
            />
            <VariableAssignableInput
              v-model="letterSpacing"
              @commit="saveLetterSpacing"
              :disabled="isPanelDisabled"
              class="w-full"
              input-class="h-8 pl-8 bg-sidebar border-border-70 border-dashed text-xs cursor-ew-resize focus:cursor-text"
              :placeholder="letterSpacingMixed ? t('inspector.typography.mixed') : '0'"
              @mousedown="
                (e: MouseEvent) => handleMouseDown('letterSpacing', e)
              "
            />
          </div>
          <Select
            :model-value="letterSpacingUnit"
            @update:model-value="onLetterSpacingUnitChange"
            :disabled="isPanelDisabled || letterSpacingMixed"
          >
            <SelectTrigger
              hide-icon
              :class="TYPOGRAPHY_UNIT_SELECT_TRIGGER_CLASS"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="end"
              class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
            >
              <SelectItem
                v-for="unit in units"
                :key="unit"
                :value="unit"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
                >{{ unit }}</SelectItem
              >
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- TEXT WRAP -->
      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <label
          class="pt-2 text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >{{ t("inspector.typography.wrap") }}</label
        >
        <Select
          :model-value="textWrapMixed ? undefined : textWrap"
          :disabled="isPanelDisabled || textWrapMixed"
          @update:model-value="handleTextWrapChange"
        >
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in TEXT_WRAP_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="grid grid-cols-[72px_1fr] gap-3 items-start">
        <div />
        <div class="space-y-2">
          <div
            class="flex rounded-md border border-border/50 p-0.5 bg-background/80"
          >
            <button
              v-for="align in ['left', 'center', 'right', 'justify'] as const"
              :key="align"
              type="button"
              class="flex-1 flex items-center justify-center h-7 rounded-sm transition-colors"
              :class="
                !textAlignMixed && textAlign === align
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :title="t(`inspector.typography.align.${align}` as const)"
              :disabled="isPanelDisabled"
              @click="saveTextAlign(align)"
            >
              <span :class="[getTextAlignIconClass(align), 'size-3.5']" />
            </button>
          </div>

          <div
            class="flex rounded-md border border-border/50 p-0.5 bg-background/80"
          >
            <button
              v-for="transform in [
                'uppercase',
                'capitalize',
                'lowercase',
              ] as const"
              :key="transform"
              type="button"
              class="flex-1 flex items-center justify-center h-7 text-xs font-semibold rounded-sm transition-colors"
              :class="
                !textTransformMixed && textTransform === transform
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :title="t(`inspector.typography.transform.${transform}` as const)"
              :disabled="isPanelDisabled"
              @click="
                saveTextTransform(
                  textTransform === transform ? 'none' : transform,
                )
              "
            >
              <span v-if="transform === 'uppercase'">AG</span>
              <span v-else-if="transform === 'capitalize'">Ag</span>
              <span v-else>ag</span>
            </button>
          </div>
        </div>
      </div>

      <div class="h-px bg-border/70 w-full" />

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
