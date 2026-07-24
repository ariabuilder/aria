import { ref, type Ref } from "vue";
import { actions } from "astro:actions";

import type { BuilderNode } from "@/lib/types/nodes";
import type { SiteSettings } from "@/lib/storage/adapter";
import {
  EMPTY_PAGE_PREVIEW_RENDER_STYLES,
} from "@/features/Studio/pages/composables/pagePreviewTypes";
import { generateComponentIsolateHtml } from "./componentPreviewLiveHtml";
import { normalizePreviewNodes } from "@/features/Studio/pages/composables/pagePreviewLiveHtml";
import {
  unwrapPagePreviewComposeResult,
  unwrapPagePreviewRenderStylesResult,
  unwrapPagePreviewSettingsResult,
  type PagePreviewRenderStylesData,
} from "./componentPreviewActionResults";
import { buildComponentSnapshotPreviewUrl } from "./componentPreviewUrls";
import { resolveBrowserIconRenderResources } from "@/lib/iconRenderResources";

export interface ComponentIsolatePreviewProps {
  componentId: string;
  snapshotUrl?: string | null;
  snapshotRefreshToken?: string | null;
}

export interface UseComponentIsolatePreviewOptions {
  props: ComponentIsolatePreviewProps;
  frameWidth: Ref<number>;
  host: {
    iframeSrc: Ref<string>;
    iframeSrcDoc: Ref<string>;
    isRendered: Ref<boolean>;
    hasError: Ref<boolean>;
    isFrameReady: Ref<boolean>;
  };
}

export function useComponentIsolatePreview(
  options: UseComponentIsolatePreviewOptions,
) {
  const { props, frameWidth, host } = options;

  const isLoading = ref(false);
  const componentNodes = ref<BuilderNode[]>([]);
  const siteSettings = ref<SiteSettings | null>(null);
  const previewRenderStyles = ref<PagePreviewRenderStylesData>({
    ...EMPTY_PAGE_PREVIEW_RENDER_STYLES,
  });
  const pageCssVariables = ref<Record<string, string>>({});
  let renderGeneration = 0;

  async function renderLivePreview(): Promise<void> {
    if (componentNodes.value.length === 0) {
      return;
    }

    const generation = ++renderGeneration;

    host.isFrameReady.value = false;
    host.iframeSrc.value = "";
    const iconResources = await resolveBrowserIconRenderResources(
      normalizePreviewNodes(componentNodes.value),
    );
    if (generation !== renderGeneration) return;
    host.iframeSrcDoc.value = generateComponentIsolateHtml({
      nodes: normalizePreviewNodes(componentNodes.value),
      settings: siteSettings.value,
      renderStyles: previewRenderStyles.value,
      pageCssVariables: pageCssVariables.value,
      frameWidth: frameWidth.value,
      iconResources,
    });
    host.isRendered.value = true;
  }

  async function loadPreview(): Promise<void> {
    if (isLoading.value || host.isRendered.value) {
      return;
    }

    isLoading.value = true;
    host.hasError.value = false;
    host.isFrameReady.value = false;

    try {
      const [composeResult, settingsResult, renderStylesResult] =
        await Promise.all([
          actions.compose({
            pageSlug: props.componentId,
            itemType: "component",
          }),
          actions.settings.get(),
          actions.styles.getRenderStyles(),
        ]);

      const compose = unwrapPagePreviewComposeResult(
        composeResult,
        "Failed to compose component preview",
        { componentId: props.componentId },
      );
      const settings = unwrapPagePreviewSettingsResult(
        settingsResult,
        "Failed to load site settings",
        { componentId: props.componentId },
      );
      const renderStyles = unwrapPagePreviewRenderStylesResult(
        renderStylesResult,
        "Failed to load render styles",
        { componentId: props.componentId },
      );

      if (!compose.success) {
        host.hasError.value = true;
        return;
      }

      componentNodes.value = compose.data.pageBlocks;
      pageCssVariables.value = compose.data.pageCssVariables;
      siteSettings.value = settings.success ? settings.data : null;
      previewRenderStyles.value = renderStyles.success
        ? renderStyles.data
        : { ...EMPTY_PAGE_PREVIEW_RENDER_STYLES };

      await renderLivePreview();
    } catch {
      host.hasError.value = true;
    } finally {
      isLoading.value = false;
    }
  }

  function resetPreviewState(): void {
    renderGeneration++;
    isLoading.value = false;
    componentNodes.value = [];
    siteSettings.value = null;
    previewRenderStyles.value = { ...EMPTY_PAGE_PREVIEW_RENDER_STYLES };
    pageCssVariables.value = {};
    host.isRendered.value = false;
    host.hasError.value = false;
    host.isFrameReady.value = false;
    host.iframeSrc.value = "";
    host.iframeSrcDoc.value = "";
  }

  function handleIframeLoad(): void {
    host.isFrameReady.value = true;
  }

  function refreshFrameLayout(): void {
    if (componentNodes.value.length === 0) {
      return;
    }

    void renderLivePreview();
  }

  function releasePreviewObjectUrl(): void {
    // Live isolate previews do not use blob URLs.
  }

  return {
    isLoading,
    componentNodes,
    siteSettings,
    previewRenderStyles,
    pageCssVariables,
    loadPreview,
    refreshFrameLayout,
    resetPreviewState,
    handleIframeLoad,
    releasePreviewObjectUrl,
    buildComponentSnapshotPreviewUrl: () =>
      buildComponentSnapshotPreviewUrl({
        componentId: props.componentId,
        snapshotUrl: props.snapshotUrl,
        snapshotRefreshToken: props.snapshotRefreshToken,
      }),
  };
}
