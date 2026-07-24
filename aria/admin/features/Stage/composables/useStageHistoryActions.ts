import { useHistoryControls } from "../../History/composables/useHistoryControls";

export interface UseStageHistoryActionsReturn {
  handleUndo: () => void;
  handleRedo: () => void;
}

export function useStageHistoryActions(): UseStageHistoryActionsReturn {
  const { handleUndo, handleRedo } = useHistoryControls();

  const triggerUndo = (): void => {
    void handleUndo();
  };

  const triggerRedo = (): void => {
    void handleRedo();
  };

  return {
    handleUndo: triggerUndo,
    handleRedo: triggerRedo,
  };
}
