import { ref, computed, readonly } from "vue";
import type { PageDSL, LayoutDSL } from "../../../../lib/types/nodes";
import { log } from "@/lib/utils/logger";
import { usePreviewSignals } from "./usePreviewSignals";

interface PreviewOptions {
  debug?: boolean;
  autoRefresh?: boolean;
}

const IFRAME_RELOAD_DELAY = 50;

// SHARED STATE (Singleton Pattern)

/**
 * Preview mode state.
 * When true, shows full-page preview instead of canvas editor.
 */
const isPreview = ref(false);

/**
 * Reference to the preview iframe element.
 * Registered externally when iframe mounts.
 */
const previewIframe = ref<HTMLIFrameElement | null>(null);

/**
 * Validates that iframe is ready for messaging.
 *
 * @param iframe - Iframe element to validate
 * @returns True if iframe has contentWindow
 */
function isIframeReady(iframe: HTMLIFrameElement | null): boolean {
  return iframe !== null && iframe.contentWindow !== null;
}

/**
 * Preview mode manager for Aria builder.
 *
 * Full-page preview via iframe messaging.
 * Integrates with the signal system for type-safe messaging.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const preview = usePreview({ debug: true });
 *
 * // Toggle preview mode
 * preview.togglePreview();
 *
 * // Register iframe when it mounts
 * preview.registerIframe(iframeElement);
 *
 * // Send DSL for rendering
 * preview.sendToPreview(pageDSL, layoutDSL);
 *
 * // Highlight a node
 * preview.highlightNode('hero-section');
 * ```
 */
export function usePreview(options: PreviewOptions = {}) {
  const { debug = false } = options;
  const {
    registerPreviewFrame,
    signalRenderDSL,
    signalHighlightNode,
    signalScrollToNode,
  } = usePreviewSignals({ debug });

  /**
   * Whether preview mode is currently active.
   */
  const isPreviewActive = computed<boolean>(() => {
    return isPreview.value;
  });

  /**
   * Whether preview iframe is ready for messaging.
   */
  const isReady = computed<boolean>(() => {
    return isIframeReady(previewIframe.value);
  });

  /**
   * Current iframe source URL.
   */
  const iframeSource = computed<string>(() => {
    return previewIframe.value?.src || "";
  });

  /**
   * Toggles preview mode on/off.
   *
   * @example
   * ```ts
   * togglePreview(); // Enter preview mode
   * togglePreview(); // Exit preview mode
   * ```
   */
  function togglePreview(): void {
    isPreview.value = !isPreview.value;

    if (debug) {
      log("debug", "[usePreview] Preview mode changed", {
        enabled: isPreview.value,
      });
    }
  }

  /**
   * Enables preview mode.
   */
  function enterPreview(): void {
    if (!isPreview.value) {
      isPreview.value = true;
      if (debug) {
        log("debug", "[usePreview] Entered preview mode");
      }
    }
  }

  /**
   * Disables preview mode.
   */
  function exitPreview(): void {
    if (isPreview.value) {
      isPreview.value = false;
      if (debug) {
        log("debug", "[usePreview] Exited preview mode");
      }
    }
  }

  /**
   * Registers the preview iframe element.
   * Should be called when iframe mounts in the component.
   *
   * @param iframe - Iframe element reference
   *
   * @example
   * ```ts
   * const iframeEl = ref<HTMLIFrameElement | null>(null);
   *
   * onMounted(() => {
   *   registerIframe(iframeEl.value);
   * });
   * ```
   */
  function registerIframe(iframe: HTMLIFrameElement | null): void {
    previewIframe.value = iframe;
    registerPreviewFrame(iframe);

    if (debug) {
      if (iframe) {
        log("debug", "[usePreview] Iframe registered");
      } else {
        log("debug", "[usePreview] Iframe unregistered");
      }
    }
  }

  /**
   * Sends DSL data to preview iframe for rendering.
   *
   * @param pageDSL - Page DSL with hierarchical nodes
   * @param layoutDSL - Optional layout DSL
   * @returns True if data was sent successfully
   *
   * @example
   * ```ts
   * const success = sendToPreview(pageDSL, layoutDSL);
   * if (!success) {
   *   console.error('Failed to send preview data');
   * }
   * ```
   */
  function sendToPreview(pageDSL: PageDSL, layoutDSL?: LayoutDSL): boolean {
    if (!isIframeReady(previewIframe.value)) {
      if (debug) {
        log("debug", "[usePreview] Cannot send message: iframe not ready");
      }
      return false;
    }

    const sent = signalRenderDSL({
      page: pageDSL,
      layout: layoutDSL,
    });

    if (sent && debug) {
      log("debug", "[usePreview] Sent DSL to preview", {
        pageId: pageDSL.id,
        layoutId: layoutDSL?.id,
        nodeCount: pageDSL.nodes?.length || 0,
      });
    }

    return sent;
  }

  /**
   * Refreshes the preview iframe.
   * Reloads the iframe content from its current source.
   *
   * @example
   * ```ts
   * refreshPreview(); // Reload the iframe
   * ```
   */
  function refreshPreview(): void {
    if (!previewIframe.value) {
      if (debug) {
        log("debug", "[usePreview] Cannot refresh: no iframe registered");
      }
      return;
    }

    const currentSrc = previewIframe.value.src;

    // Clear and restore source to trigger reload
    previewIframe.value.src = "";

    setTimeout(() => {
      if (previewIframe.value) {
        previewIframe.value.src = currentSrc;

        if (debug) {
          log("debug", "[usePreview] Preview refreshed");
        }
      }
    }, IFRAME_RELOAD_DELAY);
  }

  /**
   * Highlights a specific node in the preview.
   * Pass null to clear highlight.
   *
   * @param nodeId - ID of node to highlight, or null to clear
   * @returns True if message was sent successfully
   *
   * @example
   * ```ts
   * highlightNode('hero-section'); // Highlight node
   * highlightNode(null);           // Clear highlight
   * ```
   */
  function highlightNode(nodeId: string | null): boolean {
    if (!isIframeReady(previewIframe.value)) {
      if (debug) {
        log("debug", "[usePreview] Cannot send message: iframe not ready");
      }
      return false;
    }

    return signalHighlightNode({ nodeId });
  }

  /**
   * Scrolls to a specific node in the preview.
   *
   * @param nodeId - ID of node to scroll to
   * @returns True if message was sent successfully
   *
   * @example
   * ```ts
   * scrollToNode('contact-section'); // Scroll to node
   * ```
   */
  function scrollToNode(nodeId: string): boolean {
    if (!isIframeReady(previewIframe.value)) {
      if (debug) {
        log("debug", "[usePreview] Cannot send message: iframe not ready");
      }
      return false;
    }

    return signalScrollToNode({ nodeId });
  }

  /**
   * Clears any active highlights in the preview.
   * Convenience method that calls highlightNode(null).
   *
   * @example
   * ```ts
   * clearHighlight(); // Remove all highlights
   * ```
   */
  function clearHighlight(): boolean {
    return highlightNode(null);
  }

  return {
    // State (readonly to prevent external mutations)
    isPreview: readonly(isPreview),
    previewIframe: readonly(previewIframe),

    isPreviewActive,
    isReady,
    iframeSource,

    togglePreview,
    enterPreview,
    exitPreview,

    registerIframe,

    sendToPreview,
    refreshPreview,
    highlightNode,
    scrollToNode,
    clearHighlight,
  };
}
