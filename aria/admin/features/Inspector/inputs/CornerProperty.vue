<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";

import { Slider } from "@/components/ui/slider";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import {
  CORNER_SHAPE_OPTIONS,
  DEFAULT_CORNER_SHAPE,
  normalizeCornerShapeValue,
  parseCornerShapeShorthand,
  parseCornerShorthand,
  type CornerValue,
} from "../schemas/corner.schema";
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

type CornerKey =
  | "borderTopLeftRadius"
  | "borderTopRightRadius"
  | "borderBottomRightRadius"
  | "borderBottomLeftRadius";

type CornerShapeFieldKey =
  | "topLeft"
  | "topRight"
  | "bottomRight"
  | "bottomLeft";

type CornerSectionStyleKey = "borderRadius" | "cornerShape" | CornerKey;

const CORNER_SECTION_STYLE_KEYS = [
  "borderRadius",
  "cornerShape",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const satisfies readonly CornerSectionStyleKey[];

const CORNER_SHAPE_FIELDS: Array<{
  key: CornerShapeFieldKey;
  label: string;
  testId: string;
}> = [
  {
    key: "topLeft",
    label: t("inspector.corner.topLeft"),
    testId: "corner-top-left-shape-select",
  },
  {
    key: "topRight",
    label: t("inspector.corner.topRight"),
    testId: "corner-top-right-shape-select",
  },
  {
    key: "bottomRight",
    label: t("inspector.corner.bottomRight"),
    testId: "corner-bottom-right-shape-select",
  },
  {
    key: "bottomLeft",
    label: t("inspector.corner.bottomLeft"),
    testId: "corner-bottom-left-shape-select",
  },
];

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { styleTarget } = useInspectorStyleTargetWithGlobalDefaults({
  propertySave,
});
const cornerOverrides = useInspectorPropertyOverrides({
  propertyKeys: CORNER_SECTION_STYLE_KEYS,
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

const isRadiusLinked = ref(true);
const isShapeLinked = ref(true);
const topLeft = ref("0");
const topRight = ref("0");
const bottomRight = ref("0");
const bottomLeft = ref("0");
const linkedRadiusInput = ref("0");
const cornerShapeValue = ref(DEFAULT_CORNER_SHAPE);
const topLeftShape = ref(DEFAULT_CORNER_SHAPE);
const topRightShape = ref(DEFAULT_CORNER_SHAPE);
const bottomRightShape = ref(DEFAULT_CORNER_SHAPE);
const bottomLeftShape = ref(DEFAULT_CORNER_SHAPE);
const validationError = ref<string | null>(null);

type CornerPreviewUpdates = Partial<
  Record<CornerSectionStyleKey, string | undefined>
>;

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

const defaultCorner = computed<CornerValue>(() => {
  const fallback: CornerValue = {
    borderRadius: { default: "0" },
    cornerShape: { default: DEFAULT_CORNER_SHAPE },
  };

  return (getDefault("corner") as CornerValue) ?? fallback;
});

const cornerPreviewQueue = useStylePreviewQueue<
  Record<CornerSectionStyleKey, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
  onRestore: syncCornerValues,
});

const cornerScrubSession = usePointerScrubSession();

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function getStyleValue(key: CornerSectionStyleKey, fallback: string): string {
  return (
    styleTarget.getStyleValue(key, fallback, breakpointName.value) ?? fallback
  );
}

function getCurrentBreakpointCornerValue(
  key: CornerSectionStyleKey,
): string | undefined {
  return styleTarget.getResponsiveStyleMap(key)[breakpointName.value];
}

function getDefaultCornerShapeValue(breakpoint: string): string {
  const responsiveMap = defaultCorner.value.cornerShape ?? {
    default: DEFAULT_CORNER_SHAPE,
  };

  return (
    responsiveMap[breakpoint] ?? responsiveMap.default ?? DEFAULT_CORNER_SHAPE
  );
}

function normalizeRadius(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "0";

  if (trimmed.startsWith("var(") || trimmed.startsWith("calc(")) {
    return trimmed;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${Number(trimmed)}px`;
  }

  return trimmed;
}

function parseRadiusNumber(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(px)?$/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1] ?? "0");
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRadiusInput(value: string): string {
  const parsed = parseRadiusNumber(value);
  if (parsed == null) {
    return value;
  }

  return String(parsed);
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

const CORNER_SHAPE_SLIDER_MIN = -5;
const CORNER_SHAPE_SLIDER_MAX = 5;
const CORNER_SHAPE_SLIDER_STEP = 0.1;

const FINITE_CORNER_SHAPE_CURVATURES: Record<string, number> = {
  scoop: -1,
  bevel: 0,
  round: 1,
  squircle: 2,
};

function getSliderEventValue(values: number[] | undefined): number | null {
  const nextValue = values?.[0];

  return typeof nextValue === "number" && Number.isFinite(nextValue)
    ? nextValue
    : null;
}

function formatSliderNumber(value: number): string {
  const rounded = Number.parseFloat(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseFiniteCornerShapeCurvature(value: string): number | null {
  const normalized = normalizeCornerShapeValue(value);
  if (normalized in FINITE_CORNER_SHAPE_CURVATURES) {
    return FINITE_CORNER_SHAPE_CURVATURES[normalized] ?? null;
  }

  const match = normalized.match(
    /^superellipse\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)$/i,
  );
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function clampCornerShapeCurvature(value: number): number {
  return Math.min(
    CORNER_SHAPE_SLIDER_MAX,
    Math.max(CORNER_SHAPE_SLIDER_MIN, value),
  );
}

function getCornerShapeSliderValue(value: string): number | null {
  const parsed = parseFiniteCornerShapeCurvature(value);
  if (parsed == null) {
    return null;
  }

  return clampCornerShapeCurvature(parsed);
}

function getCornerShapeSliderModelValue(value: string): number[] {
  return [getCornerShapeSliderValue(value) ?? 0];
}

function buildCornerShapeValueFromCurvature(curvature: number): string {
  const rounded = Number.parseFloat(
    clampCornerShapeCurvature(curvature).toFixed(1),
  );

  if (rounded === -1) return "scoop";
  if (rounded === 0) return "bevel";
  if (rounded === 1) return "round";
  if (rounded === 2) return "squircle";

  return `superellipse(${formatSliderNumber(rounded)})`;
}

function formatCornerShapeSliderValue(value: string): string {
  const parsed = parseFiniteCornerShapeCurvature(value);
  return parsed == null ? "" : formatSliderNumber(parsed);
}

function getCornerShapeDisplayLabel(value: string): string {
  const normalized = normalizeCornerShapeValue(value);
  const optionKeyByValue: Record<string, Parameters<typeof t>[0]> = {
    round: "inspector.corner.shape.round",
    squircle: "inspector.corner.shape.squircle",
    bevel: "inspector.corner.shape.bevel",
    scoop: "inspector.corner.shape.scoop",
    notch: "inspector.corner.shape.notch",
    square: "inspector.corner.shape.square",
    "superellipse(1.5)": "inspector.corner.shape.softSuperellipse",
    "superellipse(0.5)": "inspector.corner.shape.pinchedSuperellipse",
    "superellipse(-0.5)": "inspector.corner.shape.softScoop",
    "superellipse(-1.5)": "inspector.corner.shape.deepScoop",
  };
  const key = optionKeyByValue[normalized];
  if (key) return t(key);

  const parsed = parseFiniteCornerShapeCurvature(normalized);
  if (parsed != null) {
    return t("inspector.corner.superellipse", {
      value: formatSliderNumber(parsed),
    });
  }

  return normalized;
}

function buildCornerCandidate(options: {
  corners: Record<CornerKey, string>;
  cornerShape: string;
}): CornerValue {
  return {
    ...defaultCorner.value,
    cornerShape: {
      ...(defaultCorner.value.cornerShape ?? { default: DEFAULT_CORNER_SHAPE }),
      [breakpointName.value]: options.cornerShape,
    },
    borderTopLeftRadius: {
      ...(defaultCorner.value.borderTopLeftRadius ?? {}),
      [breakpointName.value]: options.corners.borderTopLeftRadius,
    },
    borderTopRightRadius: {
      ...(defaultCorner.value.borderTopRightRadius ?? {}),
      [breakpointName.value]: options.corners.borderTopRightRadius,
    },
    borderBottomRightRadius: {
      ...(defaultCorner.value.borderBottomRightRadius ?? {}),
      [breakpointName.value]: options.corners.borderBottomRightRadius,
    },
    borderBottomLeftRadius: {
      ...(defaultCorner.value.borderBottomLeftRadius ?? {}),
      [breakpointName.value]: options.corners.borderBottomLeftRadius,
    },
  };
}

function getCurrentCornerValues(): Record<CornerKey, string> {
  return {
    borderTopLeftRadius: normalizeRadius(topLeft.value),
    borderTopRightRadius: normalizeRadius(topRight.value),
    borderBottomRightRadius: normalizeRadius(bottomRight.value),
    borderBottomLeftRadius: normalizeRadius(bottomLeft.value),
  };
}

function getCornerRefValue(key: CornerKey): string {
  switch (key) {
    case "borderTopLeftRadius":
      return topLeft.value;
    case "borderTopRightRadius":
      return topRight.value;
    case "borderBottomRightRadius":
      return bottomRight.value;
    case "borderBottomLeftRadius":
      return bottomLeft.value;
  }
}

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

function getCurrentCornerShapeFields(): Record<CornerShapeFieldKey, string> {
  return {
    topLeft: normalizeCornerShapeValue(topLeftShape.value),
    topRight: normalizeCornerShapeValue(topRightShape.value),
    bottomRight: normalizeCornerShapeValue(bottomRightShape.value),
    bottomLeft: normalizeCornerShapeValue(bottomLeftShape.value),
  };
}

function buildCornerShapeShorthand(
  values: Record<CornerShapeFieldKey, string>,
): string {
  if (
    values.topLeft === values.topRight &&
    values.topLeft === values.bottomRight &&
    values.topLeft === values.bottomLeft
  ) {
    return values.topLeft;
  }

  if (
    values.topLeft === values.bottomRight &&
    values.topRight === values.bottomLeft
  ) {
    return `${values.topLeft} ${values.topRight}`;
  }

  if (values.topRight === values.bottomLeft) {
    return `${values.topLeft} ${values.topRight} ${values.bottomRight}`;
  }

  return `${values.topLeft} ${values.topRight} ${values.bottomRight} ${values.bottomLeft}`;
}

function areCornerShapeValuesEqual(left: string, right: string): boolean {
  const leftParsed = parseCornerShapeShorthand(left);
  const rightParsed = parseCornerShapeShorthand(right);

  return (
    leftParsed.topLeft === rightParsed.topLeft &&
    leftParsed.topRight === rightParsed.topRight &&
    leftParsed.bottomRight === rightParsed.bottomRight &&
    leftParsed.bottomLeft === rightParsed.bottomLeft
  );
}

function getCornerShapeFieldValue(key: CornerShapeFieldKey): string {
  switch (key) {
    case "topLeft":
      return topLeftShape.value;
    case "topRight":
      return topRightShape.value;
    case "bottomRight":
      return bottomRightShape.value;
    case "bottomLeft":
      return bottomLeftShape.value;
  }
}

function setCornerShapeFieldValue(
  key: CornerShapeFieldKey,
  value: string,
): void {
  switch (key) {
    case "topLeft":
      topLeftShape.value = value;
      break;
    case "topRight":
      topRightShape.value = value;
      break;
    case "bottomRight":
      bottomRightShape.value = value;
      break;
    case "bottomLeft":
      bottomLeftShape.value = value;
      break;
  }
}

function syncCornerValues(): void {
  const shorthandRadius = getStyleValue("borderRadius", "0");
  const parsedShorthand = parseCornerShorthand(shorthandRadius);
  const parsedShape = parseCornerShapeShorthand(
    getStyleValue(
      "cornerShape",
      getDefaultCornerShapeValue(breakpointName.value),
    ),
  );

  topLeft.value = getStyleValue("borderTopLeftRadius", parsedShorthand.topLeft);
  topRight.value = getStyleValue(
    "borderTopRightRadius",
    parsedShorthand.topRight,
  );
  bottomRight.value = getStyleValue(
    "borderBottomRightRadius",
    parsedShorthand.bottomRight,
  );
  bottomLeft.value = getStyleValue(
    "borderBottomLeftRadius",
    parsedShorthand.bottomLeft,
  );

  isRadiusLinked.value =
    topLeft.value === topRight.value &&
    topLeft.value === bottomRight.value &&
    topLeft.value === bottomLeft.value;

  linkedRadiusInput.value = formatRadiusInput(topLeft.value);

  cornerShapeValue.value = parsedShape.topLeft;
  topLeftShape.value = parsedShape.topLeft;
  topRightShape.value = parsedShape.topRight;
  bottomRightShape.value = parsedShape.bottomRight;
  bottomLeftShape.value = parsedShape.bottomLeft;

  isShapeLinked.value =
    topLeftShape.value === topRightShape.value &&
    topLeftShape.value === bottomRightShape.value &&
    topLeftShape.value === bottomLeftShape.value;
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  () => {
    syncCornerValues();
  },
  { deep: true, immediate: true },
);

function validateCorners(next: Record<CornerKey, string>): boolean {
  const result = safeParse(
    "corner",
    buildCornerCandidate({
      corners: next,
      cornerShape: buildCornerShapeShorthand(getCurrentCornerShapeFields()),
    }),
  );
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidRadius");
    return false;
  }

  validationError.value = null;
  return true;
}

function validateCornerShape(nextCornerShape: string): boolean {
  const result = safeParse(
    "corner",
    buildCornerCandidate({
      corners: getCurrentCornerValues(),
      cornerShape: nextCornerShape,
    }),
  );
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidCornerShape");
    return false;
  }

  validationError.value = null;
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

  syncCornerValues();
  return true;
}

async function persistCornerShape(nextCornerShape: string): Promise<boolean> {
  if (!hasSaveContext()) return false;

  const normalizedShape = normalizeCornerShapeValue(nextCornerShape);
  const currentShape = normalizeCornerShapeValue(
    getStyleValue(
      "cornerShape",
      getDefaultCornerShapeValue(breakpointName.value),
    ),
  );

  if (areCornerShapeValuesEqual(currentShape, normalizedShape)) {
    return true;
  }

  if (!validateCornerShape(normalizedShape)) {
    return false;
  }

  const defaultShape = getDefaultCornerShapeValue(breakpointName.value);
  const success = areCornerShapeValuesEqual(normalizedShape, defaultShape)
    ? await styleTarget.clearStyleProperties(
        ["cornerShape"],
        props.currentItemType,
        props.currentItemSlug,
      )
    : await styleTarget.saveStyleProperties(
        { cornerShape: normalizedShape },
        props.currentItemType,
        props.currentItemSlug,
      );

  if (!success) {
    return false;
  }

  syncCornerValues();
  return true;
}

async function resetCurrentBreakpointCorner(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const success = await cornerOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
  if (!success) return;

  syncCornerValues();
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

function handleLinkedRadiusMouseDown(event: MouseEvent): void {
  if (!hasSaveContext()) {
    return;
  }

  const { startValue, unit } = resolveScrubOrigin(linkedRadiusInput.value);
  const originRawValues = {
    borderTopLeftRadius: getCurrentBreakpointCornerValue("borderTopLeftRadius"),
    borderTopRightRadius: getCurrentBreakpointCornerValue(
      "borderTopRightRadius",
    ),
    borderBottomRightRadius: getCurrentBreakpointCornerValue(
      "borderBottomRightRadius",
    ),
    borderBottomLeftRadius: getCurrentBreakpointCornerValue(
      "borderBottomLeftRadius",
    ),
  };
  const originDisplayValues = {
    borderTopLeftRadius: topLeft.value,
    borderTopRightRadius: topRight.value,
    borderBottomRightRadius: bottomRight.value,
    borderBottomLeftRadius: bottomLeft.value,
  };
  cornerScrubSession.start({
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

      queueCornerPreview({
        borderTopLeftRadius: normalizedValue,
        borderTopRightRadius: normalizedValue,
        borderBottomRightRadius: normalizedValue,
        borderBottomLeftRadius: normalizedValue,
      });
    },
    onCancel: () => {
      restoreCornerPreview(originRawValues);
    },
    onCommit: () => {
      flushPendingCornerPreview();
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
          restoreCornerPreview(originRawValues);
        }
      });
    },
  });
}

function handleCornerMouseDown(key: CornerKey, event: MouseEvent): void {
  if (!hasSaveContext()) {
    return;
  }

  const { startValue, unit } = resolveScrubOrigin(getCornerRefValue(key));
  const originRawValues = {
    [key]: getCurrentBreakpointCornerValue(key),
  } as CornerPreviewUpdates;
  const originDisplayValue = getCornerRefValue(key);

  cornerScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.round(startValue + deltaX);
      const displayValue = formatScrubDisplayValue(nextValue, unit);
      setCornerRefValue(key, displayValue);
      queueCornerPreview({ [key]: normalizeRadius(displayValue) });
    },
    onCancel: () => {
      restoreCornerPreview(originRawValues);
    },
    onCommit: () => {
      flushPendingCornerPreview();

      void persistCorners(getCurrentCornerValues()).then((success) => {
        if (!success) {
          setCornerRefValue(key, originDisplayValue);
          restoreCornerPreview(originRawValues);
        }
      });
    },
  });
}

function previewLinkedCornerShapeSlider(curvature: number): void {
  const nextShape = buildCornerShapeValueFromCurvature(curvature);

  cornerShapeValue.value = nextShape;
  topLeftShape.value = nextShape;
  topRightShape.value = nextShape;
  bottomRightShape.value = nextShape;
  bottomLeftShape.value = nextShape;

  queueCornerPreview({ cornerShape: nextShape });
}

function handleLinkedCornerShapeSliderUpdate(
  values: number[] | undefined,
): void {
  const nextValue = getSliderEventValue(values);
  if (nextValue == null) {
    return;
  }

  validationError.value = null;
  previewLinkedCornerShapeSlider(nextValue);
}

async function handleLinkedCornerShapeSliderCommit(
  values: number[] | undefined,
): Promise<void> {
  const nextValue = getSliderEventValue(values);
  if (nextValue == null) {
    return;
  }

  previewLinkedCornerShapeSlider(nextValue);
  flushPendingCornerPreview();
  await persistCornerShape(cornerShapeValue.value);
}

function previewCornerShapeSliderValue(
  key: CornerShapeFieldKey,
  curvature: number,
): void {
  const nextShape = buildCornerShapeValueFromCurvature(curvature);

  setCornerShapeFieldValue(key, nextShape);
  queueCornerPreview({
    cornerShape: buildCornerShapeShorthand(getCurrentCornerShapeFields()),
  });
}

function handleCornerShapeSliderUpdate(
  key: CornerShapeFieldKey,
  values: number[] | undefined,
): void {
  const nextValue = getSliderEventValue(values);
  if (nextValue == null) {
    return;
  }

  validationError.value = null;
  previewCornerShapeSliderValue(key, nextValue);
}

async function handleCornerShapeSliderCommit(
  key: CornerShapeFieldKey,
  values: number[] | undefined,
): Promise<void> {
  const nextValue = getSliderEventValue(values);
  if (nextValue == null) {
    return;
  }

  previewCornerShapeSliderValue(key, nextValue);
  flushPendingCornerPreview();
  await persistCornerShape(
    buildCornerShapeShorthand(getCurrentCornerShapeFields()),
  );
}

async function saveLinkedCornerShape(value: unknown): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  const normalized = normalizeCornerShapeValue(value);
  cornerShapeValue.value = normalized;
  topLeftShape.value = normalized;
  topRightShape.value = normalized;
  bottomRightShape.value = normalized;
  bottomLeftShape.value = normalized;

  await persistCornerShape(normalized);
}

async function saveCornerShapeField(
  key: CornerShapeFieldKey,
  value: unknown,
): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  setCornerShapeFieldValue(key, normalizeCornerShapeValue(value));

  await persistCornerShape(
    buildCornerShapeShorthand(getCurrentCornerShapeFields()),
  );
}
function cancelPendingCornerPreview(): void {
  cornerPreviewQueue.cancel();
}

function flushPendingCornerPreview(): void {
  cornerPreviewQueue.flush();
}

function queueCornerPreview(updates: CornerPreviewUpdates): void {
  cornerPreviewQueue.queue(updates);
}

function restoreCornerPreview(updates: CornerPreviewUpdates): void {
  cornerPreviewQueue.restore(updates);
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="cornerOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Corner"
    icon="corner"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="cornerOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="cornerOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen && cornerOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="corner-reset-breakpoint"
        @reset="void resetCurrentBreakpointCorner()"
      />
    </template>

    <div class="space-y-4 pb-4">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >
            {{ t("inspector.corner.shape") }}
          </label>

          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted transition-colors"
            :class="
              isShapeLinked
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground'
            "
            :disabled="isPanelDisabled"
            @click.stop="isShapeLinked = !isShapeLinked"
          >
            <span
              aria-hidden="true"
              class="size-3.5 shrink-0"
              :class="isShapeLinked  ? studioIcons.link : studioIcons.unlink02"
            />
          </button>
        </div>

        <div v-if="isShapeLinked" class="grid grid-cols-1 gap-2">
          <Select
            data-testid="corner-shape-select"
            :model-value="cornerShapeValue"
            :disabled="isPanelDisabled"
            @update:model-value="(value) => void saveLinkedCornerShape(value)"
          >
            <SelectTrigger
              class="h-8 w-full border border-dashed border-border-70 bg-sidebar px-2 text-xs hover:border-border"
            >
              <span data-testid="corner-shape-select-value">
                {{ getCornerShapeDisplayLabel(cornerShapeValue) }}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in CORNER_SHAPE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ getCornerShapeDisplayLabel(option.value) }}
              </SelectItem>
            </SelectContent>
          </Select>

          <div
            v-if="getCornerShapeSliderValue(cornerShapeValue) !== null"
            class="flex items-center gap-2"
          >
            <div
              class="flex h-9 flex-1 items-center rounded-sm border border-dashed border-border-70 bg-sidebar px-2"
            >
              <Slider
                data-testid="corner-linked-shape-slider"
                class="w-full"
                :model-value="getCornerShapeSliderModelValue(cornerShapeValue)"
                :min="CORNER_SHAPE_SLIDER_MIN"
                :max="CORNER_SHAPE_SLIDER_MAX"
                :step="CORNER_SHAPE_SLIDER_STEP"
                :disabled="isPanelDisabled"
                @update:model-value="handleLinkedCornerShapeSliderUpdate"
                @value-commit="handleLinkedCornerShapeSliderCommit"
              />
            </div>

            <span
              data-testid="corner-linked-shape-slider-value"
              class="w-12 text-right text-xs text-muted-foreground tabular-nums"
            >
              {{ formatCornerShapeSliderValue(cornerShapeValue) }}
            </span>
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-2">
          <div
            v-for="field in CORNER_SHAPE_FIELDS"
            :key="field.key"
            class="space-y-2"
          >
            <label
              class="text-[10px] uppercase tracking-widest text-muted-foreground/70"
            >
              {{ field.label }}
            </label>
            <Select
              :data-testid="field.testId"
              :model-value="getCornerShapeFieldValue(field.key)"
              :disabled="isPanelDisabled"
              @update:model-value="
                (value) => void saveCornerShapeField(field.key, value)
              "
            >
              <SelectTrigger
                class="h-8 w-full border border-dashed border-border-70 bg-sidebar px-2 text-xs hover:border-border"
              >
                <span>
                  {{
                    getCornerShapeDisplayLabel(
                      getCornerShapeFieldValue(field.key),
                    )
                  }}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in CORNER_SHAPE_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ getCornerShapeDisplayLabel(option.value) }}
                </SelectItem>
              </SelectContent>
            </Select>

            <div
              v-if="
                getCornerShapeSliderValue(
                  getCornerShapeFieldValue(field.key),
                ) !== null
              "
              class="flex items-center gap-2"
            >
              <Slider
                :data-testid="`${field.testId}-slider`"
                class="w-full"
                :model-value="
                  getCornerShapeSliderModelValue(
                    getCornerShapeFieldValue(field.key),
                  )
                "
                :min="CORNER_SHAPE_SLIDER_MIN"
                :max="CORNER_SHAPE_SLIDER_MAX"
                :step="CORNER_SHAPE_SLIDER_STEP"
                :disabled="isPanelDisabled"
                @update:model-value="
                  (values) => handleCornerShapeSliderUpdate(field.key, values)
                "
                @value-commit="
                  (values) =>
                    void handleCornerShapeSliderCommit(field.key, values)
                "
              />
              <span
                class="w-12 text-right text-[11px] text-muted-foreground tabular-nums"
              >
                {{
                  formatCornerShapeSliderValue(
                    getCornerShapeFieldValue(field.key),
                  )
                }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label
            class="text-3xs font-semibold text-muted-foreground uppercase tracking-widest"
          >
            {{ t("inspector.corner.radius") }}
          </label>

          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted transition-colors"
            :class="
              isRadiusLinked
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground'
            "
            :disabled="isPanelDisabled"
            @click.stop="isRadiusLinked = !isRadiusLinked"
          >
            <span
              aria-hidden="true"
              class="size-3.5 shrink-0"
              :class="isRadiusLinked  ? studioIcons.link : studioIcons.unlink02"
            />
          </button>
        </div>

        <div v-if="isRadiusLinked" class="grid grid-cols-1 gap-2">
          <div class="relative flex items-center">
            <span
              :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.rounding, 'size-3.5 z-10 pointer-events-none']"
            />
            <VariableAssignableInput
              v-model="linkedRadiusInput"
              data-testid="corner-linked-radius-input"
              @commit="onLinkedRadiusBlur"
              @mousedown="handleLinkedRadiusMouseDown"
              :placeholder="t('inspector.corner.radius')"
              input-class="h-8 w-full pl-8 bg-sidebar border-border-70 border-dashed text-xs cursor-ew-resize focus:cursor-text"
              :disabled="isPanelDisabled"
            />
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-2">
          <div>
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpLeft, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="topLeft"
                data-testid="corner-top-left-radius-input"
                @commit="onTopLeftBlur"
                @mousedown="
                  (event: MouseEvent) =>
                    handleCornerMouseDown('borderTopLeftRadius', event)
                "
                :placeholder="t('inspector.corner.topLeft')"
                input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
                :disabled="isPanelDisabled"
              />
            </div>
          </div>
          <div>
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowUpRight, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="topRight"
                data-testid="corner-top-right-radius-input"
                @commit="onTopRightBlur"
                @mousedown="
                  (event: MouseEvent) =>
                    handleCornerMouseDown('borderTopRightRadius', event)
                "
                :placeholder="t('inspector.corner.topRight')"
                input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
                :disabled="isPanelDisabled"
              />
            </div>
          </div>
          <div>
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowDownRight, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="bottomRight"
                data-testid="corner-bottom-right-radius-input"
                @commit="onBottomRightBlur"
                @mousedown="
                  (event: MouseEvent) =>
                    handleCornerMouseDown('borderBottomRightRadius', event)
                "
                :placeholder="t('inspector.corner.bottomRight')"
                input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
                :disabled="isPanelDisabled"
              />
            </div>
          </div>
          <div>
            <div class="relative flex items-center">
              <span
                :class="['absolute left-2.5 text-muted-foreground/60', studioIcons.arrowDownLeft, 'size-3.5 z-10 pointer-events-none']"
              />
              <VariableAssignableInput
                v-model="bottomLeft"
                data-testid="corner-bottom-left-radius-input"
                @commit="onBottomLeftBlur"
                @mousedown="
                  (event: MouseEvent) =>
                    handleCornerMouseDown('borderBottomLeftRadius', event)
                "
                :placeholder="t('inspector.corner.bottomLeft')"
                input-class="h-8 w-full pl-8 border-dashed border-border-70 bg-sidebar text-xs cursor-ew-resize focus:cursor-text"
                :disabled="isPanelDisabled"
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
