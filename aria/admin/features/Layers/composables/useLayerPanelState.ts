import { computed, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { canHaveChildren, hasChildren as nodeHasChildren } from "../utils/nodeHelpers";
import { VIRTUAL_SLOT_NAMES } from "../types";

export interface LayerPanelLayoutInfo {
  id?: string;
  name?: string;
  slots?: Array<{
    name: string;
    label?: string;
    description?: string;
    isDefault?: boolean;
  }>;
}

export interface UseLayerPanelStateOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentItemType: Ref<"page" | "layout" | "component" | undefined>;
  currentLayout: Ref<LayerPanelLayoutInfo | undefined>;
}

export function useLayerPanelState(options: UseLayerPanelStateOptions) {
  const { blocks, currentItemType, currentLayout } = options;

  const currentPageNodes = computed<BuilderNode[]>(() => blocks.value || []);

  const currentVirtualSlot = computed<string>(() => {
    return currentItemType.value === "page"
      ? VIRTUAL_SLOT_NAMES.PAGE_CONTENT
      : VIRTUAL_SLOT_NAMES.COMPONENT_CONTENT;
  });

  const showSlots = computed<boolean>(() => {
    return (
      currentItemType.value === "page" &&
      !!currentLayout.value &&
      !!currentLayout.value.slots &&
      currentLayout.value.slots.length > 0
    );
  });

  const hasLayers = computed<boolean>(() => {
    return (
      (blocks.value && blocks.value.length > 0) ||
      currentItemType.value === "page" ||
      currentItemType.value === "component"
    );
  });

  const hasChildren = (node: BuilderNode): boolean => {
    return nodeHasChildren(node);
  };

  const canAcceptChildren = (node: BuilderNode): boolean => {
    return canHaveChildren(node);
  };

  return {
    currentPageNodes,
    currentVirtualSlot,
    showSlots,
    hasLayers,
    hasChildren,
    canAcceptChildren,
  };
}
