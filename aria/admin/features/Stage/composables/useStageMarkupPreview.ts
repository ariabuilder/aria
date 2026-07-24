import { useMediaQuery } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useSelectedNodeState } from "../../Core";
import { nodesToHtmlFragmentWithStylesheet } from "../../../../lib/blocks/nodesToHtml";

const stylesheetImport = '@import url("/styles/global.css");';

const isMarkupPreviewOpen = ref(false);
const HOVER_CLOSE_DELAY_MS = 200;

let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

function cancelHoverClose(): void {
  if (hoverCloseTimer !== null) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

export function useStageMarkupPreview() {
  const { selectedNode } = useSelectedNodeState();
  const supportsHoverOpen = useMediaQuery("(hover: hover) and (pointer: fine)");

  const preview = computed(() => {
    if (!selectedNode.value) {
      return {
        html: "",
        stylesheet: "",
      };
    }

    return nodesToHtmlFragmentWithStylesheet([selectedNode.value]);
  });

  const markupPreview = computed(() => {
    if (!preview.value.html) {
      return "";
    }

    try {
      return preview.value.html.trim();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown markup render failure";
      return `<!-- Failed to generate markup: ${message} -->`;
    }
  });

  const stylesheetPreview = computed(() => {
    if (!selectedNode.value) {
      return "";
    }

    const stylesheet = preview.value.stylesheet.trim();
    return stylesheet.length > 0
      ? `${stylesheetImport}\n\n${stylesheet}`
      : stylesheetImport;
  });

  const isMarkupPreviewDisabled = computed(
    () => !selectedNode.value || !markupPreview.value,
  );

  function setMarkupPreviewOpen(open: boolean): void {
    if (open && isMarkupPreviewDisabled.value) {
      return;
    }

    if (!open) {
      cancelHoverClose();
    }

    isMarkupPreviewOpen.value = open;
  }

  function toggleMarkupPreview(): void {
    setMarkupPreviewOpen(!isMarkupPreviewOpen.value);
  }

  function openMarkupPreviewOnHover(): void {
    if (!supportsHoverOpen.value) {
      return;
    }

    cancelHoverClose();
    setMarkupPreviewOpen(true);
  }

  function keepMarkupPreviewOpenOnHover(): void {
    if (!supportsHoverOpen.value) {
      return;
    }

    cancelHoverClose();
  }

  function scheduleMarkupPreviewCloseOnHoverLeave(): void {
    if (!supportsHoverOpen.value) {
      return;
    }

    cancelHoverClose();
    hoverCloseTimer = setTimeout(() => {
      setMarkupPreviewOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }

  watch(isMarkupPreviewDisabled, (disabled) => {
    if (disabled) {
      isMarkupPreviewOpen.value = false;
    }
  });

  return {
    isMarkupPreviewOpen,
    markupPreview,
    stylesheetPreview,
    isMarkupPreviewDisabled,
    supportsHoverOpen,
    setMarkupPreviewOpen,
    toggleMarkupPreview,
    openMarkupPreviewOnHover,
    keepMarkupPreviewOpenOnHover,
    scheduleMarkupPreviewCloseOnHoverLeave,
  };
}
