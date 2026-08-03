import { ref, type Ref } from "vue";
import { z } from "zod";

const StageDisplayStateSchema = z.object({
  showOutlines: z.boolean(),
  showSelectionSizing: z.boolean(),
  showSelectionToolbar: z.boolean(),
  wireframeMode: z.boolean(),
});

const SELECTION_SIZING_STORAGE_KEY = "aria-show-selection-sizing";
const SELECTION_TOOLBAR_STORAGE_KEY = "aria-show-selection-toolbar";

function readStoredSelectionSizingVisibility(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(SELECTION_SIZING_STORAGE_KEY) !== "false";
}

function readStoredSelectionToolbarVisibility(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(SELECTION_TOOLBAR_STORAGE_KEY) !== "false";
}

export interface UseStageDisplayStateReturn {
  showOutlines: Ref<boolean>;
  showSelectionSizing: Ref<boolean>;
  showSelectionToolbar: Ref<boolean>;
  wireframeMode: Ref<boolean>;
  setShowOutlines: (value: boolean) => void;
  setShowSelectionSizing: (value: boolean) => void;
  setShowSelectionToolbar: (value: boolean) => void;
  setWireframeMode: (value: boolean) => void;
}

export function useStageDisplayState(): UseStageDisplayStateReturn {
  const initialState = StageDisplayStateSchema.parse({
    showOutlines: false,
    showSelectionSizing: readStoredSelectionSizingVisibility(),
    showSelectionToolbar: readStoredSelectionToolbarVisibility(),
    wireframeMode: false,
  });

  const showOutlines = ref(initialState.showOutlines);
  const showSelectionSizing = ref(initialState.showSelectionSizing);
  const showSelectionToolbar = ref(initialState.showSelectionToolbar);
  const wireframeMode = ref(initialState.wireframeMode);

  const setShowOutlines = (value: boolean): void => {
    showOutlines.value = StageDisplayStateSchema.shape.showOutlines.parse(value);
  };

  const setShowSelectionSizing = (value: boolean): void => {
    const parsedValue =
      StageDisplayStateSchema.shape.showSelectionSizing.parse(value);
    showSelectionSizing.value = parsedValue;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SELECTION_SIZING_STORAGE_KEY,
        String(parsedValue),
      );
    }
  };

  const setShowSelectionToolbar = (value: boolean): void => {
    const parsedValue =
      StageDisplayStateSchema.shape.showSelectionToolbar.parse(value);
    showSelectionToolbar.value = parsedValue;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SELECTION_TOOLBAR_STORAGE_KEY,
        String(parsedValue),
      );
    }
  };

  const setWireframeMode = (value: boolean): void => {
    wireframeMode.value =
      StageDisplayStateSchema.shape.wireframeMode.parse(value);
  };

  return {
    showOutlines,
    showSelectionSizing,
    showSelectionToolbar,
    wireframeMode,
    setShowOutlines,
    setShowSelectionSizing,
    setShowSelectionToolbar,
    setWireframeMode,
  };
}
