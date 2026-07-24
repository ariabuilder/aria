import type { LayerDragEvent } from "../types";

export const LAYERS_DRAG_GROUP = {
  name: "layers",
  pull: true,
  put: true,
} as const;

export const LAYERS_DRAG_CLASS_NAMES = {
  ghostClass: "ghost",
  chosenClass: "chosen",
  dragClass: "dragging",
  itemKey: "id",
} as const;

const STABLE_SORTABLE_OPTIONS = {
  animation: 150,
  direction: "vertical",
  emptyInsertThreshold: 18,
  fallbackOnBody: true,
  fallbackTolerance: 4,
  swapThreshold: 0.65,
  invertedSwapThreshold: 0.35,
  invertSwap: true,
} as const;

export function resolveDragListId(event: LayerDragEvent): string | null {
  const item = event.item;
  if (!item || typeof item.closest !== "function") {
    return null;
  }

  const childrenList = item.closest("[data-layer-children-list]");
  if (childrenList) {
    const parentId = childrenList.getAttribute("data-layer-children-list");
    if (parentId) {
      return `children:${parentId}`;
    }
  }

  const slotGroup = item.closest("[data-layer-slot-group]");
  const slotName = slotGroup?.getAttribute("data-layer-slot-name");
  if (slotName && item.closest("[data-layer-slot-list]")) {
    return `slot:${slotName}`;
  }

  return null;
}

export function createSlotDragConfig() {
  return {
    group: LAYERS_DRAG_GROUP,
    ...STABLE_SORTABLE_OPTIONS,
    ...LAYERS_DRAG_CLASS_NAMES,
  };
}

export function createChildrenDragConfig() {
  return {
    group: LAYERS_DRAG_GROUP,
    ...STABLE_SORTABLE_OPTIONS,
    ...LAYERS_DRAG_CLASS_NAMES,
    class: "layer-children",
  };
}
