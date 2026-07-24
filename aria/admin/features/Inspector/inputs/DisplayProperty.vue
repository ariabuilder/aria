<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";

import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import { usePropertySave, useSelectionTreeState } from "../../Core";
import { useInspectorStyleTargetWithGlobalDefaults } from "../composables/useInspectorStyleTargetWithGlobalDefaults";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import {
  DisplayModeSchema,
  FlexAlignContentSchema,
  FlexAlignItemsSchema,
  FlexDirectionSchema,
  FlexJustifyContentSchema,
  FlexWrapSchema,
  GRID_DISPLAY_MODES,
  GridAlignContentSchema,
  GridAlignItemsSchema,
  GridJustifyContentSchema,
  GridJustifyItemsSchema,
  FLEX_DISPLAY_MODES,
  VisibilityModeSchema,
  type DisplayMode,
  type FlexAlignContent,
  type FlexAlignItems,
  type FlexDirection,
  type FlexJustifyContent,
  type FlexWrap,
  type GridAlignContent,
  type GridAlignItems,
  type GridJustifyContent,
  type GridJustifyItems,
  type VisibilityMode,
} from "../schemas/visibility.schema";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { getNativeTagForRenderableNode } from "../../../../lib/blocks/renderSemantics";
import { getNodePath } from "../../../../lib/blocks/nodeUtils";
import { z } from "zod";
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

function createDisplayOptionGroup(values: readonly DisplayMode[]) {
  return values.map((value) => ({
    value,
    label: t(
      `inspector.display.mode.${
        value === "grid-lanes"
          ? "gridLanes"
          : value === "inline-block"
            ? "inlineBlock"
            : value === "inline-flex"
              ? "inlineFlex"
              : value === "inline-grid"
                ? "inlineGrid"
                : value
      }` as const,
    ),
  }));
}

const DISPLAY_OPTION_GROUPS: Array<{
  id: string;
  options: Array<{ value: DisplayMode; label: string }>;
}> = [
  {
    id: "primary",
    options: createDisplayOptionGroup([
      "flex",
      "grid",
      "grid-lanes",
      "block",
      "inline",
      "contents",
    ]),
  },
  {
    id: "inline-variants",
    options: createDisplayOptionGroup([
      "inline-block",
      "inline-flex",
      "inline-grid",
    ]),
  },
  {
    id: "fallbacks",
    options: createDisplayOptionGroup(["initial", "inherit", "none"]),
  },
];

const FLEX_DIRECTION_OPTIONS: Array<{
  value: FlexDirection;
  title: string;
  iconClass: string;
  iconExtraClass?: string;
  testId: string;
}> = [
  {
    value: "row",
    title: t("inspector.display.direction.row"),
    iconClass: studioIcons.menu01,
    iconExtraClass: "rotate-90",
    testId: "flex-direction-row",
  },
  {
    value: "column",
    title: t("inspector.display.direction.column"),
    iconClass: studioIcons.menu01,
    testId: "flex-direction-column",
  },
];

const FLEX_WRAP_OPTIONS: Array<{
  value: FlexWrap;
  title: string;
  iconClass: string;
  iconExtraClass?: string;
  testId: string;
}> = [
  {
    value: "nowrap",
    title: t("inspector.display.wrap.none"),
    iconClass: studioIcons.notEqualSign,
    testId: "flex-wrap-nowrap",
  },
  {
    value: "wrap",
    title: t("inspector.display.wrap.normal"),
    iconClass: studioIcons.textWrap,
    testId: "flex-wrap-wrap",
  },
  {
    value: "wrap-reverse",
    title: t("inspector.display.wrap.reverse"),
    iconClass: studioIcons.arrowReloadHorizontal,
    iconExtraClass: "-scale-y-100",
    testId: "flex-wrap-wrap-reverse",
  },
];

const FLEX_JUSTIFY_OPTIONS: Array<{
  value: FlexJustifyContent;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "flex-start",
    title: t("inspector.display.justify.start"),
    iconClass: studioIcons.alignLeft,
    testId: "flex-justify-start",
  },
  {
    value: "center",
    title: t("inspector.display.justify.center"),
    iconClass: studioIcons.alignHorizontalCenter,
    testId: "flex-justify-center",
  },
  {
    value: "flex-end",
    title: t("inspector.display.justify.end"),
    iconClass: studioIcons.alignRight,
    testId: "flex-justify-end",
  },
  {
    value: "space-between",
    title: t("inspector.display.justify.between"),
    iconClass: studioIcons.alignHorizontalSpaceBetween,
    testId: "flex-justify-space-between",
  },
];

const FLEX_ALIGN_ITEMS_OPTIONS: Array<{
  value: FlexAlignItems;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "flex-start",
    title: t("inspector.display.alignItems.start"),
    iconClass: studioIcons.alignBoxTopCenter,
    testId: "flex-align-items-start",
  },
  {
    value: "center",
    title: t("inspector.display.alignItems.center"),
    iconClass: studioIcons.alignBoxMiddleCenter,
    testId: "flex-align-items-center",
  },
  {
    value: "flex-end",
    title: t("inspector.display.alignItems.end"),
    iconClass: studioIcons.alignBoxBottomCenter,
    testId: "flex-align-items-end",
  },
  {
    value: "stretch",
    title: t("inspector.display.alignItems.stretch"),
    iconClass: studioIcons.alignVerticalDistributeCenter,
    testId: "flex-align-items-stretch",
  },
];

const FLEX_ALIGN_CONTENT_OPTIONS: Array<{
  value: FlexAlignContent;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "flex-start",
    title: t("inspector.display.alignContent.start"),
    iconClass: studioIcons.alignTop,
    testId: "flex-align-content-start",
  },
  {
    value: "center",
    title: t("inspector.display.alignContent.center"),
    iconClass: studioIcons.alignVerticalCenter,
    testId: "flex-align-content-center",
  },
  {
    value: "flex-end",
    title: t("inspector.display.alignContent.end"),
    iconClass: studioIcons.alignBottom,
    testId: "flex-align-content-end",
  },
  {
    value: "space-between",
    title: t("inspector.display.alignContent.between"),
    iconClass: studioIcons.alignVerticalSpaceBetween,
    testId: "flex-align-content-space-between",
  },
  {
    value: "stretch",
    title: t("inspector.display.alignContent.stretch"),
    iconClass: studioIcons.alignVerticalDistributeCenter,
    testId: "flex-align-content-stretch",
  },
];

const GRID_JUSTIFY_CONTENT_OPTIONS: Array<{
  value: GridJustifyContent;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "start",
    title: t("inspector.display.justify.start"),
    iconClass: studioIcons.alignLeft,
    testId: "grid-justify-content-start",
  },
  {
    value: "center",
    title: t("inspector.display.justify.center"),
    iconClass: studioIcons.alignHorizontalCenter,
    testId: "grid-justify-content-center",
  },
  {
    value: "end",
    title: t("inspector.display.justify.end"),
    iconClass: studioIcons.alignRight,
    testId: "grid-justify-content-end",
  },
  {
    value: "space-between",
    title: t("inspector.display.justify.between"),
    iconClass: studioIcons.alignHorizontalSpaceBetween,
    testId: "grid-justify-content-space-between",
  },
  {
    value: "stretch",
    title: t("inspector.display.justify.stretch"),
    iconClass: studioIcons.alignHorizontalDistributeStart,
    testId: "grid-justify-content-stretch",
  },
];

const GRID_ALIGN_CONTENT_OPTIONS: Array<{
  value: GridAlignContent;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "start",
    title: t("inspector.display.alignContent.start"),
    iconClass: studioIcons.alignTop,
    testId: "grid-align-content-start",
  },
  {
    value: "center",
    title: t("inspector.display.alignContent.center"),
    iconClass: studioIcons.alignVerticalCenter,
    testId: "grid-align-content-center",
  },
  {
    value: "end",
    title: t("inspector.display.alignContent.end"),
    iconClass: studioIcons.alignBottom,
    testId: "grid-align-content-end",
  },
  {
    value: "space-between",
    title: t("inspector.display.alignContent.between"),
    iconClass: studioIcons.alignVerticalSpaceBetween,
    testId: "grid-align-content-space-between",
  },
  {
    value: "stretch",
    title: t("inspector.display.alignContent.stretch"),
    iconClass: studioIcons.alignVerticalDistributeCenter,
    testId: "grid-align-content-stretch",
  },
];

const GRID_JUSTIFY_ITEMS_OPTIONS: Array<{
  value: GridJustifyItems;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "start",
    title: t("inspector.display.justify.start"),
    iconClass: studioIcons.alignLeft,
    testId: "grid-justify-items-start",
  },
  {
    value: "center",
    title: t("inspector.display.justify.center"),
    iconClass: studioIcons.alignHorizontalCenter,
    testId: "grid-justify-items-center",
  },
  {
    value: "end",
    title: t("inspector.display.justify.end"),
    iconClass: studioIcons.alignRight,
    testId: "grid-justify-items-end",
  },
  {
    value: "stretch",
    title: t("inspector.display.justify.stretch"),
    iconClass: studioIcons.alignHorizontalDistributeStart,
    testId: "grid-justify-items-stretch",
  },
];

const GRID_ALIGN_ITEMS_OPTIONS: Array<{
  value: GridAlignItems;
  title: string;
  iconClass: string;
  testId: string;
}> = [
  {
    value: "start",
    title: t("inspector.display.alignItems.start"),
    iconClass: studioIcons.alignBoxTopCenter,
    testId: "grid-align-items-start",
  },
  {
    value: "center",
    title: t("inspector.display.alignItems.center"),
    iconClass: studioIcons.alignBoxMiddleCenter,
    testId: "grid-align-items-center",
  },
  {
    value: "end",
    title: t("inspector.display.alignItems.end"),
    iconClass: studioIcons.alignBoxBottomCenter,
    testId: "grid-align-items-end",
  },
  {
    value: "stretch",
    title: t("inspector.display.alignItems.stretch"),
    iconClass: studioIcons.alignVerticalDistributeCenter,
    testId: "grid-align-items-stretch",
  },
];

const TEXT_INPUT_SCHEMA = z.string().trim().min(1);

type GridTemplatePropertyName = "gridTemplateColumns" | "gridTemplateRows";

const GRID_TEMPLATE_PRESETS: Record<
  GridTemplatePropertyName,
  Array<{
    id: string;
    label: string;
    value: string;
    testId: string;
  }>
> = {
  gridTemplateColumns: [
    {
      id: "two-columns",
      label: "2 Cols",
      value: "repeat(2, minmax(0, 1fr))",
      testId: "grid-cols-preset-two-columns",
    },
    {
      id: "three-columns",
      label: "3 Cols",
      value: "repeat(3, minmax(0, 1fr))",
      testId: "grid-cols-preset-three-columns",
    },
    {
      id: "four-columns",
      label: "4 Cols",
      value: "repeat(4, minmax(0, 1fr))",
      testId: "grid-cols-preset-four-columns",
    },
    {
      id: "twelve-columns",
      label: "12 Cols",
      value: "repeat(12, minmax(0, 1fr))",
      testId: "grid-cols-preset-twelve-columns",
    },
    {
      id: "auto-fit-cards",
      label: t("inspector.display.preset.autoFit"),
      value: "repeat(auto-fit, minmax(16rem, 1fr))",
      testId: "grid-cols-preset-auto-fit",
    },
    {
      id: "auto-fill-cards",
      label: t("inspector.display.preset.autoFill"),
      value: "repeat(auto-fill, minmax(250px, 1fr))",
      testId: "grid-cols-preset-auto-fill",
    },
    {
      id: "sidebar-layout",
      label: t("inspector.display.preset.sidebar"),
      value: "240px minmax(0, 1fr)",
      testId: "grid-cols-preset-sidebar",
    },
  ],
  gridTemplateRows: [
    {
      id: "single-auto",
      label: t("inspector.display.preset.auto"),
      value: "auto",
      testId: "grid-rows-preset-auto",
    },
    {
      id: "two-rows",
      label: "2 Rows",
      value: "repeat(2, auto)",
      testId: "grid-rows-preset-two-rows",
    },
    {
      id: "three-rows",
      label: "3 Rows",
      value: "repeat(3, auto)",
      testId: "grid-rows-preset-three-rows",
    },
    {
      id: "header-body-footer",
      label: t("inspector.display.preset.appShell"),
      value: "auto minmax(0, 1fr) auto",
      testId: "grid-rows-preset-app-shell",
    },
    {
      id: "content-rails",
      label: t("inspector.display.preset.rails"),
      value: "min-content auto max-content",
      testId: "grid-rows-preset-rails",
    },
  ],
};

type DisplayStyleKey =
  | "display"
  | "visibility"
  | "flexDirection"
  | "flexWrap"
  | "justifyContent"
  | "alignItems"
  | "alignContent"
  | "justifyItems"
  | "gap"
  | "flowTolerance"
  | "gridColumn"
  | "gridTemplateColumns"
  | "gridTemplateRows";

const DISPLAY_SECTION_STYLE_KEYS = [
  "display",
  "visibility",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "alignContent",
  "justifyItems",
  "gap",
  "flowTolerance",
  "gridColumn",
  "gridTemplateColumns",
  "gridTemplateRows",
] as const satisfies readonly DisplayStyleKey[];

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";

const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold text-muted-foreground uppercase tracking-widest";

const CONTROL_BUTTON_CLASS =
  "flex h-8 items-center justify-center rounded-sm border border-dashed border-border/70 bg-background/75 text-foreground/75 shadow-[inset_0_0_0_1px_rgb(var(--color-foreground)/0.02)] transition-colors hover:border-primary/55 hover:bg-sidebar/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-45 dark:bg-sidebar/55 dark:text-muted-foreground dark:hover:bg-sidebar/80 dark:hover:text-foreground";

const ACTIVE_CONTROL_BUTTON_CLASS =
  "border-primary/70 bg-primary/10! text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.16)] dark:bg-primary/15!";

const CONTROL_INPUT_CLASS =
  "h-8 w-full rounded-sm border border-dashed border-border/70 bg-background/75 px-2 text-xs text-foreground placeholder:text-muted-foreground/75 shadow-[inset_0_0_0_1px_rgb(var(--color-foreground)/0.02)] hover:border-border focus-visible:border-primary/50 focus-visible:bg-sidebar/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/25 dark:bg-sidebar/55 dark:placeholder:text-muted-foreground/70";

const SEGMENTED_CONTROL_CLASS = "grid gap-1.5";

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { selectionTreeRootNodes } = useSelectionTreeState();
const { styleTarget } = useInspectorStyleTargetWithGlobalDefaults({
  propertySave,
});
const displayOverrides = useInspectorPropertyOverrides({
  propertyKeys: DISPLAY_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});

const internalOpen = ref(props.defaultOpen);
const displayValue = ref<DisplayMode>("block");
const visibilityValue = ref<VisibilityMode>("visible");
const flexDirectionValue = ref<FlexDirection>("row");
const flexWrapValue = ref<FlexWrap>("nowrap");
const flexJustifyContentValue = ref<FlexJustifyContent>("flex-start");
const flexAlignItemsValue = ref<FlexAlignItems>("stretch");
const flexAlignContentValue = ref<FlexAlignContent>("stretch");
const gridJustifyContentValue = ref<GridJustifyContent>("start");
const gridAlignContentValue = ref<GridAlignContent>("stretch");
const gridJustifyItemsValue = ref<GridJustifyItems>("stretch");
const gridAlignItemsValue = ref<GridAlignItems>("stretch");
const gapValue = ref("");
const flowToleranceValue = ref("");
const gridColumnValue = ref("");
const gridTemplateColumnsValue = ref("");
const gridTemplateRowsValue = ref("");
const gridColumnsPresetOpen = ref(false);
const gridRowsPresetOpen = ref(false);
const validationError = ref<string | null>(null);

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);

const isFlexDisplay = computed(() =>
  FLEX_DISPLAY_MODES.includes(
    displayValue.value as (typeof FLEX_DISPLAY_MODES)[number],
  ),
);
const isGridDisplay = computed(() =>
  GRID_DISPLAY_MODES.includes(
    displayValue.value as (typeof GRID_DISPLAY_MODES)[number],
  ),
);
const isGridLanesDisplay = computed(() => displayValue.value === "grid-lanes");
const isVisible = computed(() => visibilityValue.value === "visible");

const selectedNodeParentId = computed(() => {
  const nodeId = selectedNodeId.value;
  if (!nodeId) {
    return null;
  }

  const path = getNodePath(
    selectionTreeRootNodes.value as unknown as BuilderNode[],
    nodeId,
  );
  return path.length > 0 ? path[path.length - 1] : null;
});
const canEditGridSpan = computed(() => {
  const parentId = selectedNodeParentId.value;
  if (!parentId) {
    return false;
  }

  const parentDisplay = propertySave.getComputedStyleValue(
    "display",
    "block",
    breakpointName.value,
    parentId,
  );

  return GRID_DISPLAY_MODES.includes(
    parentDisplay as (typeof GRID_DISPLAY_MODES)[number],
  );
});

const resolvedDefaultDisplay = computed<DisplayMode>(() => {
  const node = selectedNode.value;
  if (!node) {
    return "block";
  }

  const tag = getNativeTagForRenderableNode(node, node.props ?? {});
  switch (tag) {
    case "a":
    case "span":
    case "i":
      return "inline";
    case "button":
      return "inline-block";
    case "img":
    case "svg":
      return "inline";
    default:
      return "block";
  }
});

const hasDisplayChanges = computed(() => {
  return [
    hasResponsiveStyleChanges("display", resolvedDefaultDisplay.value),
    hasResponsiveStyleChanges("visibility", "visible"),
    hasResponsiveStyleChanges("flexDirection", "row"),
    hasResponsiveStyleChanges("flexWrap", "nowrap"),
    hasResponsiveStyleChanges("justifyContent", "flex-start"),
    hasResponsiveStyleChanges("alignItems", "stretch"),
    hasResponsiveStyleChanges("alignContent", "stretch"),
    hasResponsiveStyleChanges("justifyItems", "stretch"),
    hasResponsiveStyleChanges("gap"),
    hasResponsiveStyleChanges("flowTolerance"),
    hasResponsiveStyleChanges("gridColumn"),
    hasResponsiveStyleChanges("gridTemplateColumns"),
    hasResponsiveStyleChanges("gridTemplateRows"),
  ].some(Boolean);
});

function hasResponsiveStyleChanges(
  propertyName: string,
  defaultValue?: string,
): boolean {
  const value = styleTarget.getResponsiveStyleMap(propertyName);

  return Object.entries(value).some(([, entry]) => {
    if (entry === undefined) {
      return false;
    }

    if (defaultValue === undefined) {
      return true;
    }

    return entry !== defaultValue;
  });
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
    resolvedDefaultDisplay,
  ],
  () => {
    const nextValue = styleTarget.getStyleValue(
      "display",
      resolvedDefaultDisplay.value,
      breakpointName.value,
    );
    const parsed = DisplayModeSchema.safeParse(nextValue);
    displayValue.value = parsed.success
      ? parsed.data
      : resolvedDefaultDisplay.value;
    visibilityValue.value = readEnumStyleValue(
      "visibility",
      VisibilityModeSchema,
      "visible",
    );
    flexDirectionValue.value = readEnumStyleValue(
      "flexDirection",
      FlexDirectionSchema,
      "row",
    );
    flexWrapValue.value = readEnumStyleValue(
      "flexWrap",
      FlexWrapSchema,
      "nowrap",
    );
    flexJustifyContentValue.value = readEnumStyleValue(
      "justifyContent",
      FlexJustifyContentSchema,
      "flex-start",
    );
    flexAlignItemsValue.value = readEnumStyleValue(
      "alignItems",
      FlexAlignItemsSchema,
      "stretch",
    );
    flexAlignContentValue.value = readEnumStyleValue(
      "alignContent",
      FlexAlignContentSchema,
      "stretch",
    );
    gridJustifyContentValue.value = readEnumStyleValue(
      "justifyContent",
      GridJustifyContentSchema,
      "start",
    );
    gridAlignContentValue.value = readEnumStyleValue(
      "alignContent",
      GridAlignContentSchema,
      "stretch",
    );
    gridJustifyItemsValue.value = readEnumStyleValue(
      "justifyItems",
      GridJustifyItemsSchema,
      "stretch",
    );
    gridAlignItemsValue.value = readEnumStyleValue(
      "alignItems",
      GridAlignItemsSchema,
      "stretch",
    );
    gapValue.value =
      styleTarget.getStyleValue("gap", "", breakpointName.value) ?? "";
    flowToleranceValue.value =
      styleTarget.getStyleValue("flowTolerance", "", breakpointName.value) ??
      "";
    gridColumnValue.value =
      styleTarget.getStyleValue("gridColumn", "", breakpointName.value) ?? "";
    gridTemplateColumnsValue.value =
      styleTarget.getStyleValue(
        "gridTemplateColumns",
        "",
        breakpointName.value,
      ) ?? "";
    gridTemplateRowsValue.value =
      styleTarget.getStyleValue("gridTemplateRows", "", breakpointName.value) ??
      "";
  },
  { deep: true, immediate: true },
);

function readEnumStyleValue<T extends string>(
  propertyName: string,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  const nextValue = styleTarget.getStyleValue(
    propertyName,
    fallback,
    breakpointName.value,
  );
  const parsed = schema.safeParse(nextValue);

  return parsed.success ? parsed.data : fallback;
}

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

async function saveDisplay(value: string): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const parsedValue = DisplayModeSchema.safeParse(value);
  if (!parsedValue.success) {
    validationError.value = "Invalid display value.";
    return;
  }

  validationError.value = null;
  displayValue.value = parsedValue.data;

  await styleTarget.saveStyleProperty(
    "display",
    parsedValue.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function setVisibility(nextVisible: boolean): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  if (nextVisible === isVisible.value) {
    return;
  }

  const nextVisibility: VisibilityMode = nextVisible ? "visible" : "hidden";

  const parsedValue = VisibilityModeSchema.safeParse(nextVisibility);
  if (!parsedValue.success) {
    validationError.value = "Invalid visibility value.";
    return;
  }

  validationError.value = null;
  visibilityValue.value = parsedValue.data;

  await styleTarget.saveStyleProperty(
    "visibility",
    parsedValue.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveEnumProperty<T extends string>(
  propertyName: string,
  value: T,
  schema: z.ZodType<T>,
): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const parsedValue = schema.safeParse(value);
  if (!parsedValue.success) {
    validationError.value = "Invalid layout value.";
    return;
  }

  validationError.value = null;
  await styleTarget.saveStyleProperty(
    propertyName,
    parsedValue.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function saveTextProperty(
  propertyName: string,
  value: string,
): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    validationError.value = null;
    await styleTarget.clearStyleProperties(
      [propertyName],
      props.currentItemType,
      props.currentItemSlug,
    );
    return;
  }

  const parsedValue = TEXT_INPUT_SCHEMA.safeParse(trimmedValue);
  if (!parsedValue.success) {
    validationError.value = "Invalid layout value.";
    return;
  }

  validationError.value = null;
  await styleTarget.saveStyleProperty(
    propertyName,
    parsedValue.data,
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function applyGridTemplatePreset(
  propertyName: GridTemplatePropertyName,
  value: string,
): Promise<void> {
  if (propertyName === "gridTemplateColumns") {
    gridTemplateColumnsValue.value = value;
    gridColumnsPresetOpen.value = false;
  } else {
    gridTemplateRowsValue.value = value;
    gridRowsPresetOpen.value = false;
  }

  await saveTextProperty(propertyName, value);
}

async function resetCurrentBreakpointDisplay(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  await displayOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
}
</script>

<template>
  <BaseProperty
    title="Display"
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="hasDisplayChanges"
    @update:open="sectionOpen = $event"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="displayOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="
          displayOverrides.currentBreakpointLabel.value
        "
        :show-reset="
          sectionOpen && displayOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="display-reset-breakpoint"
        @reset="void resetCurrentBreakpointDisplay()"
      />
    </template>

    <div class="space-y-3 pb-4">
      <div :class="PROPERTY_ROW_CLASS">
        <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.mode") }}</span>
        <Select
          :model-value="displayValue"
          :disabled="isPanelDisabled"
          @update:model-value="(value) => void saveDisplay(String(value ?? ''))"
        >
          <SelectTrigger class="h-8 w-full rounded-md px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="min-w-0">
            <template
              v-for="(group, groupIndex) in DISPLAY_OPTION_GROUPS"
              :key="group.id"
            >
              <SelectItem
                v-for="option in group.options"
                :key="option.value"
                :value="option.value"
                class="text-xs"
              >
                {{ option.label }}
              </SelectItem>
              <SelectSeparator
                v-if="groupIndex < DISPLAY_OPTION_GROUPS.length - 1"
              />
            </template>
          </SelectContent>
        </Select>
      </div>

      <div v-if="isFlexDisplay" class="space-y-2">
        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.direction") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-2']">
            <button
              v-for="option in FLEX_DIRECTION_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                flexDirectionValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'flexDirection',
                  option.value,
                  FlexDirectionSchema,
                )
              "
            >
              <span
                :class="[
                  option.iconClass,
                  option.iconExtraClass,
                  'size-4 shrink-0',
                ]"
              />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.wrap") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-3']">
            <button
              v-for="option in FLEX_WRAP_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                flexWrapValue === option.value && ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty('flexWrap', option.value, FlexWrapSchema)
              "
            >
              <span
                :class="[
                  option.iconClass,
                  option.iconExtraClass,
                  'size-4 shrink-0',
                ]"
              />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.justify") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-4']">
            <button
              v-for="option in FLEX_JUSTIFY_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                flexJustifyContentValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'justifyContent',
                  option.value,
                  FlexJustifyContentSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.items") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-4']">
            <button
              v-for="option in FLEX_ALIGN_ITEMS_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                flexAlignItemsValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'alignItems',
                  option.value,
                  FlexAlignItemsSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.content") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-5']">
            <button
              v-for="option in FLEX_ALIGN_CONTENT_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                flexAlignContentValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'alignContent',
                  option.value,
                  FlexAlignContentSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.gap") }}</span>
          <label class="flex-1">
            <VariableAssignableInput
              v-model="gapValue"
              data-testid="layout-gap-input"
              placeholder="16px"
              :disabled="isPanelDisabled"
              :input-class="CONTROL_INPUT_CLASS"
              @commit="(value) => void saveTextProperty('gap', String(value))"
            />
          </label>
        </div>
      </div>

      <div v-else-if="isGridDisplay" class="space-y-2">
        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.columns") }}</span>
          <label class="block">
            <VariableAssignableInput
              v-model="gridTemplateColumnsValue"
              data-testid="grid-cols-input"
              placeholder="repeat(3,1fr)"
              :disabled="isPanelDisabled"
              :input-class="CONTROL_INPUT_CLASS"
              @commit="
                (value) =>
                  void saveTextProperty('gridTemplateColumns', String(value))
              "
            >
              <template #end-actions>
                <Popover v-model:open="gridColumnsPresetOpen">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      data-testid="grid-cols-helper-trigger"
                      :title="t('inspector.display.gridColumnsPresets')"
                      :disabled="isPanelDisabled"
                      :class="[
                        'flex size-7 items-center justify-center rounded-sm border border-transparent text-foreground/70 transition-all duration-100 hover:border-border/70 hover:bg-sidebar/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground',
                        gridColumnsPresetOpen
                          ? 'border-primary/60 bg-primary/10 text-primary opacity-100 pointer-events-auto'
                          : 'opacity-70 pointer-events-auto group-hover:opacity-100 group-focus-within:opacity-100',
                      ]"
                    >
                      <span :class="[studioIcons.energy, 'size-4 shrink-0']" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    :side-offset="6"
                    class="w-80 p-1.5"
                    @open-auto-focus.prevent
                  >
                    <div class="space-y-1">
                      <div
                        class="px-2 py-1 text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {{ t("inspector.display.columnPresets") }}
                      </div>
                      <button
                        v-for="preset in GRID_TEMPLATE_PRESETS.gridTemplateColumns"
                        :key="preset.id"
                        type="button"
                        :data-testid="preset.testId"
                        class="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-sidebar-80"
                        @click="
                          void applyGridTemplatePreset(
                            'gridTemplateColumns',
                            preset.value,
                          )
                        "
                      >
                        <span
                          class="min-w-0 flex-1 truncate text-xs text-foreground"
                        >
                          {{ preset.label }}
                        </span>
                        <span
                          class="max-w-44 truncate text-[10px] text-muted-foreground"
                        >
                          {{ preset.value }}
                        </span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </template>
            </VariableAssignableInput>
          </label>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.rows") }}</span>
          <label class="block">
            <VariableAssignableInput
              v-model="gridTemplateRowsValue"
              data-testid="grid-rows-input"
              placeholder="auto"
              :disabled="isPanelDisabled"
              :input-class="CONTROL_INPUT_CLASS"
              @commit="
                (value) =>
                  void saveTextProperty('gridTemplateRows', String(value))
              "
            >
              <template #end-actions>
                <Popover v-model:open="gridRowsPresetOpen">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      data-testid="grid-rows-helper-trigger"
                      :title="t('inspector.display.gridRowsPresets')"
                      :disabled="isPanelDisabled"
                      :class="[
                        'flex size-7 items-center justify-center rounded-sm border border-transparent text-foreground/70 transition-all duration-150 hover:border-border/70 hover:bg-sidebar/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground',
                        gridRowsPresetOpen
                          ? 'border-primary/60 bg-primary/10 text-primary opacity-100 pointer-events-auto'
                          : 'opacity-70 pointer-events-auto group-hover:opacity-100 group-focus-within:opacity-100',
                      ]"
                    >
                      <span :class="[studioIcons.energy, 'size-4 shrink-0']" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    :side-offset="6"
                    class="w-80 p-1.5"
                    @open-auto-focus.prevent
                  >
                    <div class="space-y-1">
                      <div
                        class="px-2 py-1 text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {{ t("inspector.display.rowPresets") }}
                      </div>
                      <button
                        v-for="preset in GRID_TEMPLATE_PRESETS.gridTemplateRows"
                        :key="preset.id"
                        type="button"
                        :data-testid="preset.testId"
                        class="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-sidebar-80"
                        @click="
                          void applyGridTemplatePreset(
                            'gridTemplateRows',
                            preset.value,
                          )
                        "
                      >
                        <span
                          class="min-w-0 flex-1 truncate text-xs text-foreground"
                        >
                          {{ preset.label }}
                        </span>
                        <span
                          class="max-w-44 truncate text-[10px] text-muted-foreground"
                        >
                          {{ preset.value }}
                        </span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </template>
            </VariableAssignableInput>
          </label>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.justify") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-5']">
            <button
              v-for="option in GRID_JUSTIFY_CONTENT_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                gridJustifyContentValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'justifyContent',
                  option.value,
                  GridJustifyContentSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.content") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-5']">
            <button
              v-for="option in GRID_ALIGN_CONTENT_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                gridAlignContentValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'alignContent',
                  option.value,
                  GridAlignContentSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.justify") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-4']">
            <button
              v-for="option in GRID_JUSTIFY_ITEMS_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                gridJustifyItemsValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'justifyItems',
                  option.value,
                  GridJustifyItemsSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.align") }}</span>
          <div :class="[SEGMENTED_CONTROL_CLASS, 'grid-cols-4']">
            <button
              v-for="option in GRID_ALIGN_ITEMS_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.title"
              :data-testid="option.testId"
              :disabled="isPanelDisabled"
              :class="[
                CONTROL_BUTTON_CLASS,
                gridAlignItemsValue === option.value &&
                  ACTIVE_CONTROL_BUTTON_CLASS,
              ]"
              @click="
                void saveEnumProperty(
                  'alignItems',
                  option.value,
                  GridAlignItemsSchema,
                )
              "
            >
              <span :class="[option.iconClass, 'size-4 shrink-0']" />
            </button>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.gap") }}</span>
          <label class="flex-1">
            <VariableAssignableInput
              v-model="gapValue"
              data-testid="layout-gap-input"
              placeholder="16px"
              :disabled="isPanelDisabled"
              :input-class="CONTROL_INPUT_CLASS"
              @commit="(value) => void saveTextProperty('gap', String(value))"
            />
          </label>
        </div>

        <div v-if="isGridLanesDisplay" :class="PROPERTY_ROW_CLASS">
          <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.tolerance") }}</span>
          <label class="flex-1">
            <VariableAssignableInput
              v-model="flowToleranceValue"
              data-testid="grid-flow-tolerance-input"
              placeholder="1em"
              :disabled="isPanelDisabled"
              :input-class="CONTROL_INPUT_CLASS"
              @commit="
                (value) => void saveTextProperty('flowTolerance', String(value))
              "
            />
          </label>
        </div>
      </div>

      <div v-if="canEditGridSpan" :class="PROPERTY_ROW_CLASS">
        <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.span") }}</span>
        <label class="flex-1">
          <VariableAssignableInput
            v-model="gridColumnValue"
            data-testid="grid-column-input"
            placeholder="span 2"
            :disabled="isPanelDisabled"
            :input-class="CONTROL_INPUT_CLASS"
            @commit="
              (value) => void saveTextProperty('gridColumn', String(value))
            "
          />
        </label>
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <span :class="PROPERTY_LABEL_CLASS">{{ t("inspector.display.visible") }}</span>
        <div class="flex flex-1 items-center justify-end">
          <Switch
            data-testid="display-visible-switch"
            :model-value="isVisible"
            :disabled="isPanelDisabled"
            @update:model-value="(value) => void setVisibility(Boolean(value))"
          />
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
