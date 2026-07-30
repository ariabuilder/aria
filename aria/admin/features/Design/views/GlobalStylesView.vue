<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DesignHeaderTeleport from "../components/DesignHeaderTeleport.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { useStudioI18n, type StudioMessageKey } from "@/i18n";
import {
  createDefaultGlobalStylesConfig,
  GLOBAL_STYLE_BUTTON_VARIANTS,
} from "../../../../lib/styles/universalDesignSystem";
import { useDesignSystem } from "../composables/useDesignSystem";
import { usePointerScrubSession } from "../../Inspector/composables/usePointerScrubSession";
import { resolveColorPickerPreviewValue } from "../lib/colorPickerValue";
import { buildVariableManagerTokenOptions } from "../lib/variableManagerTokens";
import GlobalStyleVariablePicker from "../components/GlobalStyleVariablePicker.vue";
import { studioIcons } from "@/lib/icons";
import { toast } from "vue-sonner";
import { useGlobalStyles } from "../composables/useGlobalStyles";
import {
  SPACING_MULTIPLIERS,
  TYPOGRAPHY_FONTS_UPDATED_EVENT,
  type ScaleRatio,
  type SpacingStyle,
  useTypography,
} from "../composables/useTypography";

type ControlKind = "color" | "font" | "measurement" | "select";

type SelectOption = {
  value: string;
  label: string;
};

type MeasurementUnitOption = {
  value: string;
  label: string;
};

type FieldDefinition = {
  label: string;
  path: string;
  kind: ControlKind;
  placeholder?: string;
  options?: readonly SelectOption[];
  units?: readonly MeasurementUnitOption[];
  icon?: string;
};

type SectionDefinition = {
  title: string;
  description: string;
  fields: readonly FieldDefinition[];
};

type VariableReferenceOption = {
  value: string;
  label: string;
  meta: string;
  group: string;
};

const EMPTY_SELECT_VALUE = "__empty__";
const DEFAULT_GLOBAL_STYLES = createDefaultGlobalStylesConfig();
const VARIABLE_REFERENCE_PATTERN =
  /^var\(--([a-zA-Z0-9-_]+)(?:\s*,\s*[^)]+)?\)$/;
const directFieldValues = ref<Record<string, string>>({});
const pendingMeasurementUnits = ref<Record<string, string>>({});
const SIZE_UNITS: readonly MeasurementUnitOption[] = [
  { value: "px", label: "px" },
  { value: "rem", label: "rem" },
  { value: "em", label: "em" },
  { value: "%", label: "%" },
  { value: "vw", label: "vw" },
  { value: "vh", label: "vh" },
  { value: "ch", label: "ch" },
  { value: "raw", label: "raw" },
] as const;

const SPACING_UNITS: readonly MeasurementUnitOption[] = [
  { value: "px", label: "px" },
  { value: "rem", label: "rem" },
  { value: "em", label: "em" },
  { value: "%", label: "%" },
  { value: "raw", label: "raw" },
] as const;

const LETTER_SPACING_UNITS: readonly MeasurementUnitOption[] = [
  { value: "em", label: "em" },
  { value: "rem", label: "rem" },
  { value: "px", label: "px" },
  { value: "%", label: "%" },
  { value: "raw", label: "raw" },
] as const;

const LINE_HEIGHT_UNITS: readonly MeasurementUnitOption[] = [
  { value: "px", label: "px" },
  { value: "rem", label: "rem" },
  { value: "em", label: "em" },
  { value: "%", label: "%" },
  { value: "raw", label: "raw" },
] as const;

const FONT_WEIGHT_OPTIONS: readonly SelectOption[] = [
  { value: "300", label: "300 Light" },
  { value: "400", label: "400 Regular" },
  { value: "500", label: "500 Medium" },
  { value: "600", label: "600 Semibold" },
  { value: "700", label: "700 Bold" },
  { value: "800", label: "800 Extra Bold" },
] as const;

const TEXT_TRANSFORM_OPTIONS: readonly SelectOption[] = [
  { value: "none", label: "None" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
] as const;

const TEXT_DECORATION_OPTIONS: readonly SelectOption[] = [
  { value: "none", label: "None" },
  { value: "underline", label: "Underline" },
  { value: "overline", label: "Overline" },
  { value: "line-through", label: "Line Through" },
] as const;

const TEXT_WRAP_OPTIONS: readonly SelectOption[] = [
  { value: "wrap", label: "Wrap" },
  { value: "nowrap", label: "No Wrap" },
  { value: "balance", label: "Balance" },
  { value: "pretty", label: "Pretty" },
] as const;

const SCROLL_BEHAVIOR_OPTIONS: readonly SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "smooth", label: "Smooth" },
] as const;

const CURSOR_OPTIONS: readonly SelectOption[] = [
  { value: "auto", label: "Auto" }, { value: "default", label: "Default" },
  { value: "pointer", label: "Pointer" }, { value: "text", label: "Text" },
  { value: "crosshair", label: "Crosshair" }, { value: "grab", label: "Grab" },
  { value: "grabbing", label: "Grabbing" }, { value: "not-allowed", label: "Not Allowed" },
  { value: "wait", label: "Wait" }, { value: "help", label: "Help" },
  { value: "zoom-in", label: "Zoom In" }, { value: "zoom-out", label: "Zoom Out" },
] as const;

const OUTLINE_STYLE_OPTIONS: readonly SelectOption[] = [
  { value: "none", label: "None" }, { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
] as const;

const SPACING_STYLE_OPTIONS: ReadonlyArray<{
  value: SpacingStyle;
  label: string;
  description: string;
}> = [
  {
    value: "compact",
    label: "Compact",
    description: "Tighter vertical rhythm",
  },
  {
    value: "normal",
    label: "Normal",
    description: "Balanced default spacing",
  },
  {
    value: "relaxed",
    label: "Relaxed",
    description: "More breathing room",
  },
  {
    value: "airy",
    label: "Airy",
    description: "Loose editorial spacing",
  },
] as const;

const SCALE_RATIO_OPTIONS: ReadonlyArray<{
  value: ScaleRatio;
  label: string;
  description: string;
}> = [
  {
    value: "minor-second",
    label: "Minor Second",
    description: "Subtle hierarchy",
  },
  {
    value: "major-second",
    label: "Major Second",
    description: "Small step contrast",
  },
  {
    value: "minor-third",
    label: "Minor Third",
    description: "Balanced scale",
  },
  {
    value: "major-third",
    label: "Major Third",
    description: "Stronger contrast",
  },
  {
    value: "perfect-fourth",
    label: "Perfect Fourth",
    description: "Editorial emphasis",
  },
  {
    value: "perfect-fifth",
    label: "Perfect Fifth",
    description: "High-contrast display scale",
  },
] as const;

const DEFAULT_SECTIONS: readonly SectionDefinition[] = [
  {
    title: "Body",
    description: "Applies to the page body.",
    fields: [
      {
        label: "Background",
        path: "defaults.body.backgroundColor",
        kind: "color",
        placeholder: "Background color",
      },
      {
        label: "Text",
        path: "defaults.body.color",
        kind: "color",
        placeholder: "Text color",
      },
      {
        label: "Font",
        path: "defaults.body.fontFamily",
        kind: "font",
        placeholder: "Select body font",
        icon: studioIcons.textFontSize,
      },
      {
        label: "Size",
        path: "defaults.body.fontSize",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "16",
      },
      {
        label: "Line Height",
        path: "defaults.body.lineHeight",
        kind: "measurement",
        units: LINE_HEIGHT_UNITS,
        placeholder: "1.5",
      },
      {
        label: "Weight",
        path: "defaults.body.fontWeight",
        kind: "select",
        options: FONT_WEIGHT_OPTIONS,
        icon: studioIcons.bold,
      },
      {
        label: "Letter Spacing",
        path: "defaults.body.letterSpacing",
        kind: "measurement",
        units: LETTER_SPACING_UNITS,
        placeholder: "0",
      },
      {
        label: "Max Width",
        path: "defaults.body.maxWidth",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "",
      },
      {
        label: "Margin",
        path: "defaults.body.margin",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "0",
      },
      {
        label: "Padding",
        path: "defaults.body.padding",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "0",
      },
      {
        label: "Text Wrap",
        path: "defaults.body.textWrap",
        kind: "select",
        options: TEXT_WRAP_OPTIONS,
        icon: studioIcons.textWrap,
      },
    ],
  },
  {
    title: "Headings",
    description: "Applies to h1 through h6.",
    fields: [
      {
        label: "Text",
        path: "defaults.heading.color",
        kind: "color",
        placeholder: "Heading color",
      },
      {
        label: "Font",
        path: "defaults.heading.fontFamily",
        kind: "font",
        placeholder: "Select heading font",
        icon: studioIcons.textFontSize,
      },
      {
        label: "Weight",
        path: "defaults.heading.fontWeight",
        kind: "select",
        options: FONT_WEIGHT_OPTIONS,
        icon: studioIcons.bold,
      },
      {
        label: "Line Height",
        path: "defaults.heading.lineHeight",
        kind: "measurement",
        units: LINE_HEIGHT_UNITS,
        placeholder: "1.1",
      },
      {
        label: "Letter Spacing",
        path: "defaults.heading.letterSpacing",
        kind: "measurement",
        units: LETTER_SPACING_UNITS,
        placeholder: "0",
      },
      {
        label: "Transform",
        path: "defaults.heading.textTransform",
        kind: "select",
        options: TEXT_TRANSFORM_OPTIONS,
        icon: studioIcons.textWrap,
      },
    ],
  },
  {
    title: "Links",
    description: "Applies to default and interactive link states.",
    fields: [
      {
        label: "Default",
        path: "defaults.link.color",
        kind: "color",
        placeholder: "Default color",
      },
      {
        label: "Hover",
        path: "defaults.link.hoverColor",
        kind: "color",
        placeholder: "Hover color",
      },
      {
        label: "Visited",
        path: "defaults.link.visitedColor",
        kind: "color",
        placeholder: "Visited color",
      },
      {
        label: "Decoration",
        path: "defaults.link.textDecoration",
        kind: "select",
        options: TEXT_DECORATION_OPTIONS,
        icon: studioIcons.underline,
      },
      {
        label: "Underline Offset",
        path: "defaults.link.underlineOffset",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "2",
      },
      {
        label: "Weight",
        path: "defaults.link.fontWeight",
        kind: "select",
        options: FONT_WEIGHT_OPTIONS,
        icon: studioIcons.bold,
      },
    ],
  },
  {
    title: "Inputs",
    description:
      "Applies to text inputs, textareas, selects, and `.input` helpers.",
    fields: [
      {
        label: "Background",
        path: "defaults.input.backgroundColor",
        kind: "color",
        placeholder: "Background color",
      },
      {
        label: "Text",
        path: "defaults.input.color",
        kind: "color",
        placeholder: "Text color",
      },
      {
        label: "Placeholder",
        path: "defaults.input.placeholderColor",
        kind: "color",
        placeholder: "Placeholder color",
      },
      {
        label: "Border",
        path: "defaults.input.borderColor",
        kind: "color",
        placeholder: "Border color",
      },
      {
        label: "Radius",
        path: "defaults.input.borderRadius",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "8",
      },
      {
        label: "Font",
        path: "defaults.input.fontFamily",
        kind: "font",
        placeholder: "Select input font",
        icon: studioIcons.textFontSize,
      },
      {
        label: "Size",
        path: "defaults.input.fontSize",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "16",
      },
      {
        label: "Line Height",
        path: "defaults.input.lineHeight",
        kind: "measurement",
        units: LINE_HEIGHT_UNITS,
        placeholder: "1.4",
      },
      {
        label: "Horizontal Padding",
        path: "defaults.input.paddingX",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "12",
      },
      {
        label: "Vertical Padding",
        path: "defaults.input.paddingY",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "8",
      },
      {
        label: "Focus Ring",
        path: "defaults.input.focusRingColor",
        kind: "color",
        placeholder: "Focus ring color",
      },
    ],
  },
  {
    title: "Sections",
    description: "Applies spacing defaults to semantic section containers.",
    fields: [
      {
        label: "Content Max Width",
        path: "defaults.section.contentMaxWidth",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "72",
      },
      {
        label: "Horizontal Padding",
        path: "defaults.section.horizontalPadding",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "24",
      },
      {
        label: "Vertical Padding",
        path: "defaults.section.verticalPadding",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "48",
      },
      {
        label: "Section Gap",
        path: "defaults.section.sectionGap",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "32",
      },
    ],
  },
  {
    title: "Containers",
    description: "Applies to page-level container wrappers.",
    fields: [
      {
        label: "Max Width",
        path: "defaults.container.maxWidth",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "1280",
      },
      {
        label: "Width",
        path: "defaults.container.width",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "100",
      },
    ],
  },
  {
    title: "Root",
    description: "Applies to the HTML root element.",
    fields: [
      {
        label: "Font Size",
        path: "defaults.root.fontSize",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "16",
      },
      {
        label: "Margin",
        path: "defaults.root.margin",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "0",
      },
      {
        label: "Padding",
        path: "defaults.root.padding",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "0",
      },
      {
        label: "Cursor",
        path: "defaults.root.cursor",
        kind: "select",
        options: CURSOR_OPTIONS,
        icon: studioIcons.cursor,
      },
      {
        label: "Caret Color",
        path: "defaults.root.caretColor",
        kind: "color",
        placeholder: "Caret color",
      },
      {
        label: "Selection Color",
        path: "defaults.root.selectionColor",
        kind: "color",
        placeholder: "Text selection color",
      },
      {
        label: "Selection Background",
        path: "defaults.root.selectionBackgroundColor",
        kind: "color",
        placeholder: "Selection background",
      },
      {
        label: "Scroll Behavior",
        path: "defaults.root.scrollBehavior",
        kind: "select",
        options: SCROLL_BEHAVIOR_OPTIONS,
        icon: studioIcons.arrowRight,
      },
      {
        label: "Outline Color",
        path: "defaults.root.outlineColor",
        kind: "color",
        placeholder: "Focus outline color",
      },
      {
        label: "Outline Width",
        path: "defaults.root.outlineWidth",
        kind: "measurement",
        units: SIZE_UNITS,
        placeholder: "2",
      },
      {
        label: "Outline Style",
        path: "defaults.root.outlineStyle",
        kind: "select",
        options: OUTLINE_STYLE_OPTIONS,
        icon: studioIcons.underline,
      },
      {
        label: "Border Color",
        path: "defaults.root.borderColor",
        kind: "color",
        placeholder: "Default border color",
      },
      {
        label: "Border Radius",
        path: "defaults.root.borderRadius",
        kind: "measurement",
        units: SPACING_UNITS,
        placeholder: "8",
      },
    ],
  },
] as const;

const BUTTON_BASE_FIELDS: readonly FieldDefinition[] = [
  {
    label: "Font",
    path: "defaults.button.base.fontFamily",
    kind: "font",
    placeholder: "Select button font",
    icon: studioIcons.textFontSize,
  },
  {
    label: "Size",
    path: "defaults.button.base.fontSize",
    kind: "measurement",
    units: SIZE_UNITS,
    placeholder: "14",
  },
  {
    label: "Weight",
    path: "defaults.button.base.fontWeight",
    kind: "select",
    options: FONT_WEIGHT_OPTIONS,
    icon: studioIcons.bold,
  },
  {
    label: "Line Height",
    path: "defaults.button.base.lineHeight",
    kind: "measurement",
    units: LINE_HEIGHT_UNITS,
    placeholder: "1.2",
  },
  {
    label: "Letter Spacing",
    path: "defaults.button.base.letterSpacing",
    kind: "measurement",
    units: LETTER_SPACING_UNITS,
    placeholder: "0",
  },
  {
    label: "Radius",
    path: "defaults.button.base.borderRadius",
    kind: "measurement",
    units: SPACING_UNITS,
    placeholder: "8",
  },
  {
    label: "Horizontal Padding",
    path: "defaults.button.base.paddingX",
    kind: "measurement",
    units: SPACING_UNITS,
    placeholder: "16",
  },
  {
    label: "Vertical Padding",
    path: "defaults.button.base.paddingY",
    kind: "measurement",
    units: SPACING_UNITS,
    placeholder: "10",
  },
  {
    label: "Border Width",
    path: "defaults.button.base.borderWidth",
    kind: "measurement",
    units: SPACING_UNITS,
    placeholder: "1",
  },
] as const;

const BUTTON_VARIANT_FIELDS = (variant: string): readonly FieldDefinition[] =>
  [
    {
      label: "Background",
      path: `defaults.button.variants.${variant}.backgroundColor`,
      kind: "color",
      placeholder: "Background color",
    },
    {
      label: "Text",
      path: `defaults.button.variants.${variant}.color`,
      kind: "color",
      placeholder: "Text color",
    },
    {
      label: "Border",
      path: `defaults.button.variants.${variant}.borderColor`,
      kind: "color",
      placeholder: "Border color",
    },
    {
      label: "Hover Background",
      path: `defaults.button.variants.${variant}.hoverBackgroundColor`,
      kind: "color",
      placeholder: "Hover background",
    },
    {
      label: "Hover Text",
      path: `defaults.button.variants.${variant}.hoverColor`,
      kind: "color",
      placeholder: "Hover text color",
    },
    {
      label: "Hover Border",
      path: `defaults.button.variants.${variant}.hoverBorderColor`,
      kind: "color",
      placeholder: "Hover border color",
    },
  ] as const;

const GLOBAL_STYLES_CONTROL_CLASS =
  "h-9.5! px-3 text-sm text-muted-foreground placeholder:text-muted-foreground";
const GLOBAL_STYLES_CONTROL_WITH_PICKER_CLASS =
  "h-9.5! min-w-0 px-3 pr-20 text-left text-sm";
const GLOBAL_STYLES_READONLY_CONTROL_CLASS =
  "flex h-9.5 min-w-0 items-center rounded-sm border border-border/50 border-solid bg-sidebar/40 px-3 text-sm text-foreground";
const GLOBAL_STYLES_READONLY_WITH_PICKER_CLASS =
  "flex h-9.5 min-w-0 items-center rounded-sm border border-border/50 border-solid bg-sidebar/40 px-3 pr-20 text-sm text-foreground";
const GLOBAL_STYLES_CONTROL_WITH_RESET_CLASS =
  "h-9.5! px-3 pr-10 text-sm";
const GLOBAL_STYLES_MEASUREMENT_INPUT_CLASS =
  "h-9.5! pl-8 cursor-ew-resize focus:cursor-text";
const GLOBAL_STYLES_PLAIN_INPUT_INSET_CLASS =
  "h-full rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0";
const GLOBAL_STYLES_COLOR_CONTROL_CLASS =
  "flex h-9.5 items-center gap-3 rounded-sm border border-border/50 border-solid bg-sidebar/40 px-3 hover:bg-sidebar/80 hover:border-border/50 hover:border-solid has-[[data-state=open]]:border-border has-[[data-state=open]]:bg-sidebar/80 has-[[data-state=open]]:ring-border/50 has-[[data-state=open]]:ring-[1px]";
const GLOBAL_STYLES_SUFFIX_CLASS =
  "flex h-9.5 items-center justify-center rounded-sm border border-border/50 border-solid bg-sidebar/40 px-3 text-sm text-muted-foreground";
const GLOBAL_STYLES_MEASUREMENT_GRID_CLASS =
  "grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]";
const GLOBAL_STYLES_SCALE_GRID_CLASS =
  "grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem]";
const GLOBAL_STYLES_DRAG_ICON_CLASS = `pointer-events-none absolute left-2.5 z-10 size-3.5 text-muted-foreground/50 ${studioIcons.arrowLeftRight}`;
const GLOBAL_STYLES_RESET_BUTTON_CLASS =
  "flex size-4 items-center justify-center rounded-sm text-foreground transition-colors hover:text-destructive";
const GLOBAL_STYLES_LEADING_RESET_BUTTON_CLASS =
  "absolute left-1.5 top-1/2 z-10 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-foreground transition-colors hover:text-destructive";
const GLOBAL_STYLES_TRAILING_ACTIONS_CLASS =
  "absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2";
const GLOBAL_STYLES_TRAILING_RESET_CLASS =
  "absolute right-2 top-1/2 z-10 -translate-y-1/2";
const GLOBAL_STYLES_RESET_ICON_CLASS = `${studioIcons.close} size-4 shrink-0 text-muted-foreground hover:text-destructive/80`;
const GLOBAL_STYLES_UNIT_SELECT_TRIGGER_CLASS =
  "h-9.5! w-10 justify-center px-1.5 text-xs text-muted-foreground";

const { globalStyles, isLoading, isSaving, hasUnsavedChanges, loadGlobalStyles, saveGlobalStyles } = useGlobalStyles();
const { palettes, semanticColors, load: loadDesignSystem } = useDesignSystem();
const { t } = useStudioI18n();
const measurementScrubSession = usePointerScrubSession();
const overallScaleScrubSession = usePointerScrubSession();

const {
  fontOptions,
  typography,
  overallScale,
  spacingStyle,
  scaleRatio,
  applyOverallScale,
  applySpacingStyle,
  applyScaleRatio,
  loadTypography,
  loadFontOptions,
} = useTypography();

const overallScaleDraft = ref("100");

const selectedSpacingOption = computed(
  () =>
    SPACING_STYLE_OPTIONS.find(
      (option) => option.value === spacingStyle.value,
    ) ?? SPACING_STYLE_OPTIONS[1],
);

const selectedScaleRatioOption = computed(
  () =>
    SCALE_RATIO_OPTIONS.find((option) => option.value === scaleRatio.value) ??
    SCALE_RATIO_OPTIONS[2],
);

const BUTTON_SECTION_TITLE = "Buttons";
const sectionTabs = [
  ...DEFAULT_SECTIONS.map((section) => section.title),
  BUTTON_SECTION_TITLE,
];
const activeSectionTitle = ref(sectionTabs[0] ?? BUTTON_SECTION_TITLE);

const activeDefaultSection = computed(
  () =>
    DEFAULT_SECTIONS.find(
      (section) => section.title === activeSectionTitle.value,
    ) ?? null,
);

const FIELD_LABEL_KEYS = {
  Background: "design.globalStyles.field.background",
  Text: "design.globalStyles.field.text",
  Font: "design.globalStyles.field.font",
  Size: "design.globalStyles.field.size",
  "Line Height": "design.globalStyles.field.lineHeight",
  Weight: "design.globalStyles.field.weight",
  "Letter Spacing": "design.globalStyles.field.letterSpacing",
  "Max Width": "design.globalStyles.field.maxWidth",
  Margin: "design.globalStyles.field.margin",
  Padding: "design.globalStyles.field.padding",
  "Text Wrap": "design.globalStyles.field.textWrap",
  Transform: "design.globalStyles.field.transform",
  Default: "design.globalStyles.field.default",
  Hover: "design.globalStyles.field.hover",
  Visited: "design.globalStyles.field.visited",
  Decoration: "design.globalStyles.field.decoration",
  "Underline Offset": "design.globalStyles.field.underlineOffset",
  Placeholder: "design.globalStyles.field.placeholder",
  Border: "design.globalStyles.field.border",
  Radius: "design.globalStyles.field.radius",
  "Horizontal Padding": "design.globalStyles.field.horizontalPadding",
  "Vertical Padding": "design.globalStyles.field.verticalPadding",
  "Focus Ring": "design.globalStyles.field.focusRing",
  "Content Max Width": "design.globalStyles.field.contentMaxWidth",
  "Section Gap": "design.globalStyles.field.sectionGap",
  Width: "design.globalStyles.field.width",
  "Font Size": "design.globalStyles.field.fontSize",
  Cursor: "design.globalStyles.field.cursor",
  "Caret Color": "design.globalStyles.field.caretColor",
  "Selection Color": "design.globalStyles.field.selectionColor",
  "Selection Background": "design.globalStyles.field.selectionBackground",
  "Scroll Behavior": "design.globalStyles.field.scrollBehavior",
  "Outline Color": "design.globalStyles.field.outlineColor",
  "Outline Width": "design.globalStyles.field.outlineWidth",
  "Outline Style": "design.globalStyles.field.outlineStyle",
  "Border Color": "design.globalStyles.field.borderColor",
  "Border Radius": "design.globalStyles.field.borderRadius",
  "Border Width": "design.globalStyles.field.borderWidth",
  "Hover Background": "design.globalStyles.field.hoverBackground",
  "Hover Text": "design.globalStyles.field.hoverText",
  "Hover Border": "design.globalStyles.field.hoverBorder",
} satisfies Record<string, StudioMessageKey>;

const FIELD_PLACEHOLDER_KEYS = {
  "Background color": "design.globalStyles.placeholder.backgroundColor",
  "Text color": "design.globalStyles.placeholder.textColor",
  "Select body font": "design.globalStyles.placeholder.selectBodyFont",
  "Heading color": "design.globalStyles.placeholder.headingColor",
  "Select heading font": "design.globalStyles.placeholder.selectHeadingFont",
  "Default color": "design.globalStyles.placeholder.defaultColor",
  "Hover color": "design.globalStyles.placeholder.hoverColor",
  "Visited color": "design.globalStyles.placeholder.visitedColor",
  "Placeholder color": "design.globalStyles.placeholder.placeholderColor",
  "Border color": "design.globalStyles.placeholder.borderColor",
  "Select input font": "design.globalStyles.placeholder.selectInputFont",
  "Focus ring color": "design.globalStyles.placeholder.focusRingColor",
  "Caret color": "design.globalStyles.placeholder.caretColor",
  "Text selection color": "design.globalStyles.placeholder.selectionColor",
  "Selection background": "design.globalStyles.placeholder.selectionBackground",
  "Focus outline color": "design.globalStyles.placeholder.focusOutlineColor",
  "Default border color": "design.globalStyles.placeholder.defaultBorderColor",
  "Select button font": "design.globalStyles.placeholder.selectButtonFont",
  "Hover background": "design.globalStyles.placeholder.hoverBackground",
  "Hover text color": "design.globalStyles.placeholder.hoverTextColor",
  "Hover border color": "design.globalStyles.placeholder.hoverBorderColor",
} satisfies Record<string, StudioMessageKey>;

const OPTION_LABEL_KEYS = {
  "300 Light": "design.globalStyles.option.300Light",
  "400 Regular": "design.globalStyles.option.400Regular",
  "500 Medium": "design.globalStyles.option.500Medium",
  "600 Semibold": "design.globalStyles.option.600Semibold",
  "700 Bold": "design.globalStyles.option.700Bold",
  "800 Extra Bold": "design.globalStyles.option.800ExtraBold",
  None: "design.globalStyles.option.none",
  Uppercase: "design.globalStyles.option.uppercase",
  Lowercase: "design.globalStyles.option.lowercase",
  Capitalize: "design.globalStyles.option.capitalize",
  Underline: "design.globalStyles.option.underline",
  Overline: "design.globalStyles.option.overline",
  "Line Through": "design.globalStyles.option.lineThrough",
  Wrap: "design.globalStyles.option.wrap",
  "No Wrap": "design.globalStyles.option.noWrap",
  Balance: "design.globalStyles.option.balance",
  Pretty: "design.globalStyles.option.pretty",
  Auto: "design.globalStyles.option.auto",
  Smooth: "design.globalStyles.option.smooth",
  Default: "design.globalStyles.option.default",
  Pointer: "design.globalStyles.option.pointer",
  Text: "design.globalStyles.option.text",
  Crosshair: "design.globalStyles.option.crosshair",
  Grab: "design.globalStyles.option.grab",
  Grabbing: "design.globalStyles.option.grabbing",
  "Not Allowed": "design.globalStyles.option.notAllowed",
  Wait: "design.globalStyles.option.wait",
  Help: "design.globalStyles.option.help",
  "Zoom In": "design.globalStyles.option.zoomIn",
  "Zoom Out": "design.globalStyles.option.zoomOut",
  Solid: "design.globalStyles.option.solid",
  Dashed: "design.globalStyles.option.dashed",
  Dotted: "design.globalStyles.option.dotted",
  Double: "design.globalStyles.option.double",
} satisfies Record<string, StudioMessageKey>;

function messageFromMap(
  map: Record<string, StudioMessageKey>,
  value: string | undefined,
): string {
  if (!value) return "";
  const key = map[value];
  return key ? t(key) : value;
}

function sectionLabel(title: string): string {
  const key = {
    Body: "design.globalStyles.tab.body",
    Headings: "design.globalStyles.tab.headings",
    Links: "design.globalStyles.tab.links",
    Inputs: "design.globalStyles.tab.inputs",
    Sections: "design.globalStyles.tab.sections",
    Containers: "design.globalStyles.tab.containers",
    Root: "design.globalStyles.tab.root",
    Buttons: "design.globalStyles.tab.buttons",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, title);
}

function sectionDescription(description: string): string {
  const key = {
    "Applies to the page body.": "design.globalStyles.description.body",
    "Applies to h1 through h6.": "design.globalStyles.description.headings",
    "Applies to default and interactive link states.": "design.globalStyles.description.links",
    "Applies to text inputs, textareas, selects, and `.input` helpers.": "design.globalStyles.description.inputs",
    "Applies spacing defaults to semantic section containers.": "design.globalStyles.description.sections",
    "Applies to page-level container wrappers.": "design.globalStyles.description.containers",
    "Applies to the HTML root element.": "design.globalStyles.description.root",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, description);
}

function fieldLabel(field: FieldDefinition): string {
  return messageFromMap(FIELD_LABEL_KEYS, field.label) || field.label;
}

function fieldPlaceholder(field: FieldDefinition): string {
  return messageFromMap(FIELD_PLACEHOLDER_KEYS, field.placeholder) || field.placeholder || "";
}

function optionLabel(option: SelectOption): string {
  return messageFromMap(OPTION_LABEL_KEYS, option.label);
}

function selectedOptionLabel(field: FieldDefinition): string {
  const option = field.options?.find(
    (entry) => entry.value === getStringValue(field.path),
  );
  return option ? optionLabel(option) : t("design.globalStyles.noOverride");
}

function spacingOptionLabel(option: { label: string }): string {
  const key = {
    Compact: "design.globalStyles.spacing.compact",
    Normal: "design.globalStyles.spacing.normal",
    Relaxed: "design.globalStyles.spacing.relaxed",
    Airy: "design.globalStyles.spacing.airy",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, option.label);
}

function spacingOptionDescription(option: { description: string }): string {
  const key = {
    "Tighter vertical rhythm": "design.globalStyles.spacing.compactDescription",
    "Balanced default spacing": "design.globalStyles.spacing.normalDescription",
    "More breathing room": "design.globalStyles.spacing.relaxedDescription",
    "Loose editorial spacing": "design.globalStyles.spacing.airyDescription",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, option.description);
}

function scaleRatioLabel(option: { label: string }): string {
  const key = {
    "Minor Second": "design.globalStyles.scale.minorSecond",
    "Major Second": "design.globalStyles.scale.majorSecond",
    "Minor Third": "design.globalStyles.scale.minorThird",
    "Major Third": "design.globalStyles.scale.majorThird",
    "Perfect Fourth": "design.globalStyles.scale.perfectFourth",
    "Perfect Fifth": "design.globalStyles.scale.perfectFifth",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, option.label);
}

function scaleRatioDescription(option: { description: string }): string {
  const key = {
    "Subtle hierarchy": "design.globalStyles.scale.minorSecondDescription",
    "Small step contrast": "design.globalStyles.scale.majorSecondDescription",
    "Balanced scale": "design.globalStyles.scale.minorThirdDescription",
    "Stronger contrast": "design.globalStyles.scale.majorThirdDescription",
    "Editorial emphasis": "design.globalStyles.scale.perfectFourthDescription",
    "High-contrast display scale": "design.globalStyles.scale.perfectFifthDescription",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, option.description);
}

function buttonVariantLabel(variant: string): string {
  const key = {
    primary: "design.globalStyles.buttonVariant.primary",
    secondary: "design.globalStyles.buttonVariant.secondary",
    muted: "design.globalStyles.buttonVariant.muted",
    destructive: "design.globalStyles.buttonVariant.destructive",
    disabled: "design.globalStyles.buttonVariant.disabled",
  } satisfies Record<string, StudioMessageKey>;
  return messageFromMap(key, variant);
}

const variableReferenceOptions = computed<VariableReferenceOption[]>(() => {
  const customOptions = Object.entries(globalStyles.value.variables.custom).map(
    ([key, variable]) => ({
      value: key,
      label: variable.label.trim() || `--${key}`,
      meta: `Custom · --${key}`,
      group: "Custom Variables",
    }),
  );

  const aliasOptions = Object.entries(globalStyles.value.variables.aliases).map(
    ([key, alias]) => ({
      value: key,
      label: alias.label.trim() || `--${key}`,
      meta: `Alias · --${key}`,
      group: "Aliases",
    }),
  );

  return [...customOptions, ...aliasOptions];
});

const variableManagerTokenOptions = computed(() =>
  buildVariableManagerTokenOptions(palettes.value, semanticColors.value),
);

const resolvedFontOptions = computed(() => {
  const allFamilies = new Set(
    fontOptions.value.map((option) => option.family).filter(Boolean),
  );

  const authoredFamilies = [
    globalStyles.value.defaults.body.fontFamily,
    globalStyles.value.defaults.heading.fontFamily,
    globalStyles.value.defaults.subheading.fontFamily,
    globalStyles.value.defaults.paragraph.fontFamily,
    globalStyles.value.defaults.button.base.fontFamily,
    globalStyles.value.defaults.input.fontFamily,
  ].filter((value) => value.trim().length > 0);

  for (const family of authoredFamilies) {
    allFamilies.add(family);
  }

  return Array.from(allFamilies).map((family) => {
    return (
      fontOptions.value.find((option) => option.family === family) ?? {
        label: family,
        family,
        source: "custom" as const,
      }
    );
  });
});

function getEntryFrom(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((currentValue, segment) => {
    if (!currentValue || typeof currentValue !== "object") {
      return undefined;
    }

    return (currentValue as Record<string, unknown>)[segment];
  }, source);
}

function getEntry(path: string): unknown {
  return getEntryFrom(globalStyles.value, path);
}

function getStringValue(path: string): string {
  const value = getEntry(path);
  return typeof value === "string" ? value : "";
}

function getDefaultStringValue(path: string): string {
  const value = getEntryFrom(DEFAULT_GLOBAL_STYLES, path);
  return typeof value === "string" ? value : "";
}

function assignStringValue(path: string, value: string): void {
  const segments = path.split(".");
  let target: Record<string, unknown> = globalStyles.value as unknown as Record<
    string,
    unknown
  >;

  for (const segment of segments.slice(0, -1)) {
    target = target[segment] as Record<string, unknown>;
  }

  target[segments.at(-1) as string] = value;
}

function rememberDirectValue(path: string, value: string): void {
  if (extractVariableReferenceKey(value) === null) {
    directFieldValues.value[path] = value;
  }
}

function extractVariableReferenceKey(rawValue: string): string | null {
  const matched = rawValue.trim().match(VARIABLE_REFERENCE_PATTERN);
  return matched?.[1] ?? null;
}

function isVariableReferencePath(path: string): boolean {
  return extractVariableReferenceKey(getStringValue(path)) !== null;
}

function getVariableReferenceModelValue(path: string): string | null {
  return extractVariableReferenceKey(getStringValue(path));
}

function getResolvedColorPickerValue(path: string): string | null {
  return resolveColorPickerPreviewValue(
    getStringValue(path),
    globalStyles.value.variables,
    variableManagerTokenOptions.value.map((option) => ({
      value: option.value,
      preview: option.preview,
    })),
    {
      palettes: palettes.value,
      semanticColors: semanticColors.value,
    },
  );
}

function resolvePreviewValue(rawValue: string): string | null {
  return resolveColorPickerPreviewValue(
    rawValue,
    globalStyles.value.variables,
    variableManagerTokenOptions.value.map((option) => ({
      value: option.value,
      preview: option.preview,
    })),
    {
      palettes: palettes.value,
      semanticColors: semanticColors.value,
    },
  );
}

function getPreviewColor(path: string, fallback: string): string {
  return resolvePreviewValue(getStringValue(path)) ?? fallback;
}

function getPreviewValue(path: string, fallback: string): string {
  return resolvePreviewValue(getStringValue(path)) ?? fallback;
}

function formatMeasurement(value: number, unit = ""): string {
  const normalizedValue = Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, "");

  return `${normalizedValue}${unit}`;
}

function parseMeasurement(
  value: string,
): { amount: number; unit: string } | null {
  const matched = value
    .trim()
    .match(/^(-?(?:\d+|\d*\.\d+))(px|rem|em|%|vw|vh|ch)?$/);

  if (!matched) {
    return null;
  }

  return {
    amount: Number(matched[1]),
    unit: matched[2] ?? "",
  };
}

function scaleMeasurementValue(value: string, factor: number): string {
  if (factor === 1) {
    return value;
  }

  const measurement = parseMeasurement(value);
  if (!measurement) {
    return value;
  }

  return formatMeasurement(measurement.amount * factor, measurement.unit);
}

function adjustLineHeightValue(
  value: string,
  rhythmFactor: number,
  scaleFactor: number,
): string {
  const measurement = parseMeasurement(value);
  if (!measurement) {
    return value;
  }

  const factor = measurement.unit ? rhythmFactor * scaleFactor : rhythmFactor;
  return formatMeasurement(measurement.amount * factor, measurement.unit);
}

function getTypographyScaleValue(
  stepId: string,
): { size: string; lineHeight: string; letterSpacing: string } | null {
  const scaleStep = typography.value.scale.find((step) => step.id === stepId);

  if (!scaleStep) {
    return null;
  }

  return {
    size: formatMeasurement(scaleStep.size, "px"),
    lineHeight: formatMeasurement(scaleStep.lineHeight, "px"),
    letterSpacing: formatMeasurement(scaleStep.letterSpacing, "em"),
  };
}

function getBodyPreviewStyle(): Record<string, string> {
  const scaleFactor = overallScale.value / 100;
  const rhythmFactor = SPACING_MULTIPLIERS[spacingStyle.value];

  return {
    backgroundColor: getPreviewColor(
      "defaults.body.backgroundColor",
      "#ffffff",
    ),
    color: getPreviewColor("defaults.body.color", "#111111"),
    fontFamily: getPreviewValue("defaults.body.fontFamily", "inherit"),
    fontSize: scaleMeasurementValue(
      getPreviewValue("defaults.body.fontSize", "16px"),
      scaleFactor,
    ),
    lineHeight: adjustLineHeightValue(
      getPreviewValue("defaults.body.lineHeight", "1.5"),
      rhythmFactor,
      scaleFactor,
    ),
    fontWeight: getPreviewValue("defaults.body.fontWeight", "400"),
    letterSpacing: getPreviewValue("defaults.body.letterSpacing", "0"),
  };
}

function getPreviewSurfaceStyle(): Record<string, string> {
  return {
    backgroundColor: getPreviewColor(
      "defaults.body.backgroundColor",
      "#ffffff",
    ),
  };
}

function getHeadingPreviewStyle(stepId: string): Record<string, string> {
  const scaleValue = getTypographyScaleValue(stepId);
  const rhythmFactor = SPACING_MULTIPLIERS[spacingStyle.value];

  return {
    color: getPreviewColor("defaults.heading.color", "#111111"),
    fontFamily: getPreviewValue("defaults.heading.fontFamily", "inherit"),
    fontWeight: getPreviewValue("defaults.heading.fontWeight", "700"),
    lineHeight: adjustLineHeightValue(
      getPreviewValue(
        "defaults.heading.lineHeight",
        scaleValue?.lineHeight ?? "1.1",
      ),
      rhythmFactor,
      1,
    ),
    letterSpacing: getPreviewValue(
      "defaults.heading.letterSpacing",
      scaleValue?.letterSpacing ?? "0",
    ),
    textTransform: getPreviewValue("defaults.heading.textTransform", "none"),
    fontSize: scaleValue?.size ?? "2rem",
  };
}

function getSubheadingPreviewStyle(): Record<string, string> {
  const scaleValue = getTypographyScaleValue("sm");
  const scaleFactor = overallScale.value / 100;
  const rhythmFactor = SPACING_MULTIPLIERS[spacingStyle.value];

  return {
    color: getPreviewColor("defaults.subheading.color", "#52525b"),
    fontFamily: getPreviewValue("defaults.subheading.fontFamily", "inherit"),
    fontWeight: getPreviewValue("defaults.subheading.fontWeight", "600"),
    lineHeight: adjustLineHeightValue(
      getPreviewValue(
        "defaults.subheading.lineHeight",
        scaleValue?.lineHeight ?? "1.2",
      ),
      rhythmFactor,
      scaleFactor,
    ),
    letterSpacing: getPreviewValue(
      "defaults.subheading.letterSpacing",
      scaleValue?.letterSpacing ?? "0",
    ),
    fontSize: scaleMeasurementValue(scaleValue?.size ?? "12px", scaleFactor),
  };
}

function getParagraphPreviewStyle(): Record<string, string> {
  const scaleFactor = overallScale.value / 100;
  const rhythmFactor = SPACING_MULTIPLIERS[spacingStyle.value];

  return {
    color: getPreviewColor("defaults.paragraph.color", "#111111"),
    fontFamily: getPreviewValue("defaults.paragraph.fontFamily", "inherit"),
    fontSize: scaleMeasurementValue(
      getPreviewValue("defaults.paragraph.fontSize", "16px"),
      scaleFactor,
    ),
    lineHeight: adjustLineHeightValue(
      getPreviewValue("defaults.paragraph.lineHeight", "1.6"),
      rhythmFactor,
      scaleFactor,
    ),
    letterSpacing: getPreviewValue("defaults.paragraph.letterSpacing", "0"),
    maxWidth: getPreviewValue("defaults.paragraph.maxWidth", "32ch"),
  };
}

function getInputPreviewStyle(isFocused = false): Record<string, string> {
  return {
    backgroundColor: getPreviewColor(
      "defaults.input.backgroundColor",
      "#111111",
    ),
    color: getPreviewColor("defaults.input.color", "#ffffff"),
    borderColor: getPreviewColor("defaults.input.borderColor", "#3f3f46"),
    borderRadius: getPreviewValue("defaults.input.borderRadius", "8px"),
    padding: `${getPreviewValue("defaults.input.paddingY", "8px")} ${getPreviewValue("defaults.input.paddingX", "12px")}`,
    fontFamily: getPreviewValue("defaults.input.fontFamily", "inherit"),
    fontSize: getPreviewValue("defaults.input.fontSize", "16px"),
    lineHeight: getPreviewValue("defaults.input.lineHeight", "1.4"),
    borderWidth: "1px",
    borderStyle: "solid",
    boxShadow: isFocused
      ? `0 0 0 3px ${getPreviewColor("defaults.input.focusRingColor", "#60a5fa")}`
      : "none",
  };
}

function getButtonPreviewStyle(
  variant: string,
  state: "default" | "hover" = "default",
): Record<string, string> {
  const backgroundFallbacks: Record<string, string> = {
    primary: "#111111",
    secondary: "#f3f4f6",
    muted: "#27272a",
    destructive: "#dc2626",
    disabled: "#27272a",
  };
  const textFallbacks: Record<string, string> = {
    primary: "#ffffff",
    secondary: "#111111",
    muted: "#ffffff",
    destructive: "#ffffff",
    disabled: "#a1a1aa",
  };

  const backgroundPath =
    state === "hover"
      ? `defaults.button.variants.${variant}.hoverBackgroundColor`
      : `defaults.button.variants.${variant}.backgroundColor`;
  const textPath =
    state === "hover"
      ? `defaults.button.variants.${variant}.hoverColor`
      : `defaults.button.variants.${variant}.color`;
  const borderPath =
    state === "hover"
      ? `defaults.button.variants.${variant}.hoverBorderColor`
      : `defaults.button.variants.${variant}.borderColor`;
  const defaultBackground = getPreviewColor(
    `defaults.button.variants.${variant}.backgroundColor`,
    backgroundFallbacks[variant] ?? "#111111",
  );
  const defaultText = getPreviewColor(
    `defaults.button.variants.${variant}.color`,
    textFallbacks[variant] ?? "#ffffff",
  );
  const defaultBorder = getPreviewColor(
    `defaults.button.variants.${variant}.borderColor`,
    "transparent",
  );

  return {
    backgroundColor: getPreviewColor(backgroundPath, defaultBackground),
    color: getPreviewColor(textPath, defaultText),
    borderColor: getPreviewColor(borderPath, defaultBorder),
    borderWidth: getPreviewValue("defaults.button.base.borderWidth", "1px"),
    borderStyle: "solid",
    borderRadius: getPreviewValue("defaults.button.base.borderRadius", "8px"),
    padding: `${getPreviewValue("defaults.button.base.paddingY", "10px")} ${getPreviewValue("defaults.button.base.paddingX", "16px")}`,
    fontFamily: getPreviewValue("defaults.button.base.fontFamily", "inherit"),
    fontSize: getPreviewValue("defaults.button.base.fontSize", "14px"),
    fontWeight: getPreviewValue("defaults.button.base.fontWeight", "600"),
    lineHeight: getPreviewValue("defaults.button.base.lineHeight", "1.2"),
    letterSpacing: getPreviewValue("defaults.button.base.letterSpacing", "0"),
  };
}

function handleVariableReferenceUpdate(
  path: string,
  nextValue: string | null,
): void {
  if (!nextValue) {
    assignStringValue(path, directFieldValues.value[path] ?? "");
    return;
  }

  const currentValue = getStringValue(path);
  if (extractVariableReferenceKey(currentValue) === null) {
    rememberDirectValue(path, currentValue);
  }

  assignStringValue(path, `var(--${nextValue})`);
}

function setStringValue(path: string, value: string): void {
  rememberDirectValue(path, value);
  assignStringValue(path, value);
}

function parseMeasurementValue(
  rawValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): { value: string; unit: string } {
  const trimmed = rawValue.trim();
  const fallbackUnit = allowedUnits[0]?.value ?? "px";

  if (!trimmed) {
    return { value: "", unit: fallbackUnit };
  }

  const matched = trimmed.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!matched) {
    return { value: trimmed, unit: "raw" };
  }

  const nextUnit = allowedUnits.some((unit) => unit.value === matched[2])
    ? matched[2]
    : fallbackUnit;

  return {
    value: matched[1],
    unit: nextUnit,
  };
}

function getDefaultMeasurementUnit(
  allowedUnits: readonly MeasurementUnitOption[],
): string {
  return allowedUnits[0]?.value ?? "px";
}

function normalizeMeasurementUnitValue(
  unitValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): string {
  return allowedUnits.some((unit) => unit.value === unitValue)
    ? unitValue
    : getDefaultMeasurementUnit(allowedUnits);
}

function rememberMeasurementUnit(
  path: string,
  unitValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): void {
  pendingMeasurementUnits.value[path] = normalizeMeasurementUnitValue(
    unitValue,
    allowedUnits,
  );
}

function getMeasurementNumber(
  path: string,
  allowedUnits: readonly MeasurementUnitOption[],
): string {
  return parseMeasurementValue(getStringValue(path), allowedUnits).value;
}

function getMeasurementUnit(
  path: string,
  allowedUnits: readonly MeasurementUnitOption[],
): string {
  const rawValue = getStringValue(path);

  if (!rawValue.trim()) {
    return normalizeMeasurementUnitValue(
      pendingMeasurementUnits.value[path] ?? "",
      allowedUnits,
    );
  }

  return parseMeasurementValue(rawValue, allowedUnits).unit;
}

function writeMeasurement(
  path: string,
  numericValue: string,
  unitValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): void {
  const normalizedUnit = normalizeMeasurementUnitValue(unitValue, allowedUnits);
  rememberMeasurementUnit(path, normalizedUnit, allowedUnits);
  const trimmed = numericValue.trim();
  if (!trimmed) {
    setStringValue(path, "");
    return;
  }

  if (normalizedUnit === "raw") {
    setStringValue(path, trimmed);
    return;
  }

  setStringValue(path, `${trimmed}${normalizedUnit}`);
}

function updateMeasurementNumber(
  path: string,
  nextValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): void {
  const sanitized = nextValue.replace(/[^0-9.-]/g, "");
  const unit = getMeasurementUnit(path, allowedUnits);
  writeMeasurement(path, sanitized, unit, allowedUnits);
}

function handleMeasurementValueUpdate(
  path: string,
  nextValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): void {
  if (extractVariableReferenceKey(nextValue) !== null) {
    setStringValue(path, nextValue);
    return;
  }

  updateMeasurementNumber(path, nextValue, allowedUnits);
}

function resolveScrubOrigin(rawValue: string): {
  startValue: number;
  unit: string;
} {
  const trimmed = rawValue.trim();
  const matched = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);

  if (!matched) {
    return { startValue: 0, unit: "px" };
  }

  return {
    startValue: Number.parseFloat(matched[1] ?? "0"),
    unit: matched[2] ?? "px",
  };
}

function handleMeasurementMouseDown(
  path: string,
  allowedUnits: readonly MeasurementUnitOption[],
  event: MouseEvent,
): void {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (isVariableReferencePath(path)) {
    return;
  }

  const input = event.target;
  const originValue = getStringValue(path);
  const { startValue, unit: originUnit } = resolveScrubOrigin(originValue);
  const unit = originValue.trim()
    ? originUnit
    : getMeasurementUnit(path, allowedUnits);

  measurementScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = String(Math.round(startValue + deltaX));
      const resolvedUnit = allowedUnits.some((option) => option.value === unit)
        ? unit
        : (allowedUnits[0]?.value ?? "px");
      writeMeasurement(path, nextValue, resolvedUnit, allowedUnits);
      input.focus();
    },
    onCancel: () => {
      assignStringValue(path, originValue);
    },
    onCommit: () => {
      const currentValue = getStringValue(path);
      rememberDirectValue(path, currentValue);
    },
  });
}

function updateMeasurementUnit(
  path: string,
  nextUnitValue: string,
  allowedUnits: readonly MeasurementUnitOption[],
): void {
  const rawValue = getStringValue(path);
  const { value, unit } = parseMeasurementValue(rawValue, allowedUnits);

  // If the value couldn't be parsed into a clean number+unit (raw),
  // and we're switching to a real unit, start from scratch to avoid
  // producing invalid CSS like "calc(16px * 2)px"
  const writeValue = unit === "raw" && nextUnitValue !== "raw" ? "" : value;

  writeMeasurement(path, writeValue, nextUnitValue, allowedUnits);
}

function handleSelectUpdate(path: string, nextValue: string): void {
  setStringValue(path, nextValue === EMPTY_SELECT_VALUE ? "" : nextValue);
}

function getSelectModelValue(path: string): string {
  if (isVariableReferencePath(path)) {
    return EMPTY_SELECT_VALUE;
  }

  const value = getStringValue(path);
  return value || EMPTY_SELECT_VALUE;
}

function hasSelectValue(path: string): boolean {
  const value = getStringValue(path);
  return value !== "" && value !== EMPTY_SELECT_VALUE;
}

function isFieldChanged(path: string): boolean {
  return getStringValue(path) !== getDefaultStringValue(path);
}

function resetFieldValue(path: string): void {
  setStringValue(path, getDefaultStringValue(path));
}

function getFieldResetButtonTestId(path: string): string {
  return `global-styles-reset-${path.replace(/\./g, "-")}`;
}

function getFieldMeasurementInputTestId(path: string): string {
  return `global-styles-measurement-${path.replace(/\./g, "-")}`;
}

function getFieldUnitSelectTestId(path: string): string {
  return `global-styles-unit-${path.replace(/\./g, "-")}`;
}

function isOverallScaleChanged(): boolean {
  return overallScale.value !== 100;
}

function resetOverallScale(): void {
  overallScaleDraft.value = "100";
  applyOverallScale(100);
}

function isSpacingStyleChanged(): boolean {
  return spacingStyle.value !== "normal";
}

function resetSpacingStyle(): void {
  applySpacingStyle("normal");
}

function isScaleRatioChanged(): boolean {
  return scaleRatio.value !== "minor-third";
}

function resetScaleRatio(): void {
  applyScaleRatio("minor-third");
}

function handleFontsUpdated(): void {
  void loadFontOptions();
}

function commitOverallScale(): void {
  const parsedValue = Number(overallScaleDraft.value);

  if (!Number.isFinite(parsedValue)) {
    overallScaleDraft.value = String(overallScale.value);
    return;
  }

  applyOverallScale(Math.min(150, Math.max(75, Math.round(parsedValue))));
}

function handleOverallScaleMouseDown(event: MouseEvent): void {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  const input = event.target;
  const originValue = overallScale.value;
  const startValue = Number.parseFloat(
    overallScaleDraft.value || String(originValue),
  );

  overallScaleScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.min(
        150,
        Math.max(75, Math.round(startValue + deltaX)),
      );
      overallScaleDraft.value = String(nextValue);
      applyOverallScale(nextValue);
      input.focus();
    },
    onCancel: () => {
      overallScaleDraft.value = String(originValue);
      applyOverallScale(originValue);
    },
    onCommit: () => {
      commitOverallScale();
    },
  });
}

function handleSpacingStyleUpdate(nextValue: string): void {
  const matchingOption = SPACING_STYLE_OPTIONS.find(
    (option) => option.value === nextValue,
  );

  if (!matchingOption) {
    return;
  }

  applySpacingStyle(matchingOption.value);
}

function handleScaleRatioUpdate(nextValue: string): void {
  const matchingOption = SCALE_RATIO_OPTIONS.find(
    (option) => option.value === nextValue,
  );

  if (!matchingOption) {
    return;
  }

  applyScaleRatio(matchingOption.value);
}

onMounted(async () => {
  await Promise.all([
    loadGlobalStyles(),
    loadTypography(),
    palettes.value.length === 0 ? loadDesignSystem() : Promise.resolve(),
  ]);
  window.addEventListener(TYPOGRAPHY_FONTS_UPDATED_EVENT, handleFontsUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener(
    TYPOGRAPHY_FONTS_UPDATED_EVENT,
    handleFontsUpdated,
  );
});

watch(
  overallScale,
  (nextValue) => {
    overallScaleDraft.value = String(nextValue);
  },
  { immediate: true },
);

async function handleSave(): Promise<void> {
  try {
    await saveGlobalStyles();
    toast.success(t("design.globalStyles.saved"));
  } catch (error) {
    toast.error(t("design.globalStyles.saveFailed"));
  }
}
</script>

<template>
  <div
    v-if="isLoading"
    class="flex h-full items-center justify-center page-card-enter"
  >
    <div
      :class="[
        studioIcons.loading,
        'h-6 w-6 animate-spin text-muted-foreground',
      ]"
    ></div>
  </div>

  <div v-else class="min-w-0 space-y-0 px-0 page-card-enter z-10 bg-background">
    <DesignHeaderTeleport target="actions">
      <HeaderActionTooltip :label="hasUnsavedChanges ? t('common.saveChanges') : t('design.status.synced')">
        <Button variant="headerAction" size="icon-header" :disabled="!hasUnsavedChanges || isSaving" @click="handleSave">
          <span v-if="isSaving" :class="[studioIcons.loading, 'size-4 shrink-0 animate-spin']" />
          <span v-else :class="[studioIcons.save, 'size-4 shrink-0']" />
        </Button>
      </HeaderActionTooltip>
    </DesignHeaderTeleport>

    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
    >
      <Button
          v-for="tab in sectionTabs"
          :key="tab"
          type="button"
          size="tab"
          :variant="activeSectionTitle === tab ? 'tab-active' : 'tab'"
          @click="activeSectionTitle = tab"
        >
          {{ sectionLabel(tab) }}
      </Button>
    </div>

    <div class="px-5 py-5">
      <div class="mx-auto max-w-5xl overscroll-none pb-6">
        <div
          class="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,42rem)_20rem]"
        >
          <div class="min-w-0">
<section
          v-if="activeDefaultSection"
          :key="activeDefaultSection.title"
          class="min-w-0 p-7 page-card-enter"
        >
          <div class="space-y-0 mb-8">
            <h2
              class="text-2xl font-serif font-medium text-foreground leading-2"
            >
              {{ sectionLabel(activeDefaultSection.title) }}
            </h2>
            <p class="text-sm text-muted-foreground/70">
              {{ sectionDescription(activeDefaultSection.description) }}
            </p>
          </div>

          <div class="space-y-6">
            <div
              v-for="field in activeDefaultSection.fields"
              :key="field.path"
              class="min-w-0 space-y-2"
            >
              <label
                class="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
              >
                {{ fieldLabel(field) }}
              </label>

              <div v-if="field.kind === 'color'" class="space-y-2">
                <div class="flex items-center gap-2">
                  <ColorField
                    :model-value="getStringValue(field.path) || '#777777'"
                    :resolved-model-value="
                      getResolvedColorPickerValue(field.path)
                    "
                    layout="unified"
                    persist-mode="live"
                    show-variables
                    show-alpha
                    show-design-colors
                    content-side="left"
                    content-align="center"
                    class="min-w-0 flex-1"
                    @update:model-value="
                      setStringValue(field.path, String($event))
                    "
                  />
                  <button
                    v-if="isFieldChanged(field.path)"
                    type="button"
                    :title="t('design.globalStyles.resetField')"
                    :aria-label="t('design.globalStyles.resetField')"
                    :data-testid="getFieldResetButtonTestId(field.path)"
                    :class="GLOBAL_STYLES_RESET_BUTTON_CLASS"
                    @click.stop.prevent="resetFieldValue(field.path)"
                  >
                    <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                  </button>
                </div>
              </div>

              <div v-else-if="field.kind === 'font'">
                <div class="flex min-w-0 items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <div
                      v-if="isVariableReferencePath(field.path)"
                      :class="GLOBAL_STYLES_READONLY_CONTROL_CLASS"
                    >
                      <button
                        type="button"
                        :title="t('design.globalStyles.clearSelection')"
                        :aria-label="t('design.globalStyles.clearSelection')"
                        class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                        @pointerdown.stop.prevent="resetFieldValue(field.path)"
                      >
                        <span :class="[studioIcons.close, 'size-4 shrink-0']" />
                      </button>
                      {{ getStringValue(field.path) }}
                    </div>
                    <Select
                      v-else
                      :model-value="getSelectModelValue(field.path)"
                      @update:model-value="
                        handleSelectUpdate(field.path, String($event))
                      "
                    >
                      <SelectTrigger
                        hide-icon
                        :class="GLOBAL_STYLES_CONTROL_CLASS"
                      >
                        <button
                          v-if="hasSelectValue(field.path)"
                          type="button"
                          :title="t('design.globalStyles.clearSelection')"
                          :aria-label="t('design.globalStyles.clearSelection')"
                          class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                          @pointerdown.stop.prevent="
                            resetFieldValue(field.path)
                          "
                        >
                          <span
                            :class="[studioIcons.close, 'size-4 shrink-0']"
                          />
                        </button>
                        <span
                          v-else
                          :class="[
                            field.icon || studioIcons.textFontSize,
                            'size-4 shrink-0 mr-2 text-muted-foreground',
                          ]"
                        />
                        <SelectValue>
                          {{
                            getStringValue(field.path) ||
                            fieldPlaceholder(field) ||
                            t("design.globalStyles.selectFont")
                          }}
                        </SelectValue>
                        <div class="ml-auto flex items-center">
                          <GlobalStyleVariablePicker
                            inline
                            :model-value="
                              getVariableReferenceModelValue(field.path)
                            "
                            :options="variableReferenceOptions"
                            :placeholder="t('design.globalStyles.selectVariable')"
                            @update:model-value="
                              handleVariableReferenceUpdate(field.path, $event)
                            "
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem :value="EMPTY_SELECT_VALUE">
                          {{ t("design.globalStyles.noOverride") }}
                        </SelectItem>
                        <SelectItem
                          v-for="option in resolvedFontOptions"
                          :key="option.family"
                          :value="option.family"
                        >
                          <span :style="{ fontFamily: option.family }">{{
                            option.label
                          }}</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div
                v-else-if="field.kind === 'measurement' && field.units"
                class="space-y-2"
              >
                <div :class="GLOBAL_STYLES_MEASUREMENT_GRID_CLASS">
                  <div class="relative flex items-center">
                    <button
                      v-if="isFieldChanged(field.path)"
                      type="button"
                      :title="t('design.globalStyles.resetField')"
                      :aria-label="t('design.globalStyles.resetField')"
                      :data-testid="getFieldResetButtonTestId(field.path)"
                      :class="GLOBAL_STYLES_LEADING_RESET_BUTTON_CLASS"
                      @click.stop.prevent="resetFieldValue(field.path)"
                    >
                      <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                    </button>
                    <span v-else :class="GLOBAL_STYLES_DRAG_ICON_CLASS" />
                    <VariableAssignableInput
                      :model-value="
                        isVariableReferencePath(field.path)
                          ? getStringValue(field.path)
                          : getMeasurementNumber(field.path, field.units)
                      "
                      :data-testid="getFieldMeasurementInputTestId(field.path)"
                      class="min-w-0 w-full"
                      :placeholder="fieldPlaceholder(field)"
                      :options="variableReferenceOptions"
                      :picker-placeholder="t('design.globalStyles.selectVariable')"
                      :input-class="GLOBAL_STYLES_MEASUREMENT_INPUT_CLASS"
                      @update:model-value="
                        handleMeasurementValueUpdate(
                          field.path,
                          String($event),
                          field.units,
                        )
                      "
                      @mousedown="
                        handleMeasurementMouseDown(
                          field.path,
                          field.units,
                          $event,
                        )
                      "
                    />
                  </div>
                  <Select
                    :model-value="getMeasurementUnit(field.path, field.units)"
                    :data-testid="getFieldUnitSelectTestId(field.path)"
                    :disabled="isVariableReferencePath(field.path)"
                    @update:model-value="
                      updateMeasurementUnit(
                        field.path,
                        String($event),
                        field.units,
                      )
                    "
                  >
                    <SelectTrigger
                      hide-icon
                      :class="GLOBAL_STYLES_UNIT_SELECT_TRIGGER_CLASS"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="end"
                      class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
                    >
                      <SelectItem
                        v-for="unit in field.units"
                        :key="unit.label"
                        :value="unit.value"
                        class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
                      >
                        {{ unit.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div v-else-if="field.kind === 'select' && field.options">
                <div class="flex min-w-0 items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <div
                      v-if="isVariableReferencePath(field.path)"
                      :class="GLOBAL_STYLES_READONLY_CONTROL_CLASS"
                    >
                      <button
                        type="button"
                        :title="t('design.globalStyles.clearSelection')"
                        :aria-label="t('design.globalStyles.clearSelection')"
                        class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                        @pointerdown.stop.prevent="resetFieldValue(field.path)"
                      >
                        <span :class="[studioIcons.close, 'size-4 shrink-0']" />
                      </button>
                      {{ getStringValue(field.path) }}
                    </div>
                    <Select
                      v-else
                      :model-value="getSelectModelValue(field.path)"
                      @update:model-value="
                        handleSelectUpdate(field.path, String($event))
                      "
                    >
                      <SelectTrigger
                        hide-icon
                        :class="GLOBAL_STYLES_CONTROL_CLASS"
                      >
                        <button
                          v-if="hasSelectValue(field.path)"
                          type="button"
                          :title="t('design.globalStyles.clearSelection')"
                          :aria-label="t('design.globalStyles.clearSelection')"
                          class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                          @pointerdown.stop.prevent="
                            resetFieldValue(field.path)
                          "
                        >
                          <span
                            :class="[studioIcons.close, 'size-4 shrink-0']"
                          />
                        </button>
                        <span
                          v-else-if="field.icon"
                          :class="[
                            field.icon,
                            'size-4 shrink-0 mr-2 text-muted-foreground',
                          ]"
                        />
                      <SelectValue>
                          {{ selectedOptionLabel(field) }}
                      </SelectValue>
                        <div class="ml-auto flex items-center">
                          <GlobalStyleVariablePicker
                            inline
                            :model-value="
                              getVariableReferenceModelValue(field.path)
                            "
                            :options="variableReferenceOptions"
                            :placeholder="t('design.globalStyles.selectVariable')"
                            @update:model-value="
                              handleVariableReferenceUpdate(field.path, $event)
                            "
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem :value="EMPTY_SELECT_VALUE">
                          {{ t("design.globalStyles.noOverride") }}
                        </SelectItem>
                        <SelectItem
                          v-for="option in field.options"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ optionLabel(option) }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <template v-if="activeDefaultSection.title === 'Body'">
              <div class="space-y-2">
                <label
                  class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {{ t("design.globalStyles.overallSize") }}
                </label>

                <div :class="GLOBAL_STYLES_SCALE_GRID_CLASS">
                  <div class="relative flex items-center">
                    <button
                      v-if="isOverallScaleChanged()"
                      type="button"
                      :title="t('design.globalStyles.resetField')"
                      :aria-label="t('design.globalStyles.resetField')"
                      data-testid="global-styles-reset-overall-scale"
                      :class="GLOBAL_STYLES_LEADING_RESET_BUTTON_CLASS"
                      @click.stop.prevent="resetOverallScale()"
                    >
                      <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                    </button>
                    <span v-else :class="GLOBAL_STYLES_DRAG_ICON_CLASS" />
                    <Input
                      :model-value="overallScaleDraft"
                      :class="GLOBAL_STYLES_MEASUREMENT_INPUT_CLASS"
                      placeholder="100"
                      @update:model-value="
                        overallScaleDraft = String($event).replace(
                          /[^0-9.-]/g,
                          '',
                        )
                      "
                      @blur="commitOverallScale"
                      @mousedown="handleOverallScaleMouseDown"
                    />
                  </div>
                  <div :class="GLOBAL_STYLES_SUFFIX_CLASS">%</div>
                </div>
              </div>

              <div class="space-y-2">
                <label
                  class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {{ t("design.globalStyles.lineRhythm") }}
                </label>

                <div class="relative">
                  <Select
                    :model-value="spacingStyle"
                    @update:model-value="
                      handleSpacingStyleUpdate(String($event))
                    "
                  >
                    <SelectTrigger
                      :class="GLOBAL_STYLES_CONTROL_WITH_RESET_CLASS"
                    >
                      <SelectValue>
                        {{ spacingOptionLabel(selectedSpacingOption) }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in SPACING_STYLE_OPTIONS"
                        :key="option.value"
                        :value="option.value"
                      >
                        <div class="flex flex-col items-start">
                          <span>{{ spacingOptionLabel(option) }}</span>
                          <span class="text-xs text-muted-foreground">{{
                            spacingOptionDescription(option)
                          }}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <button
                    v-if="isSpacingStyleChanged()"
                    type="button"
                    :title="t('design.globalStyles.resetField')"
                    :aria-label="t('design.globalStyles.resetField')"
                    data-testid="global-styles-reset-spacing-style"
                    :class="[
                      GLOBAL_STYLES_RESET_BUTTON_CLASS,
                      GLOBAL_STYLES_TRAILING_RESET_CLASS,
                    ]"
                    @click.stop.prevent="resetSpacingStyle()"
                  >
                    <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                  </button>
                </div>
              </div>
            </template>

            <template v-else-if="activeDefaultSection.title === 'Headings'">
              <div class="space-y-2">
                <label
                  class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {{ t("design.globalStyles.headingScale") }}
                </label>

                <div class="relative">
                  <Select
                    :model-value="scaleRatio"
                    @update:model-value="handleScaleRatioUpdate(String($event))"
                  >
                    <SelectTrigger
                      :class="GLOBAL_STYLES_CONTROL_WITH_RESET_CLASS"
                    >
                      <SelectValue>
                        {{ scaleRatioLabel(selectedScaleRatioOption) }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in SCALE_RATIO_OPTIONS"
                        :key="option.value"
                        :value="option.value"
                      >
                        <div class="flex flex-col items-start">
                          <span>{{ scaleRatioLabel(option) }}</span>
                          <span class="text-xs text-muted-foreground">{{
                            scaleRatioDescription(option)
                          }}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <button
                    v-if="isScaleRatioChanged()"
                    type="button"
                    :title="t('design.globalStyles.resetField')"
                    :aria-label="t('design.globalStyles.resetField')"
                    data-testid="global-styles-reset-scale-ratio"
                    :class="[
                      GLOBAL_STYLES_RESET_BUTTON_CLASS,
                      GLOBAL_STYLES_TRAILING_RESET_CLASS,
                    ]"
                    @click.stop.prevent="resetScaleRatio()"
                  >
                    <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                  </button>
                </div>

                <p class="text-xs leading-5 text-muted-foreground">
                  {{ scaleRatioDescription(selectedScaleRatioOption) }}
                </p>
              </div>
            </template>
          </div>
        </section>

        <section v-else class="min-w-0 p-7 page-card-enter">
          <div class="space-y-0 mb-8">
            <h2
              class="text-2xl font-serif font-medium text-foreground leading-2"
            >
              {{ t("design.globalStyles.tab.buttons") }}
            </h2>
            <p class="text-sm text-muted-foreground/70">
              {{ t("design.globalStyles.description.buttons") }}
            </p>
          </div>

          <div class="space-y-6">
            <div
              v-for="field in BUTTON_BASE_FIELDS"
              :key="field.path"
              class="min-w-0 space-y-2"
            >
              <label
                class="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
              >
                {{ fieldLabel(field) }}
              </label>

              <div
                v-if="field.kind === 'font'"
                class="flex min-w-0 items-center gap-2"
              >
                <div class="min-w-0 flex-1">
                  <div
                    v-if="isVariableReferencePath(field.path)"
                    :class="GLOBAL_STYLES_READONLY_CONTROL_CLASS"
                  >
                    <button
                      type="button"
                      :title="t('design.globalStyles.clearSelection')"
                      :aria-label="t('design.globalStyles.clearSelection')"
                      class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                      @pointerdown.stop.prevent="resetFieldValue(field.path)"
                    >
                      <span :class="[studioIcons.close, 'size-4 shrink-0']" />
                    </button>
                    {{ getStringValue(field.path) }}
                  </div>
                  <Select
                    v-else
                    :model-value="getSelectModelValue(field.path)"
                    @update:model-value="
                      handleSelectUpdate(field.path, String($event))
                    "
                  >
                    <SelectTrigger
                      hide-icon
                      :class="GLOBAL_STYLES_CONTROL_CLASS"
                    >
                      <button
                        v-if="hasSelectValue(field.path)"
                        type="button"
                        :title="t('design.globalStyles.clearSelection')"
                        :aria-label="t('design.globalStyles.clearSelection')"
                        class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                        @pointerdown.stop.prevent="resetFieldValue(field.path)"
                      >
                        <span :class="[studioIcons.close, 'size-4 shrink-0']" />
                      </button>
                      <span
                        v-else
                        :class="[
                          field.icon || studioIcons.textFontSize,
                          'size-4 shrink-0 mr-2 text-muted-foreground',
                        ]"
                      />
                      <SelectValue>
                        {{
                          getStringValue(field.path) ||
                          fieldPlaceholder(field) ||
                          t("design.globalStyles.selectFont")
                        }}
                      </SelectValue>
                      <div class="ml-auto flex items-center">
                        <GlobalStyleVariablePicker
                          inline
                          :model-value="
                            getVariableReferenceModelValue(field.path)
                          "
                          :options="variableReferenceOptions"
                          :placeholder="t('design.globalStyles.selectVariable')"
                          @update:model-value="
                            handleVariableReferenceUpdate(field.path, $event)
                          "
                        />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="EMPTY_SELECT_VALUE">
                        {{ t("design.globalStyles.noOverride") }}
                      </SelectItem>
                      <SelectItem
                        v-for="option in resolvedFontOptions"
                        :key="`${field.path}-${option.family}`"
                        :value="option.family"
                      >
                        <span :style="{ fontFamily: option.family }">{{
                          option.label
                        }}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div
                v-else-if="field.kind === 'measurement' && field.units"
                class="space-y-2"
              >
                <div :class="GLOBAL_STYLES_MEASUREMENT_GRID_CLASS">
                  <div class="relative flex items-center">
                    <button
                      v-if="isFieldChanged(field.path)"
                      type="button"
                      :title="t('design.globalStyles.resetField')"
                      :aria-label="t('design.globalStyles.resetField')"
                      :data-testid="getFieldResetButtonTestId(field.path)"
                      :class="GLOBAL_STYLES_LEADING_RESET_BUTTON_CLASS"
                      @click.stop.prevent="resetFieldValue(field.path)"
                    >
                      <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                    </button>
                    <span v-else :class="GLOBAL_STYLES_DRAG_ICON_CLASS" />
                    <VariableAssignableInput
                      :model-value="
                        isVariableReferencePath(field.path)
                          ? getStringValue(field.path)
                          : getMeasurementNumber(field.path, field.units)
                      "
                      :data-testid="getFieldMeasurementInputTestId(field.path)"
                      class="min-w-0 w-full"
                      :placeholder="fieldPlaceholder(field)"
                      :options="variableReferenceOptions"
                      :picker-placeholder="t('design.globalStyles.selectVariable')"
                      :input-class="GLOBAL_STYLES_MEASUREMENT_INPUT_CLASS"
                      @update:model-value="
                        handleMeasurementValueUpdate(
                          field.path,
                          String($event),
                          field.units,
                        )
                      "
                      @mousedown="
                        handleMeasurementMouseDown(
                          field.path,
                          field.units,
                          $event,
                        )
                      "
                    />
                  </div>
                  <Select
                    :model-value="getMeasurementUnit(field.path, field.units)"
                    :data-testid="getFieldUnitSelectTestId(field.path)"
                    :disabled="isVariableReferencePath(field.path)"
                    @update:model-value="
                      updateMeasurementUnit(
                        field.path,
                        String($event),
                        field.units,
                      )
                    "
                  >
                    <SelectTrigger
                      hide-icon
                      :class="GLOBAL_STYLES_UNIT_SELECT_TRIGGER_CLASS"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="end"
                      class="w-16 min-w-0 border-border-70 bg-sidebar text-foreground shadow-xl"
                    >
                      <SelectItem
                        v-for="unit in field.units"
                        :key="`${field.path}-${unit.label}`"
                        :value="unit.value"
                        class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-muted focus:text-foreground data-[state=checked]:text-primary"
                      >
                        {{ unit.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div
                v-else-if="field.kind === 'select' && field.options"
                class="flex min-w-0 items-center gap-2"
              >
                <div class="min-w-0 flex-1">
                  <div
                    v-if="isVariableReferencePath(field.path)"
                    :class="GLOBAL_STYLES_READONLY_CONTROL_CLASS"
                  >
                    <button
                      type="button"
                      :title="t('design.globalStyles.clearSelection')"
                      :aria-label="t('design.globalStyles.clearSelection')"
                      class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                      @pointerdown.stop.prevent="resetFieldValue(field.path)"
                    >
                      <span :class="[studioIcons.close, 'size-4 shrink-0']" />
                    </button>
                    {{ getStringValue(field.path) }}
                  </div>
                  <Select
                    v-else
                    :model-value="getSelectModelValue(field.path)"
                    @update:model-value="
                      handleSelectUpdate(field.path, String($event))
                    "
                  >
                    <SelectTrigger
                      hide-icon
                      :class="GLOBAL_STYLES_CONTROL_CLASS"
                    >
                      <button
                        v-if="hasSelectValue(field.path)"
                        type="button"
                        :title="t('design.globalStyles.clearSelection')"
                        :aria-label="t('design.globalStyles.clearSelection')"
                        class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground shrink-0 mr-2"
                        @pointerdown.stop.prevent="resetFieldValue(field.path)"
                      >
                        <span :class="[studioIcons.close, 'size-4 shrink-0']" />
                      </button>
                      <span
                        v-else-if="field.icon"
                        :class="[
                          field.icon,
                          'size-4 shrink-0 mr-2 text-muted-foreground',
                        ]"
                      />
                      <SelectValue>
                        {{ selectedOptionLabel(field) }}
                      </SelectValue>
                      <div class="ml-auto flex items-center">
                        <GlobalStyleVariablePicker
                          inline
                          :model-value="
                            getVariableReferenceModelValue(field.path)
                          "
                          :options="variableReferenceOptions"
                          :placeholder="t('design.globalStyles.selectVariable')"
                          @update:model-value="
                            handleVariableReferenceUpdate(field.path, $event)
                          "
                        />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="EMPTY_SELECT_VALUE">
                        {{ t("design.globalStyles.noOverride") }}
                      </SelectItem>
                      <SelectItem
                        v-for="option in field.options"
                        :key="`${field.path}-${option.value}`"
                        :value="option.value"
                      >
                        {{ optionLabel(option) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-6">
            <article
              v-for="variant in GLOBAL_STYLE_BUTTON_VARIANTS"
              :key="variant"
              class="min-w-0 rounded-lg border border-dashed border-border/50 bg-card/30 p-4 space-y-4"
            >
              <h5 class="text-sm font-medium text-foreground">
                {{ buttonVariantLabel(variant) }}
              </h5>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div
                  v-for="field in BUTTON_VARIANT_FIELDS(variant)"
                  :key="field.path"
                  class="min-w-0 space-y-2"
                >
                  <label
                    class="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {{ fieldLabel(field) }}
                  </label>

                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <ColorField
                        :model-value="getStringValue(field.path) || '#111111'"
                        :resolved-model-value="
                          getResolvedColorPickerValue(field.path)
                        "
                        layout="unified"
                        persist-mode="live"
                        show-variables
                        show-alpha
                        show-design-colors
                        content-side="left"
                        content-align="start"
                        class="min-w-0 flex-1"
                        @update:model-value="
                          setStringValue(field.path, String($event))
                        "
                      />
                      <button
                        v-if="isFieldChanged(field.path)"
                        type="button"
                        :title="t('design.globalStyles.resetField')"
                        :aria-label="t('design.globalStyles.resetField')"
                        :data-testid="getFieldResetButtonTestId(field.path)"
                        :class="GLOBAL_STYLES_RESET_BUTTON_CLASS"
                        @click.stop.prevent="resetFieldValue(field.path)"
                      >
                        <span :class="GLOBAL_STYLES_RESET_ICON_CLASS" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
          </div>

          <aside class="min-w-0 xl:sticky xl:top-5">
            <div
              class="overflow-hidden rounded-sm border border-dashed border-border bg-card/20"
            >
              <div
                class="flex h-12 items-center justify-between border-b border-dashed border-border px-4"
              >
                <h3 class="text-sm font-serif font-medium text-foreground">
                  {{ t("design.globalStyles.preview") }}
                </h3>
                <span
                  class="rounded-sm border border-dashed border-border/50 px-1.5 py-0.5 text-2xs font-mono text-muted-foreground"
                >
                  {{ sectionLabel(activeSectionTitle) }}
                </span>
              </div>

              <div
                data-testid="preview-surface"
                class="min-h-80 p-4"
                :style="getPreviewSurfaceStyle()"
              >
                <div
                  v-if="activeSectionTitle === 'Body'"
                  data-testid="body-preview-sample"
                  class="space-y-[0.65em] rounded-sm border border-dashed border-border/50 bg-background/45 p-4"
                  :style="getBodyPreviewStyle()"
                >
                  <div class="font-medium">{{ t("design.globalStyles.previewBody") }}</div>
                  <p>
                    {{ t("design.globalStyles.previewBodyCopy") }}
                  </p>
                </div>

                <div
                  v-else-if="activeSectionTitle === 'Headings'"
                  class="space-y-3 rounded-sm border border-dashed border-border/50 bg-background/45 p-4"
                >
                  <div
                    data-testid="heading-preview-display"
                    :style="getHeadingPreviewStyle('4xl')"
                  >
                    {{ t("design.globalStyles.previewHeading") }}
                  </div>
                  <div
                    data-testid="heading-preview-supporting"
                    :style="getHeadingPreviewStyle('2xl')"
                  >
                    {{ t("design.globalStyles.previewSupportingHeading") }}
                  </div>
                </div>

                <div
                  v-else-if="activeSectionTitle === 'Links'"
                  class="space-y-2 rounded-sm border border-dashed border-border/50 bg-background/45 p-4 text-sm"
                >
                  <a
                    href="#"
                    :style="{
                      color: getPreviewColor('defaults.link.color', '#2563eb'),
                      textDecoration: getPreviewValue(
                        'defaults.link.textDecoration',
                        'underline',
                      ),
                      textUnderlineOffset: getPreviewValue(
                        'defaults.link.underlineOffset',
                        '2px',
                      ),
                      fontWeight: getPreviewValue(
                        'defaults.link.fontWeight',
                        '500',
                      ),
                    }"
                    @click.prevent
                  >
                    {{ t("design.globalStyles.previewLink") }}
                  </a>
                  <a
                    href="#"
                    :style="{
                      color: getPreviewColor(
                        'defaults.link.hoverColor',
                        '#1d4ed8',
                      ),
                    }"
                    @click.prevent
                  >
                    {{ t("design.globalStyles.previewHover") }}
                  </a>
                </div>

                <div
                  v-else-if="activeSectionTitle === 'Inputs'"
                  class="space-y-3 rounded-sm border border-dashed border-border/50 bg-background/45 p-4"
                >
                  <div
                    class="border"
                    :style="getInputPreviewStyle(false)"
                  >
                    {{ t("design.globalStyles.previewInput") }}
                  </div>
                  <div
                    data-testid="inputs-preview-focus"
                    class="border"
                    :style="getInputPreviewStyle(true)"
                  >
                    {{ t("design.globalStyles.previewFocus") }}
                  </div>
                </div>

                <div
                  v-else-if="activeSectionTitle === 'Sections'"
                  class="rounded-sm border border-dashed border-border/50 bg-background/45 p-4"
                >
                  <div
                    data-testid="sections-preview-content"
                    class="grid rounded-sm border border-dashed border-border/50 p-3"
                    :style="{
                      maxWidth: getPreviewValue(
                        'defaults.section.contentMaxWidth',
                        '64rem',
                      ),
                      gap: getPreviewValue(
                        'defaults.section.sectionGap',
                        '1rem',
                      ),
                      padding: `${getPreviewValue(
                        'defaults.section.verticalPadding',
                        '1rem',
                      )} ${getPreviewValue(
                        'defaults.section.horizontalPadding',
                        '1rem',
                      )}`,
                    }"
                  >
                    <span class="h-2 rounded-sm bg-foreground/30" />
                    <span class="h-2 w-2/3 rounded-sm bg-foreground/20" />
                  </div>
                </div>

                <div
                  v-else-if="activeSectionTitle === 'Buttons'"
                  class="space-y-3 rounded-sm border border-dashed border-border/50 bg-background/45 p-4"
                >
                  <button
                    data-testid="button-preview-primary-default"
                    type="button"
                    :style="getButtonPreviewStyle('primary')"
                  >
                    {{ t("design.globalStyles.buttonVariant.primary") }}
                  </button>
                  <button
                    data-testid="button-preview-primary-hover"
                    type="button"
                    :style="getButtonPreviewStyle('primary', 'hover')"
                  >
                    {{ t("design.globalStyles.previewHover") }}
                  </button>
                </div>

                <div
                  v-else
                  class="space-y-3 rounded-sm border border-dashed border-border/50 bg-background/45 p-4 text-sm text-foreground"
                >
                  <div class="h-2 w-full rounded-sm bg-foreground/25" />
                  <div class="h-2 w-2/3 rounded-sm bg-foreground/15" />
                  <div class="h-8 rounded-sm border border-dashed border-border" />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>
