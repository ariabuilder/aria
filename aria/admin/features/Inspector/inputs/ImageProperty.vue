<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useInjectedPageBlocks, useInjectedStageIframeRef } from "../../Core";
import { useSignals } from "../../../composables/useSignals";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePropertySave } from "../../Core";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { usePropertySchema } from "../composables/usePropertySchema";
import { studioIcons } from "@/lib/icons";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import BaseProperty from "./BaseProperty.vue";
import LinkProperty from "./LinkProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { IMAGE_NON_MANAGED_HTML_ATTRS } from "../../../../lib/blocks/renderSemantics";
import { isAriaLibraryMediaPath } from "../../../../lib/media/utils/path";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  DEFAULT_IMAGE,
  DEFAULT_IMAGE_OBJECT_FIT,
  IMAGE_LOADING_LABELS,
  ImageFitSchema,
  ImageLoadingSchema,
  inferImageSourceMode,
  isExternalImage,
  isUrlReferencedImage,
  type ImageFit,
  type ImageLoading,
} from "../schemas/image.schema";
import {
  DEFAULT_POSITION_VALUE,
  normalizePositionValue,
} from "../constants/positionOptions";
import InspectorPositionGridPicker from "./InspectorPositionGridPicker.vue";
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import {
  resolveImageBindingSourceMode,
  useInspectorPropBinding,
} from "../composables/useInspectorPropBinding";
import { useStudioI18n } from "@/i18n";
import { useMediaAssets } from "@/features/Studio/media/composables";
import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import ComposerMediaVariantSelect from "../components/ComposerMediaVariantSelect.vue";
import {
  useComposerMediaVariants,
  type ComposerMediaSelection,
} from "../composables/useComposerMediaVariants";
import {
  readComposerNodeMediaReferences,
  readComposerResponsiveImage,
  withComposerImageReference,
  withComposerResponsiveImage,
  type ComposerResponsiveImageSource,
} from "../../../../lib/media/composerReference";
import {
  DEFAULT_RESPONSIVE_IMAGE_SIZES,
  ResponsiveImageSizesSchema,
  type ResponsiveImageSizes,
} from "../../../../lib/media/transforms/responsive";
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

const IMAGE_STYLE_KEYS = ["objectFit", "objectPosition"] as const;

type ImageSourceMode = "media" | "url" | "collection";

const BASE_IMAGE_SOURCE_MODE_OPTIONS: Array<{
  value: ImageSourceMode;
  label: string;
}> = [
  { value: "media", label: "Media" },
  { value: "url", label: "URL" },
  { value: "collection", label: "Collection" },
];

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const SOURCE_MODE_TOGGLE_GROUP_CLASS =
  "flex w-full flex-nowrap items-center gap-1.5";
const SOURCE_MODE_TOGGLE_CLASS =
  "flex h-9 min-w-0 flex-[1_1_auto] items-center justify-center whitespace-nowrap rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-border hover:bg-sidebar-80 hover:text-foreground";
const ACTIVE_SOURCE_MODE_TOGGLE_CLASS =
  "border-primary/70 bg-accent-10 text-primary shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.18)]";
const SELECT_TRIGGER_CLASS =
  "h-9 border-dashed border-border-70 bg-sidebar text-xs hover:border-border hover:bg-sidebar-80 focus:ring-0 focus:ring-offset-0";
const SELECT_CONTENT_CLASS =
  "border-border-70 bg-sidebar text-foreground shadow-xl";
const INPUT_CLASS =
  "h-9 border-dashed border-border-70 bg-sidebar text-xs placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0";

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

function imageSourceModeLabel(value: ImageSourceMode): string {
  return t(
    {
      media: "inspector.media.source.media",
      url: "inspector.media.source.url",
      collection: "inspector.media.source.collection",
    }[value],
  );
}

function imageFitLabel(value: ImageFit): string {
  return t(
    {
      cover: "inspector.media.fit.cover",
      contain: "inspector.media.fit.contain",
      "scale-down": "inspector.media.fit.scaleDown",
      fill: "inspector.media.fit.fill",
      none: "inspector.media.fit.none",
    }[value],
  );
}

const propertySave = usePropertySave();
const {
  selectedNode,
  selectedNodeId,
  breakpointName,
  saveProperty,
  saveProperties,
  saveNodeUpdates,
} = propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const imageOverrides = useInspectorPropertyOverrides({
  propertyKeys: IMAGE_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse } = usePropertySchema();

const pageBlocks = useInjectedPageBlocks();
const stageIframeRef = useInjectedStageIframeRef();
const { assets: mediaAssets, loadAssets: loadMediaAssets } = useMediaAssets();
const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });
const mediaVariants = useComposerMediaVariants();

// Local state for editing
const src = ref("");
const alt = ref("");
const loading = ref<ImageLoading>(DEFAULT_IMAGE.loading);
const objectFit = ref<ImageFit>(DEFAULT_IMAGE_OBJECT_FIT);
const objectPosition = ref(DEFAULT_POSITION_VALUE);
const imageSourceMode = ref<ImageSourceMode>("media");
const persistedImageValues = ref({
  src: DEFAULT_IMAGE.src,
  alt: DEFAULT_IMAGE.alt,
  loading: DEFAULT_IMAGE.loading,
});
const isDragging = ref(false);
const isMediaPickerOpen = ref(false);
const internalOpen = ref(props.defaultOpen);
const responsiveSizes = ref<ResponsiveImageSizes>(
  DEFAULT_RESPONSIVE_IMAGE_SIZES,
);
const healedImageAttrNodeIds = ref(new Set<string>());
const ensuredObjectFitNodeIds = ref(new Set<string>());

const srcBinding = useInspectorPropBinding({
  propName: "src",
  propType: "string",
  value: src,
});
const altBinding = useInspectorPropBinding({
  propName: "alt",
  propType: "string",
  value: alt,
});

const imageSourceModeOptions = computed(() =>
  srcBinding.hasCmsContext.value
    ? BASE_IMAGE_SOURCE_MODE_OPTIONS
    : BASE_IMAGE_SOURCE_MODE_OPTIONS.filter(
        (option) => option.value !== "collection",
      ),
);

const showStaticImageSource = computed(
  () => imageSourceMode.value !== "collection",
);

const isSrcBindingReadOnly = computed(
  () => srcBinding.isReadOnly.value || imageSourceMode.value === "collection",
);

const showAltFieldPicker = computed(
  () =>
    altBinding.showFieldPicker.value &&
    (altBinding.isBound.value ||
      srcBinding.propsEditor.isAssignedCmsTemplatePage.value),
);

const responsiveImage = computed(() =>
  readComposerResponsiveImage(selectedNode.value?.metadata),
);

const responsiveImageSource = computed<
  ComposerResponsiveImageSource | undefined
>(() => {
  const responsive = responsiveImage.value;
  if (!responsive) return undefined;
  return (
    getComputedValue(
      responsive.sources,
      breakpointName.value,
      activeBreakpoints.value,
    ) ?? responsive.default
  );
});

const imageMediaReference = computed(
  () =>
    responsiveImageSource.value?.reference ??
    readComposerNodeMediaReferences(selectedNode.value?.metadata).image,
);

const hasCurrentResponsiveOverride = computed(() =>
  Boolean(
    breakpointName.value !== "base" &&
    responsiveImage.value?.sources[breakpointName.value],
  ),
);

const hasManagedImageReference = computed(() =>
  Boolean(imageMediaReference.value && mediaVariants.asset.value),
);

let mediaReferenceHydration = 0;
watch(
  [
    selectedNodeId,
    () => imageMediaReference.value?.mediaId,
    () => imageMediaReference.value?.variantId,
  ],
  async ([nodeId]) => {
    const generation = ++mediaReferenceHydration;
    const reference = imageMediaReference.value;
    if (!nodeId || !reference) {
      mediaVariants.clear();
      return;
    }
    await loadMediaAssets();
    if (generation !== mediaReferenceHydration) return;
    await mediaVariants.hydrate(reference, mediaAssets.value);
  },
  { immediate: true },
);

watch(
  responsiveImage,
  (value) => {
    responsiveSizes.value = value?.sizes ?? DEFAULT_RESPONSIVE_IMAGE_SIZES;
  },
  { immediate: true },
);

const { on } = useSignals();
on("open-image-picker", () => {
  isMediaPickerOpen.value = true;
});

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

function hasSaveContext(): boolean {
  if (styleTarget.isClassEditing.value) {
    return true;
  }

  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => styleTarget.isLoading.value),
});

const targetError = computed(() => styleTarget.error.value);
const hasError = computed(() => !!targetError.value);
const hasImageChanges = computed(
  () =>
    src.value.trim() !== DEFAULT_IMAGE.src ||
    alt.value.trim() !== DEFAULT_IMAGE.alt ||
    imageOverrides.overrideBreakpointIds.value.length > 0,
);
const hasSelectedImage = computed(() => src.value.trim().length > 0);
const imagePreviewSrc = computed(
  () => responsiveImageSource.value?.url ?? src.value,
);
const imageSourceSummary = computed(() => {
  const value = src.value.trim();

  if (!value) {
    return imageSourceMode.value === "url"
      ? "Paste a hosted image URL"
      : "Choose from your media library";
  }

  if (value.startsWith("data:")) {
    return "Dropped image";
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
const imageSourceMeta = computed(() => {
  const value = src.value.trim();

  if (!value) {
    return imageSourceMode.value === "url"
      ? "Best for remote CDN or third-party hosted images."
      : "Best for managed uploads, reuse, and stable publishing.";
  }

  if (value.startsWith("data:")) {
    return "Inline image data";
  }

  if (isUrlReferencedImage(value)) {
    if (isExternalImage(value)) {
      try {
        return new URL(value).hostname;
      } catch {
        return "External image URL";
      }
    }

    return "External image URL";
  }

  return "Media library asset";
});

async function resetCurrentBreakpointImage(): Promise<void> {
  await imageOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
  await clearCurrentResponsiveOverride();
}

function findNodeById(
  nodes: BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children?.length) {
      const found = findNodeById(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function setPersistedImageValues(
  values: Partial<{ src: string; alt: string; loading: ImageLoading }>,
): void {
  persistedImageValues.value = {
    ...persistedImageValues.value,
    ...values,
  };
}

function nodeHasNonManagedImageAttrs(
  nodeProps: Record<string, unknown>,
): boolean {
  return IMAGE_NON_MANAGED_HTML_ATTRS.some((attrName) =>
    Object.prototype.hasOwnProperty.call(nodeProps, attrName),
  );
}

function buildNonManagedImageAttrClears(
  nodeProps: Record<string, unknown>,
): Record<string, undefined> {
  const clears: Record<string, undefined> = {};

  for (const attrName of IMAGE_NON_MANAGED_HTML_ATTRS) {
    if (Object.prototype.hasOwnProperty.call(nodeProps, attrName)) {
      clears[attrName] = undefined;
    }
  }

  return clears;
}

async function clearNonManagedImageAttrsOnNode(
  nodeProps: Record<string, unknown>,
): Promise<boolean> {
  const clears = buildNonManagedImageAttrClears(nodeProps);
  if (Object.keys(clears).length === 0) {
    return true;
  }

  if (!props.currentItemType || !props.currentItemSlug) {
    return false;
  }

  return saveProperties(clears, props.currentItemType, props.currentItemSlug);
}

function shouldHealStalePasteImageAttrs(
  nodeId: string,
  nodeProps: Record<string, unknown>,
): boolean {
  if (healedImageAttrNodeIds.value.has(nodeId)) {
    return false;
  }

  const srcValue = typeof nodeProps.src === "string" ? nodeProps.src : "";
  if (!isAriaLibraryMediaPath(srcValue)) {
    return false;
  }

  const srcsetValue =
    typeof nodeProps.srcset === "string" ? nodeProps.srcset : "";
  return srcsetValue.includes("/_astro/");
}

async function healStalePasteImageAttrsIfNeeded(
  nodeId: string,
  nodeProps: Record<string, unknown>,
): Promise<void> {
  if (!shouldHealStalePasteImageAttrs(nodeId, nodeProps)) {
    return;
  }

  healedImageAttrNodeIds.value.add(nodeId);
  await clearNonManagedImageAttrsOnNode(nodeProps);
}

function hasPersistedImageStyle(
  propertyName: "objectFit" | "objectPosition",
): boolean {
  return (
    styleTarget.getStyleValueState(propertyName, breakpointName.value).value !==
    undefined
  );
}

async function ensureDefaultImageObjectFitPersisted(
  nodeId: string,
): Promise<void> {
  if (ensuredObjectFitNodeIds.value.has(nodeId)) {
    return;
  }

  if (hasPersistedImageStyle("objectFit")) {
    ensuredObjectFitNodeIds.value.add(nodeId);
    return;
  }

  if (!hasSaveContext()) {
    return;
  }

  ensuredObjectFitNodeIds.value.add(nodeId);

  const success = await styleTarget.saveStyleProperty(
    "objectFit",
    DEFAULT_IMAGE_OBJECT_FIT,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    objectFit.value = DEFAULT_IMAGE_OBJECT_FIT;
  }
}

function syncImageState(
  node: { props?: Record<string, unknown> } | null,
): void {
  const nodeProps = node?.props ?? {};
  const nextSrc = typeof nodeProps.src === "string" ? nodeProps.src : "";
  const nextAlt = typeof nodeProps.alt === "string" ? nodeProps.alt : "";
  const loadingParsed = ImageLoadingSchema.safeParse(nodeProps.loading);

  src.value = nextSrc;
  alt.value = nextAlt;
  loading.value = loadingParsed.success
    ? loadingParsed.data
    : DEFAULT_IMAGE.loading;
  persistedImageValues.value = {
    src: nextSrc,
    alt: nextAlt,
    loading: loading.value,
  };
  syncImageSourceModeFromState();

  const fitValue =
    styleTarget.getStyleValue(
      "objectFit",
      DEFAULT_IMAGE_OBJECT_FIT,
      breakpointName.value,
    ) ?? DEFAULT_IMAGE_OBJECT_FIT;
  const positionValue =
    styleTarget.getStyleValue(
      "objectPosition",
      DEFAULT_POSITION_VALUE,
      breakpointName.value,
    ) ?? DEFAULT_POSITION_VALUE;
  const fitParsed = ImageFitSchema.safeParse(fitValue);
  objectFit.value = fitParsed.success
    ? fitParsed.data
    : DEFAULT_IMAGE_OBJECT_FIT;
  objectPosition.value = normalizePositionValue(positionValue);

  if (selectedNodeId.value) {
    void healStalePasteImageAttrsIfNeeded(selectedNodeId.value, nodeProps);
    void ensureDefaultImageObjectFitPersisted(selectedNodeId.value);
  }
}

function tryHydrateFromNodeId(nodeId: string): boolean {
  const canonicalNode = findNodeById(pageBlocks.value || [], nodeId);
  const fallbackNode = canonicalNode || selectedNode.value || null;

  if (fallbackNode?.props) {
    syncImageState(fallbackNode);
  }

  syncImageStateFromCanvas(nodeId);

  return Boolean(src.value || alt.value);
}

function hydrateWithRetry(nodeId: string): void {
  if (tryHydrateFromNodeId(nodeId)) {
    return;
  }

  requestAnimationFrame(() => {
    if (tryHydrateFromNodeId(nodeId)) {
      return;
    }

    setTimeout(() => {
      tryHydrateFromNodeId(nodeId);
    }, 60);
  });
}

function syncImageStateFromCanvas(nodeId: string): void {
  const iframe = stageIframeRef.value as HTMLIFrameElement | null;
  const doc = iframe?.contentDocument;
  if (!doc) return;

  const container = doc.querySelector(
    `[data-aria-id="${nodeId}"]`,
  ) as HTMLElement | null;
  if (!container) return;

  const imageElement =
    container.tagName.toLowerCase() === "img"
      ? (container as HTMLImageElement)
      : (container.querySelector("img") as HTMLImageElement | null);

  const srcFromCanvas =
    imageElement?.getAttribute("src") || container.getAttribute("src") || "";
  const altFromCanvas =
    imageElement?.getAttribute("alt") || container.getAttribute("alt") || "";
  const positionFromCanvas =
    imageElement?.style.objectPosition || container.style.objectPosition || "";

  if (!src.value && srcFromCanvas) {
    src.value = srcFromCanvas;
    setPersistedImageValues({ src: srcFromCanvas });
    imageSourceMode.value = inferImageSourceMode(srcFromCanvas);
  }

  if (!alt.value && altFromCanvas) {
    alt.value = altFromCanvas;
    setPersistedImageValues({ alt: altFromCanvas });
  }

  if (
    (objectPosition.value === DEFAULT_POSITION_VALUE ||
      !objectPosition.value) &&
    positionFromCanvas
  ) {
    objectPosition.value = normalizePositionValue(positionFromCanvas);
  }
}

watch(
  [
    selectedNodeId,
    selectedNode,
    pageBlocks,
    breakpointName,
    styleTarget.isClassEditing,
    styleTarget.activeClass,
  ],
  ([nodeId]) => {
    if (!nodeId) {
      syncImageState(null);
      return;
    }

    hydrateWithRetry(nodeId);
  },
  { deep: true, immediate: true },
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || !selectedNodeId.value) return;
    hydrateWithRetry(selectedNodeId.value);
  },
  { immediate: true },
);

const saveSrc = async (value: string) => {
  if (!selectedNodeId.value) return;

  const nextValue = typeof value === "string" ? value.trim() : "";
  const nodeProps = selectedNode.value?.props ?? {};
  const hasStaleAttrs = nodeHasNonManagedImageAttrs(nodeProps);
  if (persistedImageValues.value.src === nextValue && !hasStaleAttrs) return;

  const parsedImage = safeParse("image", {
    src: nextValue,
    alt: alt.value,
    loading: loading.value,
    objectFit: objectFit.value,
    objectPosition: objectPosition.value,
  });
  if (!("success" in parsedImage) || !parsedImage.success) return;

  if (!props.currentItemType || !props.currentItemSlug) return;

  const attrClears = buildNonManagedImageAttrClears(nodeProps);
  const success =
    typeof saveNodeUpdates === "function"
      ? await saveNodeUpdates(
          {
            props: {
              src: nextValue,
              ...attrClears,
            },
            metadata: withComposerResponsiveImage(
              withComposerImageReference(selectedNode.value?.metadata, null),
              null,
            ),
          },
          props.currentItemType,
          props.currentItemSlug,
        )
      : Object.keys(attrClears).length > 0
        ? await saveProperties(
            { src: nextValue, ...attrClears },
            props.currentItemType,
            props.currentItemSlug,
          )
        : await saveProperty(
            "src",
            nextValue,
            props.currentItemType,
            props.currentItemSlug,
          );

  if (success) {
    src.value = nextValue;
    setPersistedImageValues({ src: nextValue });
    imageSourceMode.value = inferImageSourceMode(nextValue);
    mediaVariants.clear();
    if (selectedNodeId.value) {
      await ensureDefaultImageObjectFitPersisted(selectedNodeId.value);
    }
  }
};

const saveAlt = async (value: string) => {
  if (!selectedNodeId.value) return;

  const nextValue = typeof value === "string" ? value : "";
  if (persistedImageValues.value.alt === nextValue) return;

  const parsedImage = safeParse("image", {
    src: src.value,
    alt: nextValue,
    loading: loading.value,
    objectFit: objectFit.value,
    objectPosition: objectPosition.value,
  });
  if (!("success" in parsedImage) || !parsedImage.success) return;

  if (!props.currentItemType || !props.currentItemSlug) return;

  const success = await saveProperty(
    "alt",
    nextValue,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    alt.value = nextValue;
    setPersistedImageValues({ alt: nextValue });
  }
};

const saveLoading = async (value: unknown) => {
  const loadingResult = ImageLoadingSchema.safeParse(value);
  if (!loadingResult.success) return;

  if (persistedImageValues.value.loading === loadingResult.data) return;

  const parsedImage = safeParse("image", {
    src: src.value,
    alt: alt.value,
    loading: loadingResult.data,
    objectFit: objectFit.value,
    objectPosition: objectPosition.value,
  });
  if (!("success" in parsedImage) || !parsedImage.success) return;

  if (!props.currentItemType || !props.currentItemSlug) return;

  const success = await saveProperty(
    "loading",
    loadingResult.data,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    loading.value = loadingResult.data;
    setPersistedImageValues({ loading: loadingResult.data });
  }
};

function syncImageSourceModeFromState(): void {
  const resolved = resolveImageBindingSourceMode({
    isBound: srcBinding.isBound.value,
    src: src.value,
    isExternalUrl:
      isExternalImage(src.value) || isUrlReferencedImage(src.value),
  });

  if (
    imageSourceMode.value === "url" &&
    resolved === "media" &&
    !srcBinding.isBound.value
  ) {
    return;
  }

  imageSourceMode.value = resolved;
}

function handleImageSourceModeChange(value: ImageSourceMode): void {
  if (value === "collection") {
    imageSourceMode.value = "collection";
    void srcBinding.enterCollectionMode();
    return;
  }

  if (imageSourceMode.value === "collection") {
    void srcBinding.leaveCollectionMode();
  }

  imageSourceMode.value = value;
}

async function handleSrcFieldSelect(fieldPath: string): Promise<void> {
  await srcBinding.bind(fieldPath);
  imageSourceMode.value = "collection";
}

async function handleAltFieldSelect(fieldPath: string): Promise<void> {
  await altBinding.bind(fieldPath);
}

async function clearImageSource(): Promise<void> {
  await saveSrc("");
}

const saveObjectFit = async (value: unknown) => {
  const fitResult = ImageFitSchema.safeParse(value);
  if (!fitResult.success) return;

  const parsedImage = safeParse("image", {
    src: src.value,
    alt: alt.value,
    loading: loading.value,
    objectFit: fitResult.data,
    objectPosition: objectPosition.value,
  });
  if (!("success" in parsedImage) || !parsedImage.success) return;

  const isAlreadyPersisted =
    hasPersistedImageStyle("objectFit") && objectFit.value === fitResult.data;
  if (isAlreadyPersisted) return;

  if (!hasSaveContext()) return;

  const success = await styleTarget.saveStyleProperty(
    "objectFit",
    fitResult.data,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    objectFit.value = fitResult.data;
  }
};

const saveObjectPosition = async (value: unknown) => {
  if (typeof value !== "string") return;

  const nextPosition = normalizePositionValue(value);
  const parsedImage = safeParse("image", {
    src: src.value,
    alt: alt.value,
    loading: loading.value,
    objectFit: objectFit.value,
    objectPosition: nextPosition,
  });
  if (!("success" in parsedImage) || !parsedImage.success) return;

  if (objectPosition.value === nextPosition) return;

  if (!hasSaveContext()) return;

  const success = await styleTarget.saveStyleProperty(
    "objectPosition",
    nextPosition,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    objectPosition.value = nextPosition;
  }
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();

  if (imageSourceMode.value !== "media") {
    return;
  }

  isDragging.value = true;
};

const handleDragLeave = () => {
  isDragging.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;

  if (imageSourceMode.value !== "media") {
    return;
  }

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith("image/")) return;

  // Drag-drop uses a local data URL; use the media picker for persisted assets.
  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target?.result as string;
    imageSourceMode.value = "media";
    void saveSrc(dataUrl);
  };
  reader.readAsDataURL(file);
};

async function saveManagedImageSelection(
  selection: ComposerMediaSelection,
): Promise<void> {
  if (!props.currentItemType || !props.currentItemSlug) return;
  if (typeof saveNodeUpdates !== "function") {
    await saveSrc(selection.url);
    return;
  }
  const attrClears = buildNonManagedImageAttrClears(
    selectedNode.value?.props ?? {},
  );
  const source =
    selection.width && selection.width > 0
      ? {
          url: selection.url,
          reference: selection.reference,
          width: selection.width,
          height: selection.height,
          allowDerivatives: selection.supportsResponsiveDelivery,
        }
      : null;
  const currentResponsive = responsiveImage.value;
  const isDefaultSelection =
    breakpointName.value === "base" || !currentResponsive;
  let metadata = selectedNode.value?.metadata;
  let nextResponsive = currentResponsive;

  if (source) {
    nextResponsive = isDefaultSelection
      ? {
          sizes: currentResponsive?.sizes ?? responsiveSizes.value,
          default: source,
          sources: currentResponsive?.sources ?? {},
        }
      : {
          ...currentResponsive,
          sources: {
            ...currentResponsive.sources,
            [breakpointName.value]: source,
          },
        };
    metadata = withComposerResponsiveImage(metadata, nextResponsive);
  } else if (isDefaultSelection) {
    metadata = withComposerResponsiveImage(metadata, null);
  }

  if (isDefaultSelection) {
    metadata = withComposerImageReference(
      metadata,
      source ? null : selection.reference,
    );
  }

  const success = await saveNodeUpdates(
    {
      ...(isDefaultSelection
        ? { props: { src: selection.url, ...attrClears } }
        : {}),
      metadata,
    },
    props.currentItemType,
    props.currentItemSlug,
  );
  if (!success) return;
  if (isDefaultSelection) {
    src.value = selection.url;
    setPersistedImageValues({ src: selection.url });
  }
  imageSourceMode.value = "media";
}

const handleMediaSelect = async (asset: MediaAsset): Promise<void> => {
  imageSourceMode.value = "media";
  await mediaVariants.loadForAsset(asset);
  const selection = mediaVariants.selectVariant(null);
  if (!selection) {
    await saveSrc(asset.deliveryUrl || asset.url);
    return;
  }
  await saveManagedImageSelection(selection);
};

async function handleImageVariantChange(
  variantId: string | null,
): Promise<void> {
  const selection = mediaVariants.selectVariant(variantId);
  if (!selection) return;
  await saveManagedImageSelection(selection);
}

async function saveResponsiveSizes(value: unknown): Promise<void> {
  const parsed = ResponsiveImageSizesSchema.safeParse(value);
  if (!parsed.success || !responsiveImage.value) return;
  if (
    typeof saveNodeUpdates !== "function" ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }
  const success = await saveNodeUpdates(
    {
      metadata: withComposerResponsiveImage(selectedNode.value?.metadata, {
        ...responsiveImage.value,
        sizes: parsed.data,
      }),
    },
    props.currentItemType,
    props.currentItemSlug,
  );
  if (success) responsiveSizes.value = parsed.data;
}

async function clearCurrentResponsiveOverride(): Promise<void> {
  const responsive = responsiveImage.value;
  if (
    !responsive ||
    breakpointName.value === "base" ||
    typeof saveNodeUpdates !== "function" ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }
  const sources = { ...responsive.sources };
  delete sources[breakpointName.value];
  const success = await saveNodeUpdates(
    {
      metadata: withComposerResponsiveImage(selectedNode.value?.metadata, {
        ...responsive,
        sources,
      }),
    },
    props.currentItemType,
    props.currentItemSlug,
  );
  if (!success) return;
  const inheritedSource =
    getComputedValue(sources, breakpointName.value, activeBreakpoints.value) ??
    responsive.default;
  await mediaVariants.hydrate(inheritedSource.reference, mediaAssets.value);
}

const imagePreviewPickerAriaLabel = computed(() =>
  hasSelectedImage.value
    ? t("inspector.media.replaceImage")
    : t("inspector.media.chooseImage"),
);

function openImagePicker(): void {
  isMediaPickerOpen.value = true;
}

function handlePreviewPickerKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openImagePicker();
  }
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="hasImageChanges"
    @update:open="sectionOpen = $event"
    title="Image"
    icon="image"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="imageOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="imageOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen &&
          (imageOverrides.hasCurrentBreakpointOverride.value ||
            hasCurrentResponsiveOverride)
        "
        reset-test-id="image-reset-breakpoint"
        @reset="void resetCurrentBreakpointImage()"
      />
    </template>

    <div class="space-y-3">
      <div
        :class="SOURCE_MODE_TOGGLE_GROUP_CLASS"
        role="group"
        :aria-label="t('inspector.media.source')"
        data-testid="image-source-mode"
      >
        <button
          v-for="option in imageSourceModeOptions"
          :key="option.value"
          type="button"
          :data-testid="`image-source-mode-${option.value}`"
          :aria-pressed="imageSourceMode === option.value"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            imageSourceMode === option.value && ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          @click="handleImageSourceModeChange(option.value)"
        >
          {{ imageSourceModeLabel(option.value) }}
        </button>
      </div>

      <InspectorPropBinding
        v-if="imageSourceMode === 'collection'"
        :model-value="srcBinding.boundPath.value"
        :groups="srcBinding.fieldGroups.value"
        :picker-mode="srcBinding.bindingPickerMode.value"
        :display-label="srcBinding.displayLabel.value"
        :disabled="srcBinding.pickerDisabled.value"
        :placeholder="t('variablePicker.chooseField')"
        @select="(path) => void handleSrcFieldSelect(path)"
        @clear="void srcBinding.clear()"
      />

      <div
        v-if="showStaticImageSource"
        class="rounded-md border border-dashed border-border/50 p-2.5 space-y-2.5 bg-muted/20"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-0.5">
            <span
              class="text-[10px] uppercase tracking-wide text-muted-foreground"
              >{{ t("inspector.media.preview") }}</span
            >
            <p class="truncate text-xs font-medium text-foreground">
              {{ imageSourceSummary }}
            </p>
          </div>

          <div class="flex items-center gap-0.5">
            <Button
              v-if="imageSourceMode === 'media'"
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0"
              data-testid="image-replace-button"
              :aria-label="
                hasSelectedImage
                  ? t('inspector.media.replaceImage')
                  : t('inspector.media.chooseImage')
              "
              @click="openImagePicker"
            >
              <span
                aria-hidden="true"
                :class="[studioIcons.imageUpload, 'size-4 shrink-0']"
              />
            </Button>
            <Button
              v-if="hasSelectedImage"
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0"
              data-testid="image-clear-button"
              :aria-label="t('inspector.media.clearImage')"
              @click="void clearImageSource()"
            >
              <span
                aria-hidden="true"
                :class="[studioIcons.close, 'size-4 shrink-0']"
              />
            </Button>
          </div>
        </div>

        <div
          data-testid="image-preview-open-picker"
          role="button"
          tabindex="0"
          :aria-label="imagePreviewPickerAriaLabel"
          @click="openImagePicker"
          @keydown="handlePreviewPickerKeydown"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          :class="[
            'border rounded-md overflow-hidden transition-colors h-28 flex items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            isDragging
              ? 'border-primary/60 bg-primary/5'
              : 'border-border/50 bg-background/60',
          ]"
        >
          <img
            v-if="imagePreviewSrc"
            :src="imagePreviewSrc"
            :alt="alt || t('inspector.media.selectedImage')"
            class="h-full w-full object-cover"
            :style="{ objectFit, objectPosition }"
          />
          <div v-else class="px-4 text-center">
            <p class="text-xs text-muted-foreground">
              {{
                imageSourceMode === "media"
                  ? t("inspector.media.imageDropHint")
                  : t("inspector.media.imageUrlHint")
              }}
            </p>
            <p class="mt-1 text-[10px] text-muted-foreground/80">
              {{
                imageSourceMode === "media"
                  ? t("inspector.media.managedHint")
                  : t("inspector.media.directImageHint")
              }}
            </p>
          </div>
        </div>

        <ComposerMediaVariantSelect
          v-if="hasManagedImageReference"
          :model-value="mediaVariants.selectedVariantId.value"
          :variants="mediaVariants.variants.value"
          :current-source-version="mediaVariants.currentSourceVersion.value"
          :disabled="isPanelDisabled || mediaVariants.isLoading.value"
          @update:model-value="handleImageVariantChange"
        />

        <div v-if="responsiveImage" :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.media.displayWidth")
          }}</label>
          <div class="flex min-w-0 items-center gap-1.5">
            <Select
              :model-value="responsiveSizes"
              :disabled="isPanelDisabled"
              @update:model-value="saveResponsiveSizes"
            >
              <SelectTrigger
                class="min-w-0 flex-1"
                :class="SELECT_TRIGGER_CLASS"
                data-testid="image-responsive-sizes"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent :class="SELECT_CONTENT_CLASS">
                <SelectItem value="100vw">{{
                  t("inspector.media.displayWidth.full")
                }}</SelectItem>
                <SelectItem value="(max-width: 767px) 100vw, 50vw">{{
                  t("inspector.media.displayWidth.half")
                }}</SelectItem>
                <SelectItem value="(max-width: 767px) 100vw, 33vw">{{
                  t("inspector.media.displayWidth.third")
                }}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              v-if="hasCurrentResponsiveOverride"
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              data-testid="image-responsive-use-inherited"
              :aria-label="t('inspector.media.useInheritedImage')"
              @click="void clearCurrentResponsiveOverride()"
            >
              <span
                aria-hidden="true"
                :class="[studioIcons.undo, 'size-4 shrink-0']"
              />
            </Button>
          </div>
        </div>
      </div>

      <div
        v-if="showStaticImageSource && imageSourceMode === 'url'"
        :class="PROPERTY_ROW_CLASS"
      >
        <label :class="PROPERTY_LABEL_CLASS">{{
          t("inspector.media.url")
        }}</label>
        <div class="space-y-1.5">
          <Input
            data-testid="image-source-url-input"
            v-model="src"
            @blur="() => saveSrc(src)"
            placeholder="https://..."
            :class="INPUT_CLASS"
            :disabled="isPanelDisabled || isSrcBindingReadOnly"
          />
        </div>
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{
          t("inspector.media.alt")
        }}</label>
        <div class="space-y-1.5">
          <InspectorPropBinding
            v-if="showAltFieldPicker"
            variant="inline"
            :model-value="altBinding.boundPath.value"
            :groups="altBinding.fieldGroups.value"
            :picker-mode="altBinding.bindingPickerMode.value"
            :display-label="altBinding.displayLabel.value"
            :disabled="altBinding.pickerDisabled.value"
            :placeholder="t('variablePicker.chooseField')"
            @select="(path) => void handleAltFieldSelect(path)"
            @clear="void altBinding.clear()"
          />
          <Input
            v-else
            data-testid="image-alt-input"
            v-model="alt"
            @blur="() => saveAlt(alt)"
            :placeholder="t('inspector.media.describeImage')"
            :class="INPUT_CLASS"
            :disabled="isPanelDisabled || altBinding.isReadOnly.value"
          />
        </div>
      </div>

      <div class="border-t border-dashed border-border/50 pt-3">
        <LinkProperty
          embedded
          :current-item-type="props.currentItemType"
          :current-item-slug="props.currentItemSlug"
        />
      </div>

      <div class="rounded-md space-y-2.5 bg-muted/20">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.media.scale")
          }}</label>
          <Select
            data-testid="image-object-fit-select"
            :model-value="objectFit"
            @update:model-value="saveObjectFit"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                value="cover"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ imageFitLabel("cover") }}
              </SelectItem>
              <SelectItem
                value="contain"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ imageFitLabel("contain") }}
              </SelectItem>
              <SelectItem
                value="scale-down"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ imageFitLabel("scale-down") }}
              </SelectItem>
              <SelectItem
                value="fill"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ imageFitLabel("fill") }}
              </SelectItem>
              <SelectItem
                value="none"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ imageFitLabel("none") }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.media.position")
          }}</label>
          <InspectorPositionGridPicker
            data-testid="image-object-position-select"
            :model-value="objectPosition"
            preview-key-prefix="image-position"
            @update:model-value="saveObjectPosition"
          />
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{
            t("inspector.media.loading")
          }}</label>
          <Select
            data-testid="image-loading-select"
            :model-value="loading"
            @update:model-value="saveLoading"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="(label, value) in IMAGE_LOADING_LABELS"
                :key="value"
                :value="value"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{
                  value === "lazy"
                    ? t("inspector.media.loading.lazy")
                    : t("inspector.media.loading.eager")
                }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- Loading indicator -->
      <div
        v-if="isPersisting"
        class="text-xs text-muted-foreground/80 flex items-center gap-2"
      >
        <div
          class="h-2 w-2 rounded-full bg-muted-foreground/70 animate-pulse"
        ></div>
        {{ t("common.saving") }}
      </div>

      <!-- Error message -->
      <div v-if="hasError" class="text-xs text-red-500">
        {{ targetError }}
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        :title="t('inspector.media.selectImage')"
        :description="t('inspector.media.selectImageDescription')"
        media-type="image"
        @select="handleMediaSelect"
      />
    </div>
  </BaseProperty>
</template>
