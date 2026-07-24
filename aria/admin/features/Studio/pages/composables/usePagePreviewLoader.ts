import { computed, ref } from "vue";
import { actions } from "astro:actions";
import type { BuilderNode } from "@/lib/types/nodes";
import type { SiteSettings } from "@/lib/storage/adapter";
import {
  unwrapPagePreviewComposeResult,
  unwrapPagePreviewRenderStylesResult,
  unwrapPagePreviewSettingsResult,
  type PagePreviewRenderStylesData,
} from "./pagePreviewActionResults";
import { loadCachedSnapshotHtml } from "./pagePreviewSnapshotCache";
import {
  generateLiveHtml,
  normalizePreviewNodes,
} from "./pagePreviewLiveHtml";
import { buildSnapshotPreviewUrl } from "./pagePreviewUrls";
import {
  EMPTY_PAGE_PREVIEW_RENDER_STYLES,
  type PagePreviewFrameProps,
  type PagePreviewHost,
} from "./pagePreviewTypes";
import type { PagePreviewThumbnailApi } from "./usePagePreviewThumbnail";
import { isIOS } from "../utils/deviceCapabilities";
import { resolveBrowserIconRenderResources } from "@/lib/iconRenderResources";

export interface UsePagePreviewLoaderOptions {
  props: PagePreviewFrameProps;
  host: PagePreviewHost;
  thumbnail: PagePreviewThumbnailApi;
}

export function usePagePreviewLoader(options: UsePagePreviewLoaderOptions) {
  const { props, host, thumbnail } = options;

  const isLoading = ref(false);
  const pageNodes = ref<BuilderNode[]>([]);
  const siteSettings = ref<SiteSettings | null>(null);
  const previewRenderStyles = ref<PagePreviewRenderStylesData>({
    ...EMPTY_PAGE_PREVIEW_RENDER_STYLES,
  });
  const pageCssVariables = ref<Record<string, string>>({});

  const isLivePublicPagePreview = computed(() => props.itemType === "page");
  const usesThumbnailImagePreview = computed(
    () => Boolean(props.inert && props.itemType === "page"),
  );
  const isIOSDevice = computed(() => isIOS());
  let loadGeneration = 0;

  function handleIframeLoad(): void {
    host.isFrameReady.value = true;
  }

  async function renderLivePreview(
    expectedGeneration = loadGeneration,
  ): Promise<void> {
    if (pageNodes.value.length === 0) return;

    host.isFrameReady.value = false;
    thumbnail.releasePreviewObjectUrl();
    thumbnail.previewImageSrc.value = "";
    host.iframeSrc.value = "";
    const iconResources = await resolveBrowserIconRenderResources(
      normalizePreviewNodes(pageNodes.value),
    );
    if (expectedGeneration !== loadGeneration) return;
    host.iframeSrcDoc.value = generateLiveHtml({
      nodes: normalizePreviewNodes(pageNodes.value),
      settings: siteSettings.value,
      renderStyles: previewRenderStyles.value,
      pageCssVariables: pageCssVariables.value,
      iconResources,
    });
    host.isRendered.value = true;
  }

  async function loadPreview(): Promise<void> {
    if (isLoading.value || host.isRendered.value) return;

    const generation = loadGeneration + 1;
    loadGeneration = generation;
    const loadSlug = props.pageSlug;
    const loadSnapshotUrl = props.snapshotUrl ?? "";
    isLoading.value = true;
    host.hasError.value = false;
    host.isFrameReady.value = false;

    try {
      if (usesThumbnailImagePreview.value) {
        await thumbnail.loadThumbnailPreview();
        return;
      }

      if (isIOSDevice.value && props.inert) {
        return;
      }

      if (isLivePublicPagePreview.value) {
        const snapshotUrl = buildSnapshotPreviewUrl(props);

        const { html } = await loadCachedSnapshotHtml(snapshotUrl, async () => {
          const response = await fetch(snapshotUrl, {
            credentials: "same-origin",
            headers: {
              Accept: "text/html",
            },
          });

          if (!response.ok) {
            throw new Error(
              `Failed to fetch snapshot HTML: ${response.status}`,
            );
          }

          return await response.text();
        });

        if (
          generation !== loadGeneration ||
          props.pageSlug !== loadSlug ||
          (props.snapshotUrl ?? "") !== loadSnapshotUrl
        ) {
          return;
        }

        host.iframeSrc.value = "";
        host.iframeSrcDoc.value = html;
        host.isRendered.value = true;
        return;
      }

      const [composeResult, settingsResult, renderStylesResult] =
        await Promise.all([
          actions.compose({
            pageSlug: props.pageSlug,
            itemType: props.itemType,
          }),
          actions.settings.get(),
          actions.styles.getRenderStyles(),
        ]);

      if (generation !== loadGeneration || props.pageSlug !== loadSlug) {
        return;
      }

      if (composeResult?.error) {
        throw new Error(composeResult.error.message || "Failed to load page");
      }

      const composeData = unwrapPagePreviewComposeResult(
        composeResult,
        "Failed to load page",
        {
          source: "PagePreviewFrame.loadPreview.compose",
          pageSlug: props.pageSlug,
          itemType: props.itemType,
        },
      );

      if (!composeData.success) {
        throw new Error(composeData.error);
      }

      pageNodes.value = composeData.data.pageBlocks;
      pageCssVariables.value = composeData.data.pageCssVariables;

      const parsedSettings = unwrapPagePreviewSettingsResult(
        settingsResult,
        "Failed to load preview settings",
        {
          source: "PagePreviewFrame.loadPreview.settings",
          pageSlug: props.pageSlug,
          itemType: props.itemType,
        },
      );
      siteSettings.value = parsedSettings.data;

      const parsedRenderStyles = unwrapPagePreviewRenderStylesResult(
        renderStylesResult,
        "Failed to load preview CSS",
        {
          source: "PagePreviewFrame.loadPreview.renderStyles",
          pageSlug: props.pageSlug,
          itemType: props.itemType,
        },
      );
      previewRenderStyles.value = parsedRenderStyles.data;

      await renderLivePreview(generation);
    } catch (error) {
      if (generation !== loadGeneration || props.pageSlug !== loadSlug) {
        return;
      }

      console.error(
        `[PagePreviewFrame] Failed to load preview for ${props.pageSlug}:`,
        error,
      );
      host.hasError.value = true;
    } finally {
      if (generation === loadGeneration && props.pageSlug === loadSlug) {
        isLoading.value = false;
      }
    }
  }

  function resetPreviewState(wasShowingThumbnail: boolean): void {
    loadGeneration += 1;
    host.isRendered.value = false;
    host.isFrameReady.value = false;
    pageNodes.value = [];
    host.iframeSrc.value = "";
    host.iframeSrcDoc.value = "";
    thumbnail.clearThumbnailState({ keepImage: wasShowingThumbnail });
  }

  return {
    isLoading,
    pageNodes,
    siteSettings,
    previewRenderStyles,
    pageCssVariables,
    usesThumbnailImagePreview,
    loadPreview,
    renderLivePreview,
    resetPreviewState,
    handleIframeLoad,
  };
}

export type PagePreviewLoaderApi = ReturnType<typeof usePagePreviewLoader>;
