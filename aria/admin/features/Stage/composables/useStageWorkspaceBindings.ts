import { provide, ref, watch, type Ref } from "vue";
import type { AppLeftSidebarShellExpose, UseAppRouterReturn } from "../../Core";
import {
  useStageAppBindings,
  type UseStageAppBindingsReturn,
  type UseStageAppBindingsDeps,
} from "./useStageAppBindings";
import {
  useStageLayoutActions,
  type UseStageLayoutActionsDeps,
} from "./useStageLayoutActions";
import { useStageComponentActions } from "./useStageComponentActions";
import {
  useStageCanvasActions,
  type UseStageCanvasActionsDeps,
} from "./useStageCanvasActions";
import { useStageHistoryActions } from "./useStageHistoryActions";
import {
  useStagePersistenceActions,
  type UseStagePersistenceActionsDeps,
} from "./useStagePersistenceActions";
import {
  useStageMutationActions,
  type UseStageMutationActionsDeps,
} from "./useStageMutationActions";
import {
  useStageLoadingActions,
  type UseStageLoadingActionsDeps,
} from "./useStageLoadingActions";
import { useStagePreviewState } from "./useStagePreviewState";
import { useStageDisplayState } from "./useStageDisplayState";
import {
  useStageSelection,
  type UseStageSelectionOptions,
} from "./useStageSelection";
import {
  useStageShellWorkspaceBindings,
  type UseStageShellWorkspaceBindingsReturn,
  type UseStageShellWorkspaceBindingsDeps,
} from "./useStageShellWorkspaceBindings";
import { useStageSidebarLoadActions } from "./useStageSidebarLoadActions";
import { useStageWorkspaceState } from "./useStageWorkspaceState";
import type { UseStageShellActionsDeps } from "./useStageShellActions";
import type { UseStageShellBindingsDeps } from "./useStageShellBindings";
import type { UseStageContentSyncActionsDeps } from "./useStageContentSyncActions";
import { useCmsPreviewEntryContext } from "../../CMS/composables/useCmsPreviewEntryContext";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import { getEditorSlotScope } from "../../../../lib/layouts/slotEditing";

interface StageWorkspaceNodeEventHandlers {
  handleAddElement: UseStageShellActionsDeps["handleAddElement"];
  handleDeleteBlock: UseStageCanvasActionsDeps["deleteBlock"];
  handleDuplicateBlock: UseStageCanvasActionsDeps["duplicateBlock"];
  handleDetachComponent: UseStageCanvasActionsDeps["detachComponent"];
  handleReplaceBlockWithComponent: UseStageCanvasActionsDeps["replaceBlockWithComponent"];
  handleLayersReorderNode: UseStageShellBindingsDeps["handleLayersReorderNode"];
}

interface StageWorkspaceEditorMutationHandlers {
  handleAddBlock: UseStageMutationActionsDeps["handleAddBlock"];
  handleReorderBlock: UseStageMutationActionsDeps["handleReorderBlock"];
}

interface StageEditorState {
  loadingState: UseStageAppBindingsDeps["loadingState"];
  pageBlocks: UseStageShellWorkspaceBindingsDeps["pageBlocks"];
  currentPage: UseStageShellBindingsDeps["currentPage"];
  currentLayout: UseStageShellBindingsDeps["currentLayout"];
  currentComponent: UseStageShellBindingsDeps["currentComponent"];
  currentItemType: UseStageShellBindingsDeps["currentItemType"];
  selectedLayoutRegion: UseStageSelectionOptions["selectedLayoutRegion"];
  hasUnsavedChanges: UseStageShellWorkspaceBindingsDeps["hasUnsavedChanges"];
  lastSavedSnapshot: UseStageContentSyncActionsDeps["lastSavedSnapshot"];
  currentPageSlug: UseStageAppBindingsDeps["currentPageSlug"];
  currentItemSlug: UseStageShellWorkspaceBindingsDeps["currentItemSlug"];
  currentPageLayoutSlug: UseStageAppBindingsDeps["currentLayoutSlug"];
  currentLayoutMetadata: UseStageAppBindingsDeps["currentLayoutMetadata"];
  currentHeaderComponent: UseStageAppBindingsDeps["currentHeaderComponent"];
  currentFooterComponent: UseStageAppBindingsDeps["currentFooterComponent"];
  stageKey: UseStageAppBindingsDeps["stageKey"];
}

export type UseStageWorkspaceBindingsDeps = Omit<
  UseStageShellWorkspaceBindingsDeps,
  | "appSidebarRef"
  | "appMode"
  | "pickerOpen"
  | "openSettings"
  | "setPickerOpen"
  | "leftSidebarOpen"
  | "setLeftSidebarOpen"
  | "editingTab"
  | "setEditingTab"
  | "openPicker"
  | "openComponentPicker"
  | "openLeftSidebar"
  | "rightSidebarOpen"
  | "handleLayoutUpdate"
  | "handleComponentSelect"
  | "handleLoadPage"
  | "handleLoadLayout"
  | "handleLoadComponent"
  | "isPreview"
  | "pageBlocks"
  | "hasUnsavedChanges"
  | "loadingState"
  | "currentItemSlug"
  | "currentItemType"
  | "currentLayout"
  | "currentPage"
  | "currentComponent"
  | "showOutlines"
  | "showSelectionSizing"
  | "showSelectionToolbar"
  | "wireframeMode"
  | "setShowOutlines"
  | "setShowSelectionSizing"
  | "setShowSelectionToolbar"
  | "setWireframeMode"
> &
  Omit<
    UseStageAppBindingsDeps,
    | "handleOpenAddElements"
    | "leftSidebarOpen"
    | "rightSidebarOpen"
    | "toggleLeftSidebar"
    | "toggleRightSidebar"
    | "currentPage"
    | "loadingState"
    | "currentLayout"
    | "stageKey"
    | "currentItemType"
    | "currentItemSlug"
    | "currentLayoutSlug"
    | "currentHeaderComponent"
    | "currentFooterComponent"
    | "pageBlocks"
    | "currentPageSlug"
    | "currentLayoutMetadata"
    | "handleLayoutUpdate"
    | "handleLayoutMetadataUpdate"
    | "handleBackgroundClick"
    | "handleStageSelectBlock"
    | "handleStageAddBlock"
    | "handleDeleteBlock"
    | "handleDuplicateBlock"
    | "handleDetachComponent"
    | "handleEditComponent"
    | "handleUndo"
    | "handleRedo"
    | "isPreview"
    | "showOutlines"
    | "showSelectionSizing"
    | "showSelectionToolbar"
    | "wireframeMode"
    | "setShowOutlines"
    | "setShowSelectionSizing"
    | "setShowSelectionToolbar"
    | "setWireframeMode"
    | "handleOpenPicker"
    | "handleEditLayoutRegion"
    | "handleUpdateRegionComponent"
  > &
  Pick<UseStageLayoutActionsDeps, "history"> &
  Pick<UseStagePersistenceActionsDeps, "handleSave" | "handlePublish"> &
  Pick<UseStageLoadingActionsDeps, "itemLoading"> & {
    appRouter: UseAppRouterReturn;
    editorState: StageEditorState;
    nodeEventHandlers: StageWorkspaceNodeEventHandlers;
    editorMutationHandlers: StageWorkspaceEditorMutationHandlers;
    showLayoutSlotGroups?: Ref<boolean>;
    confirmComposerItemSwitch?: () => Promise<boolean>;
    isItemTransitioning: Ref<boolean>;
  };

export interface UseStageWorkspaceBindingsReturn {
  appSidebarRef: ReturnType<typeof ref<AppLeftSidebarShellExpose | null>>;
  handleClearSelection: () => void;
  stageChromeShellProps: UseStageShellWorkspaceBindingsReturn["stageChromeShellProps"];
  stageChromeShellListeners: UseStageShellWorkspaceBindingsReturn["stageChromeShellListeners"];
  stageSidebarShellProps: UseStageShellWorkspaceBindingsReturn["stageSidebarShellProps"];
  stageSidebarShellListeners: UseStageShellWorkspaceBindingsReturn["stageSidebarShellListeners"];
  stageCanvasRef: UseStageAppBindingsReturn["stageCanvasRef"];
  stageIframeRef: UseStageAppBindingsReturn["stageIframeRef"];
  stageAppProps: UseStageAppBindingsReturn["stageAppProps"];
  stageAppListeners: UseStageAppBindingsReturn["stageAppListeners"];
}

export function useStageWorkspaceBindings(
  deps: UseStageWorkspaceBindingsDeps,
): UseStageWorkspaceBindingsReturn {
  const { editorState } = deps;
  const appSidebarRef = ref<AppLeftSidebarShellExpose | null>(null);
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
    openLeftSidebar,
    setLeftSidebarOpen,
    editingTab,
    setEditingTab,
    pickerOpen,
    pickerTargetSlot,
    openPicker,
    openComponentPicker,
    setPickerOpen,
    openSettings,
  } = useStageWorkspaceState({
    appRouter: deps.appRouter,
    currentItemType: editorState.currentItemType,
  });
  const appMode = deps.appRouter.appMode;
  const cmsPreviewEntryContext = useCmsPreviewEntryContext(editorState.currentPage);
  provide(APP_INJECTION_KEYS.cmsPreviewEntryContext, cmsPreviewEntryContext);

  if (deps.showLayoutSlotGroups) {
    watch(deps.showLayoutSlotGroups, (showGroups) => {
      if (showGroups) {
        return;
      }

      const slotName = pickerTargetSlot.value.trim();
      if (!slotName) {
        return;
      }

      const scope = getEditorSlotScope(
        editorState.currentItemType.value,
        slotName,
        editorState.currentLayout.value,
      );

      if (scope === "layout") {
        pickerTargetSlot.value = "";
      }
    });
  }

  const { isPreview } = useStagePreviewState();
  const {
    showOutlines,
    showSelectionSizing,
    showSelectionToolbar,
    wireframeMode,
    setShowOutlines,
    setShowSelectionSizing,
    setShowSelectionToolbar,
    setWireframeMode,
  } = useStageDisplayState();
  const openLayersEditorTab = (): void => {
    setEditingTab("layers");
    openLeftSidebar();
  };

  const { handleStageSave, handleStagePublish } = useStagePersistenceActions({
    handleSave: deps.handleSave,
    handlePublish: deps.handlePublish,
  });

  const {
    handleLoadLayoutDataOnly,
  } = useStageLoadingActions({
    itemLoading: deps.itemLoading,
  });

  const {
    handleSidebarSelectPage,
    handleSidebarCreatePage,
    handleSidebarSelectLayout,
    handleSidebarCreateLayout,
    handleSidebarSelectComponent,
    handleSidebarCreateComponent,
  } = useStageSidebarLoadActions({
    appRouter: deps.appRouter,
    confirmComposerItemSwitch: deps.confirmComposerItemSwitch,
  });

  const {
    handleStageAddBlock: handleMutationAddBlock,
    handleStageReorderBlock: handleMutationReorderBlock,
  } = useStageMutationActions({
    handleAddBlock: deps.editorMutationHandlers.handleAddBlock,
    handleReorderBlock: deps.editorMutationHandlers.handleReorderBlock,
  });

  const { handleLayoutUpdate, handleLayoutMetadataUpdate } =
    useStageLayoutActions({
      currentPage: editorState.currentPage,
      currentLayout: editorState.currentLayout,
      currentItemType: editorState.currentItemType,
      pageBlocks: editorState.pageBlocks,
      history: deps.history,
      handleLoadLayoutDataOnly,
      handleSave: handleStageSave,
    });

  const { handleComponentSelect, handleEditComponent } =
    useStageComponentActions({
      pickerTargetSlot,
      navigateToComponent: handleSidebarSelectComponent,
      openLeftSidebar,
      handleAddElement: async (payload) => {
        deps.nodeEventHandlers.handleAddElement(payload);
      },
    });

  const {
    handleDeleteBlock,
    handleDuplicateBlock,
    handleDetachComponent,
    handleReplaceBlockWithComponent,
    handleReorderBlock,
    handleCanvasOpenPicker,
  } = useStageCanvasActions({
    openPicker,
    handleReorderBlock: handleMutationReorderBlock,
    deleteBlock: deps.nodeEventHandlers.handleDeleteBlock,
    duplicateBlock: deps.nodeEventHandlers.handleDuplicateBlock,
    detachComponent: deps.nodeEventHandlers.handleDetachComponent,
    replaceBlockWithComponent:
      deps.nodeEventHandlers.handleReplaceBlockWithComponent,
  });

  const { handleUndo, handleRedo } = useStageHistoryActions();

  const {
    stageChromeShellProps,
    stageChromeShellListeners,
    stageSidebarShellProps,
    stageSidebarShellListeners,
    handleOpenAddElements,
  } = useStageShellWorkspaceBindings({
    ...deps,
    pageBlocks: editorState.pageBlocks,
    hasUnsavedChanges: editorState.hasUnsavedChanges,
    currentItemSlug: editorState.currentItemSlug,
    currentItemType: editorState.currentItemType,
    currentLayout: editorState.currentLayout,
    currentPage: editorState.currentPage,
    currentComponent: editorState.currentComponent,
    pages: deps.pages,
    layouts: deps.layouts,
    handleAddElement: deps.nodeEventHandlers.handleAddElement,
    handleLayersReorderNode: deps.nodeEventHandlers.handleLayersReorderNode,
    appMode,
    pickerOpen,
    openSettings,
    setPickerOpen,
    leftSidebarOpen,
    setLeftSidebarOpen,
    editingTab,
    setEditingTab,
    openPicker,
    openComponentPicker,
    openLeftSidebar,
    rightSidebarOpen,
    appRouter: deps.appRouter,
    appSidebarRef,
    isPreview,
    showOutlines,
    showSelectionSizing,
    showSelectionToolbar,
    wireframeMode,
    setShowOutlines,
    setShowSelectionSizing,
    setShowSelectionToolbar,
    setWireframeMode,
    handleComponentSelect,
    handleLayoutUpdate,
    handleSidebarSelectPage,
    handleSidebarCreatePage,
    handleSidebarSelectLayout,
    handleSidebarCreateLayout,
    handleSidebarSelectComponent,
    handleSidebarCreateComponent,
    handleEditComponent,
  });

  const {
    handleClearSelection,
    handleBackgroundClick,
    handleStageSelectBlock,
    handleStageAddBlock,
    handleEditLayoutRegion,
  } = useStageSelection({
    pageBlocks: editorState.pageBlocks,
    selectedLayoutRegion: editorState.selectedLayoutRegion,
    openLayersEditorTab,
    handleAddBlock: handleMutationAddBlock,
  });

  const { stageCanvasRef, stageIframeRef, stageAppProps, stageAppListeners } =
    useStageAppBindings({
      ...deps,
      currentPage: editorState.currentPage,
      loadingState: editorState.loadingState,
      currentLayout: editorState.currentLayout,
      stageKey: editorState.stageKey,
      currentItemType: editorState.currentItemType,
      currentItemSlug: editorState.currentItemSlug,
      currentLayoutSlug: editorState.currentPageLayoutSlug,
      currentHeaderComponent: editorState.currentHeaderComponent,
      currentFooterComponent: editorState.currentFooterComponent,
      pageBlocks: editorState.pageBlocks,
      currentPageSlug: editorState.currentPageSlug,
      currentLayoutMetadata: editorState.currentLayoutMetadata,
      hasUnsavedChanges: editorState.hasUnsavedChanges,
      leftSidebarOpen,
      rightSidebarOpen,
      toggleLeftSidebar,
      toggleRightSidebar,
      isPreview,
      showOutlines,
      showSelectionSizing,
      showSelectionToolbar,
      wireframeMode,
      handleUndo,
      handleRedo,
      setShowOutlines,
      setWireframeMode,
      handleBackgroundClick,
      handleStageSelectBlock,
      handleStageAddBlock,
      handleDeleteBlock,
      handleDuplicateBlock,
      handleDetachComponent,
      handleReplaceBlockWithComponent,
      handleEditComponent,
      handleReorderBlock,
      handleOpenPicker: handleCanvasOpenPicker,
      handleEditLayoutRegion,
      handleOpenAddElements,
      handleLayoutUpdate,
      handleLayoutMetadataUpdate,
      handleSave: handleStageSave,
      handlePublish: handleStagePublish,
      handleUnpublish: deps.handleSidebarUnpublish,
    });

  return {
    appSidebarRef,
    handleClearSelection,
    stageChromeShellProps,
    stageChromeShellListeners,
    stageSidebarShellProps,
    stageSidebarShellListeners,
    stageCanvasRef,
    stageIframeRef,
    stageAppProps,
    stageAppListeners,
  };
}
