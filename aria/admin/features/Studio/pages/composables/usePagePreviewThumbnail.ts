import { ref, watch } from "vue";
import { acquireThumbnailFetchSlot } from "./thumbnailFetchQueue";
import { buildThumbnailPreviewUrl } from "./pagePreviewUrls";
import {
  enqueuePageThumbnailGeneration,
  getPageGeneratedThumbnailUrl,
  pageThumbnailGenerationEpoch,
} from "./pageThumbnailBackgroundQueue";
import { isThumbnailCaptureSupported } from "../utils/deviceCapabilities";
import type { PagePreviewFrameProps, PagePreviewHost } from "./pagePreviewTypes";

export interface UsePagePreviewThumbnailOptions {
  props: PagePreviewFrameProps;
  host: PagePreviewHost;
}

export function usePagePreviewThumbnail(options: UsePagePreviewThumbnailOptions) {
  const { props, host } = options;

  const previewImageSrc = ref("");
  const generatedThumbnailUrl = ref("");
  const hasAttemptedThumbnailGeneration = ref(false);
  let previewObjectUrl: string | null = null;

  function releasePreviewObjectUrl(): void {
    if (!previewObjectUrl) {
      return;
    }

    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  function setPreviewImageSource(source: string): void {
    if (source.startsWith("blob:")) {
      if (source !== previewObjectUrl) {
        releasePreviewObjectUrl();
      }
      previewObjectUrl = source;
    } else {
      releasePreviewObjectUrl();
    }

    previewImageSrc.value = source;
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
      if (blob.size <= 0) {
        return null;
      }

      releasePreviewObjectUrl();
      previewObjectUrl = URL.createObjectURL(blob);
      return previewObjectUrl;
    } catch {
      return null;
    }
  }

  function applyThumbnailImageSource(source: string): void {
    setPreviewImageSource(source);
    host.iframeSrc.value = "";
    host.iframeSrcDoc.value = "";
    host.isRendered.value = true;
    host.hasError.value = false;
  }

  async function loadThumbnailPreview(
    options: { forceGenerate?: boolean } = {},
  ): Promise<void> {
    const resolvedGeneratedUrl =
      generatedThumbnailUrl.value ||
      (props.pageId ? getPageGeneratedThumbnailUrl(props.pageId) : "");

    const thumbnailPreviewUrl = buildThumbnailPreviewUrl(
      props,
      resolvedGeneratedUrl,
    );

    if (thumbnailPreviewUrl && !options.forceGenerate) {
      const resolvedSource =
        await resolveThumbnailImageSource(thumbnailPreviewUrl);

      if (resolvedSource) {
        if (resolvedGeneratedUrl) {
          generatedThumbnailUrl.value = resolvedGeneratedUrl;
        }

        applyThumbnailImageSource(resolvedSource);
        return;
      }
    }

    if (
      !props.pageId ||
      !isThumbnailCaptureSupported() ||
      (!options.forceGenerate && hasAttemptedThumbnailGeneration.value)
    ) {
      host.isRendered.value = false;
      host.hasError.value = Boolean(thumbnailPreviewUrl);
      return;
    }

    hasAttemptedThumbnailGeneration.value = true;

    const generatedUrl = await enqueuePageThumbnailGeneration({
      pageId: props.pageId,
      pageSlug: props.pageSlug,
      stage: props.pageStatus === "published" ? "published" : "draft",
      force: options.forceGenerate,
    });

    if (generatedUrl) {
      generatedThumbnailUrl.value = generatedUrl;
      applyThumbnailImageSource(generatedUrl);
      return;
    }

    host.isRendered.value = false;
    host.hasError.value = Boolean(thumbnailPreviewUrl);
  }

  function handlePreviewImageError(): void {
    host.isFrameReady.value = false;
    releasePreviewObjectUrl();
    previewImageSrc.value = "";
    host.isRendered.value = false;
    host.hasError.value = true;
  }

  function clearThumbnailState(options: { keepImage?: boolean } = {}): void {
    generatedThumbnailUrl.value = "";
    hasAttemptedThumbnailGeneration.value = false;

    if (!options.keepImage) {
      releasePreviewObjectUrl();
      previewImageSrc.value = "";
    }
  }

  if (props.pageId) {
    watch(
      () => pageThumbnailGenerationEpoch.value[props.pageId ?? ""] ?? 0,
      (epoch, previousEpoch) => {
        if (!props.pageId || epoch === previousEpoch || epoch === 0) {
          return;
        }

        clearThumbnailState();
        void loadThumbnailPreview();
      },
    );
  }

  return {
    previewImageSrc,
    generatedThumbnailUrl,
    loadThumbnailPreview,
    handlePreviewImageError,
    releasePreviewObjectUrl,
    clearThumbnailState,
    setPreviewImageSource,
  };
}

export type PagePreviewThumbnailApi = ReturnType<typeof usePagePreviewThumbnail>;
