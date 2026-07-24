export interface UseStagePersistenceActionsDeps {
  handleSave: () => void | Promise<void>;
  handlePublish: () => void | Promise<void>;
}

export interface UseStagePersistenceActionsReturn {
  handleStageSave: () => Promise<void>;
  handleStagePublish: () => Promise<void>;
}

export function useStagePersistenceActions(
  deps: UseStagePersistenceActionsDeps,
): UseStagePersistenceActionsReturn {
  const { handleSave, handlePublish } = deps;

  const handleStageSave = async (): Promise<void> => {
    await handleSave();
  };

  const handleStagePublish = async (): Promise<void> => {
    await handlePublish();
  };

  return {
    handleStageSave,
    handleStagePublish,
  };
}
