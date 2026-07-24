import { ref, watch, type ComputedRef, type Ref } from "vue";
import { traceStartup } from "@/lib/startupTrace";
import { useAppLoading } from "../../Composer/composables/useAppLoading";
import { useShellModeTransition } from "./useShellModeTransition";
import { preloadBuilderShell } from "./useAppAsyncViews";
import type { AppMode, EditableItemType, StudioSection } from "../types/router";

export interface UseAppBootstrapDeps {
  appMode: ComputedRef<AppMode>;
  itemType: Readonly<Ref<EditableItemType | null>>;
  itemSlug: Readonly<Ref<string | null>>;
  studioSection: Readonly<Ref<StudioSection>>;
  currentItemType: Ref<"page" | "layout" | "component">;
  currentItemSlug: ComputedRef<string>;
  stageKey: ComputedRef<string>;
  showStudio: ComputedRef<boolean>;
  showCanvas: ComputedRef<boolean>;
}

export interface UseAppBootstrapReturn {
  hasEnteredEditing: Ref<boolean>;
  prewarmBuilder: () => Promise<void>;
  handleStudioShellReady: () => void;
  handleCanvasStageReady: () => void;
}

export function useAppBootstrap(
  deps: UseAppBootstrapDeps,
): UseAppBootstrapReturn {
  const {
    appMode,
    itemType,
    itemSlug,
    studioSection,
    currentItemType,
    currentItemSlug,
    stageKey,
    showStudio,
    showCanvas,
  } = deps;
  const { setStudioReady, setStageReady } = useAppLoading();
  const shellTransition = useShellModeTransition();

  const hasEnteredEditing = ref(appMode.value === "stage");

  watch(
    () => appMode.value,
    (nextMode) => {
      if (nextMode !== "stage" || hasEnteredEditing.value) return;

      hasEnteredEditing.value = true;
      traceStartup("app-shell:editing-entered", {
        itemType: itemType.value,
        itemSlug: itemSlug.value,
      });
    },
    { immediate: true },
  );

  watch(
    () => ({
      appMode: appMode.value,
      itemType: itemType.value,
      itemSlug: itemSlug.value,
    }),
    (mode) => {
      traceStartup("app-router:editing-mode", {
        appMode: mode.appMode,
        isEditing: mode.appMode === "stage",
        itemType: mode.itemType,
        itemSlug: mode.itemSlug,
      });
    },
    { deep: true, immediate: true },
  );

  watch(
    () => ({
      showStudio: showStudio.value,
      showCanvas: showCanvas.value,
      currentItemType: appMode.value === "stage" ? currentItemType.value : null,
      currentItemSlug: appMode.value === "stage" ? currentItemSlug.value : null,
      stageKey: stageKey.value,
    }),
    (viewState) => {
      traceStartup("app:view-state", viewState);
    },
    { deep: true, immediate: true },
  );

  async function prewarmBuilder(): Promise<void> {
    traceStartup("builder-shell:prewarm:start");
    await preloadBuilderShell();
    traceStartup("builder-shell:prewarm:end");
  }

  function handleStudioShellReady(): void {
    traceStartup("app-shell:studio-ready", {
      showStudio: showStudio.value,
      showCanvas: showCanvas.value,
      studioSection: studioSection.value,
    });
    setStudioReady(true);
  }

  function handleCanvasStageReady(): void {
    traceStartup("app-shell:canvas-ready", {
      stageKey: stageKey.value,
      itemType: currentItemType.value,
      itemSlug: currentItemSlug.value,
      showStudio: showStudio.value,
      showCanvas: showCanvas.value,
    });
    shellTransition.markStageReady({
      stageKey: stageKey.value,
      generation: shellTransition.transitionGeneration.value,
    });
    setStageReady(true);
  }

  return {
    hasEnteredEditing,
    prewarmBuilder,
    handleStudioShellReady,
    handleCanvasStageReady,
  };
}
