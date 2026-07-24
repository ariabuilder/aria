import type { Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { AppNodeEventHandlers } from "../../Core/types/injectionKeys";
import type { NodeSwapOption } from "../../Nodes/swap/nodeSwapSchemas";

export interface NodeEventHandlers {
  handleCopyBlock: (nodeId: string) => void;
  handlePasteBlock: (nodeId: string) => Promise<void>;
  handleDuplicateBlock: (nodeId: string) => void;
  handleDeleteBlock: (nodeId: string) => void;
  handleDeleteBlocks: (nodeIds: string[]) => void;
  handleWrapInContainer: (nodeId: string) => void;
  handleWrapInSection: (nodeId: string) => void;
  handleDetachComponent: (nodeId: string) => void;
  getSwapOptionsForNode: (node: BuilderNode) => NodeSwapOption[];
  getSwapOptionsForNodes: (nodeIds: string[]) => NodeSwapOption[];
  swapNode: (nodeId: string, strategyId: string) => Promise<void>;
}

export interface UseLayerNodeActionsOptions {
  appNodeEventHandlers: AppNodeEventHandlers;
  /** @deprecated Kept for type compatibility; app handlers are always used. */
  currentPageNodes?: Ref<BuilderNode[]>;
}

export function useLayerNodeActions(options: UseLayerNodeActionsOptions) {
  const { appNodeEventHandlers } = options;

  const nodeEventHandlers: NodeEventHandlers = {
    handleCopyBlock: (nodeId) => {
      appNodeEventHandlers.handleCopyBlock(nodeId);
    },
    handlePasteBlock: (nodeId) => appNodeEventHandlers.handlePasteBlock(nodeId),
    handleDuplicateBlock: (nodeId) => {
      void appNodeEventHandlers.handleDuplicateBlock(nodeId);
    },
    handleDeleteBlock: (nodeId) => {
      void appNodeEventHandlers.handleDeleteBlock(nodeId);
    },
    handleDeleteBlocks: (nodeIds) => {
      void appNodeEventHandlers.handleDeleteBlocks(nodeIds);
    },
    handleWrapInContainer: (nodeId) => {
      appNodeEventHandlers.handleWrapInContainer(nodeId);
    },
    handleWrapInSection: (nodeId) => {
      appNodeEventHandlers.handleWrapInSection(nodeId);
    },
    handleDetachComponent: (nodeId) => {
      void appNodeEventHandlers.handleDetachComponent(nodeId);
    },
    getSwapOptionsForNode: (node) =>
      appNodeEventHandlers.getSwapOptionsForNode(node),
    getSwapOptionsForNodes: (nodeIds) =>
      appNodeEventHandlers.getSwapOptionsForNodes(nodeIds),
    swapNode: (nodeId, strategyId) =>
      appNodeEventHandlers.swapNode(nodeId, strategyId),
  };

  return {
    nodeEventHandlers,
  };
}
