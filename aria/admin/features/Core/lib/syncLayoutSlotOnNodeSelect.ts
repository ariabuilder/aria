/**
 * Sync active layout slot when selecting a node in the layer tree or on canvas.
 */

import type { LayoutDSL } from "../../../../lib/types/nodes";
import type { LayoutWithSlotsLike } from "../../../../lib/layouts/slotEditing";
import type { UseActiveLayoutSlotReturn } from "../composables/useActiveLayoutSlot";
import type { useEditorNodeRegistry } from "../composables/useEditorNodeRegistry";
import type { LocatedEditorNode } from "../composables/useEditorNodeRegistry";

type EditorNodeRegistryApi = ReturnType<typeof useEditorNodeRegistry>;

export interface SyncLayoutSlotOnNodeSelectResult {
  slotChanged: boolean;
  slotName?: string;
  located: LocatedEditorNode | null;
}

export interface SyncLayoutSlotOnNodeSelectOptions {
  nodeId: string;
  registry: Pick<EditorNodeRegistryApi, "locateNode"> | null | undefined;
  activeLayoutSlot: UseActiveLayoutSlotReturn | null | undefined;
  layout: LayoutWithSlotsLike | LayoutDSL | null | undefined;
}

export function syncLayoutSlotOnNodeSelect(
  options: SyncLayoutSlotOnNodeSelectOptions,
): SyncLayoutSlotOnNodeSelectResult {
  const { nodeId, registry, activeLayoutSlot, layout } = options;

  if (!registry || !activeLayoutSlot) {
    return { slotChanged: false, located: null };
  }

  const located = registry.locateNode(nodeId);
  if (!located) {
    return { slotChanged: false, located: null };
  }

  if (located.store.kind === "layout-slot") {
    const slotName = located.store.slotName;
    const prev = activeLayoutSlot.activeSlot.value.name;
    activeLayoutSlot.enterSlot(slotName, { layout });
    return {
      slotChanged: prev !== slotName,
      slotName,
      located,
    };
  }

  if (activeLayoutSlot.isLayoutSlotEditing.value) {
    activeLayoutSlot.resetToPageScope();
    return { slotChanged: true, located };
  }

  return { slotChanged: false, located };
}
