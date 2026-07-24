import { ref, type Ref } from "vue";
import { z } from "zod";

const StageDisplayStateSchema = z.object({
  showOutlines: z.boolean(),
  wireframeMode: z.boolean(),
});

export interface UseStageDisplayStateReturn {
  showOutlines: Ref<boolean>;
  wireframeMode: Ref<boolean>;
  setShowOutlines: (value: boolean) => void;
  setWireframeMode: (value: boolean) => void;
}

export function useStageDisplayState(): UseStageDisplayStateReturn {
  const initialState = StageDisplayStateSchema.parse({
    showOutlines: false,
    wireframeMode: false,
  });

  const showOutlines = ref(initialState.showOutlines);
  const wireframeMode = ref(initialState.wireframeMode);

  const setShowOutlines = (value: boolean): void => {
    showOutlines.value = StageDisplayStateSchema.shape.showOutlines.parse(value);
  };

  const setWireframeMode = (value: boolean): void => {
    wireframeMode.value =
      StageDisplayStateSchema.shape.wireframeMode.parse(value);
  };

  return {
    showOutlines,
    wireframeMode,
    setShowOutlines,
    setWireframeMode,
  };
}