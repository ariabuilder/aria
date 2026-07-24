import { onBeforeUnmount, ref, watch, type Ref } from "vue";

import { useShellSignalBridge } from "../../Core";
import type { AppMode } from "../../Core/types/router";
import { useSettingsDialog } from "@/features/Studio/settings/composables/useSettingsDialog";
import {
  StageDialogStateSchema,
  StagePickerTargetSlotSchema,
} from "../types";

export interface UseStageDialogStateDeps {
  appMode: Ref<AppMode>;
}

export interface UseStageDialogStateReturn {
  pickerOpen: Ref<boolean>;
  pickerTargetSlot: Ref<string>;
  openPicker: (slotName: string) => void;
  openComponentPicker: () => void;
  setPickerOpen: (value: boolean) => void;
  openSettings: () => void;
  resetDialogs: () => void;
}

export function useStageDialogState(
  deps: UseStageDialogStateDeps,
): UseStageDialogStateReturn {
  const { appMode } = deps;
  const { onRequestComponentPicker } = useShellSignalBridge();
  const settingsDialog = useSettingsDialog();

  const initialState = StageDialogStateSchema.parse({
    pickerOpen: false,
    pickerTargetSlot: "",
  });

  const pickerOpen = ref(initialState.pickerOpen);
  const pickerTargetSlot = ref(initialState.pickerTargetSlot);

  const resetDialogs = (): void => {
    pickerOpen.value = false;
    pickerTargetSlot.value = "";
    settingsDialog.close();
  };

  const setPickerOpen = (value: boolean): void => {
    pickerOpen.value = StageDialogStateSchema.shape.pickerOpen.parse(value);
  };

  const openPicker = (slotName: string): void => {
    pickerTargetSlot.value = StagePickerTargetSlotSchema.parse(slotName);
    pickerOpen.value = true;
  };

  const openComponentPicker = (): void => {
    pickerTargetSlot.value = StagePickerTargetSlotSchema.parse("");
    pickerOpen.value = true;
  };

  const openSettings = (): void => {
    settingsDialog.open();
  };

  const stopRequestComponentPicker = onRequestComponentPicker((slotName) => {
    if (appMode.value !== "stage") {
      return;
    }

    openPicker(slotName);
  });

  if (stopRequestComponentPicker) {
    onBeforeUnmount(() => {
      stopRequestComponentPicker();
    });
  }

  watch(appMode, (mode) => {
    if (mode !== "stage") {
      resetDialogs();
    }
  });

  return {
    pickerOpen,
    pickerTargetSlot,
    openPicker,
    openComponentPicker,
    setPickerOpen,
    openSettings,
    resetDialogs,
  };
}
