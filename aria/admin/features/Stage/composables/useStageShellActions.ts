import type { AddElementPayload } from "../../../types/app";
import { AddElementPayloadSchema } from "../../Nodes/events/shared/nodeEventSchemas";
import { isEmptyLibraryComponentPayload } from "../../Nodes/events/shared/libraryComponentGuard";
import { useShellSignalBridge } from "../../Core";
import type { StageEditingTab } from "../types";
import { log } from "@/lib/utils/logger";

const StageShellSlotNameSchema = AddElementPayloadSchema.shape.type;

export interface UseStageShellActionsDeps {
  openPicker: (slotName: string) => void;
  openComponentPicker: () => void;
  openLeftSidebar: () => void;
  setEditingTab: (value: StageEditingTab) => void;
  handleAddElement: (payload: AddElementPayload) => void;
}

export interface UseStageShellActionsReturn {
  handleOpenPicker: (slotName: string) => void;
  handleSidebarAddElement: (payload: AddElementPayload) => void;
  handleOpenAddElements: () => void;
}

export function useStageShellActions(
  deps: UseStageShellActionsDeps,
): UseStageShellActionsReturn {
  const { broadcastOpenAddElements } = useShellSignalBridge();
  const {
    openPicker,
    openComponentPicker,
    openLeftSidebar,
    setEditingTab,
    handleAddElement,
  } = deps;

  const handleOpenPicker = (slotName: string): void => {
    const parsedSlotName = StageShellSlotNameSchema.safeParse(slotName);
    if (!parsedSlotName.success) {
      log("warn", "[useStageShellActions] Ignoring invalid picker slot", {
        slotName,
      });
      return;
    }

    openPicker(parsedSlotName.data);
  };

  const handleSidebarAddElement = (payload: AddElementPayload): void => {
    const parsedPayload = AddElementPayloadSchema.safeParse(payload);
    if (!parsedPayload.success) {
      log(
        "warn",
        "[useStageShellActions] Ignoring invalid add-element payload",
        {
          issues: parsedPayload.error.issues,
        },
      );
      return;
    }

    if (
      parsedPayload.data.type === "component" &&
      isEmptyLibraryComponentPayload(
        parsedPayload.data.type,
        parsedPayload.data.data,
        parsedPayload.data.componentSlug,
      )
    ) {
      openComponentPicker();
      return;
    }

    handleAddElement(parsedPayload.data);
  };

  const handleOpenAddElements = (): void => {
    openLeftSidebar();
    setEditingTab("add-elements");
    broadcastOpenAddElements();
  };

  return {
    handleOpenPicker,
    handleSidebarAddElement,
    handleOpenAddElements,
  };
}
