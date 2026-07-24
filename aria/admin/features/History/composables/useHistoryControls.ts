import { useHistory } from "./useHistory";

export interface UseHistoryControlsReturn {
  handleUndo: () => Promise<void>;
  handleRedo: () => Promise<void>;
  handleJumpTo: (index: number) => Promise<void>;
  clearFailure: () => void;
}

export function useHistoryControls(): UseHistoryControlsReturn {
  const history = useHistory();

  return {
    handleUndo: async (): Promise<void> => {
      await history.undo();
    },
    handleRedo: async (): Promise<void> => {
      await history.redo();
    },
    handleJumpTo: async (index: number): Promise<void> => {
      await history.jumpTo(index);
    },
    clearFailure: (): void => {
      history.clearLastFailure();
    },
  };
}
