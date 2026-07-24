/**
 * Slot-level add/clear operations for the Stage iframe.
 */

import { generateNodeId } from "../../../../lib/ids/nodeId";
import { resolveNodeSlotForLayout } from "../../../../lib/layouts/resolveNodeSlot";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { ComponentDefinition } from "../types";

export interface UseSlotActionsOptions {
  getBlocks: () => BuilderNode[];
  getCurrentLayout: () =>
    | {
        slots?: {
          name: string;
          label?: string;
          description?: string;
          isDefault?: boolean;
        }[];
      }
    | null
    | undefined;
  emit: {
    (e: "addBlock", block: BuilderNode, parentId: string | null): void;
    (e: "deleteBlock", id: string): void;
  };
}

export function useSlotActions(options: UseSlotActionsOptions) {
  const { getBlocks, getCurrentLayout, emit } = options;

  const handleAddComponentToSlot = (
    slotName: string,
    componentDef: ComponentDefinition,
  ) => {
    const newBlock: BuilderNode = {
      id: generateNodeId(),
      type: "Component",
      props: {},
      children: [],
      styles: {},
      slot: slotName,
      reference: { type: "instance", masterId: componentDef.id },
    };
    emit("addBlock", newBlock, null);
  };

  /** Clearing all blocks from a specific slot. */
  const handleClearSlot = (slotName: string) => {
    const layout = getCurrentLayout();
    const defaultSlot =
      layout?.slots?.find((s) => s.isDefault)?.name || "default";
    const targetSlot = slotName || defaultSlot;

    const blocksToRemove = getBlocks().filter((b) => {
      return resolveNodeSlotForLayout(b, layout) === targetSlot;
    });

    blocksToRemove.forEach((b) => {
      emit("deleteBlock", b.id);
    });
  };

  return {
    handleAddComponentToSlot,
    handleClearSlot,
  };
}
