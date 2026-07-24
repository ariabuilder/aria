import { computed, ref, unref, type ComputedRef, type Ref } from "vue";
import type {
  BuilderNode,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type { LoadingState } from "../../Core/composables/useEditorContext";
import type { EditableItemType } from "../../Core/types/router";
import type { LayoutInspectorMetadata } from "../../Core/types/layout";
import type { ReorderOperation } from "../../../types/app";
import { mergePageBlocksWithLayoutSlots, resolveSlotRootsForDisplay } from "../../../../lib/layouts/canvasSlotMerge";
import type {
  StageAppListeners,
  StageAppProps,
  StageCanvasExpose,
  StageSelectBlockInput,
} from "../types";

export interface UseStageAppBindingsDeps {
  hasEnteredEditing: Ref<boolean>;
  showCanvas: ComputedRef<boolean>;
  isPreview: Ref<boolean>;
  isItemTransitioning: Ref<boolean>;
  currentPage: Ref<PageDSL | null>;
  leftSidebarOpen: Ref<boolean>;
  rightSidebarOpen: Ref<boolean>;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  loadingState: Ref<LoadingState>;
  showOutlines: Ref<boolean>;
  wireframeMode: Ref<boolean>;
  currentLayout: Ref<LayoutDSL | null>;
  stageKey: ComputedRef<string>;
  currentItemType: Ref<EditableItemType>;
  currentItemSlug: ComputedRef<string>;
  currentLayoutSlug: ComputedRef<string | undefined>;
  currentHeaderComponent: ComputedRef<string | undefined>;
  currentFooterComponent: ComputedRef<string | undefined>;
  pageBlocks: Ref<BuilderNode[]>;
  currentPageSlug: ComputedRef<string | null>;
  currentLayoutMetadata: ComputedRef<LayoutInspectorMetadata | undefined>;
  handleUndo: () => void;
  handleRedo: () => void;
  setShowOutlines: (value: boolean) => void;
  setWireframeMode: (value: boolean) => void;
  handleCanvasStageReady: () => void;
  handleBackgroundClick: () => void;
  handleStageSelectBlock: (selection: StageSelectBlockInput) => void;
  handleStageAddBlock: (block: BuilderNode, parentId: string | null) => void;
  handleDeleteBlock: (nodeId: string) => void;
  handleDuplicateBlock: (nodeId: string) => void;
  handleDetachComponent: (nodeId: string) => Promise<void> | void;
  handleReplaceBlockWithComponent: (
    nodeId: string,
    componentSlug: string,
  ) => Promise<void> | void;
  handleEditComponent: (componentId: string) => void;
  handleReorderBlock: (operation: ReorderOperation) => void;
  handleOpenPicker: (slotName: string) => void;
  handleEditLayoutRegion: (regionId: string) => void;
  handleLayoutUpdate: (layoutSlug: string) => void;
  handleLayoutMetadataUpdate: (
    metadata: LayoutInspectorMetadata,
  ) => Promise<void> | void;
  handleOpenAddElements: () => void;
  hasUnsavedChanges: Ref<boolean>;
  handleSave: () => void | Promise<void>;
  handlePublish: () => void | Promise<void>;
  handleUnpublish: () => void | Promise<void>;
}

export interface UseStageAppBindingsReturn {
  stageCanvasRef: Ref<StageCanvasExpose | null>;
  stageIframeRef: ComputedRef<HTMLIFrameElement | null>;
  stageAppProps: ComputedRef<StageAppProps>;
  stageAppListeners: StageAppListeners;
}

export function useStageAppBindings(
  deps: UseStageAppBindingsDeps,
): UseStageAppBindingsReturn {
  const {
    hasEnteredEditing,
    showCanvas,
    isPreview,
    isItemTransitioning,
    currentPage,
    leftSidebarOpen,
    rightSidebarOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
    loadingState,
    showOutlines,
    wireframeMode,
    currentLayout,
    stageKey,
    currentItemType,
    currentItemSlug,
    currentLayoutSlug,
    currentHeaderComponent,
    currentFooterComponent,
    pageBlocks,
    currentPageSlug,
    currentLayoutMetadata,
    handleUndo,
    handleRedo,
    setShowOutlines,
    setWireframeMode,
    handleCanvasStageReady,
    handleBackgroundClick,
    handleStageSelectBlock,
    handleStageAddBlock,
    handleDeleteBlock,
    handleDuplicateBlock,
    handleDetachComponent,
    handleReplaceBlockWithComponent,
    handleEditComponent,
    handleReorderBlock,
    handleOpenPicker,
    handleEditLayoutRegion,
    handleLayoutUpdate,
    handleLayoutMetadataUpdate,
    handleOpenAddElements,
    hasUnsavedChanges,
    handleSave,
    handlePublish,
    handleUnpublish,
  } = deps;

  const stageCanvasRef = ref<StageCanvasExpose | null>(null);

  const stageIframeRef = computed(() => {
    const exposed = stageCanvasRef.value?.stageIframeRef;
    if (!exposed) {
      return null;
    }
    return unref(unref(exposed));
  });

  const canvasRootBlocks = computed(() =>
    mergePageBlocksWithLayoutSlots(
      pageBlocks.value,
      currentLayout.value,
      resolveSlotRootsForDisplay,
    ),
  );

  const showEmptyComponentState = computed(() => {
    const itemType = currentItemType.value;
    if (itemType !== "page" && itemType !== "component") {
      return false;
    }

    return (
      showCanvas.value &&
      !loadingState.value.isLoading &&
      !loadingState.value.loadError &&
      canvasRootBlocks.value.length === 0
    );
  });

  const stageAppProps = computed<StageAppProps>(() => ({
    hasEnteredEditing: hasEnteredEditing.value,
    show: showCanvas.value,
    isPreview: isPreview.value,
    isItemTransitioning: isItemTransitioning.value,
    page: currentPage.value,
    leftSidebarOpen: leftSidebarOpen.value,
    rightSidebarOpen: rightSidebarOpen.value,
    onToggleLeftSidebar: toggleLeftSidebar,
    onToggleRightSidebar: toggleRightSidebar,
    isLoading: loadingState.value.isLoading,
    loadError: loadingState.value.loadError,
    showOutlines: showOutlines.value,
    wireframeMode: wireframeMode.value,
    currentLayout: currentLayout.value,
    stageKey: stageKey.value,
    currentItemType: currentItemType.value,
    currentItemSlug: currentItemSlug.value,
    currentLayoutSlug: currentLayoutSlug.value,
    headerComponent: currentHeaderComponent.value,
    footerComponent: currentFooterComponent.value,
    expandedBlocks: canvasRootBlocks.value,
    pageSlug: currentPageSlug.value,
    showEmptyComponentState: showEmptyComponentState.value,
    layoutMetadata: currentLayoutMetadata.value,
    canvasControlBar: {
      currentItemType: currentItemType.value,
      currentItemSlug: currentItemSlug.value,
      currentPage: currentPage.value,
      canSave: hasUnsavedChanges.value,
      canPublish:
        currentItemType.value === "page" &&
        (hasUnsavedChanges.value ||
          currentPage.value?.status === "draft" ||
          (currentPage.value?.status === "published" &&
            currentPage.value.isModifiedSincePublish === true)),
      hasUnsavedChanges: hasUnsavedChanges.value,
      isSaving: loadingState.value.isSaving,
      isPublishing: loadingState.value.isPublishing,
      isLoading: isItemTransitioning.value,
    },
  }));

  const stageAppListeners: StageAppListeners = {
    undo: handleUndo,
    redo: handleRedo,
    "background-click": handleBackgroundClick,
    "update:show-outlines": setShowOutlines,
    "update:wireframe-mode": setWireframeMode,
    "stage-ready": handleCanvasStageReady,
    "select-block": handleStageSelectBlock,
    "add-block": handleStageAddBlock,
    "delete-block": handleDeleteBlock,
    "duplicate-block": handleDuplicateBlock,
    "detach-component": handleDetachComponent,
    "replace-block-with-component": handleReplaceBlockWithComponent,
    "edit-component": handleEditComponent,
    "reorder-block": handleReorderBlock,
    "open-picker": handleOpenPicker,
    "edit-layout-region": handleEditLayoutRegion,
    "update-layout": handleLayoutUpdate,
    "update-layout-metadata": handleLayoutMetadataUpdate,
    "add-first-element": handleOpenAddElements,
    save: handleSave,
    publish: handlePublish,
    unpublish: handleUnpublish,
  };

  return {
    stageCanvasRef,
    stageIframeRef,
    stageAppProps,
    stageAppListeners,
  };
}
