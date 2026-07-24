import type { Ref } from "vue";
import { usePreview } from "./usePreview";

export interface UseStagePreviewStateReturn {
  isPreview: Readonly<Ref<boolean>>;
}

export function useStagePreviewState(): UseStagePreviewStateReturn {
  const { isPreview } = usePreview();

  return {
    isPreview,
  };
}
