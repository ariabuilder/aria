<script setup lang="ts">
import { studioIcons, backgroundModeIcons } from "@/lib/icons";
import { computed, ref, watch } from "vue";
import { ColorField } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import {
  DEFAULT_POSITION_VALUE,
  normalizePositionValue,
} from "../constants/positionOptions";
import InspectorPositionGridPicker from "./InspectorPositionGridPicker.vue";
import { usePropertySave } from "../../Core";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useStylePreviewQueue } from "../composables/useStylePreviewQueue";
import { useInspectorStyleTargetWithGlobalDefaults } from "../composables/useInspectorStyleTargetWithGlobalDefaults";
import { usePropertySchema } from "../composables/usePropertySchema";
import {
  DEFAULT_BACKGROUND,
  cssToGradient,
  gradientToCSS,
  type BackgroundAttachment,
  type BackgroundBlendMode,
  type BackgroundRepeat,
  type BackgroundType,
  type BackgroundValue,
} from "../schemas/background.schema";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import {
  resolveImageBindingSourceMode,
  STYLE_BINDING_BACKGROUND_IMAGE,
  useInspectorPropBinding,
} from "../composables/useInspectorPropBinding";
import GradientAngleDial from "./GradientAngleDial.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import type { GradientConfig } from "../schemas/background.schema";
import { useStudioI18n } from "@/i18n";
import { useMediaAssets } from "@/features/Studio/media/composables";
import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import ComposerMediaVariantSelect from "../components/ComposerMediaVariantSelect.vue";
import { useComposerMediaVariants } from "../composables/useComposerMediaVariants";
import {
  readComposerNodeMediaReferences,
  withComposerBackgroundReference,
  type ComposerMediaReference,
} from "../../../../lib/media/composerReference";
import {
  buildDesktopFirstCascadeStyleMutation,
  mergeCascadeStyleMutations,
} from "../../../../lib/styles/responsiveCascade";
import { getComputedValue } from "../../Core/utils/responsive";

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

type BackgroundStyleKey =
  | "backgroundColor"
  | "backgroundImage"
  | "backgroundSize"
  | "backgroundPosition"
  | "backgroundRepeat"
  | "backgroundAttachment"
  | "backgroundBlendMode";

const BACKGROUND_SECTION_STYLE_KEYS = [
  "backgroundColor",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "backgroundAttachment",
  "backgroundBlendMode",
] as const satisfies readonly BackgroundStyleKey[];

const BACKGROUND_SIZE_OPTIONS = ["cover", "contain", "auto"] as const;
const BACKGROUND_REPEAT_OPTIONS = [
  "no-repeat",
  "repeat",
  "repeat-x",
  "repeat-y",
] as const satisfies readonly BackgroundRepeat[];
const BACKGROUND_ATTACHMENT_OPTIONS = [
  "scroll",
  "fixed",
  "local",
] as const satisfies readonly BackgroundAttachment[];
const BACKGROUND_BLEND_MODE_OPTIONS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "soft-light",
  "difference",
  "luminosity",
] as const satisfies readonly BackgroundBlendMode[];

const BACKGROUND_MODE_OPTIONS = [
  {
    value: "none",
    label: t("inspector.background.none"),
    icon: backgroundModeIcons.none,
  },
  {
    value: "color",
    label: t("inspector.background.color"),
    icon: backgroundModeIcons.color,
  },
  {
    value: "gradient",
    label: t("inspector.background.gradient"),
    icon: backgroundModeIcons.gradient,
  },
  {
    value: "image",
    label: t("inspector.background.image"),
    icon: backgroundModeIcons.image,
  },
] as const satisfies readonly {
  value: BackgroundType;
  label: string;
  icon: string;
}[];

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const SELECT_TRIGGER_CLASS =
  "h-9 border-dashed border-border-70 bg-sidebar text-xs hover:border-border hover:bg-sidebar-80 focus:ring-0 focus:ring-offset-0";
const SELECT_CONTENT_CLASS =
  "border-border-70 bg-sidebar text-foreground shadow-xl";
const INPUT_CLASS =
  "h-9 border-dashed border-border-70 bg-sidebar text-xs placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0";
const PREVIEW_CARD_CLASS =
  "rounded-md border border-dashed border-border/50 p-2.5 space-y-2.5 bg-muted/20";
const IMAGE_SOURCE_TOGGLE_GROUP_CLASS =
  "flex w-full flex-nowrap items-center gap-1.5";
const IMAGE_SOURCE_TOGGLE_CLASS =
  "flex h-8 min-w-0 flex-[1_1_auto] items-center justify-center whitespace-nowrap rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-border hover:bg-sidebar-80 hover:text-foreground";
const ACTIVE_IMAGE_SOURCE_TOGGLE_CLASS =
  "border-primary/70 bg-accent-10 text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.18)]";

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName, saveNodeUpdates } =
  propertySave;
const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });
const { styleTarget } = useInspectorStyleTargetWithGlobalDefaults({
  propertySave,
});
const backgroundOverrides = useInspectorPropertyOverrides({
  propertyKeys: BACKGROUND_SECTION_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse, getDefault } = usePropertySchema();
const { assets: mediaAssets, loadAssets: loadMediaAssets } = useMediaAssets();
const mediaVariants = useComposerMediaVariants();

const backgroundType = ref<BackgroundType>("none");
const backgroundColor = ref("transparent");
const gradientStart = ref("#000000");
const gradientMid = ref("");
const gradientMidPosition = ref("50");
const gradientEnd = ref("#ffffff");
const gradientAngle = ref("180");
const gradientType = ref<"linear" | "radial">("linear");
const backgroundImageUrl = ref("");
const backgroundImageBinding = useInspectorPropBinding({
  propName: STYLE_BINDING_BACKGROUND_IMAGE,
  propType: "string",
  value: backgroundImageUrl,
});
type BackgroundImageSourceMode = "media" | "url" | "collection";
const backgroundImageSourceMode = ref<BackgroundImageSourceMode>("media");
const backgroundSize = ref<(typeof BACKGROUND_SIZE_OPTIONS)[number]>("cover");
const backgroundPosition = ref(DEFAULT_POSITION_VALUE);
const backgroundRepeat = ref<BackgroundRepeat>("no-repeat");
const backgroundAttachment = ref<BackgroundAttachment>("scroll");
const backgroundBlendMode = ref<BackgroundBlendMode>("normal");
const isDragging = ref(false);
const isMediaPickerOpen = ref(false);
const validationError = ref<string | null>(null);
const internalOpen = ref(props.defaultOpen);

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const backgroundPreviewQueue = useStylePreviewQueue<
  Record<string, string | undefined>
>({
  applyPreview: (updates) => {
    styleTarget.previewStyleProperties(updates);
  },
});

function flushPendingBackgroundPreview(): void {
  backgroundPreviewQueue.flush();
}

function buildSolidBackgroundPreview(
  value: string,
): Record<string, string | undefined> {
  const normalized = value.trim() || "transparent";

  return {
    backgroundColor: normalized,
    backgroundImage: undefined,
  };
}

function buildGradientBackgroundPreview(): Record<string, string | undefined> {
  return {
    backgroundImage: gradientToCSS(buildCurrentGradientConfig()),
  };
}

const targetError = computed(() => styleTarget.error.value);

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});
const defaultBackground = computed<BackgroundValue>(() => {
  return (getDefault("background") as BackgroundValue) ?? DEFAULT_BACKGROUND;
});

const hasBackgroundImage = computed(
  () => backgroundImageUrl.value.trim().length > 0,
);

const backgroundMediaReference = computed(() =>
  getComputedValue(
    readComposerNodeMediaReferences(selectedNode.value?.metadata).background,
    breakpointName.value,
    activeBreakpoints.value,
  ),
);

const hasManagedBackgroundReference = computed(
  () =>
    !styleTarget.isClassEditing.value &&
    Boolean(backgroundMediaReference.value && mediaVariants.asset.value),
);

let backgroundMediaHydration = 0;
watch(
  [
    selectedNodeId,
    breakpointName,
    () => backgroundMediaReference.value?.mediaId,
    () => backgroundMediaReference.value?.variantId,
    styleTarget.isClassEditing,
  ],
  async ([nodeId, , , , isClassEditing]) => {
    const generation = ++backgroundMediaHydration;
    const reference = backgroundMediaReference.value;
    if (!nodeId || !reference || isClassEditing) {
      mediaVariants.clear();
      return;
    }
    await loadMediaAssets();
    if (generation !== backgroundMediaHydration) return;
    await mediaVariants.hydrate(reference, mediaAssets.value);
  },
  { immediate: true },
);

const BACKGROUND_IMAGE_SOURCE_OPTIONS = computed(() =>
  backgroundImageBinding.hasCmsContext.value
    ? [
        { value: "media" as const, label: t("inspector.link.media") },
        { value: "url" as const, label: t("inspector.background.url") },
        {
          value: "collection" as const,
          label: t("inspector.props.collection"),
        },
      ]
    : [
        { value: "media" as const, label: t("inspector.link.media") },
        { value: "url" as const, label: t("inspector.background.url") },
      ],
);

const showStaticBackgroundImageSource = computed(
  () => backgroundImageSourceMode.value !== "collection",
);

function syncBackgroundImageSourceMode(): void {
  backgroundImageSourceMode.value = resolveImageBindingSourceMode({
    isBound: backgroundImageBinding.isBound.value,
    src: backgroundImageUrl.value,
    isExternalUrl: /^https?:\/\//i.test(backgroundImageUrl.value),
  });
}

function handleBackgroundImageSourceModeChange(
  value: BackgroundImageSourceMode,
): void {
  if (value === "collection") {
    backgroundImageSourceMode.value = "collection";
    void backgroundImageBinding.enterCollectionMode();
    return;
  }

  if (backgroundImageSourceMode.value === "collection") {
    void backgroundImageBinding.leaveCollectionMode();
  }
  backgroundImageSourceMode.value = value;
}

async function handleBackgroundImageFieldSelect(
  fieldPath: string,
): Promise<void> {
  await backgroundImageBinding.bind(fieldPath);
  backgroundImageSourceMode.value = "collection";
}

const backgroundImageSummary = computed(() => {
  const value = backgroundImageUrl.value.trim();

  if (!value) {
    return t("inspector.background.noneSelected");
  }

  if (value.startsWith("data:")) {
    return t("inspector.background.dropped");
  }

  try {
    const normalizedUrl = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    const segments = normalizedUrl.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    return lastSegment ? decodeURIComponent(lastSegment) : value;
  } catch {
    return value;
  }
});

function buildCurrentGradientConfig(): GradientConfig {
  const angle = Number.parseFloat(gradientAngle.value.trim() || "180");
  const midColor = gradientMid.value.trim();
  const midPosition = Number.parseFloat(
    gradientMidPosition.value.trim() || "50",
  );
  const stops: GradientConfig["stops"] = [
    { color: gradientStart.value.trim() || "#000000", position: 0 },
  ];

  if (midColor) {
    stops.push({
      color: midColor,
      position: Number.isFinite(midPosition)
        ? Math.min(100, Math.max(0, midPosition))
        : 50,
    });
  }

  stops.push({ color: gradientEnd.value.trim() || "#ffffff", position: 100 });

  return {
    type: gradientType.value,
    angle: Number.isFinite(angle) ? angle : 180,
    stops,
  };
}

const gradientPreviewStyle = computed(() => ({
  background: gradientToCSS(buildCurrentGradientConfig()),
}));

const showAdvancedControls = computed(
  () => backgroundType.value === "gradient" || backgroundType.value === "image",
);

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

function getResponsiveStyleMap(
  propertyName: BackgroundStyleKey,
): Record<string, string | undefined> {
  return styleTarget.getResponsiveStyleMap(propertyName);
}

function getStyleValue(key: BackgroundStyleKey, fallback = ""): string {
  return (
    styleTarget.getStyleValue(key, fallback, breakpointName.value) ?? fallback
  );
}

function extractBackgroundImageUrl(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^url\((['"]?)(.*)\1\)$/i);
  return match?.[2]?.trim() || trimmed;
}

function buildBackgroundImageValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(url\(|linear-gradient\(|radial-gradient\()/i.test(trimmed)) {
    return trimmed;
  }

  return `url("${trimmed.replace(/"/g, '\\"')}")`;
}

function syncBackgroundValues(): void {
  const colorValue = getStyleValue("backgroundColor", "transparent");
  const imageValue = getStyleValue("backgroundImage", "").trim();
  const parsedGradient = imageValue ? cssToGradient(imageValue) : null;

  backgroundColor.value = colorValue || "transparent";
  backgroundSize.value =
    (getStyleValue("backgroundSize", "cover") as
      | (typeof BACKGROUND_SIZE_OPTIONS)[number]
      | "") || "cover";
  backgroundPosition.value = normalizePositionValue(
    getStyleValue("backgroundPosition", DEFAULT_POSITION_VALUE),
  );
  backgroundRepeat.value =
    (getStyleValue("backgroundRepeat", "no-repeat") as BackgroundRepeat) ||
    "no-repeat";
  backgroundAttachment.value =
    (getStyleValue("backgroundAttachment", "scroll") as BackgroundAttachment) ||
    "scroll";
  backgroundBlendMode.value =
    (getStyleValue("backgroundBlendMode", "normal") as BackgroundBlendMode) ||
    "normal";

  if (parsedGradient) {
    backgroundType.value = "gradient";
    gradientType.value = parsedGradient.type;
    gradientStart.value = parsedGradient.stops[0]?.color || "#000000";
    gradientMid.value =
      parsedGradient.stops[1] && parsedGradient.stops.length > 2
        ? parsedGradient.stops[1].color
        : "";
    gradientMidPosition.value =
      parsedGradient.stops[1] && parsedGradient.stops.length > 2
        ? String(parsedGradient.stops[1].position ?? 50)
        : "50";
    gradientEnd.value =
      parsedGradient.stops[parsedGradient.stops.length - 1]?.color || "#ffffff";
    gradientAngle.value = String(parsedGradient.angle ?? 90);
    backgroundImageUrl.value = "";
    return;
  }

  if (imageValue) {
    backgroundType.value = "image";
    backgroundImageUrl.value = extractBackgroundImageUrl(imageValue);
    syncBackgroundImageSourceMode();
    gradientType.value = "linear";
    gradientStart.value = "#000000";
    gradientMid.value = "";
    gradientMidPosition.value = "50";
    gradientEnd.value = "#ffffff";
    gradientAngle.value = "180";
    return;
  }

  backgroundImageUrl.value = "";
  gradientType.value = "linear";
  gradientMid.value = "";
  gradientMidPosition.value = "50";
  if (colorValue && colorValue !== "transparent") {
    backgroundType.value = "color";
  } else {
    backgroundType.value = "none";
  }
}

watch(
  [
    selectedNode,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClassName,
    styleTarget.activeClass,
  ],
  () => {
    syncBackgroundValues();
  },
  { deep: true, immediate: true },
);

function validateBackground(
  candidate: BackgroundValue,
  message: string,
): boolean {
  const result = safeParse("background", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = message;
    return false;
  }

  validationError.value = null;
  return true;
}

async function persistBackgroundStyleValues(
  styleValues: Record<string, string | undefined>,
  referenceUpdate?: ComposerMediaReference | null,
): Promise<boolean> {
  if (
    referenceUpdate === undefined ||
    styleTarget.isClassEditing.value ||
    typeof saveNodeUpdates !== "function" ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return styleTarget.saveStyleProperties(
      styleValues,
      props.currentItemType,
      props.currentItemSlug,
    );
  }

  const styles = mergeCascadeStyleMutations(
    Object.entries(styleValues).map(
      ([propertyName, value]) =>
        buildDesktopFirstCascadeStyleMutation(
          activeBreakpoints.value,
          propertyName,
          breakpointName.value,
          value,
          selectedNode.value?.styles?.[propertyName],
        ) ?? { [propertyName]: { [breakpointName.value]: value } },
    ),
  );
  let metadata = selectedNode.value?.metadata;
  for (const [breakpoint, value] of Object.entries(
    styles.backgroundImage ?? {},
  )) {
    metadata = withComposerBackgroundReference(
      metadata,
      breakpoint,
      typeof value === "string" ? referenceUpdate : null,
    );
  }

  return saveNodeUpdates(
    { styles, metadata },
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function resetCurrentBreakpointBackground(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const success = await persistBackgroundStyleValues(
    Object.fromEntries(
      BACKGROUND_SECTION_STYLE_KEYS.map((propertyName) => [
        propertyName,
        undefined,
      ]),
    ),
    null,
  );
  if (!success) return;

  syncBackgroundValues();
}

async function saveBackgroundColor(value: string): Promise<boolean> {
  if (!hasSaveContext()) return false;
  const normalized = value.trim() || "transparent";

  const candidate: BackgroundValue = {
    ...defaultBackground.value,
    type: normalized === "transparent" ? "none" : "color",
    color: {
      ...(defaultBackground.value.color ?? {}),
      [breakpointName.value]: normalized,
    },
  };

  if (!validateBackground(candidate, "Invalid background color.")) {
    return false;
  }

  const success = await persistBackgroundStyleValues(
    {
      backgroundColor: normalized,
      backgroundImage: undefined,
      backgroundSize: undefined,
      backgroundPosition: undefined,
      backgroundRepeat: undefined,
      backgroundAttachment: undefined,
      backgroundBlendMode: undefined,
    },
    null,
  );
  if (!success) return false;

  backgroundType.value = normalized === "transparent" ? "none" : "color";
  syncBackgroundValues();
  return true;
}

function previewBackgroundColor(value: string): void {
  if (!hasSaveContext()) {
    return;
  }

  backgroundColor.value = value;
  backgroundPreviewQueue.queue(buildSolidBackgroundPreview(value));
}

async function persistBackgroundColor(value: string): Promise<void> {
  const previousPreview = {
    backgroundColor: getStyleValue("backgroundColor", "transparent"),
    backgroundImage: getStyleValue("backgroundImage", "").trim() || undefined,
  };

  backgroundColor.value = value;
  flushPendingBackgroundPreview();
  const success = await saveBackgroundColor(value);
  if (success) {
    return;
  }

  backgroundPreviewQueue.restore(previousPreview);
  syncBackgroundValues();
}

function previewGradientColors(): void {
  if (!hasSaveContext()) {
    return;
  }

  backgroundPreviewQueue.queue(buildGradientBackgroundPreview());
}

async function persistGradientColors(): Promise<void> {
  flushPendingBackgroundPreview();
  await saveGradient();
}

async function saveGradient(): Promise<void> {
  if (!hasSaveContext()) return;

  const gradient = buildCurrentGradientConfig();

  const candidate: BackgroundValue = {
    ...defaultBackground.value,
    type: "gradient",
    gradient,
  };

  if (!validateBackground(candidate, "Invalid gradient values.")) {
    return;
  }

  const success = await persistBackgroundStyleValues(
    {
      backgroundImage: gradientToCSS(gradient),
      backgroundSize: undefined,
      backgroundPosition: undefined,
      backgroundRepeat: undefined,
      backgroundAttachment: undefined,
      backgroundBlendMode:
        backgroundBlendMode.value !== "normal"
          ? backgroundBlendMode.value
          : undefined,
    },
    null,
  );
  if (!success) return;

  backgroundType.value = "gradient";
  syncBackgroundValues();
}

function handleGradientStartPreview(value: string): void {
  gradientStart.value = value;
  previewGradientColors();
}

async function handleGradientStartCommit(value: string): Promise<void> {
  gradientStart.value = value;
  await persistGradientColors();
}

function handleGradientEndPreview(value: string): void {
  gradientEnd.value = value;
  previewGradientColors();
}

async function handleGradientEndCommit(value: string): Promise<void> {
  gradientEnd.value = value;
  await persistGradientColors();
}

function handleGradientMidPreview(value: string): void {
  gradientMid.value = value;
  previewGradientColors();
}

async function handleGradientMidCommit(value: string): Promise<void> {
  gradientMid.value = value;
  await persistGradientColors();
}

async function handleGradientMidPositionBlur(): Promise<void> {
  await saveGradient();
}

async function handleGradientTypeChange(value: unknown): Promise<void> {
  if (value !== "linear" && value !== "radial") {
    return;
  }

  gradientType.value = value;
  await saveGradient();
}

async function saveBackgroundImage(
  referenceUpdate?: ComposerMediaReference | null,
): Promise<void> {
  if (!hasSaveContext()) return;

  const imageValue = buildBackgroundImageValue(backgroundImageUrl.value);
  const normalizedPosition = normalizePositionValue(backgroundPosition.value);
  const candidate: BackgroundValue = {
    ...defaultBackground.value,
    type: imageValue ? "image" : "none",
    image: imageValue
      ? {
          url: backgroundImageUrl.value.trim(),
          size: backgroundSize.value,
          position: normalizedPosition,
          repeat: backgroundRepeat.value,
          attachment: backgroundAttachment.value,
          blendMode: backgroundBlendMode.value,
        }
      : undefined,
  };

  if (!validateBackground(candidate, "Invalid background image settings.")) {
    return;
  }

  const styleValues = {
    backgroundImage: imageValue,
    backgroundSize: imageValue ? backgroundSize.value : undefined,
    backgroundPosition: imageValue ? normalizedPosition : undefined,
    backgroundRepeat: imageValue ? backgroundRepeat.value : undefined,
    backgroundAttachment:
      imageValue && backgroundAttachment.value !== "scroll"
        ? backgroundAttachment.value
        : undefined,
    backgroundBlendMode:
      imageValue && backgroundBlendMode.value !== "normal"
        ? backgroundBlendMode.value
        : undefined,
  };

  const success = await persistBackgroundStyleValues(
    styleValues,
    referenceUpdate,
  );
  if (!success) return;

  backgroundType.value = imageValue ? "image" : "none";
  syncBackgroundValues();
}

async function selectBackgroundType(nextType: BackgroundType): Promise<void> {
  backgroundType.value = nextType;

  if (!hasSaveContext()) {
    return;
  }

  if (nextType === "none") {
    await persistBackgroundStyleValues(
      {
        backgroundColor: undefined,
        backgroundImage: undefined,
        backgroundSize: undefined,
        backgroundPosition: undefined,
        backgroundRepeat: undefined,
        backgroundAttachment: undefined,
        backgroundBlendMode: undefined,
      },
      null,
    );
    syncBackgroundValues();
    return;
  }
}

async function handleBackgroundSizeChange(value: unknown): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  backgroundSize.value = value as (typeof BACKGROUND_SIZE_OPTIONS)[number];
  await saveBackgroundImage();
}

async function handleBackgroundRepeatChange(value: unknown): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  backgroundRepeat.value = value as BackgroundRepeat;
  await saveBackgroundImage();
}

async function handleBackgroundPositionChange(value: unknown): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  backgroundPosition.value = normalizePositionValue(value);
  await saveBackgroundImage();
}

async function handleBackgroundAttachmentChange(value: unknown): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  backgroundAttachment.value = value as BackgroundAttachment;
  if (backgroundType.value === "gradient") {
    await saveGradient();
    return;
  }
  await saveBackgroundImage();
}

async function handleBackgroundBlendModeChange(value: unknown): Promise<void> {
  if (typeof value !== "string") {
    return;
  }

  backgroundBlendMode.value = value as BackgroundBlendMode;
  if (backgroundType.value === "gradient") {
    await saveGradient();
    return;
  }
  await saveBackgroundImage();
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = true;
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = false;
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = false;

  const mediaUrl = event.dataTransfer?.getData("media-url");
  if (mediaUrl) {
    backgroundImageUrl.value = mediaUrl;
    backgroundType.value = "image";
    void saveBackgroundImage(null);
    return;
  }

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) {
    return;
  }

  const file = files[0];
  if (!file.type.startsWith("image/")) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const dataUrl = loadEvent.target?.result;
    if (typeof dataUrl !== "string") {
      return;
    }

    backgroundImageUrl.value = dataUrl;
    backgroundType.value = "image";
    void saveBackgroundImage(null);
  };
  reader.readAsDataURL(file);
}

async function handleMediaSelect(asset: MediaAsset): Promise<void> {
  backgroundType.value = "image";
  await mediaVariants.loadForAsset(asset);
  const selection = mediaVariants.selectVariant(null);
  if (!selection || styleTarget.isClassEditing.value) {
    backgroundImageUrl.value = asset.deliveryUrl || asset.url;
    await saveBackgroundImage(null);
    return;
  }
  backgroundImageUrl.value = selection.url;
  await saveBackgroundImage(selection.reference);
}

async function handleBackgroundVariantChange(
  variantId: string | null,
): Promise<void> {
  const selection = mediaVariants.selectVariant(variantId);
  if (!selection) return;
  backgroundImageUrl.value = selection.url;
  await saveBackgroundImage(selection.reference);
}

function openBackgroundPicker(): void {
  if (backgroundType.value !== "image" || isPanelDisabled.value) {
    return;
  }

  isMediaPickerOpen.value = true;
}

async function clearBackgroundImage(): Promise<void> {
  backgroundImageUrl.value = "";
  await saveBackgroundImage(null);
}

function handleGradientAngleCommit(): void {
  void saveGradient();
}
</script>
<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="backgroundOverrides.overrideBreakpointIds.value.length > 0"
    @update:open="sectionOpen = $event"
    title="Background"
    icon="palette"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="backgroundOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="
          backgroundOverrides.currentBreakpointLabel.value
        "
        :show-reset="
          sectionOpen && backgroundOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="background-reset-breakpoint"
        @reset="void resetCurrentBreakpointBackground()"
      />
    </template>

    <div class="space-y-3">
      <div
        class="flex h-9 bg-sidebar border border-dashed border-border-70 rounded-sm overflow-hidden"
      >
        <TooltipProvider
          v-for="option in BACKGROUND_MODE_OPTIONS"
          :key="option.value"
          :delay-duration="250"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                class="h-full flex-1 rounded-none border-0 px-0 text-muted-foreground hover:bg-sidebar-80 hover:text-foreground"
                :class="[
                  backgroundType === option.value
                    ? 'bg-accent-10 text-accent hover:bg-accent-10 hover:text-accent'
                    : '',
                ]"
                :disabled="isPanelDisabled"
                @click.stop="selectBackgroundType(option.value)"
              >
                <span
                  aria-hidden="true"
                  :class="[option.icon, 'size-4 shrink-0']"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-xs">
              {{ option.label }}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div v-if="backgroundType === 'color'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{
          t("inspector.background.color")
        }}</label>
        <ColorField
          v-model="backgroundColor"
          layout="unified"
          show-variables
          show-alpha
          show-design-colors
          content-side="left"
          content-align="center"
          class="min-w-0 w-full"
          data-testid="background-color-input"
          contrast-against="#ffffff"
          :disabled="isPanelDisabled"
          @preview="previewBackgroundColor"
          @update:model-value="backgroundColor = $event"
          @commit="persistBackgroundColor"
        />
      </div>

      <div v-if="backgroundType === 'gradient'" class="space-y-3">
        <div
          data-testid="background-gradient-preview"
          class="h-20 rounded-md border border-dashed border-border/50 overflow-hidden"
          :style="gradientPreviewStyle"
          aria-hidden="true"
        />

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.type")
          }}</label>
          <Select
            :model-value="gradientType"
            @update:model-value="handleGradientTypeChange"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem value="linear">{{
                t("inspector.background.linear")
              }}</SelectItem>
              <SelectItem value="radial">{{
                t("inspector.background.radial")
              }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="gradientType === 'linear'" :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.angle")
          }}</label>
          <div class="flex items-center gap-2">
            <GradientAngleDial
              v-model="gradientAngle"
              :disabled="isPanelDisabled"
              @commit="handleGradientAngleCommit"
            />
            <div
              class="flex h-9 flex-1 items-center overflow-hidden rounded-sm border border-dashed border-border-70 bg-sidebar"
            >
              <Input
                v-model="gradientAngle"
                @blur="saveGradient"
                @keydown.enter="saveGradient"
                type="text"
                inputmode="numeric"
                placeholder="180"
                class="h-full flex-1 border-0 bg-transparent px-2 text-center text-xs shadow-none focus-visible:ring-0"
                :disabled="isPanelDisabled"
              />
              <span
                class="border-l border-dashed border-border-70 px-2 text-xs text-muted-foreground"
                >deg</span
              >
            </div>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.start")
          }}</label>
          <ColorField
            v-model="gradientStart"
            layout="unified"
            show-variables
            show-alpha
            show-design-colors
            content-side="left"
            content-align="center"
            class="min-w-0 w-full"
            :contrast-against="gradientEnd"
            :disabled="isPanelDisabled"
            @preview="handleGradientStartPreview"
            @update:model-value="gradientStart = $event"
            @commit="handleGradientStartCommit"
          />
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.middle")
          }}</label>
          <div class="flex items-center gap-2">
            <ColorField
              v-model="gradientMid"
              layout="unified"
              show-variables
              show-alpha
              show-design-colors
              content-side="left"
              content-align="center"
              class="min-w-0 flex-1"
              :contrast-against="gradientStart"
              :disabled="isPanelDisabled"
              @preview="handleGradientMidPreview"
              @update:model-value="gradientMid = $event"
              @commit="handleGradientMidCommit"
            />
            <div
              class="flex h-9 w-16 shrink-0 items-center overflow-hidden rounded-sm border border-dashed border-border-70 bg-sidebar"
            >
              <Input
                v-model="gradientMidPosition"
                @blur="handleGradientMidPositionBlur"
                @keydown.enter="saveGradient"
                type="text"
                inputmode="numeric"
                placeholder="50"
                class="h-full flex-1 border-0 bg-transparent px-1 text-center text-xs shadow-none focus-visible:ring-0"
                :disabled="isPanelDisabled || !gradientMid"
              />
              <span
                class="border-l border-dashed border-border-70 px-1.5 text-xs text-muted-foreground"
                >%</span
              >
            </div>
          </div>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.end")
          }}</label>
          <ColorField
            v-model="gradientEnd"
            layout="unified"
            show-variables
            show-alpha
            show-design-colors
            content-side="left"
            content-align="center"
            class="min-w-0 w-full"
            :contrast-against="gradientStart"
            :disabled="isPanelDisabled"
            @preview="handleGradientEndPreview"
            @update:model-value="gradientEnd = $event"
            @commit="handleGradientEndCommit"
          />
        </div>
      </div>

      <div v-if="backgroundType === 'image'" class="space-y-3">
        <div
          :class="IMAGE_SOURCE_TOGGLE_GROUP_CLASS"
          role="group"
          :aria-label="t('inspector.background.source')"
          data-testid="background-image-source-mode"
        >
          <button
            v-for="option in BACKGROUND_IMAGE_SOURCE_OPTIONS"
            :key="option.value"
            type="button"
            :data-testid="`background-image-source-mode-${option.value}`"
            :aria-pressed="backgroundImageSourceMode === option.value"
            :class="[
              IMAGE_SOURCE_TOGGLE_CLASS,
              backgroundImageSourceMode === option.value &&
                ACTIVE_IMAGE_SOURCE_TOGGLE_CLASS,
            ]"
            @click="handleBackgroundImageSourceModeChange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <InspectorPropBinding
          v-if="backgroundImageSourceMode === 'collection'"
          :model-value="backgroundImageBinding.boundPath.value"
          :groups="backgroundImageBinding.fieldGroups.value"
          :picker-mode="backgroundImageBinding.bindingPickerMode.value"
          :display-label="backgroundImageBinding.displayLabel.value"
          :disabled="backgroundImageBinding.pickerDisabled.value"
          :placeholder="t('inspector.props.chooseField')"
          @select="(path) => void handleBackgroundImageFieldSelect(path)"
          @clear="void backgroundImageBinding.clear()"
        />
      </div>

      <div
        v-if="backgroundType === 'image' && showStaticBackgroundImageSource"
        :class="PREVIEW_CARD_CLASS"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-0.5">
            <span
              class="text-[10px] uppercase tracking-wide text-muted-foreground"
              >{{ t("inspector.background.preview") }}</span
            >
            <p class="truncate text-xs font-medium text-foreground">
              {{ backgroundImageSummary }}
            </p>
          </div>

          <div class="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0"
              data-testid="background-replace-button"
              :aria-label="t('inspector.background.chooseImage')"
              :disabled="isPanelDisabled"
              @click="openBackgroundPicker"
            >
              <span
                aria-hidden="true"
                :class="[studioIcons.imageUpload, 'size-3.5 shrink-0']"
              />
            </Button>
            <Button
              v-if="hasBackgroundImage"
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0"
              data-testid="background-clear-button"
              :aria-label="t('inspector.background.clearImage')"
              :disabled="isPanelDisabled"
              @click="void clearBackgroundImage()"
            >
              <span
                aria-hidden="true"
                :class="[studioIcons.close, 'size-3.5 shrink-0']"
              />
            </Button>
          </div>
        </div>

        <div
          data-testid="background-preview"
          role="button"
          tabindex="0"
          :aria-label="t('inspector.background.chooseImage')"
          class="border rounded-md overflow-hidden transition-colors h-28 flex items-center justify-center cursor-pointer border-border/50 bg-background/60 hover:border-primary/40 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          :class="isDragging ? 'border-primary/60 bg-primary/5' : ''"
          @click="openBackgroundPicker"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @keydown.enter.prevent="openBackgroundPicker"
          @keydown.space.prevent="openBackgroundPicker"
        >
          <img
            v-if="hasBackgroundImage"
            :src="backgroundImageUrl"
            :alt="t('inspector.background.previewAlt')"
            class="h-full w-full object-cover"
            :style="{
              objectPosition: backgroundPosition,
            }"
          />
          <p v-else class="px-4 text-center text-xs text-muted-foreground">
            {{ t("inspector.background.dropOrChoose") }}
          </p>
        </div>

        <ComposerMediaVariantSelect
          v-if="hasManagedBackgroundReference"
          :model-value="mediaVariants.selectedVariantId.value"
          :variants="mediaVariants.variants.value"
          :current-source-version="mediaVariants.currentSourceVersion.value"
          :disabled="isPanelDisabled || mediaVariants.isLoading.value"
          @update:model-value="handleBackgroundVariantChange"
        />

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.url")
          }}</label>
          <Input
            v-model="backgroundImageUrl"
            @blur="saveBackgroundImage(null)"
            @keydown.enter="saveBackgroundImage(null)"
            placeholder="https://..."
            :class="INPUT_CLASS"
            :disabled="isPanelDisabled"
          />
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.size")
          }}</label>
          <Select
            data-testid="background-size-select"
            :model-value="backgroundSize"
            @update:model-value="handleBackgroundSizeChange"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="option in BACKGROUND_SIZE_OPTIONS"
                :key="option"
                :value="option"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ t(`inspector.background.size.${option}` as const) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.position")
          }}</label>
          <InspectorPositionGridPicker
            :model-value="backgroundPosition"
            :disabled="isPanelDisabled"
            preview-key-prefix="background-position"
            @update:model-value="handleBackgroundPositionChange"
          />
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.repeat")
          }}</label>
          <Select
            data-testid="background-repeat-select"
            :model-value="backgroundRepeat"
            @update:model-value="handleBackgroundRepeatChange"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="option in BACKGROUND_REPEAT_OPTIONS"
                :key="option"
                :value="option"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{
                  t(
                    `inspector.background.repeat.${option === "no-repeat" ? "noRepeat" : option === "repeat-x" ? "repeatX" : option === "repeat-y" ? "repeatY" : "repeat"}` as const,
                  )
                }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        v-if="showAdvancedControls"
        class="space-y-2 border-t border-dashed border-border/50 pt-3"
      >
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.attachment")
          }}</label>
          <Select
            data-testid="background-attachment-select"
            :model-value="backgroundAttachment"
            @update:model-value="handleBackgroundAttachmentChange"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="option in BACKGROUND_ATTACHMENT_OPTIONS"
                :key="option"
                :value="option"
              >
                {{ t(`inspector.background.attachment.${option}` as const) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.background.blend")
          }}</label>
          <Select
            data-testid="background-blend-mode-select"
            :model-value="backgroundBlendMode"
            @update:model-value="handleBackgroundBlendModeChange"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="option in BACKGROUND_BLEND_MODE_OPTIONS"
                :key="option"
                :value="option"
              >
                {{
                  t(
                    `inspector.background.blend.${option === "soft-light" ? "softLight" : option}` as const,
                  )
                }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="targetError" class="text-xs text-red-500">
        {{ targetError }}
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        :title="t('inspector.background.selectImage')"
        :description="t('inspector.background.selectImageDescription')"
        media-type="image"
        @select="handleMediaSelect"
      />
    </div>
  </BaseProperty>
</template>
