import { type Ref } from "vue";
import { toast } from "vue-sonner";
import { z } from "zod";
import type { SelectableComponent } from "../../Core";
import type { AddElementPayload } from "../../../types/app";
import { log } from "@/lib/utils/logger";

const StageSelectableComponentSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
  })
  .refine((component) => Boolean(component.id || component.slug), {
    message: "Component selection requires an id or slug",
    path: ["id"],
  });

const StageComponentEditIdSchema = z.string().trim().min(1);

export interface UseStageComponentActionsDeps {
  pickerTargetSlot: Ref<string>;
  navigateToComponent: (componentId: string) => Promise<void>;
  openLeftSidebar: () => void;
  handleAddElement: (payload: AddElementPayload) => Promise<void>;
}

export interface UseStageComponentActionsReturn {
  handleComponentSelect: (component: SelectableComponent) => Promise<void>;
  handleEditComponent: (componentId: string) => Promise<void>;
}

export function useStageComponentActions(
  deps: UseStageComponentActionsDeps,
): UseStageComponentActionsReturn {
  const {
    pickerTargetSlot,
    navigateToComponent,
    openLeftSidebar,
    handleAddElement,
  } = deps;

  const handleComponentSelect = async (
    component: SelectableComponent,
  ): Promise<void> => {
    const parsedComponent = StageSelectableComponentSchema.safeParse(component);
    if (!parsedComponent.success) {
      log(
        "warn",
        "[useStageComponentActions] Ignoring invalid component selection",
        {
          issues: parsedComponent.error.issues,
        },
      );
      toast.error("Invalid component selection");
      return;
    }

    const nextComponent = parsedComponent.data;
    const componentId = nextComponent.id || nextComponent.slug;
    if (!componentId) {
      toast.error("Invalid component selection");
      return;
    }

    const slotName = pickerTargetSlot.value.trim();
    await handleAddElement({
      type: "component",
      componentSlug: componentId,
      data: {
        type: "Component",
        props: {},
        styles: {},
        children: [],
        ...(slotName ? { slot: slotName } : {}),
        reference: { type: "instance", masterId: componentId },
      },
    });
  };

  const handleEditComponent = async (componentId: string): Promise<void> => {
    const parsedComponentId = StageComponentEditIdSchema.safeParse(componentId);
    if (!parsedComponentId.success) {
      log(
        "warn",
        "[useStageComponentActions] Ignoring invalid component edit request",
        {
          componentId,
        },
      );
      toast.error("Invalid component selection");
      return;
    }

    try {
      await navigateToComponent(parsedComponentId.data);
      openLeftSidebar();
      toast.success("Switched to component editor");
    } catch (error) {
      log("error", "Failed to navigate to component", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to load component");
    }
  };

  return {
    handleComponentSelect,
    handleEditComponent,
  };
}
