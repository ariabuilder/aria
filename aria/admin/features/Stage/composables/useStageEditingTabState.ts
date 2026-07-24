import { ref, watch, type Ref } from "vue";
import type { EditableItemType, UseAppRouterReturn } from "../../Core";
import { StageEditingTabSchema, type StageEditingTab } from "../types";

export interface UseStageEditingTabStateDeps {
  appRouter: UseAppRouterReturn;
  currentItemType?: Ref<EditableItemType | undefined>;
}

export interface UseStageEditingTabStateReturn {
  editingTab: Ref<StageEditingTab>;
  setEditingTab: (tab: StageEditingTab) => void;
}

export function coerceStageEditingTabForItemType(
  tab: StageEditingTab,
  _itemType?: EditableItemType,
): StageEditingTab {
  if (tab === "components" || tab === "settings") {
    return "agent";
  }

  return tab;
}

export function useStageEditingTabState(
  deps: UseStageEditingTabStateDeps,
): UseStageEditingTabStateReturn {
  const { appRouter, currentItemType } = deps;

  const initialParsed = StageEditingTabSchema.safeParse(
    appRouter.editingTab.value,
  );
  const initialTab = initialParsed.success ? initialParsed.data : "layers";
  const editingTab = ref<StageEditingTab>(
    coerceStageEditingTabForItemType(initialTab, currentItemType?.value),
  );

  watch(
    () => appRouter.editingTab.value,
    (nextTab) => {
      const parsedTab = StageEditingTabSchema.safeParse(nextTab);
      if (!parsedTab.success) {
        return;
      }

      const coercedTab = coerceStageEditingTabForItemType(
        parsedTab.data,
        currentItemType?.value,
      );

      if (editingTab.value !== coercedTab) {
        editingTab.value = coercedTab;
      }
    },
    { immediate: true },
  );

  watch(
    () => currentItemType?.value,
    (itemType) => {
      if (!itemType) {
        return;
      }

      const coercedTab = coerceStageEditingTabForItemType(
        editingTab.value,
        itemType,
      );

      if (coercedTab !== editingTab.value) {
        editingTab.value = coercedTab;
      }
    },
  );

  watch(editingTab, (nextTab) => {
    if (appRouter.editingTab.value !== nextTab) {
      appRouter.setEditingTab(nextTab);
    }
  });

  const setEditingTab = (tab: StageEditingTab): void => {
    editingTab.value = coerceStageEditingTabForItemType(
      StageEditingTabSchema.parse(tab),
      currentItemType?.value,
    );
  };

  return {
    editingTab,
    setEditingTab,
  };
}
