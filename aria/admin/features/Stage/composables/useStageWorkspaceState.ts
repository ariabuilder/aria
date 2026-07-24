import type { EditableItemType, UseAppRouterReturn } from "../../Core";
import type { Ref } from "vue";
import {
  useStageChromeState,
  type UseStageChromeStateReturn,
} from "./useStageChromeState";
import {
  useStageEditingTabState,
  type UseStageEditingTabStateReturn,
} from "./useStageEditingTabState";
import {
  useStageDialogState,
  type UseStageDialogStateReturn,
} from "./useStageDialogState";

export interface UseStageWorkspaceStateDeps {
  appRouter: UseAppRouterReturn;
  currentItemType?: Ref<EditableItemType | undefined>;
}

export interface UseStageWorkspaceStateReturn
  extends UseStageChromeStateReturn,
    UseStageEditingTabStateReturn,
    UseStageDialogStateReturn {}

export function useStageWorkspaceState(
  deps: UseStageWorkspaceStateDeps,
): UseStageWorkspaceStateReturn {
  const chromeState = useStageChromeState({ appRouter: deps.appRouter });
  const editingTabState = useStageEditingTabState({
    appRouter: deps.appRouter,
    currentItemType: deps.currentItemType,
  });
  const dialogState = useStageDialogState({
    appMode: deps.appRouter.appMode,
  });

  return {
    ...chromeState,
    ...editingTabState,
    ...dialogState,
  };
}