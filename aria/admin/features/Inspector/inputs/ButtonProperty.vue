<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorField } from "@/components/ui/color-picker";
import { VariableAssignableInput } from "@/components/ui/variable-reference-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import BaseProperty from "./BaseProperty.vue";
import LinkAnchorPickerField from "./LinkAnchorPickerField.vue";
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import { useInspectorPropBinding } from "../composables/useInspectorPropBinding";
import { IconPickerDialog } from "@/components/ui/icon-picker";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import {
  useCanvasSignalBridge,
  usePropertySave,
  useSelectionTreeState,
} from "../../Core";
import { usePointerScrubSession } from "../composables/usePointerScrubSession";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useSiteSettings } from "../../../composables/useSiteSettings";
import { hydrateIconHost } from "../../Stage/utils/canvasIconHydration";
import { extractVariableReferenceKey } from "../../../lib/variableReferences";
import { JsonObjectSchema } from "../../../../lib/schemas/json";
import {
  getIconClassFromValue,
  normalizeIconValue,
} from "../../../../lib/icons/reference";
import {
  LINK_MODE_OPTIONS,
  useLinkPropertyForm,
} from "../composables/useLinkPropertyForm";
import {
  BUTTON_VARIANT_OPTIONS,
  SelectableButtonVariantSchema,
  getButtonVariantOrDefault,
  type SelectableButtonVariant,
} from "../../../../lib/blocks/buttonVariants";
import {
  DEFAULT_BUTTON_ICON_GAP,
  DEFAULT_BUTTON_ICON_SIZE,
  DEFAULT_BUTTON_ICON_COLOR,
  ButtonIconGapSchema,
  ButtonIconSizeSchema,
  ButtonIconColorSchema,
  getButtonIconGap,
  getButtonIconSize,
  getPersistedButtonIconSize,
  getButtonIconColor,
  getPersistedButtonIconColor,
  buildButtonIconStyle,
  getButtonIconHostClassName,
  normalizeButtonIconSize,
  getButtonIconPosition,
  getButtonIconSpaceBetween,
  getPersistedButtonIconGap,
  type ButtonIconPosition,
} from "../../../../lib/blocks/buttonContent";
import { useStudioI18n } from "@/i18n";

type ItemType = "page" | "layout" | "component";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: ItemType;
  currentItemSlug?: string;
}

const DEFAULT_BUTTON_LABEL = "Button";
const ICON_PICKER_PREVIEW_SIZE = "1rem";
const ButtonLabelSchema = z.string().trim().min(1).max(120);
const AriaLabelSchema = z.string().trim().max(200);
const IconValueSchema = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value.length === 0 || !/\s/.test(value), {
    message: "Icon value cannot contain spaces.",
  });

const BUTTON_ICON_POSITION_OPTIONS: Array<{
  value: ButtonIconPosition;
  label: string;
}> = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

const SEGMENTED_CONTROL_CLASS = "grid h-8 grid-cols-2 gap-1.5";

const CONTROL_BUTTON_CLASS =
  "flex h-8 items-center justify-center rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-muted-foreground transition-colors hover:border-border hover:bg-sidebar-80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

const ACTIVE_CONTROL_BUTTON_CLASS =
  "border-primary/70 bg-accent-10 text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.18)]";

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const CONTROL_INPUT_CLASS =
  "h-8 border border-dashed border-border-70 bg-sidebar text-xs select-text";
const CONTROL_VARIABLE_INPUT_CLASS =
  "h-8 border border-dashed border-border-70 bg-sidebar pl-8 text-xs cursor-ew-resize focus:cursor-text";
const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const {
  selectedNode,
  selectedNodeId,
  breakpointName,
  isLoading,
  error,
  saveNodeUpdates,
} = usePropertySave();
const { broadcastPropsUpdate } = useCanvasSignalBridge();
const { selectionTreeRootNodes } = useSelectionTreeState();
const {
  enabledIconPacks,
  defaultIconPack,
  loadSettings: loadSiteSettings,
} = useSiteSettings();

const {
  form,
  validationError: linkValidationError,
  anchorValidationError,
  isMediaPickerOpen,
  isPagePickerOpen,
  isAnchorPickerOpen,
  pageSearchQuery,
  anchorSearchQuery,
  hasLinkChanges,
  filteredPages,
  selectedPageOption,
  selectedPageLabel,
  mediaButtonLabel,
  filteredAnchorOptions,
  selectedAnchorOption,
  selectedAnchorTriggerLabel,
  selectedAnchorSubtitle,
  showCustomAnchorOption,
  normalizedAnchorSearchQuery,
  pageAnchorOptions,
  hasConfiguredHref,
  showOpenInNewTab,
  showDownload,
  showRelField,
  showTitleField,
  relNoOpenerEnabled,
  relNoReferrerEnabled,
  relNoFollowEnabled,
  getPageHref,
  setMode,
  setPageHref,
  setAnchorId,
  setMediaAsset,
  clearMediaSelection,
  setBooleanField,
  setRelToken,
  serializeLinkState,
  validatePayload,
  shouldPersistLinkState,
  resetForm,
} = useLinkPropertyForm(selectedNode, {
  pageRootNodes: selectionTreeRootNodes,
});

const labelValue = ref(DEFAULT_BUTTON_LABEL);

const labelBinding = useInspectorPropBinding({
  propName: "label",
  propType: "string",
  value: labelValue,
});
const hrefBinding = useInspectorPropBinding({
  propName: "href",
  propType: "string",
  value: computed(() =>
    typeof selectedNode.value?.props?.href === "string"
      ? selectedNode.value.props.href
      : "",
  ),
});

const linkModeOptions = computed(() =>
  hrefBinding.hasCmsContext.value
    ? LINK_MODE_OPTIONS
    : LINK_MODE_OPTIONS.filter((option) => option.value !== "collection"),
);

const showLabelFieldPicker = computed(
  () =>
    labelBinding.showFieldPicker.value &&
    (labelBinding.isBound.value ||
      labelBinding.propsEditor.isAssignedCmsTemplatePage.value),
);

const isLabelReadOnly = computed(
  () =>
    labelBinding.isReadOnly.value ||
    (labelBinding.bindingMode.value === "dynamic" && !labelBinding.isBound.value),
);

watch(
  () => hrefBinding.isBound.value,
  (isBound) => {
    if (isBound) {
      setMode("collection");
    }
  },
  { immediate: true },
);
const variantValue = ref<SelectableButtonVariant>("primary");
const iconValue = ref("");
const iconPositionValue = ref<ButtonIconPosition>("left");
const iconGapValue = ref(DEFAULT_BUTTON_ICON_GAP);
const iconSpaceBetweenValue = ref(false);
const iconSizeValue = ref(DEFAULT_BUTTON_ICON_SIZE);
const iconColorValue = ref(DEFAULT_BUTTON_ICON_COLOR);
const isIconPickerOpen = ref(false);
const disabledValue = ref(false);
const ariaLabelValue = ref("");
const buttonValidationError = ref<string | null>(null);
const iconGapScrubSession = usePointerScrubSession();
const iconSizeScrubSession = usePointerScrubSession();
const iconPickerPreviewRef = ref<HTMLElement | null>(null);
let iconPickerPreviewRequest = 0;

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});

const validationError = computed(
  () => buttonValidationError.value ?? linkValidationError.value,
);
const hasButtonIcon = computed(() => iconValue.value.trim().length > 0);
const iconPickerAriaLabel = computed(() =>
  hasButtonIcon.value
    ? t("inspector.button.changeIcon")
    : t("inspector.button.chooseIcon"),
);
const iconPositionDisabled = computed(
  () => isPanelDisabled.value || !hasButtonIcon.value,
);
const iconSpacingDisabled = computed(
  () => isPanelDisabled.value || !hasButtonIcon.value,
);
const iconSizeDisabled = computed(
  () => isPanelDisabled.value || !hasButtonIcon.value,
);
const iconColorDisabled = computed(
  () => isPanelDisabled.value || !hasButtonIcon.value,
);

const hasButtonChanges = computed(() => {
  return (
    labelValue.value !== DEFAULT_BUTTON_LABEL ||
    variantValue.value !== "primary" ||
    hasButtonIcon.value ||
    iconPositionValue.value !== "left" ||
    iconGapValue.value !== DEFAULT_BUTTON_ICON_GAP ||
    iconSpaceBetweenValue.value ||
    iconSizeValue.value !== DEFAULT_BUTTON_ICON_SIZE ||
    iconColorValue.value !== DEFAULT_BUTTON_ICON_COLOR ||
    disabledValue.value ||
    hasLinkChanges.value ||
    ariaLabelValue.value.trim().length > 0
  );
});

watch(
  selectedNode,
  (node) => {
    labelValue.value = getButtonLabel(node);
    variantValue.value = getButtonVariantOrDefault(node?.props?.variant);
    iconValue.value = getIconClassFromValue(node?.props?.icon);
    iconPositionValue.value = getButtonIconPosition(node?.props?.iconPosition);
    iconGapValue.value = getButtonIconGap(node?.props?.iconGap);
    iconSpaceBetweenValue.value = getButtonIconSpaceBetween(
      node?.props?.iconSpaceBetween,
    );
    iconSizeValue.value = getButtonIconSize(node?.props?.iconSize);
    iconColorValue.value = getButtonIconColor(node?.props?.iconColor);
    disabledValue.value = node?.props?.disabled === true;
    ariaLabelValue.value =
      typeof node?.a11y?.ariaLabel === "string"
        ? node.a11y.ariaLabel
        : typeof node?.props?.ariaLabel === "string"
          ? node.props.ariaLabel
          : "";
  },
  { deep: true, immediate: true },
);

function getIconPickerPreviewValue(): unknown {
  const rawIcon = selectedNode.value?.props?.icon;
  if (rawIcon !== undefined && rawIcon !== null && rawIcon !== "") {
    return rawIcon;
  }

  const trimmed = iconValue.value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

async function renderIconPickerPreview(): Promise<void> {
  const requestId = ++iconPickerPreviewRequest;
  const host = iconPickerPreviewRef.value;

  if (!host || !hasButtonIcon.value) {
    return;
  }

  const styleProps = {
    iconSize: ICON_PICKER_PREVIEW_SIZE,
    iconColor: iconColorValue.value,
  };
  const hostClassName = getButtonIconHostClassName(styleProps);

  host.className = [
    "inline-flex shrink-0 items-center justify-center",
    hostClassName,
  ]
    .filter(Boolean)
    .join(" ");
  host.style.cssText = buildButtonIconStyle(styleProps);

  await hydrateIconHost({
    host,
    iconValue: getIconPickerPreviewValue(),
    classNameValue: "",
    ariaLabelValue: "",
    fallbackText: "",
  });

  if (
    requestId !== iconPickerPreviewRequest ||
    iconPickerPreviewRef.value !== host
  ) {
    return;
  }

  host.setAttribute("aria-hidden", "true");
  host.removeAttribute("role");
  host.removeAttribute("aria-label");
}

watch(
  [
    hasButtonIcon,
    iconValue,
    iconColorValue,
    () => selectedNode.value?.props?.icon,
    iconPickerPreviewRef,
  ],
  async () => {
    await nextTick();
    await renderIconPickerPreview();
  },
  { immediate: true, flush: "post" },
);

function getButtonLabel(node: typeof selectedNode.value): string {
  const label = node?.props?.label;
  if (typeof label === "string" && label.trim().length > 0) {
    return label;
  }

  const text = node?.props?.text;
  if (typeof text === "string" && text.trim().length > 0) {
    return text;
  }

  return DEFAULT_BUTTON_LABEL;
}

function getButtonContentGap(value: unknown): string {
  return getButtonIconGap(value);
}

function emitLiveButtonPreview(): void {
  if (!selectedNodeId.value) {
    return;
  }

  const previewProps: Record<string, unknown> = {};
  const parsedLabel = ButtonLabelSchema.safeParse(labelValue.value);
  if (parsedLabel.success) {
    previewProps.label = parsedLabel.data;
  }

  const parsedVariant = SelectableButtonVariantSchema.safeParse(
    variantValue.value,
  );
  if (parsedVariant.success) {
    previewProps.variant = parsedVariant.data;
  }

  if (disabledValue.value) {
    previewProps.disabled = true;
  }

  if (hasButtonIcon.value) {
    previewProps.icon = iconValue.value.trim();
    previewProps.iconPosition = getButtonIconPosition(iconPositionValue.value);
    previewProps.iconGap = getButtonContentGap(iconGapValue.value);
    previewProps.iconSpaceBetween = iconSpaceBetweenValue.value;
    previewProps.iconSize = iconSizeValue.value;
    const persistedIconColor = getPersistedButtonIconColor(iconColorValue.value);
    if (persistedIconColor) {
      previewProps.iconColor = persistedIconColor;
    }
  }

  const parsedPreviewProps = JsonObjectSchema.safeParse(previewProps);
  if (!parsedPreviewProps.success) {
    return;
  }

  broadcastPropsUpdate({
    nodeId: selectedNodeId.value,
    props: parsedPreviewProps.data,
    source: "inspector-live",
  });
}

function getCurrentBreakpointStyleValue(
  propertyName: string,
): string | undefined {
  const activeBreakpoint = breakpointName.value;
  const responsiveValue = selectedNode.value?.styles?.[propertyName] as
    | Record<string, string | undefined>
    | undefined;

  return (
    responsiveValue?.[activeBreakpoint] ?? responsiveValue?.base ?? undefined
  );
}

function getCurrentTarget(): "_self" | "_blank" | "_parent" | "_top" {
  return selectedNode.value?.props?.target === "_blank" ||
    selectedNode.value?.props?.target === "_parent" ||
    selectedNode.value?.props?.target === "_top"
    ? selectedNode.value.props.target
    : "_self";
}

async function saveButtonState(): Promise<boolean> {
  if (!selectedNodeId.value) return false;
  if (!props.currentItemType || !props.currentItemSlug) return false;

  const parsedLabel = ButtonLabelSchema.safeParse(labelValue.value);
  if (!parsedLabel.success) {
    buttonValidationError.value =
      parsedLabel.error.issues[0]?.message ?? t("inspector.validation.invalidButtonLabel");
    return false;
  }

  const parsedVariant = SelectableButtonVariantSchema.safeParse(
    variantValue.value,
  );
  if (!parsedVariant.success) {
    buttonValidationError.value = t("inspector.validation.invalidButtonVariant");
    return false;
  }

  const parsedAriaLabel = AriaLabelSchema.safeParse(ariaLabelValue.value);
  if (!parsedAriaLabel.success) {
    buttonValidationError.value = t("inspector.validation.invalidAriaLabel");
    return false;
  }

  const parsedIcon = IconValueSchema.safeParse(iconValue.value);
  if (!parsedIcon.success) {
    buttonValidationError.value =
      parsedIcon.error.issues[0]?.message ?? t("inspector.validation.invalidIcon");
    return false;
  }

  const parsedIconSize = ButtonIconSizeSchema.safeParse(iconSizeValue.value);
  if (!parsedIconSize.success) {
    buttonValidationError.value =
      parsedIconSize.error.issues[0]?.message ?? t("inspector.validation.invalidIconSize");
    return false;
  }

  const parsedIconColor = ButtonIconColorSchema.safeParse(iconColorValue.value);
  if (!parsedIconColor.success) {
    buttonValidationError.value =
      parsedIconColor.error.issues[0]?.message ?? t("inspector.validation.invalidIconColor");
    return false;
  }

  const parsedIconGap = ButtonIconGapSchema.safeParse(iconGapValue.value);
  if (!parsedIconGap.success) {
    buttonValidationError.value =
      parsedIconGap.error.issues[0]?.message ?? t("inspector.validation.invalidIconGap");
    return false;
  }

  const nextLabel = parsedLabel.data;
  const nextVariant = parsedVariant.data;
  const nextIconInput = parsedIcon.data;
  const nextIcon = nextIconInput
    ? normalizeIconValue(nextIconInput)
    : undefined;
  const nextIconPosition = nextIcon
    ? getButtonIconPosition(iconPositionValue.value)
    : undefined;
  const nextIconGap = nextIcon
    ? getButtonContentGap(parsedIconGap.data)
    : DEFAULT_BUTTON_ICON_GAP;
  const nextPersistedIconGap = nextIcon
    ? getPersistedButtonIconGap(parsedIconGap.data)
    : undefined;
  const nextIconSpaceBetween = nextIcon ? iconSpaceBetweenValue.value : false;
  const nextIconSize = nextIcon
    ? getPersistedButtonIconSize(parsedIconSize.data)
    : undefined;
  const nextIconColor = nextIcon
    ? getPersistedButtonIconColor(parsedIconColor.data)
    : undefined;
  const nextDisabled = disabledValue.value;
  const nextAriaLabel = parsedAriaLabel.data.trim() || undefined;

  const currentLabel = getButtonLabel(selectedNode.value);
  const currentVariant = getButtonVariantOrDefault(
    selectedNode.value?.props?.variant,
  );
  const currentIcon = selectedNode.value?.props?.icon;
  const currentIconPosition = currentIcon
    ? getButtonIconPosition(selectedNode.value?.props?.iconPosition)
    : undefined;
  const currentIconGap = currentIcon
    ? getButtonContentGap(selectedNode.value?.props?.iconGap)
    : DEFAULT_BUTTON_ICON_GAP;
  const currentIconSpaceBetween = currentIcon
    ? getButtonIconSpaceBetween(selectedNode.value?.props?.iconSpaceBetween)
    : false;
  const currentIconSize = currentIcon
    ? getButtonIconSize(selectedNode.value?.props?.iconSize)
    : DEFAULT_BUTTON_ICON_SIZE;
  const currentIconColor = currentIcon
    ? getButtonIconColor(selectedNode.value?.props?.iconColor)
    : DEFAULT_BUTTON_ICON_COLOR;
  const currentDisabled = selectedNode.value?.props?.disabled === true;
  const currentHref =
    typeof selectedNode.value?.props?.href === "string"
      ? selectedNode.value.props.href
      : "";
  const currentTarget = getCurrentTarget();
  const currentRel =
    typeof selectedNode.value?.props?.rel === "string"
      ? selectedNode.value.props.rel
      : "";
  const currentTitle =
    typeof selectedNode.value?.props?.title === "string"
      ? selectedNode.value.props.title
      : "";
  const currentDownload = selectedNode.value?.props?.download === true;
  const currentAriaLabel =
    typeof selectedNode.value?.a11y?.ariaLabel === "string"
      ? selectedNode.value.a11y.ariaLabel
      : typeof selectedNode.value?.props?.ariaLabel === "string"
        ? selectedNode.value.props.ariaLabel
        : undefined;

  const linkPayload =
    form.value.mode === "collection"
      ? {
          href: currentHref,
          target: currentTarget === "_self" ? undefined : currentTarget,
          rel: currentRel || undefined,
          title: currentTitle || undefined,
          download: currentDownload ? true : undefined,
          linkScope: form.value.linkScope,
        }
      : serializeLinkState();
  if (form.value.mode !== "collection" && !validatePayload(linkPayload)) {
    return false;
  }

  const nextTarget = linkPayload.target ?? "_self";
  const nextRel = linkPayload.rel ?? "";
  const nextTitle = linkPayload.title ?? "";
  const nextDownload = linkPayload.download === true;

  if (
    currentLabel === nextLabel &&
    currentVariant === nextVariant &&
    JSON.stringify(currentIcon) === JSON.stringify(nextIcon) &&
    currentIconPosition === nextIconPosition &&
    currentIconGap === nextIconGap &&
    currentIconSpaceBetween === nextIconSpaceBetween &&
    currentIconSize === nextIconSize &&
    currentIconColor === nextIconColor &&
    currentDisabled === nextDisabled &&
    currentHref === linkPayload.href &&
    currentTarget === nextTarget &&
    currentRel === nextRel &&
    currentTitle === nextTitle &&
    currentDownload === nextDownload &&
    currentAriaLabel === nextAriaLabel
  ) {
    buttonValidationError.value = null;
    linkValidationError.value = null;
    return true;
  }

  const success = await saveNodeUpdates(
    {
      props: {
        label: nextLabel,
        variant: nextVariant,
        text: undefined,
        icon: nextIcon,
        iconPosition: nextIconPosition,
        iconGap: nextPersistedIconGap,
        iconSpaceBetween: nextIconSpaceBetween ? true : undefined,
        iconSize: nextIconSize,
        iconColor: nextIconColor,
        disabled: nextDisabled ? true : undefined,
        href: linkPayload.href || undefined,
        target: linkPayload.target,
        rel: linkPayload.rel,
        title: linkPayload.title,
        download: linkPayload.download,
        ariaLabel: undefined,
      },
      a11y: {
        ariaLabel: nextAriaLabel,
      },
    },
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    buttonValidationError.value = null;
    linkValidationError.value = null;
    labelValue.value = nextLabel;
    variantValue.value = nextVariant;
    iconValue.value = nextIconInput;
    iconPositionValue.value = nextIconPosition ?? "left";
    iconGapValue.value = nextIconGap;
    iconSpaceBetweenValue.value = nextIconSpaceBetween;
    iconSizeValue.value = getButtonIconSize(nextIconSize);
    iconColorValue.value = getButtonIconColor(nextIconColor);
    disabledValue.value = nextDisabled;
    ariaLabelValue.value = nextAriaLabel ?? "";
  }

  return success;
}

function handleModeChange(value: unknown): void {
  if (value === "collection") {
    void hrefBinding.enterCollectionMode();
    const nextMode = setMode(value);
    if (!nextMode) {
      return;
    }
    return;
  }

  if (form.value.mode === "collection" && hrefBinding.isBound.value) {
    void hrefBinding.leaveCollectionMode();
  }

  const nextMode = setMode(value);
  if (!nextMode) {
    return;
  }

  if (shouldPersistLinkState()) {
    void saveButtonState();
  }
}

async function handleHrefFieldSelect(fieldPath: string): Promise<void> {
  await hrefBinding.bind(fieldPath);
  setMode("collection");
}

async function handleLabelFieldSelect(fieldPath: string): Promise<void> {
  await labelBinding.bind(fieldPath);
}

function handlePageChange(value: unknown): void {
  if (typeof value !== "string") return;
  setPageHref(value);
  void saveButtonState();
}

function handleAnchorSelect(id: string, fromList: boolean): void {
  if (!setAnchorId(id, { fromList })) {
    return;
  }

  void saveButtonState();
}

function handleAnchorSelectCustom(): void {
  if (!setAnchorId(anchorSearchQuery.value)) {
    return;
  }

  void saveButtonState();
}

function handleMediaSelect(asset: MediaAsset): void {
  setMediaAsset(asset);
  void saveButtonState();
}

function handleLinkSwitchChange(
  field: "openInNewTab" | "downloadEnabled",
  value: boolean,
): void {
  setBooleanField(field, value);
  void saveButtonState();
}

function handleDisabledChange(value: boolean): void {
  disabledValue.value = value;
  void saveButtonState();
}

async function handleIconSelect(value: string): Promise<void> {
  iconValue.value = value;
  iconPositionValue.value = "left";
  iconGapValue.value = DEFAULT_BUTTON_ICON_GAP;
  iconSpaceBetweenValue.value = false;
  iconSizeValue.value = DEFAULT_BUTTON_ICON_SIZE;
  iconColorValue.value = DEFAULT_BUTTON_ICON_COLOR;
  await saveButtonState();
}

async function handleClearIcon(): Promise<void> {
  if (isPanelDisabled.value) {
    return;
  }

  iconValue.value = "";
  iconPositionValue.value = "left";
  iconGapValue.value = DEFAULT_BUTTON_ICON_GAP;
  iconSpaceBetweenValue.value = false;
  iconSizeValue.value = DEFAULT_BUTTON_ICON_SIZE;
  iconColorValue.value = DEFAULT_BUTTON_ICON_COLOR;
  isIconPickerOpen.value = false;
  await saveButtonState();
}

function handleLabelInput(value: string): void {
  labelValue.value = value;
  emitLiveButtonPreview();
}

async function onLabelBlur(event: Event): Promise<void> {
  labelValue.value = (event.target as HTMLInputElement).value;
  await saveButtonState();
}

function handleVariantChange(value: unknown): void {
  const parsedVariant = SelectableButtonVariantSchema.safeParse(value);
  if (!parsedVariant.success) {
    return;
  }

  variantValue.value = parsedVariant.data;
  void saveButtonState();
}

async function onAriaLabelBlur(event: Event): Promise<void> {
  ariaLabelValue.value = (event.target as HTMLInputElement).value;
  await saveButtonState();
}

function handleIconPositionChange(value: unknown): void {
  if (value !== "left" && value !== "right") {
    return;
  }

  iconPositionValue.value = value;
  void saveButtonState();
}

async function handleIconGapCommit(value: string): Promise<void> {
  iconGapValue.value = getButtonContentGap(value);
  await saveButtonState();
}

function handleIconGapInput(value: string): void {
  iconGapValue.value = value;
  emitLiveButtonPreview();
}

function handleIconSpaceBetweenChange(value: boolean): void {
  if (iconSpacingDisabled.value) {
    return;
  }

  iconSpaceBetweenValue.value = value;
  void saveButtonState();
}

function handleIconGapMouseDown(event: MouseEvent): void {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (iconSpacingDisabled.value) {
    return;
  }

  const initialValue = iconGapValue.value.trim();
  if (extractVariableReferenceKey(initialValue) !== null) {
    return;
  }

  const match = initialValue.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);
  if (!match) {
    return;
  }

  const startValue = Number.parseFloat(match[1] ?? "0");
  const unit = match[2] ?? "px";
  const step = unit === "px" || unit === "%" ? 1 : 0.05;
  const originValue = iconGapValue.value;
  iconGapScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.max(
        0,
        Math.round((startValue + deltaX * step) * 100) / 100,
      );
      iconGapValue.value = `${nextValue}${unit}`;
      emitLiveButtonPreview();
    },
    onCancel: () => {
      iconGapValue.value = originValue;
      emitLiveButtonPreview();
    },
    onCommit: () => {
      void saveButtonState().then((success) => {
        if (!success) {
          iconGapValue.value = originValue;
          emitLiveButtonPreview();
        }
      });
    },
  });
}

function handleIconSizeInput(value: string): void {
  iconSizeValue.value = value;
  emitLiveButtonPreview();
}

async function handleIconSizeCommit(value: string): Promise<void> {
  iconSizeValue.value = normalizeButtonIconSize(value);
  await saveButtonState();
}

function handleIconSizeMouseDown(event: MouseEvent): void {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (iconSizeDisabled.value) {
    return;
  }

  const initialValue = iconSizeValue.value.trim();
  if (extractVariableReferenceKey(initialValue) !== null) {
    return;
  }

  const match = initialValue.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);
  if (!match) {
    return;
  }

  const startValue = Number.parseFloat(match[1] ?? "0");
  const unit = match[2] ?? "px";
  const step = unit === "px" || unit === "%" ? 1 : 0.05;
  const originValue = iconSizeValue.value;
  iconSizeScrubSession.start({
    event,
    onMove: ({ deltaX }) => {
      const nextValue = Math.max(
        1,
        Math.round((startValue + deltaX * step) * 100) / 100,
      );
      iconSizeValue.value = `${nextValue}${unit}`;
      emitLiveButtonPreview();
    },
    onCancel: () => {
      iconSizeValue.value = originValue;
      emitLiveButtonPreview();
    },
    onCommit: () => {
      void saveButtonState().then((success) => {
        if (!success) {
          iconSizeValue.value = originValue;
          emitLiveButtonPreview();
        }
      });
    },
  });
}

function handleIconColorPreview(value: string): void {
  iconColorValue.value = value;
  emitLiveButtonPreview();
  void nextTick().then(() => renderIconPickerPreview());
}

async function handleIconColorCommit(value: string): Promise<void> {
  iconColorValue.value = value;
  await saveButtonState();
}

async function resetButton(): Promise<void> {
  buttonValidationError.value = null;
  linkValidationError.value = null;
  resetForm();
  labelValue.value = DEFAULT_BUTTON_LABEL;
  variantValue.value = "primary";
  iconValue.value = "";
  iconPositionValue.value = "left";
  iconGapValue.value = DEFAULT_BUTTON_ICON_GAP;
  iconSpaceBetweenValue.value = false;
  iconSizeValue.value = DEFAULT_BUTTON_ICON_SIZE;
  iconColorValue.value = DEFAULT_BUTTON_ICON_COLOR;
  isIconPickerOpen.value = false;
  disabledValue.value = false;
  ariaLabelValue.value = "";
  await saveButtonState();
}

onMounted(async () => {
  await loadSiteSettings();
});
</script>

<template>
  <BaseProperty
    :open="open"
    :defaultOpen="props.defaultOpen"
    :has-changes="hasButtonChanges"
    :show-reset="hasButtonChanges"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.button.reset')"
    @update:open="emit('update:open', $event)"
    @reset="void resetButton()"
    title="Button"
  >
    <div class="space-y-3">
      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.variant") }}</label>
        <Select
          data-testid="button-variant-select"
          :model-value="variantValue"
          @update:model-value="handleVariantChange"
        >
          <SelectTrigger :class="CONTROL_INPUT_CLASS">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in BUTTON_VARIANT_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.label") }}</label>
        <div class="space-y-1.5">
          <InspectorPropBinding
            v-if="showLabelFieldPicker"
            :model-value="labelBinding.boundPath.value"
            :groups="labelBinding.fieldGroups.value"
            :picker-mode="labelBinding.bindingPickerMode.value"
            :display-label="labelBinding.displayLabel.value"
            :disabled="labelBinding.pickerDisabled.value"
            :placeholder="t('variablePicker.chooseField')"
            @select="(path) => void handleLabelFieldSelect(path)"
            @clear="void labelBinding.clear()"
          />
          <Input
            data-testid="button-label-input"
            :model-value="labelValue"
            :class="CONTROL_INPUT_CLASS"
            :placeholder="t('inspector.button.labelPlaceholder')"
            :readonly="labelBinding.isReadOnly.value"
            :disabled="isPanelDisabled || isLabelReadOnly"
            @update:model-value="handleLabelInput(String($event))"
            @blur="onLabelBlur"
          />
        </div>
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.icon.label") }}</label>
        <div class="flex min-w-0 items-center gap-2">
          <Button
            data-testid="button-icon-picker"
            type="button"
            variant="outline"
            class="h-9 min-w-0 flex-1 justify-center border border-dashed border-border-70 bg-sidebar px-0 text-foreground"
            :disabled="isPanelDisabled"
            :aria-label="iconPickerAriaLabel"
            :title="iconPickerAriaLabel"
            @click="isIconPickerOpen = true"
          >
            <span
              v-if="hasButtonIcon"
              ref="iconPickerPreviewRef"
              data-testid="button-icon-picker-preview"
              class="inline-flex size-4 shrink-0 items-center justify-center"
              aria-hidden="true"
            />
            <span
              v-else
              :class="[studioIcons.magnifier, 'size-4 shrink-0']"
              aria-hidden="true"
            />
          </Button>
          <Button
            v-if="hasButtonIcon"
            data-testid="button-icon-clear"
            type="button"
            variant="ghost"
            size="sm"
            class="h-9 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
            :disabled="isPanelDisabled"
            :aria-label="t('inspector.button.clearIcon')"
            :title="t('inspector.button.clearIcon')"
            @click="void handleClearIcon()"
          >
            {{ t("common.clear") }}
          </Button>
        </div>
      </div>

      <Transition name="button-icon-controls">
        <div v-if="hasButtonIcon" class="space-y-3">
          <div :class="PROPERTY_ROW_CLASS">
            <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.position") }}</label>
            <div>
              <div :class="SEGMENTED_CONTROL_CLASS">
                <button
                  v-for="option in BUTTON_ICON_POSITION_OPTIONS"
                  :key="option.value"
                  :data-testid="`button-icon-position-${option.value}`"
                  type="button"
                  :disabled="iconPositionDisabled"
                  :aria-label="option.value === 'left' ? t('inspector.button.left') : t('inspector.button.right')"
                  :aria-pressed="String(iconPositionValue === option.value)"
                  :class="[
                    CONTROL_BUTTON_CLASS,
                    iconPositionValue === option.value &&
                      ACTIVE_CONTROL_BUTTON_CLASS,
                  ]"
                  @click="handleIconPositionChange(option.value)"
                >
                  <span
                    :class="[
                      option.value === 'left'
                        ? studioIcons.arrowLeft03
                        : studioIcons.arrowRight03,
                      'size-4 shrink-0',
                    ]"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>

          <div :class="PROPERTY_ROW_CLASS">
            <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.border.size") }}</label>
            <div class="relative flex items-center">
              <span
                :class="[
                  'pointer-events-none absolute left-2.5 z-10 size-3.5 text-muted-foreground/60',
                  studioIcons.arrowExpand,
                ]"
              />
              <VariableAssignableInput
                v-model="iconSizeValue"
                data-testid="button-icon-size-input"
                placeholder="1em"
                :disabled="iconSizeDisabled"
                class="w-full"
                :input-class="CONTROL_VARIABLE_INPUT_CLASS"
                @update:model-value="handleIconSizeInput"
                @commit="handleIconSizeCommit"
                @mousedown="handleIconSizeMouseDown"
              />
            </div>
          </div>

          <div :class="PROPERTY_ROW_CLASS">
            <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.shadow.color") }}</label>
            <ColorField
              v-model="iconColorValue"
              layout="unified"
              show-variables
              show-alpha
              show-design-colors
              content-side="left"
              content-align="center"
              class="min-w-0 w-full"
              :disabled="iconColorDisabled"
              @preview="handleIconColorPreview"
              @commit="handleIconColorCommit"
            />
          </div>

          <div :class="PROPERTY_ROW_CLASS">
            <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.gap") }}</label>
            <div class="relative flex items-center">
              <span
                :class="[
                  'pointer-events-none absolute left-2.5 z-10 size-3.5 text-muted-foreground/60',
                  studioIcons.alignHorizontalSpacing,
                ]"
              />
              <VariableAssignableInput
                :model-value="iconGapValue"
                data-testid="button-icon-gap-input"
                placeholder="0.5rem"
                :disabled="iconSpacingDisabled"
                class="w-full"
                :input-class="CONTROL_VARIABLE_INPUT_CLASS"
                @update:model-value="handleIconGapInput(String($event))"
                @commit="handleIconGapCommit"
                @mousedown="handleIconGapMouseDown"
              />
            </div>
          </div>

          <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
            <label
              :class="[PROPERTY_LABEL_CLASS, 'shrink-0 whitespace-nowrap']"
              :title="t('inspector.button.spaceBetweenHint')"
            >
              {{ t("inspector.button.spaceBetween") }}
            </label>
            <div
              class="flex h-8 items-center justify-end rounded-md border border-dashed border-border/50 px-3"
            >
              <Switch
                data-testid="button-icon-space-between-switch"
                :disabled="iconSpacingDisabled"
                :model-value="iconSpaceBetweenValue"
                @update:model-value="
                  handleIconSpaceBetweenChange(Boolean($event))
                "
              />
            </div>
          </div>
        </div>
      </Transition>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.destination") }}</label>
        <Select
          data-testid="button-destination-select"
          :model-value="form.mode"
          @update:model-value="handleModeChange"
        >
          <SelectTrigger :class="CONTROL_INPUT_CLASS">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in linkModeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="form.mode === 'collection'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.field") }}</label>
        <InspectorPropBinding
          :model-value="hrefBinding.boundPath.value"
          :groups="hrefBinding.fieldGroups.value"
          :picker-mode="hrefBinding.bindingPickerMode.value"
          :display-label="hrefBinding.displayLabel.value"
          :disabled="hrefBinding.pickerDisabled.value"
          :placeholder="t('variablePicker.chooseField')"
          @select="(path) => void handleHrefFieldSelect(path)"
          @clear="void hrefBinding.clear()"
        />
      </div>

      <div v-if="form.mode === 'page'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.page") }}</label>
        <Popover v-model:open="isPagePickerOpen">
          <PopoverTrigger as-child>
            <Button
              type="button"
              variant="outline"
              class="h-8 w-full justify-between gap-2 border border-dashed border-border-70 bg-sidebar px-3 text-left text-xs font-normal"
            >
              <span class="min-w-0 truncate text-xs text-foreground">
                {{ selectedPageLabel }}
              </span>
              <span
                :class="[
                  studioIcons.magnifier,
                  'size-4 shrink-0 text-muted-foreground',
                ]"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            :side-offset="6"
            class="w-88 overflow-hidden p-0"
            @open-auto-focus.prevent
          >
            <div class="border-b border-dashed border-border-70 p-2">
              <div class="relative">
                <span
                  :class="[
                    studioIcons.magnifier,
                    'pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground',
                  ]"
                />
                <Input
                  v-model="pageSearchQuery"
                  class="h-8 border border-dashed border-border-70 bg-sidebar pl-7 text-xs"
                  :placeholder="t('inspector.button.searchPages')"
                />
              </div>
            </div>

            <div class="max-h-72 overflow-y-auto p-1">
              <button
                v-for="page in filteredPages"
                :key="page.id"
                type="button"
                @click="handlePageChange(getPageHref(page.slug))"
                :class="[
                  'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                  selectedPageOption?.id === page.id
                    ? 'bg-secondary text-foreground'
                    : 'text-foreground/72 hover:bg-muted/25',
                ]"
              >
                <span class="min-w-0 flex-1">
                  <span
                    class="flex items-center justify-between gap-2 text-xs font-medium"
                  >
                    <span class="truncate">{{
                      page.title || page.slug
                    }}</span>
                    <span
                      v-if="selectedPageOption?.id === page.id"
                      :class="[
                        studioIcons.checkCircleBold,
                        'size-4 text-primary',
                      ]"
                    />
                  </span>
                  <span
                    class="mt-1 block truncate text-[11px] text-foreground/45"
                  >
                    {{ getPageHref(page.slug) }}
                  </span>
                </span>
              </button>

              <div
                v-if="filteredPages.length === 0"
                class="rounded-md px-3 py-4 text-center text-xs text-foreground/45"
              >
                {{ t("inspector.button.noMatchingPages") }}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div v-else-if="form.mode === 'url'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.url") }}</label>
        <Input
          v-model="form.urlHref"
          :class="CONTROL_INPUT_CLASS"
          placeholder="https://example.com"
          @blur="void saveButtonState()"
        />
      </div>

      <div v-else-if="form.mode === 'media'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.source.media") }}</label>
        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            class="h-8 px-3 text-xs"
            @click="isMediaPickerOpen = true"
          >
            {{ mediaButtonLabel }}
          </Button>
          <Button
            v-if="form.mediaHref"
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs text-muted-foreground"
            @click="
              clearMediaSelection();
              void saveButtonState();
            "
          >
            {{ t("common.clear") }}
          </Button>
        </div>
      </div>

      <LinkAnchorPickerField
        v-else-if="form.mode === 'anchor'"
        v-model:open="isAnchorPickerOpen"
        v-model:anchor-search-query="anchorSearchQuery"
        :label="t('inspector.button.section')"
        :row-class="PROPERTY_ROW_CLASS"
        :trigger-class="CONTROL_INPUT_CLASS"
        :filtered-anchor-options="filteredAnchorOptions"
        :selected-anchor-option="selectedAnchorOption"
        :selected-anchor-trigger-label="selectedAnchorTriggerLabel"
        :selected-anchor-subtitle="selectedAnchorSubtitle"
        :show-custom-anchor-option="showCustomAnchorOption"
        :normalized-anchor-search-query="normalizedAnchorSearchQuery"
        :anchor-validation-error="anchorValidationError"
        :has-anchor-options="pageAnchorOptions.length > 0"
        @select="handleAnchorSelect"
        @select-custom="handleAnchorSelectCustom"
      />

      <template v-else-if="form.mode === 'email'">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.email") }}</label>
          <Input
            v-model="form.emailAddress"
            :class="CONTROL_INPUT_CLASS"
            placeholder="hello@example.com"
            @blur="void saveButtonState()"
          />
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.subject") }}</label>
          <Input
            v-model="form.emailSubject"
            :class="CONTROL_INPUT_CLASS"
            :placeholder="t('inspector.button.subjectPlaceholder')"
            @blur="void saveButtonState()"
          />
        </div>
      </template>

      <div v-else-if="form.mode === 'phone'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.phone") }}</label>
        <Input
          v-model="form.phoneNumber"
          :class="CONTROL_INPUT_CLASS"
          placeholder="+1 555 123 4567"
          @blur="void saveButtonState()"
        />
      </div>

      <div v-if="showOpenInNewTab" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.newTab") }}</label>
        <div
          class="flex h-8 items-center justify-end rounded-md border border-dashed border-border/50 px-3"
        >
          <Switch
            :model-value="form.openInNewTab"
            @update:model-value="
              handleLinkSwitchChange('openInNewTab', Boolean($event))
            "
          />
        </div>
      </div>

      <div v-if="showDownload" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.download") }}</label>
        <div
          class="flex h-8 items-center justify-end rounded-md border border-dashed border-border/50 px-3"
        >
          <Switch
            :model-value="form.downloadEnabled"
            @update:model-value="
              handleLinkSwitchChange('downloadEnabled', Boolean($event))
            "
          />
        </div>
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.disabled") }}</label>
        <div
          class="flex h-8 items-center justify-end rounded-md border border-dashed border-border/50 px-3"
        >
          <Switch
            data-testid="button-disabled-switch"
            :model-value="disabledValue"
            @update:model-value="handleDisabledChange(Boolean($event))"
          />
        </div>
      </div>

      <div v-if="showRelField" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.rel") }}</label>
        <div
          class="space-y-2 rounded-md border border-dashed border-border/50 px-3 py-3"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="text-xs text-foreground">{{ t("inspector.button.noOpener") }}</div>
            <Switch
              :model-value="relNoOpenerEnabled"
              @update:model-value="
                setRelToken('noopener', Boolean($event));
                void saveButtonState();
              "
            />
          </div>

          <div class="flex items-center justify-between gap-3">
            <div class="text-xs text-foreground">{{ t("inspector.button.noReferrer") }}</div>
            <Switch
              :model-value="relNoReferrerEnabled"
              @update:model-value="
                setRelToken('noreferrer', Boolean($event));
                void saveButtonState();
              "
            />
          </div>

          <div class="flex items-center justify-between gap-3">
            <div class="text-xs text-foreground">{{ t("inspector.button.noFollow") }}</div>
            <Switch
              :model-value="relNoFollowEnabled"
              @update:model-value="
                setRelToken('nofollow', Boolean($event));
                void saveButtonState();
              "
            />
          </div>
        </div>
      </div>

      <div v-if="showTitleField" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.button.title") }}</label>
        <Input
          v-model="form.title"
          :class="CONTROL_INPUT_CLASS"
          :placeholder="t('inspector.button.titlePlaceholder')"
          @blur="void saveButtonState()"
        />
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.icon.aria") }}</label>
        <Input
          data-testid="button-aria-label-input"
          :model-value="ariaLabelValue"
          :class="CONTROL_INPUT_CLASS"
          :placeholder="t('inspector.button.ariaPlaceholder')"
          @update:model-value="ariaLabelValue = String($event)"
          @blur="onAriaLabelBlur"
        />
      </div>

      <div v-if="validationError" class="text-xs text-destructive">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-destructive">
        {{ error }}
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        :title="t('inspector.button.selectMedia')"
        :description="t('inspector.button.selectMediaDescription')"
        @select="handleMediaSelect"
      />

      <IconPickerDialog
        :open="isIconPickerOpen"
        :title="t('inspector.button.selectIcon')"
        :description="t('inspector.button.selectIconDescription')"
        :value="iconValue"
        :enabled-packs="enabledIconPacks"
        :default-pack="defaultIconPack"
        @update:open="isIconPickerOpen = $event"
        @select="handleIconSelect"
      />
    </div>
  </BaseProperty>
</template>

<style scoped>
.button-icon-controls-enter-active {
  overflow: hidden;
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    max-height 220ms cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 320px;
}

.button-icon-controls-leave-active {
  overflow: hidden;
  transition:
    opacity 120ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 120ms cubic-bezier(0.4, 0, 0.2, 1),
    max-height 160ms cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 320px;
}

.button-icon-controls-enter-from,
.button-icon-controls-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}

@media (prefers-reduced-motion: reduce) {
  .button-icon-controls-enter-active,
  .button-icon-controls-leave-active {
    transition-duration: 1ms;
  }
}
</style>
