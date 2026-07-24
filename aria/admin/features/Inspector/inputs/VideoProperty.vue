<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import {
  resolveImageBindingSourceMode,
  useInspectorPropBinding,
} from "../composables/useInspectorPropBinding";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import BaseProperty from "./BaseProperty.vue";
import LinkProperty from "./LinkProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  DEFAULT_VIDEO,
  VideoPreloadSchema,
  VideoAspectRatioSchema,
  VIDEO_ASPECT_RATIO_LABELS,
  VIDEO_ASPECT_RATIOS,
  type VideoPreload,
  type VideoAspectRatio,
} from "../schemas/video.schema";
import {
  isExternalImage,
  isUrlReferencedImage,
} from "../schemas/image.schema";
import {
  DEFAULT_POSITION_VALUE,
  normalizePositionValue,
} from "../constants/positionOptions";
import InspectorPositionGridPicker from "./InspectorPositionGridPicker.vue";
import { ImageFitSchema } from "../schemas/image.schema";
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

const VIDEO_STYLE_KEYS = ["objectFit", "objectPosition", "aspectRatio"] as const;

const VIDEO_PRELOAD_OPTIONS: Array<{ value: VideoPreload; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "metadata", label: "Metadata" },
  { value: "none", label: "None" },
];

type VideoSourceMode = "media" | "url" | "collection";

const VIDEO_SOURCE_MODE_OPTIONS: Array<{
  value: VideoSourceMode;
  label: string;
}> = [
  { value: "media", label: "Media" },
  { value: "url", label: "URL" },
  { value: "collection", label: "Collection" },
];

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
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

function videoSourceModeLabel(value: VideoSourceMode): string {
  return t(
    {
      media: "inspector.media.source.media",
      url: "inspector.media.source.url",
      collection: "inspector.media.source.collection",
    }[value],
  );
}

function videoFitLabel(value: "cover" | "contain" | "fill" | "none" | "scale-down"): string {
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
const { selectedNode, selectedNodeId, breakpointName, saveProperty } =
  propertySave;
const styleTarget = useInspectorStyleTarget({ propertySave });
const videoOverrides = useInspectorPropertyOverrides({
  propertyKeys: VIDEO_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget,
});
const { safeParse } = usePropertySchema();

const pageBlocks = useInjectedPageBlocks();
const stageIframeRef = useInjectedStageIframeRef();

// Local state for editing
const src = ref("");
const poster = ref("");
const alt = ref("");
const autoplay = ref(false);
const loop = ref(false);
const muted = ref(false);
const controls = ref(true);
const playsinline = ref(false);
const preload = ref<VideoPreload>("metadata");
const aspectRatio = ref<VideoAspectRatio>(DEFAULT_VIDEO.aspectRatio ?? "16:9");
const objectFit = ref<"cover" | "contain" | "fill" | "none" | "scale-down">(
  "cover",
);
const objectPosition = ref(DEFAULT_POSITION_VALUE);
const videoSourceMode = ref<VideoSourceMode>("media");

const srcBinding = useInspectorPropBinding({
  propName: "src",
  propType: "string",
  value: src,
});
const posterBinding = useInspectorPropBinding({
  propName: "poster",
  propType: "string",
  value: poster,
});

const videoSourceModeOptions = computed(() =>
  srcBinding.hasCmsContext.value
    ? VIDEO_SOURCE_MODE_OPTIONS
    : VIDEO_SOURCE_MODE_OPTIONS.filter((option) => option.value !== "collection"),
);

const showStaticVideoSource = computed(
  () => videoSourceMode.value !== "collection",
);

const isSrcBindingReadOnly = computed(
  () => srcBinding.isReadOnly.value || videoSourceMode.value === "collection",
);

const showPosterFieldPicker = computed(
  () =>
    posterBinding.showFieldPicker.value &&
    (posterBinding.isBound.value ||
      srcBinding.propsEditor.isAssignedCmsTemplatePage.value),
);

watch(
  () => srcBinding.isBound.value,
  () => {
    syncVideoSourceModeFromState();
  },
);
const persistedVideoValues = ref({
  src: DEFAULT_VIDEO.src,
  poster: DEFAULT_VIDEO.poster,
  alt: DEFAULT_VIDEO.alt,
  autoplay: DEFAULT_VIDEO.autoplay,
  loop: DEFAULT_VIDEO.loop,
  muted: DEFAULT_VIDEO.muted,
  controls: DEFAULT_VIDEO.controls,
  playsinline: DEFAULT_VIDEO.playsinline,
  preload: DEFAULT_VIDEO.preload,
  aspectRatio: DEFAULT_VIDEO.aspectRatio,
});
const isDragging = ref(false);
const isVideoPickerOpen = ref(false);
const isPosterPickerOpen = ref(false);
const internalOpen = ref(props.defaultOpen);

const { on } = useSignals();
on("open-video-picker", () => {
  isVideoPickerOpen.value = true;
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
const hasVideoChanges = computed(
  () =>
    src.value.trim() !== DEFAULT_VIDEO.src ||
    poster.value.trim() !== DEFAULT_VIDEO.poster ||
    alt.value.trim() !== DEFAULT_VIDEO.alt ||
    autoplay.value !== DEFAULT_VIDEO.autoplay ||
    loop.value !== DEFAULT_VIDEO.loop ||
    muted.value !== DEFAULT_VIDEO.muted ||
    controls.value !== DEFAULT_VIDEO.controls ||
    playsinline.value !== DEFAULT_VIDEO.playsinline ||
    preload.value !== DEFAULT_VIDEO.preload ||
    videoOverrides.overrideBreakpointIds.value.length > 0,
);
const hasSelectedVideo = computed(() => src.value.trim().length > 0);
const hasSelectedPoster = computed(() => poster.value.trim().length > 0);
const videoSourceSummary = computed(() => {
  const value = src.value.trim();

  if (!value) {
    return videoSourceMode.value === "url"
      ? "Paste a hosted video URL"
      : "Choose from your media library";
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

async function resetCurrentBreakpointVideo(): Promise<void> {
  await videoOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );
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

function syncVideoState(
  node: { props?: Record<string, unknown> } | null,
): void {
  const nodeProps = node?.props ?? {};

  const nextSrc = typeof nodeProps.src === "string" ? nodeProps.src : "";
  const nextPoster =
    typeof nodeProps.poster === "string" ? nodeProps.poster : "";
  const nextAlt = typeof nodeProps.alt === "string" ? nodeProps.alt : "";
  const nextAutoplay = Boolean(nodeProps.autoplay);
  const nextLoop = Boolean(nodeProps.loop);
  const nextMuted = Boolean(nodeProps.muted);
  const nextControls = nodeProps.controls === false ? false : true;
  const nextPlaysinline = Boolean(nodeProps.playsinline);
  const nextPreload = VideoPreloadSchema.safeParse(
    nodeProps.preload,
  ).success
    ? (nodeProps.preload as VideoPreload)
    : "metadata";
  const parsedAspect = VideoAspectRatioSchema.safeParse(nodeProps.aspectRatio);
  const nextAspect = parsedAspect.success ? parsedAspect.data : (DEFAULT_VIDEO.aspectRatio ?? "16:9");

  src.value = nextSrc;
  poster.value = nextPoster;
  alt.value = nextAlt;
  autoplay.value = nextAutoplay;
  loop.value = nextLoop;
  muted.value = nextMuted;
  controls.value = nextControls;
  playsinline.value = nextPlaysinline;
  preload.value = nextPreload;
  aspectRatio.value = nextAspect;

  persistedVideoValues.value = {
    src: nextSrc,
    poster: nextPoster,
    alt: nextAlt,
    autoplay: nextAutoplay,
    loop: nextLoop,
    muted: nextMuted,
    controls: nextControls,
    playsinline: nextPlaysinline,
    preload: nextPreload,
    aspectRatio: nextAspect,
  };

  syncVideoSourceModeFromState();

  const fitValue =
    styleTarget.getStyleValue("objectFit", "cover", breakpointName.value) ??
    "cover";
  const positionValue =
    styleTarget.getStyleValue(
      "objectPosition",
      DEFAULT_POSITION_VALUE,
      breakpointName.value,
    ) ?? DEFAULT_POSITION_VALUE;
  const fitParsed = ImageFitSchema.safeParse(fitValue);
  objectFit.value = fitParsed.success ? fitParsed.data : "cover";
  objectPosition.value = normalizePositionValue(positionValue);

  const ratioValue =
    styleTarget.getStyleValue("aspectRatio", "", breakpointName.value);
  if (ratioValue) {
    const ratioParsed = VideoAspectRatioSchema.safeParse(
      ratioValue.replace("/", ":"),
    );
    if (ratioParsed.success) {
      aspectRatio.value = ratioParsed.data;
    }
  }

}

function tryHydrateFromNodeId(nodeId: string): boolean {
  const canonicalNode = findNodeById(pageBlocks.value || [], nodeId);
  const fallbackNode = canonicalNode || selectedNode.value || null;

  if (fallbackNode?.props) {
    syncVideoState(fallbackNode);
  }

  syncVideoStateFromCanvas(nodeId);

  return Boolean(src.value || poster.value);
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

function syncVideoStateFromCanvas(nodeId: string): void {
  const iframe = stageIframeRef.value as HTMLIFrameElement | null;
  const doc = iframe?.contentDocument;
  if (!doc) return;

  const container = doc.querySelector(
    `[data-aria-id="${nodeId}"]`,
  ) as HTMLElement | null;
  if (!container) return;

  const videoElement =
    container.tagName.toLowerCase() === "video"
      ? (container as HTMLVideoElement)
      : (container.querySelector("video") as HTMLVideoElement | null);

  if (!videoElement) return;

  const srcFromCanvas = videoElement.getAttribute("src") || "";
  const posterFromCanvas = videoElement.getAttribute("poster") || "";
  const altFromCanvas = videoElement.getAttribute("alt") || "";
  const autoplayFromCanvas = videoElement.hasAttribute("autoplay");
  const loopFromCanvas = videoElement.hasAttribute("loop");
  const mutedFromCanvas = videoElement.hasAttribute("muted");
  const controlsFromCanvas = videoElement.hasAttribute("controls");
  const playsinlineFromCanvas = videoElement.hasAttribute("playsinline");
  const preloadFromCanvas = videoElement.getAttribute("preload") || "";
  const fitFromCanvas =
    videoElement.style.objectFit || container.style.objectFit || "";
  const positionFromCanvas =
    videoElement.style.objectPosition || container.style.objectPosition || "";
  const aspectRatioFromCanvas =
    videoElement.style.aspectRatio || container.style.aspectRatio || "";

  if (!src.value && srcFromCanvas) {
    src.value = srcFromCanvas;
    persistedVideoValues.value.src = srcFromCanvas;
    syncVideoSourceModeFromState();
  }

  if (!poster.value && posterFromCanvas) {
    poster.value = posterFromCanvas;
    persistedVideoValues.value.poster = posterFromCanvas;
  }

  if (!alt.value && altFromCanvas) {
    alt.value = altFromCanvas;
    persistedVideoValues.value.alt = altFromCanvas;
  }

  if (!autoplay.value && autoplayFromCanvas) autoplay.value = true;
  if (!loop.value && loopFromCanvas) loop.value = true;
  if (!muted.value && mutedFromCanvas) muted.value = true;
  if (controls.value && !controlsFromCanvas) controls.value = false;
  if (!playsinline.value && playsinlineFromCanvas) playsinline.value = true;

  if (!preload.value && preloadFromCanvas) {
    const parsed = VideoPreloadSchema.safeParse(preloadFromCanvas);
    if (parsed.success) {
      preload.value = parsed.data;
    }
  }

  if (
    (objectFit.value === "cover" || !objectFit.value) &&
    (fitFromCanvas === "cover" ||
      fitFromCanvas === "contain" ||
      fitFromCanvas === "fill" ||
      fitFromCanvas === "none" ||
      fitFromCanvas === "scale-down")
  ) {
    const parsed = ImageFitSchema.safeParse(fitFromCanvas);
    if (parsed.success) {
      objectFit.value = parsed.data;
    }
  }

  if (
    (objectPosition.value === DEFAULT_POSITION_VALUE ||
      !objectPosition.value) &&
    positionFromCanvas
  ) {
    objectPosition.value = normalizePositionValue(positionFromCanvas);
  }

  if (aspectRatioFromCanvas) {
    const rawRatio = aspectRatioFromCanvas.replace("/", ":");
    const parsed = VideoAspectRatioSchema.safeParse(rawRatio);
    if (parsed.success) {
      aspectRatio.value = parsed.data;
    }
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
      syncVideoState(null);
      return;
    }

    hydrateWithRetry(nodeId);
  },
  { immediate: true },
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || !selectedNodeId.value) return;
    hydrateWithRetry(selectedNodeId.value);
  },
  { immediate: true },
);

function buildVideoCandidate(): Record<string, unknown> {
  return {
    src: src.value,
    poster: poster.value,
    alt: alt.value,
    autoplay: autoplay.value,
    loop: loop.value,
    muted: muted.value,
    controls: controls.value,
    playsinline: playsinline.value,
    preload: preload.value,
    objectFit: objectFit.value,
    objectPosition: objectPosition.value,
    aspectRatio: aspectRatio.value,
  };
}

async function saveVideoProp<K extends keyof typeof persistedVideoValues.value>(
  key: K,
  value: (typeof persistedVideoValues.value)[K],
): Promise<boolean> {
  if (!selectedNodeId.value) return false;

  const current = persistedVideoValues.value[key];
  if (current === value) return true;

  const candidate = buildVideoCandidate();
  const parsedVideo = safeParse("video", candidate);
  if (!("success" in parsedVideo) || !parsedVideo.success) return false;

  if (!props.currentItemType || !props.currentItemSlug) return false;

  const success = await saveProperty(
    key,
    value,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    persistedVideoValues.value = {
      ...persistedVideoValues.value,
      [key]: value,
    };

    if (key === "src") {
      syncVideoSourceModeFromState();
    }
  }

  return success;
}

function syncVideoSourceModeFromState(): void {
  videoSourceMode.value = resolveImageBindingSourceMode({
    isBound: srcBinding.isBound.value,
    src: src.value,
    isExternalUrl:
      isExternalImage(src.value) || isUrlReferencedImage(src.value),
  });
}

function handleVideoSourceModeChange(value: unknown): void {
  if (value !== "media" && value !== "url" && value !== "collection") {
    return;
  }

  if (value === "collection") {
    videoSourceMode.value = "collection";
    void srcBinding.enterCollectionMode();
    return;
  }

  if (videoSourceMode.value === "collection") {
    void srcBinding.leaveCollectionMode();
  }

  videoSourceMode.value = value;
}

async function handleSrcFieldSelect(fieldPath: string): Promise<void> {
  await srcBinding.bind(fieldPath);
  videoSourceMode.value = "collection";
}

async function handlePosterFieldSelect(fieldPath: string): Promise<void> {
  await posterBinding.bind(fieldPath);
}

async function clearVideoSource(): Promise<void> {
  await saveVideoProp("src", "");
  src.value = "";
}

async function clearPoster(): Promise<void> {
  await saveVideoProp("poster", "");
  poster.value = "";
}

async function toggleAutoplay(value: boolean): Promise<void> {
  autoplay.value = value;
  await saveVideoProp("autoplay", value);
}

async function toggleMuted(value: boolean): Promise<void> {
  muted.value = value;
  await saveVideoProp("muted", value);
}

async function toggleLoop(value: boolean): Promise<void> {
  loop.value = value;
  await saveVideoProp("loop", value);
}

async function toggleControls(value: boolean): Promise<void> {
  controls.value = value;
  await saveVideoProp("controls", value);
}

async function togglePlaysinline(value: boolean): Promise<void> {
  playsinline.value = value;
  await saveVideoProp("playsinline", value);
}

async function savePreload(value: unknown): Promise<void> {
  const parsed = VideoPreloadSchema.safeParse(value);
  if (!parsed.success) return;

  preload.value = parsed.data;
  await saveVideoProp("preload", parsed.data);
}

async function saveObjectFit(value: unknown): Promise<void> {
  const fitResult = ImageFitSchema.safeParse(value);
  if (!fitResult.success) return;

  const candidate = buildVideoCandidate();
  const parsedVideo = safeParse("video", candidate);
  if (!("success" in parsedVideo) || !parsedVideo.success) return;

  if (objectFit.value === fitResult.data) return;

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
}

async function saveObjectPosition(value: unknown): Promise<void> {
  if (typeof value !== "string") return;

  const nextPosition = normalizePositionValue(value);
  const candidate = buildVideoCandidate();
  const parsedVideo = safeParse("video", candidate);
  if (!("success" in parsedVideo) || !parsedVideo.success) return;

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
}

async function saveAspectRatio(value: unknown): Promise<void> {
  const nextValue = typeof value === "string" ? value : "";
  const parsed = VideoAspectRatioSchema.safeParse(nextValue);
  if (!parsed.success) return;

  if (aspectRatio.value === parsed.data) return;

  if (!hasSaveContext()) return;

  const success = await styleTarget.saveStyleProperty(
    "aspectRatio",
    parsed.data.replace(":", "/"),
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    aspectRatio.value = parsed.data;
  }
}

async function saveAlt(value: string): Promise<void> {
  await saveVideoProp("alt", value);
}

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  if (videoSourceMode.value !== "media") return;
  isDragging.value = true;
};

const handleDragLeave = () => {
  isDragging.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;

  if (videoSourceMode.value !== "media") return;

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith("video/")) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target?.result as string;
    videoSourceMode.value = "media";
    void saveVideoProp("src", dataUrl);
    src.value = dataUrl;
  };
  reader.readAsDataURL(file);
};

const handleVideoSelect = (asset: MediaAsset): void => {
  const mediaUrl = asset.deliveryUrl || asset.url;
  videoSourceMode.value = "media";
  void saveVideoProp("src", mediaUrl);
  src.value = mediaUrl;
};

const handlePosterSelect = (asset: MediaAsset): void => {
  const mediaUrl = asset.deliveryUrl || asset.url;
  void saveVideoProp("poster", mediaUrl);
  poster.value = mediaUrl;
};
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="hasVideoChanges"
    @update:open="sectionOpen = $event"
    title="Video"
    icon="video"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="videoOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="videoOverrides.currentBreakpointLabel.value"
        :show-reset="
          sectionOpen && videoOverrides.hasCurrentBreakpointOverride.value
        "
        reset-test-id="video-reset-breakpoint"
        @reset="void resetCurrentBreakpointVideo()"
      />
    </template>

    <div class="space-y-3">
      <!-- Source Mode -->
      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.source") }}</label>
        <Select
          data-testid="video-source-select"
          :model-value="videoSourceMode"
          @update:model-value="handleVideoSourceModeChange"
        >
          <SelectTrigger :class="SELECT_TRIGGER_CLASS">
            <SelectValue />
          </SelectTrigger>
          <SelectContent :class="SELECT_CONTENT_CLASS">
            <SelectItem
              v-for="option in videoSourceModeOptions"
              :key="option.value"
              :value="option.value"
              class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
            >
              {{ videoSourceModeLabel(option.value) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <InspectorPropBinding
        v-if="videoSourceMode === 'collection'"
        :model-value="srcBinding.boundPath.value"
        :groups="srcBinding.fieldGroups.value"
        :picker-mode="srcBinding.bindingPickerMode.value"
        :display-label="srcBinding.displayLabel.value"
        :disabled="srcBinding.pickerDisabled.value"
        :placeholder="t('variablePicker.chooseField')"
        @select="(path) => void handleSrcFieldSelect(path)"
        @clear="void srcBinding.clear()"
      />

      <!-- Video Preview / Drop Zone -->
      <div
        v-if="showStaticVideoSource"
        class="rounded-md border border-dashed border-border/50 p-2.5 space-y-2.5 bg-muted/20"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-0.5">
            <span
              class="text-[10px] uppercase tracking-wide text-muted-foreground"
              >{{ t("inspector.media.preview") }}</span
            >
            <p class="truncate text-xs font-medium text-foreground">
              {{ videoSourceSummary }}
            </p>
          </div>

          <div class="flex items-center gap-1">
            <Button
              v-if="videoSourceMode === 'media'"
              variant="outline"
              class="h-8 px-2 text-xs"
              :title="t('inspector.media.selectVideo')"
              @click="isVideoPickerOpen = true"
            >
              {{ hasSelectedVideo ? t("inspector.media.replace") : t("inspector.media.choose") }}
            </Button>
            <Button
              v-if="hasSelectedVideo"
              variant="ghost"
              class="h-8 px-2 text-xs"
              :title="t('inspector.media.clearVideo')"
              @click="void clearVideoSource()"
            >
              {{ t("common.clear") }}
            </Button>
          </div>
        </div>

        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          :class="[
            'border rounded-md overflow-hidden transition-colors h-28 flex items-center justify-center',
            isDragging && videoSourceMode === 'media'
              ? 'border-primary/60 bg-primary/5'
              : 'border-border/50 bg-background/60',
          ]"
        >
          <video
            v-if="src"
            :src="src"
            :poster="poster || undefined"
            :alt="alt || t('inspector.media.selectedVideo')"
            class="h-full w-full object-cover"
            :style="{ objectFit, objectPosition }"
            muted
            playsinline
          />
          <div v-else class="px-4 text-center">
            <p class="text-xs text-muted-foreground">
              {{
                videoSourceMode === "media"
                  ? t("inspector.media.videoDropHint")
                  : t("inspector.media.videoUrlHint")
              }}
            </p>
            <p class="mt-1 text-[10px] text-muted-foreground/80">
              {{
                videoSourceMode === "media"
                  ? t("inspector.media.managedHint")
                  : t("inspector.media.directVideoHint")
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- URL Input -->
      <div v-if="videoSourceMode === 'url'" :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.url") }}</label>
        <div class="space-y-1.5">
          <Input
            data-testid="video-source-url-input"
            v-model="src"
            @blur="() => saveVideoProp('src', src)"
            placeholder="https://..."
            :class="INPUT_CLASS"
            :disabled="isPanelDisabled || isSrcBindingReadOnly"
          />
        </div>
      </div>

      <!-- Poster Image -->
      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.poster") }}</label>
        <div class="space-y-1.5">
          <InspectorPropBinding
            v-if="showPosterFieldPicker"
            :model-value="posterBinding.boundPath.value"
            :groups="posterBinding.fieldGroups.value"
            :picker-mode="posterBinding.bindingPickerMode.value"
            :display-label="posterBinding.displayLabel.value"
            :disabled="posterBinding.pickerDisabled.value"
            :placeholder="t('variablePicker.chooseField')"
            @select="(path) => void handlePosterFieldSelect(path)"
            @clear="void posterBinding.clear()"
          />
          <div
            v-if="!posterBinding.isBound.value"
            class="flex items-center gap-1.5"
          >
            <Input
              data-testid="video-poster-input"
              v-model="poster"
              @blur="() => saveVideoProp('poster', poster)"
              :placeholder="t('inspector.media.posterUrl')"
              :class="[INPUT_CLASS, 'flex-1']"
              :disabled="isPanelDisabled || posterBinding.isReadOnly.value"
            />
            <Button
              variant="outline"
              class="h-9 px-2 text-xs shrink-0"
              :title="t('inspector.media.selectPoster')"
              @click="isPosterPickerOpen = true"
            >
              {{ hasSelectedPoster ? t("inspector.media.replace") : t("inspector.media.choose") }}
            </Button>
            <Button
              v-if="hasSelectedPoster"
              variant="ghost"
              class="h-9 px-2 text-xs shrink-0"
              :title="t('inspector.media.clearPoster')"
              @click="void clearPoster()"
            >
              {{ t("common.clear") }}
            </Button>
          </div>
        </div>
      </div>

      <!-- Playback Toggles -->
      <div
        class="rounded-md border border-dashed border-border/50 p-2.5 space-y-2 bg-muted/20"
      >
        <p
          class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1"
        >
          {{ t("inspector.video.playback") }}
        </p>

        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.video.autoplay") }}</label>
            <Switch
              data-testid="video-autoplay-toggle"
              :model-value="autoplay"
              @update:model-value="toggleAutoplay(Boolean($event))"
              :disabled="isPanelDisabled"
            />
          </div>

          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.video.muted") }}</label>
            <Switch
              data-testid="video-muted-toggle"
              :model-value="muted"
              @update:model-value="toggleMuted(Boolean($event))"
              :disabled="isPanelDisabled"
            />
          </div>

          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.video.loop") }}</label>
            <Switch
              data-testid="video-loop-toggle"
              :model-value="loop"
              @update:model-value="toggleLoop(Boolean($event))"
              :disabled="isPanelDisabled"
            />
          </div>

          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.video.controls") }}</label>
            <Switch
              data-testid="video-controls-toggle"
              :model-value="controls"
              @update:model-value="toggleControls(Boolean($event))"
              :disabled="isPanelDisabled"
            />
          </div>

          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-foreground">{{ t("inspector.video.playsInline") }}</label>
            <Switch
              data-testid="video-playsinline-toggle"
              :model-value="playsinline"
              @update:model-value="togglePlaysinline(Boolean($event))"
              :disabled="isPanelDisabled"
            />
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 pt-1">
          <label class="text-xs text-foreground">{{ t("inspector.video.preload") }}</label>
          <Select
            data-testid="video-preload-select"
            :model-value="preload"
            @update:model-value="savePreload"
          >
            <SelectTrigger :class="[SELECT_TRIGGER_CLASS, 'w-32']">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="option in VIDEO_PRELOAD_OPTIONS"
                :key="option.value"
                :value="option.value"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ option.value === "auto" ? t("inspector.video.preload.auto") : option.value === "metadata" ? t("inspector.video.preload.metadata") : t("inspector.media.fit.none") }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- Alt Text -->
      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.alt") }}</label>
        <div class="space-y-1.5">
          <Input
            data-testid="video-alt-input"
            v-model="alt"
            @blur="() => saveAlt(alt)"
            :placeholder="t('inspector.media.describeVideo')"
            :class="INPUT_CLASS"
            :disabled="isPanelDisabled"
          />
        </div>
      </div>

      <!-- Link -->
      <div class="border-t border-dashed border-border/50 pt-3">
        <LinkProperty
          embedded
          :current-item-type="props.currentItemType"
          :current-item-slug="props.currentItemSlug"
        />
      </div>

      <!-- Display (Responsive Styles) -->
      <div class="rounded-md space-y-2.5 bg-muted/20">
        <p
          class="text-[10px] uppercase tracking-wide text-muted-foreground px-2 pt-2"
        >
          {{ t("inspector.video.display") }}
        </p>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.video.ratio") }}</label>
          <Select
            data-testid="video-aspect-ratio-select"
            :model-value="aspectRatio"
            @update:model-value="saveAspectRatio"
          >
            <SelectTrigger :class="SELECT_TRIGGER_CLASS">
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="SELECT_CONTENT_CLASS">
              <SelectItem
                v-for="ar in VIDEO_ASPECT_RATIOS"
                :key="ar"
                :value="ar"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ VIDEO_ASPECT_RATIO_LABELS[ar] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.scale") }}</label>
          <Select
            data-testid="video-object-fit-select"
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
                {{ videoFitLabel("cover") }}
              </SelectItem>
              <SelectItem
                value="contain"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ videoFitLabel("contain") }}
              </SelectItem>
              <SelectItem
                value="scale-down"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ videoFitLabel("scale-down") }}
              </SelectItem>
              <SelectItem
                value="fill"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ videoFitLabel("fill") }}
              </SelectItem>
              <SelectItem
                value="none"
                class="pl-2 pr-6 text-xs text-muted-foreground focus:bg-sidebar-80 focus:text-foreground data-[state=checked]:text-primary"
              >
                {{ videoFitLabel("none") }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.media.position") }}</label>
          <InspectorPositionGridPicker
            data-testid="video-object-position-select"
            :model-value="objectPosition"
            preview-key-prefix="video-position"
            @update:model-value="saveObjectPosition"
          />
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
        v-model:open="isVideoPickerOpen"
        :title="t('inspector.media.selectVideo')"
        :description="t('inspector.media.selectVideoDescription')"
        media-type="video"
        @select="handleVideoSelect"
      />

      <MediaPickerDialog
        v-model:open="isPosterPickerOpen"
        :title="t('inspector.media.selectPoster')"
        :description="t('inspector.media.selectPosterDescription')"
        media-type="image"
        @select="handlePosterSelect"
      />
    </div>
  </BaseProperty>
</template>
