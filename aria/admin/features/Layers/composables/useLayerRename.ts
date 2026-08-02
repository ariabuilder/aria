import type { Ref } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import { snapshotLayoutSlots } from "../../../../lib/layouts/slotEditing";
import { cloneDeep } from "../../Core";
import type { LocatedEditorNode } from "../../Core/composables/useEditorNodeRegistry";
import { findNodeById, updateNodeById } from "../utils/nodeHelpers";
import type { LayerStateChangeRecord } from "./useLayerHistory";

export interface LayerRenameNodeRegistry {
  locateNode(nodeId: string): LocatedEditorNode | null;
  getEditableTreeForNode(nodeId: string): {
    roots: BuilderNode[];
    commit: (roots: BuilderNode[]) => void;
  } | null;
}

export interface UseLayerRenameOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentLayout?: Ref<LayoutDSL | null>;
  nodeRegistry?: LayerRenameNodeRegistry | null;
  emitUpdateBlocks: (blocks: BuilderNode[]) => void;
  recordStateChange: (change: LayerStateChangeRecord) => void;
}

export type LayerRenameResult =
  | { success: true; store: "page-root" | "layout-slot" }
  | { success: false; reason: "NODE_NOT_FOUND" };

const renamedNode = (node: BuilderNode, label: string): BuilderNode => ({
  ...node,
  metadata: {
    ...node.metadata,
    label,
  },
});

export function useLayerRename(options: UseLayerRenameOptions) {
  const {
    blocks,
    currentLayout,
    nodeRegistry,
    emitUpdateBlocks,
    recordStateChange,
  } = options;

  const renameNode = (nodeId: string, label: string): LayerRenameResult => {
    const description = `Rename node to "${label}"`;
    const previousBlocks = cloneDeep(blocks.value ?? []);
    const previousLayoutSnapshot = currentLayout?.value
      ? snapshotLayoutSlots(currentLayout.value)
      : undefined;

    if (nodeRegistry) {
      const located = nodeRegistry.locateNode(nodeId);
      const editableTree = nodeRegistry.getEditableTreeForNode(nodeId);
      if (!located || !editableTree) {
        return { success: false, reason: "NODE_NOT_FOUND" };
      }

      const nextRoots = updateNodeById(editableTree.roots, nodeId, (node) =>
        renamedNode(node, label),
      );
      editableTree.commit(nextRoots);

      const nextBlocks = cloneDeep(blocks.value ?? []);
      if (located.store.kind === "page-root") {
        emitUpdateBlocks(nextBlocks);
      }

      recordStateChange({
        previousBlocks,
        nextBlocks,
        description,
        previousLayoutSnapshot,
        nextLayoutSnapshot: currentLayout?.value
          ? snapshotLayoutSlots(currentLayout.value)
          : undefined,
      });

      return { success: true, store: located.store.kind };
    }

    const currentBlocks = blocks.value ?? [];
    if (!findNodeById(currentBlocks, nodeId)) {
      return { success: false, reason: "NODE_NOT_FOUND" };
    }

    const nextBlocks = updateNodeById(currentBlocks, nodeId, (node) =>
      renamedNode(node, label),
    );
    emitUpdateBlocks(nextBlocks);
    recordStateChange({
      previousBlocks,
      nextBlocks: cloneDeep(nextBlocks),
      description,
      previousLayoutSnapshot,
      nextLayoutSnapshot: currentLayout?.value
        ? snapshotLayoutSlots(currentLayout.value)
        : undefined,
    });

    return { success: true, store: "page-root" };
  };

  return {
    renameNode,
  };
}
