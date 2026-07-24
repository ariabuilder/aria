import { ref, watch } from "vue";

import { acquireThumbnailFetchSlot } from "@/features/Studio/pages/composables/thumbnailFetchQueue";
import { isThumbnailCaptureSupported } from "@/features/Studio/pages/utils/deviceCapabilities";
import {
  buildComponentThumbnailPreviewUrl,
  buildStoredComponentThumbnailPreviewUrl,
} from "./componentPreviewUrls";
import {
  enqueueComponentThumbnailGeneration,
  getComponentGeneratedThumbnailUrl,
  componentThumbnailGenerationEpoch,
} from "./componentThumbnailBackgroundQueue";
import {
  hasCurrentComponentThumbnailPreset,
  markCurrentComponentThumbnailPreset,
} from "./componentThumbnailPreset";

export interface UseComponentPreviewThumbnailProps {
  componentId: string;
  inert?: boolean;
  thumbnailUrl?: string | null;
  thumbnailRefreshToken?: string | null;
  updatedAt?: string | null;
}

export interface ComponentPreviewThumbnailHost {
  iframeSrc: { value: string };
  iframeSrcDoc: { value: string };
  isRendered: { value: boolean };
  hasError: { value: boolean };
}

export type ComponentThumbnailStatus =
  | "idle"
  | "loadingCached"
  | "regenerating"
  | "ready"
  | "failed";

interface LoadThumbnailPreviewOptions {
  forceGenerate?: boolean;
}

interface ResolvedThumbnailPreviewRequest {
  props: UseComponentPreviewThumbnailProps;
  generatedUrl: string;
  previewUrl: string;
  shouldForceGenerate: boolean;
  key: string;
}

const BLANK_THUMBNAIL_SAMPLE_WIDTH = 48;
const BLANK_THUMBNAIL_SAMPLE_HEIGHT = 27;
const BLANK_THUMBNAIL_WHITE_MIN_LUMINANCE = 252;
const BLANK_THUMBNAIL_WHITE_MAX_RANGE = 2;

function normalizeThumbnailUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

/** Test-only reset */
export function resetComponentPreviewThumbnailRepairState(): void {
  /* no-op: repair state is tracked per composable instance */
}

export function useComponentPreviewThumbnail(options: {
  props:
    | UseComponentPreviewThumbnailProps
    | (() => UseComponentPreviewThumbnailProps);
  host: ComponentPreviewThumbnailHost;
}) {
  const { host } = options;

  function resolveProps(): UseComponentPreviewThumbnailProps {
    return typeof options.props === "function" ? options.props() : options.props;
  }

  const previewImageSrc = ref("");
  const generatedThumbnailUrl = ref("");
  const isGenerating = ref(false);
  const hasAttemptedThumbnailGeneration = ref(false);
  const status = ref<ComponentThumbnailStatus>("idle");
  let previewObjectUrl: string | null = null;
  let activeLoadKey = "";
  let activeLoadPromise: Promise<void> | null = null;

  function releasePreviewObjectUrl(): void {
    if (!previewObjectUrl) {
      return;
    }

    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  function setPreviewImageSource(source: unknown): boolean {
    const normalizedSource = normalizeThumbnailUrl(source);
    if (!normalizedSource) {
      releasePreviewObjectUrl();
      previewImageSrc.value = "";
      return false;
    }

    if (normalizedSource.startsWith("blob:")) {
      if (normalizedSource !== previewObjectUrl) {
        releasePreviewObjectUrl();
      }
      previewObjectUrl = normalizedSource;
    } else {
      releasePreviewObjectUrl();
    }

    previewImageSrc.value = normalizedSource;
    return true;
  }

  async function resolveThumbnailImageSource(
    thumbnailPreviewUrl: string,
  ): Promise<string | null> {
    if (!thumbnailPreviewUrl) {
      return null;
    }

    if (thumbnailPreviewUrl.startsWith("data:")) {
      return thumbnailPreviewUrl;
    }

    try {
      const response = await acquireThumbnailFetchSlot(() =>
        fetch(thumbnailPreviewUrl, {
          credentials: "same-origin",
        }),
      );

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      if (blob.size <= 0 || !blob.type.startsWith("image/")) {
        return null;
      }

      if (await isVisuallyEmptyImageBlob(blob)) {
        return null;
      }

      releasePreviewObjectUrl();
      previewObjectUrl = URL.createObjectURL(blob);
      return previewObjectUrl;
    } catch {
      return null;
    }
  }

  async function isVisuallyEmptyImageBlob(blob: Blob): Promise<boolean> {
    if (
      typeof globalThis.createImageBitmap !== "function" ||
      typeof document === "undefined"
    ) {
      return false;
    }

    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await globalThis.createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      const width = Math.min(BLANK_THUMBNAIL_SAMPLE_WIDTH, bitmap.width);
      const height = Math.min(BLANK_THUMBNAIL_SAMPLE_HEIGHT, bitmap.height);

      if (width <= 0 || height <= 0) {
        return true;
      }

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        return false;
      }

      context.drawImage(
        bitmap,
        0,
        0,
        bitmap.width,
        bitmap.height,
        0,
        0,
        width,
        height,
      );
      const { data } = context.getImageData(0, 0, width, height);
      let opaquePixels = 0;
      let minLuminance = 255;
      let maxLuminance = 0;

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3] ?? 0;
        if (alpha < 8) {
          continue;
        }

        const luminance =
          ((data[index] ?? 0) + (data[index + 1] ?? 0) + (data[index + 2] ?? 0)) /
          3;
        minLuminance = Math.min(minLuminance, luminance);
        maxLuminance = Math.max(maxLuminance, luminance);
        opaquePixels += 1;
      }

      return (
        opaquePixels === 0 ||
        (minLuminance >= BLANK_THUMBNAIL_WHITE_MIN_LUMINANCE &&
          maxLuminance - minLuminance <= BLANK_THUMBNAIL_WHITE_MAX_RANGE)
      );
    } catch {
      return false;
    } finally {
      bitmap?.close();
    }
  }

  function applyThumbnailImageSource(source: unknown): boolean {
    if (!setPreviewImageSource(source)) {
      return false;
    }
    host.iframeSrc.value = "";
    host.iframeSrcDoc.value = "";
    host.isRendered.value = true;
    host.hasError.value = false;
    status.value = "ready";
    return true;
  }

  function settleFailed(): void {
    host.isRendered.value = false;
    host.hasError.value = true;
    status.value = "failed";
  }

  function needsPresetRegeneration(
    props: UseComponentPreviewThumbnailProps,
  ): boolean {
    return (
      Boolean(props.thumbnailUrl) &&
      !hasCurrentComponentThumbnailPreset({
        componentId: props.componentId,
        updatedAt: props.updatedAt,
        thumbnailUrl: props.thumbnailUrl,
      })
    );
  }

  function resolveThumbnailPreviewRequest(
    props: UseComponentPreviewThumbnailProps,
    options: LoadThumbnailPreviewOptions,
  ): ResolvedThumbnailPreviewRequest {
    const generatedUrl =
      normalizeThumbnailUrl(getComponentGeneratedThumbnailUrl(props.componentId)) ||
      normalizeThumbnailUrl(generatedThumbnailUrl.value) ||
      "";
    const previewUrl = buildComponentThumbnailPreviewUrl(
      {
        componentId: props.componentId,
        thumbnailUrl: props.thumbnailUrl,
        thumbnailRefreshToken: props.thumbnailRefreshToken,
        inert: props.inert,
      },
      generatedUrl,
    ) ||
      buildStoredComponentThumbnailPreviewUrl({
        componentId: props.componentId,
        thumbnailRefreshToken: props.thumbnailRefreshToken,
        inert: props.inert,
      });
    const shouldForceGenerate =
      options.forceGenerate || needsPresetRegeneration(props);

    return {
      props,
      generatedUrl,
      previewUrl,
      shouldForceGenerate,
      key: [
        props.componentId,
        props.thumbnailUrl ?? "",
        props.thumbnailRefreshToken ?? "",
        props.updatedAt ?? "",
        generatedUrl,
        previewUrl,
        shouldForceGenerate ? "force" : "cache",
      ].join("\n"),
    };
  }

  async function enqueueThumbnailGeneration(
    props: UseComponentPreviewThumbnailProps,
    options: LoadThumbnailPreviewOptions & { force?: boolean } = {},
  ): Promise<boolean> {
    if (!props.componentId || !isThumbnailCaptureSupported()) {
      return false;
    }

    const force =
      options.force ??
      options.forceGenerate ??
      needsPresetRegeneration(props);

    status.value = "regenerating";
    host.hasError.value = false;
    isGenerating.value = true;

    try {
      const generatedUrl = normalizeThumbnailUrl(
        await enqueueComponentThumbnailGeneration(props.componentId, {
          force,
        }),
      );

      if (!generatedUrl) {
        return false;
      }

      if (force && props.thumbnailUrl) {
        markCurrentComponentThumbnailPreset({
          componentId: props.componentId,
          updatedAt: props.updatedAt,
        });
      }

      const latestGeneratedUrl =
        normalizeThumbnailUrl(getComponentGeneratedThumbnailUrl(props.componentId)) ||
        generatedUrl;
      generatedThumbnailUrl.value = latestGeneratedUrl;
      return applyThumbnailImageSource(latestGeneratedUrl);
    } finally {
      isGenerating.value = false;
    }
  }

  async function loadThumbnailPreview(
    options: LoadThumbnailPreviewOptions = {},
  ): Promise<void> {
    const props = resolveProps();

    if (!props.inert) {
      return;
    }

    const request = resolveThumbnailPreviewRequest(props, options);

    if (activeLoadPromise && activeLoadKey === request.key) {
      return await activeLoadPromise;
    }

    activeLoadKey = request.key;
    activeLoadPromise = loadResolvedThumbnailPreview(request).finally(() => {
      if (activeLoadPromise && activeLoadKey === request.key) {
        activeLoadPromise = null;
        activeLoadKey = "";
      }
    });

    return await activeLoadPromise;
  }

  async function loadResolvedThumbnailPreview(
    request: ResolvedThumbnailPreviewRequest,
  ): Promise<void> {
    const {
      props,
      generatedUrl: resolvedGeneratedUrl,
      previewUrl: thumbnailPreviewUrl,
      shouldForceGenerate,
    } = request;
    host.hasError.value = false;

    if (thumbnailPreviewUrl && !shouldForceGenerate) {
      status.value = "loadingCached";
      const resolvedSource =
        await resolveThumbnailImageSource(thumbnailPreviewUrl);

      if (resolvedSource) {
        if (resolvedGeneratedUrl) {
          generatedThumbnailUrl.value = resolvedGeneratedUrl;
        }

        if (!applyThumbnailImageSource(resolvedSource)) {
          settleFailed();
          return;
        }
        markCurrentComponentThumbnailPreset({
          componentId: props.componentId,
          updatedAt: props.updatedAt,
        });
        return;
      }
    }

    if (
      !props.componentId ||
      !isThumbnailCaptureSupported() ||
      (!shouldForceGenerate && hasAttemptedThumbnailGeneration.value)
    ) {
      settleFailed();
      return;
    }

    hasAttemptedThumbnailGeneration.value = true;

    if (await enqueueThumbnailGeneration(props, { force: shouldForceGenerate })) {
      return;
    }

    settleFailed();
  }

  async function handlePreviewImageError(): Promise<void> {
    releasePreviewObjectUrl();
    previewImageSrc.value = "";
    host.isRendered.value = false;

    const props = resolveProps();

    if (hasAttemptedThumbnailGeneration.value) {
      settleFailed();
      return;
    }

    hasAttemptedThumbnailGeneration.value = true;

    if (await enqueueThumbnailGeneration(props, { force: true })) {
      return;
    }

    settleFailed();
  }

  function clearThumbnailState(options: { keepImage?: boolean } = {}): void {
    activeLoadKey = "";
    activeLoadPromise = null;
    generatedThumbnailUrl.value = "";
    isGenerating.value = false;
    hasAttemptedThumbnailGeneration.value = false;
    status.value = "idle";

    if (!options.keepImage) {
      releasePreviewObjectUrl();
      previewImageSrc.value = "";
      host.isRendered.value = false;
      host.hasError.value = false;
    }
  }

  watch(
    () => componentThumbnailGenerationEpoch.value[resolveProps().componentId] ?? 0,
    (epoch, previousEpoch) => {
      const componentId = resolveProps().componentId;
      if (!componentId || epoch === previousEpoch || epoch === 0) {
        return;
      }

      if (isGenerating.value) {
        return;
      }

      const latestGeneratedUrl = normalizeThumbnailUrl(
        getComponentGeneratedThumbnailUrl(componentId),
      );
      if (
        latestGeneratedUrl &&
        (latestGeneratedUrl === generatedThumbnailUrl.value ||
          latestGeneratedUrl === previewImageSrc.value)
      ) {
        return;
      }

      clearThumbnailState();
      void loadThumbnailPreview();
    },
  );

  return {
    previewImageSrc,
    generatedThumbnailUrl,
    isGenerating,
    status,
    loadThumbnailPreview,
    handlePreviewImageError,
    releasePreviewObjectUrl,
    clearThumbnailState,
  };
}
