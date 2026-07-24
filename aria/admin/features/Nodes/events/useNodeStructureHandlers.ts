import type { Ref } from "vue";
import { toast } from "vue-sonner";
import { findNodeById as findNodeInTreeById } from "../../../../lib/blocks/nodeUtils";
import { generateNodeId } from "../../../../lib/ids/nodeId";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { cloneDeep } from "../../Core";
import { findParentAndIndex } from "./shared/nodeEventTreeUtils";
import type { ExecuteNodeEventOperation } from "./shared/nodeEventHistory";
import type { useEditorNodeRegistry } from "../../Core/composables/useEditorNodeRegistry";

type EditorNodeRegistry = ReturnType<typeof useEditorNodeRegistry>;

interface UseNodeStructureHandlersOptions {
  pageBlocks: Ref<BuilderNode[]>;
  nodeManipulation: {
    findNodeById: (nodes: BuilderNode[], id: string) => BuilderNode | null;
  };
  executeNodeEventOperation: ExecuteNodeEventOperation;
  setSelectedBlock: (id: string | null) => void;
  getSelectedNodeIds?: () => string[];
  editorNodeRegistry?: EditorNodeRegistry;
}

interface WrapTreeContext {
  roots: BuilderNode[];
  commit: (roots: BuilderNode[]) => void;
  parent: BuilderNode | null;
  targetArray: BuilderNode[];
}

export function useNodeStructureHandlers(
  options: UseNodeStructureHandlersOptions,
) {
  const {
    pageBlocks,
    executeNodeEventOperation,
    setSelectedBlock,
    getSelectedNodeIds,
    editorNodeRegistry,
  } = options;

  const resolveWrapTreeContext = (nodeId: string): WrapTreeContext | null => {
    if (editorNodeRegistry) {
      const editable = editorNodeRegistry.getEditableTreeForNode(nodeId);
      if (editable) {
        const position = findParentAndIndex(editable.roots, nodeId);
        if (!position) {
          return null;
        }

        const { parent, index } = position;
        const targetArray = parent ? parent.children! : editable.roots;
        if (!targetArray[index]) {
          return null;
        }

        return {
          roots: editable.roots,
          commit: editable.commit,
          parent,
          targetArray,
        };
      }
    }

    const position = findParentAndIndex(pageBlocks.value, nodeId);
    if (!position) {
      return null;
    }

    const { parent, index } = position;
    const targetArray = parent ? parent.children! : pageBlocks.value;
    if (!targetArray[index]) {
      return null;
    }

    return {
      roots: pageBlocks.value,
      commit: (roots) => {
        pageBlocks.value = roots;
      },
      parent,
      targetArray,
    };
  };

  const wrapNode = (nodeId: string, wrapperType: "Container" | "Section") => {
    const selectedNodeIds = (getSelectedNodeIds?.() ?? []).filter(
      (selectedId, index, ids) => ids.indexOf(selectedId) === index,
    );
    const candidateNodeIds = selectedNodeIds.includes(nodeId)
      ? selectedNodeIds
      : [nodeId];

    const treeContext = resolveWrapTreeContext(nodeId);
    if (!treeContext) {
      toast.error("Block not found");
      return;
    }

    const positionByNodeId = new Map<
      string,
      { parent: BuilderNode | null; index: number }
    >();

    for (const candidateId of candidateNodeIds) {
      const position = findParentAndIndex(treeContext.roots, candidateId);
      if (position) {
        positionByNodeId.set(candidateId, position);
      }
    }

    const targetPosition = positionByNodeId.get(nodeId);
    if (!targetPosition) {
      toast.error("Block not found");
      return;
    }

    const { parent } = targetPosition;
    const parentId = parent?.id ?? null;
    const positionsToWrap = candidateNodeIds
      .map((candidateId) => {
        const position = positionByNodeId.get(candidateId);
        if (!position) {
          return null;
        }

        const candidateParentId = position.parent?.id ?? null;
        if (candidateParentId !== parentId) {
          return null;
        }

        const siblings = position.parent
          ? position.parent.children!
          : treeContext.roots;
        const node = siblings[position.index];
        if (!node) {
          return null;
        }

        return {
          nodeId: candidateId,
          index: position.index,
          node,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          nodeId: string;
          index: number;
          node: BuilderNode;
        } => entry !== null,
      )
      .sort((left, right) => left.index - right.index);

    if (positionsToWrap.length === 0) {
      toast.error("Could not find block position");
      return;
    }

    const wrapperInsertIndex = positionsToWrap[0].index;
    const wrapperNodeId = generateNodeId();

    const resolveSiblingArray = (
      roots: BuilderNode[],
    ): BuilderNode[] | null => {
      if (!parent) {
        return roots;
      }

      const parentNode = findNodeInTreeById(roots, parent.id);
      return parentNode?.children ?? null;
    };

    const applyWrap = (): BuilderNode[] => {
      const nextRoots = cloneDeep(treeContext.roots);
      const siblings = resolveSiblingArray(nextRoots);
      if (!siblings) {
        return treeContext.roots;
      }

      const wrappedNodes: BuilderNode[] = [];
      for (let i = positionsToWrap.length - 1; i >= 0; i--) {
        const entry = positionsToWrap[i]!;
        const node = siblings[entry.index];
        if (!node) {
          return treeContext.roots;
        }
        wrappedNodes.unshift(node);
        siblings.splice(entry.index, 1);
      }

      siblings.splice(wrapperInsertIndex, 0, {
        id: wrapperNodeId,
        type: wrapperType,
        props: {},
        children: wrappedNodes,
        styles: {},
      });
      return nextRoots;
    };

    const applyUnwrap = (): BuilderNode[] => {
      const nextRoots = cloneDeep(treeContext.roots);
      const siblings = resolveSiblingArray(nextRoots);
      if (!siblings) {
        return treeContext.roots;
      }

      const wrapperIndex = siblings.findIndex((node) => node.id === wrapperNodeId);
      if (wrapperIndex < 0) {
        return nextRoots;
      }

      const [wrapperNode] = siblings.splice(wrapperIndex, 1);
      const wrappedChildren = wrapperNode?.children ?? [];
      wrappedChildren.forEach((node, offset) => {
        siblings.splice(wrapperInsertIndex + offset, 0, node);
      });
      return nextRoots;
    };

    void executeNodeEventOperation(
      {
        type: "update-node",
        description:
          positionsToWrap.length > 1
            ? `Wrapped ${positionsToWrap.length} blocks in ${wrapperType}`
            : `Wrapped block in ${wrapperType}`,
        affectedNodeIds: [
          ...positionsToWrap.map((entry) => entry.nodeId),
          wrapperNodeId,
        ],
      },
      {
        undo: () => {
          treeContext.commit(applyUnwrap());
          setSelectedBlock(positionsToWrap[0]?.nodeId ?? null);
        },
        redo: () => {
          treeContext.commit(applyWrap());
          setSelectedBlock(wrapperNodeId);
        },
      },
    ).then((result) => {
      if (!result.success) {
        toast.error(result.error ?? `Failed to wrap block in ${wrapperType}`);
        return;
      }

      toast.success(
        positionsToWrap.length > 1
          ? `Wrapped ${positionsToWrap.length} blocks in ${wrapperType}`
          : `Wrapped block in ${wrapperType}`,
      );
    });
  };

  const handleWrapInContainer = (nodeId: string): void => {
    wrapNode(nodeId, "Container");
  };

  const handleWrapInSection = (nodeId: string): void => {
    wrapNode(nodeId, "Section");
  };

  return {
    handleWrapInContainer,
    handleWrapInSection,
  };
}
