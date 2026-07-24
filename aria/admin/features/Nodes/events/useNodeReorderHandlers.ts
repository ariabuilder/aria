import type { Ref } from "vue";
import { toast } from "vue-sonner";
import type { BuilderNode, PageDSL } from "../../../../lib/types/nodes";
import type { LayersReorderData } from "../../../types/app";
import type { ExecuteNodeEventOperation } from "./shared/nodeEventHistory";

interface UseNodeReorderHandlersOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  executeNodeEventOperation: ExecuteNodeEventOperation;
}

export function useNodeReorderHandlers(options: UseNodeReorderHandlersOptions) {
  const { pageBlocks, currentPage, executeNodeEventOperation } = options;

  const handleLayersReorderNode = (data: LayersReorderData): void => {
    const { nodeId, targetNodeId, position } = data;

    const page = currentPage.value;
    if (!page) {
      toast.error("No active page loaded");
      return;
    }

    const draggedIndex = page.nodes.findIndex((node) => node.id === nodeId);
    if (draggedIndex === -1) return;

    const targetIndex = page.nodes.findIndex(
      (node) => node.id === targetNodeId,
    );
    if (targetIndex === -1) return;

    const draggedNode = page.nodes[draggedIndex];
    const originalIndex = draggedIndex;

    const moveNode = (sourceNodeId: string, destinationNodeId: string) => {
      const currentDraggedIndex = page.nodes.findIndex(
        (node) => node.id === sourceNodeId,
      );
      const currentTargetIndex = page.nodes.findIndex(
        (node) => node.id === destinationNodeId,
      );

      if (currentDraggedIndex === -1 || currentTargetIndex === -1) {
        return;
      }

      const node = page.nodes.splice(currentDraggedIndex, 1)[0];
      const adjustedTargetIdx =
        currentTargetIndex > currentDraggedIndex
          ? currentTargetIndex - 1
          : currentTargetIndex;
      const insertIdx =
        position === "before" ? adjustedTargetIdx : adjustedTargetIdx + 1;
      page.nodes.splice(insertIdx, 0, node);
      pageBlocks.value = [...page.nodes];
    };

    void executeNodeEventOperation(
      {
        type: "move-node",
        description: `Move ${draggedNode.type} ${position} ${page.nodes[targetIndex]?.type || "target"}`,
        affectedNodeIds: [nodeId],
      },
      {
        undo: () => {
          const currentIndex = page.nodes.findIndex(
            (node) => node.id === nodeId,
          );
          if (currentIndex !== -1) {
            page.nodes.splice(currentIndex, 1);
          }
          page.nodes.splice(originalIndex, 0, draggedNode);
          pageBlocks.value = [...page.nodes];
        },
        redo: () => {
          moveNode(nodeId, targetNodeId);
        },
      },
    ).then((result) => {
      if (!result.success) {
        toast.error(result.error ?? "Failed to reorder block");
      }
    });
  };

  return { handleLayersReorderNode };
}
