import type { ComputedRef, Ref } from "vue";
import type { UseAppRouterReturn } from "../../Core";
import type {
  AppChromeShellListeners,
  AppChromeShellProps,
  AppLeftSidebarShellExpose,
  AppLeftSidebarShellListeners,
  AppLeftSidebarShellProps,
} from "../../Core";
import {
  useStageShellActions,
  type UseStageShellActionsDeps,
} from "./useStageShellActions";
import {
  useStageContentSyncActions,
  type UseStageContentSyncActionsDeps,
} from "./useStageContentSyncActions";
import {
  useStageShellBindings,
  type UseStageShellBindingsDeps,
} from "./useStageShellBindings";
import { useStageShellSync } from "./useStageShellSync";
import type { UseStageSidebarLoadActionsReturn } from "./useStageSidebarLoadActions";

type StageShellBindingsBaseDeps = Omit<
  UseStageShellBindingsDeps,
  | "handleSidebarComponentSaved"
  | "handleSidebarSelectPage"
  | "handleSidebarCreatePage"
  | "handleSidebarSelectLayout"
  | "handleSidebarCreateLayout"
  | "handleSidebarSelectComponent"
  | "handleSidebarCreateComponent"
  | "handleActiveBlocksUpdate"
  | "handleSidebarAddElement"
  | "handleOpenPicker"
  | "handleSidebarPageSaved"
  | "handleEditComponent"
>;

export interface UseStageShellWorkspaceBindingsDeps
  extends
    StageShellBindingsBaseDeps,
    UseStageShellActionsDeps,
    UseStageContentSyncActionsDeps {
  appRouter: Pick<UseAppRouterReturn, "startEditing">;
  rightSidebarOpen: Ref<boolean>;
  appSidebarRef: Ref<AppLeftSidebarShellExpose | null>;
  handleSidebarSelectPage: UseStageSidebarLoadActionsReturn["handleSidebarSelectPage"];
  handleSidebarCreatePage: UseStageSidebarLoadActionsReturn["handleSidebarCreatePage"];
  handleSidebarSelectLayout: UseStageSidebarLoadActionsReturn["handleSidebarSelectLayout"];
  handleSidebarCreateLayout: UseStageSidebarLoadActionsReturn["handleSidebarCreateLayout"];
  handleSidebarSelectComponent: UseStageSidebarLoadActionsReturn["handleSidebarSelectComponent"];
  handleSidebarCreateComponent: UseStageSidebarLoadActionsReturn["handleSidebarCreateComponent"];
  handleEditComponent: (componentId: string) => void | Promise<void>;
}

export interface UseStageShellWorkspaceBindingsReturn {
  stageChromeShellProps: ComputedRef<AppChromeShellProps>;
  stageChromeShellListeners: AppChromeShellListeners;
  stageSidebarShellProps: ComputedRef<AppLeftSidebarShellProps>;
  stageSidebarShellListeners: AppLeftSidebarShellListeners;
  handleOpenAddElements: () => void;
}

export function useStageShellWorkspaceBindings(
  deps: UseStageShellWorkspaceBindingsDeps,
): UseStageShellWorkspaceBindingsReturn {
  const {
    pageBlocks,
    rightSidebarOpen,
    appSidebarRef,
    handleSidebarSelectPage,
    handleSidebarCreatePage,
    handleSidebarSelectLayout,
    handleSidebarCreateLayout,
    handleSidebarSelectComponent,
    handleSidebarCreateComponent,
    handleEditComponent,
    ...restDeps
  } = deps;

  const {
    handleSidebarComponentSaved,
    handleSidebarPageSaved,
    handleActiveBlocksUpdate,
  } = useStageContentSyncActions({
    currentPage: restDeps.currentPage,
    currentComponent: restDeps.currentComponent,
    lastSavedSnapshot: restDeps.lastSavedSnapshot,
    hasUnsavedChanges: restDeps.hasUnsavedChanges,
    pageBlocks,
    createSnapshot: restDeps.createSnapshot,
  });

  const { handleOpenPicker, handleSidebarAddElement, handleOpenAddElements } =
    useStageShellActions(restDeps);

  useStageShellSync({
    rightSidebarOpen,
    appSidebarRef,
  });

  const {
    stageChromeShellProps,
    stageChromeShellListeners,
    stageSidebarShellProps,
    stageSidebarShellListeners,
  } = useStageShellBindings({
    ...restDeps,
    pageBlocks,
    handleSidebarComponentSaved,
    handleSidebarSelectPage,
    handleSidebarCreatePage,
    handleSidebarSelectLayout,
    handleSidebarCreateLayout,
    handleSidebarSelectComponent,
    handleSidebarCreateComponent,
    handleActiveBlocksUpdate,
    handleSidebarAddElement,
    handleOpenPicker,
    handleSidebarPageSaved,
    handleEditComponent,
  });

  return {
    stageChromeShellProps,
    stageChromeShellListeners,
    stageSidebarShellProps,
    stageSidebarShellListeners,
    handleOpenAddElements,
  };
}
