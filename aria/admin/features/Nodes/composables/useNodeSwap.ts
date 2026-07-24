import type { Ref } from "vue";
import { toast } from "vue-sonner";
import {
  deleteNodeById,
  findNodeById as findNodeInTreeById,
  insertNode as insertNodeInTree,
} from "../../../../lib/blocks/nodeUtils";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import {
  buildSwappedNode,
  isLeafSwapCandidate,
  normalizeSwapNodeType,
} from "../../../../lib/blocks/svgIconNodeConversion";
import { resolveOneIconSvgData } from "@/lib/iconDataClient";
import {
  cloneDeep,
  findParentAndIndex,
} from "../events/shared/nodeEventTreeUtils";
import type { ExecuteNodeEventOperation } from "../events/shared/nodeEventHistory";
import { replaceNodeViaAction } from "../events/shared/replaceNodeViaAction";
import {
  NodeSwapOptionSchema,
  NodeSwapRequestSchema,
  NodeSwapStrategyIdSchema,
  type NodeSwapOption,
  type NodeSwapStrategyId,
} from "../swap/nodeSwapSchemas";
import type { useEditorNodeRegistry } from "../../Core/composables/useEditorNodeRegistry";

type EditorNodeRegistry = ReturnType<typeof useEditorNodeRegistry>;

function layoutUsesNodeRegistry(
  editorNodeRegistry: EditorNodeRegistry | undefined,
  currentLayout: LayoutDSL | null | undefined,
): boolean {
  return Boolean(editorNodeRegistry && (currentLayout?.slots?.length ?? 0) > 0);
}

type SwapStrategy = {
  id: NodeSwapStrategyId;
  from: "svg" | "icon";
  label: string;
};

const SWAP_STRATEGIES: readonly SwapStrategy[] = [
  { id: "svg-to-icon", from: "svg", label: "Icon" },
  { id: "icon-to-svg", from: "icon", label: "SVG" },
] as const;

interface SwapTreeContext {
  roots: BuilderNode[];
  commit: (roots: BuilderNode[]) => void;
  parent: BuilderNode | null;
  index: number;
}

interface UseNodeSwapOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentLayout?: Ref<LayoutDSL | null>;
  executeNodeEventOperation: ExecuteNodeEventOperation;
  setSelectedBlock: (id: string | null) => void;
  resolveMutationPath: () => {
    collection: "pages" | "layouts" | "components";
    id: string;
  } | null;
  editorNodeRegistry?: EditorNodeRegistry;
}

function replaceNodeAtPosition(
  roots: BuilderNode[],
  parent: BuilderNode | null,
  _index: number,
  nodeId: string,
  replacement: BuilderNode,
): BuilderNode[] {
  const nextRoots = cloneDeep(roots);
  const parentNode = parent ? findNodeInTreeById(nextRoots, parent.id) : null;
  const siblings = parentNode ? parentNode.children : nextRoots;
  if (!siblings) {
    return roots;
  }

  const currentIndex = siblings.findIndex((node) => node.id === nodeId);
  if (currentIndex < 0) {
    return roots;
  }

  siblings[currentIndex] = replacement;
  return nextRoots;
}

function applyLocalReplacement(params: {
  pageBlocks: Ref<BuilderNode[]>;
  treeContext: SwapTreeContext;
  nodeId: string;
  replacement: BuilderNode;
}): void {
  const nextRoots = replaceNodeAtPosition(
    params.treeContext.roots,
    params.treeContext.parent,
    params.treeContext.index,
    params.nodeId,
    params.replacement,
  );
  params.treeContext.commit(nextRoots);

  if (findNodeInTreeById(params.pageBlocks.value, params.nodeId)) {
    params.pageBlocks.value = insertNodeInTree(
      deleteNodeById(params.pageBlocks.value, params.nodeId),
      params.treeContext.parent?.id ?? null,
      params.replacement,
      params.treeContext.index,
    );
  }
}

export function useNodeSwap(options: UseNodeSwapOptions) {
  const {
    pageBlocks,
    currentLayout,
    executeNodeEventOperation,
    setSelectedBlock,
    resolveMutationPath,
    editorNodeRegistry,
  } = options;

  let swapInFlight = false;

  const resolveTreeContext = (nodeId: string): SwapTreeContext | null => {
    if (editorNodeRegistry) {
      const editable = editorNodeRegistry.getEditableTreeForNode(nodeId);
      if (editable) {
        const position = findParentAndIndex(editable.roots, nodeId);
        if (!position) {
          return null;
        }

        const { parent, index } = position;
        const targetArray = parent ? parent.children : editable.roots;
        if (!targetArray[index]) {
          return null;
        }

        return {
          roots: editable.roots,
          commit: editable.commit,
          parent,
          index,
        };
      }
    }

    const position = findParentAndIndex(pageBlocks.value, nodeId);
    if (!position) {
      return null;
    }

    const { parent, index } = position;
    const targetArray = parent ? parent.children : pageBlocks.value;
    if (!targetArray[index]) {
      return null;
    }

    return {
      roots: pageBlocks.value,
      commit: (roots) => {
        pageBlocks.value = roots;
      },
      parent,
      index,
    };
  };

  const getSwapOptionsForNode = (node: BuilderNode): NodeSwapOption[] => {
    const normalizedType = normalizeSwapNodeType(node.type);
    if (!normalizedType || !isLeafSwapCandidate(node)) {
      return [];
    }

    return SWAP_STRATEGIES.filter(
      (strategy) => strategy.from === normalizedType,
    ).map((strategy) =>
      NodeSwapOptionSchema.parse({
        id: strategy.id,
        label: strategy.label,
      }),
    );
  };

  const getSwapOptionsForNodes = (nodeIds: string[]): NodeSwapOption[] => {
    if (nodeIds.length === 0) return [];

    const normalizedTypes = new Set<string>();

    for (const id of nodeIds) {
      let node = findNodeInTreeById(pageBlocks.value, id) ?? null;
      if (!node && editorNodeRegistry) {
        const editable = editorNodeRegistry.getEditableTreeForNode(id);
        if (editable) {
          node = findNodeInTreeById(editable.roots, id) ?? null;
        }
      }
      if (!node) continue;

      const normalizedType = normalizeSwapNodeType(node.type);
      if (!normalizedType || !isLeafSwapCandidate(node)) continue;

      normalizedTypes.add(normalizedType);
    }

    if (normalizedTypes.size !== 1) return [];

    const [commonType] = [...normalizedTypes];

    return SWAP_STRATEGIES.filter(
      (strategy) => strategy.from === commonType,
    ).map((strategy) =>
      NodeSwapOptionSchema.parse({
        id: strategy.id,
        label: strategy.label,
      }),
    );
  };

  const swapNode = async (
    nodeId: string,
    strategyId: string,
  ): Promise<void> => {
    if (swapInFlight) {
      return;
    }

    const parsedRequest = NodeSwapRequestSchema.safeParse({
      nodeId,
      strategyId,
    });
    if (!parsedRequest.success) {
      toast.error(
        parsedRequest.error.issues[0]?.message ?? "Invalid swap request",
      );
      return;
    }

    const parsedStrategyId = NodeSwapStrategyIdSchema.safeParse(strategyId);
    if (!parsedStrategyId.success) {
      toast.error("Unknown replace option");
      return;
    }

    const treeContext = resolveTreeContext(nodeId);
    if (!treeContext) {
      toast.error("Block not found");
      return;
    }

    const siblings = treeContext.parent
      ? treeContext.parent.children
      : treeContext.roots;
    const sourceNode = siblings[treeContext.index];
    if (!sourceNode) {
      toast.error("Block not found");
      return;
    }

    const normalizedType = normalizeSwapNodeType(sourceNode.type);
    const strategy = SWAP_STRATEGIES.find(
      (entry) => entry.id === parsedStrategyId.data,
    );
    if (!strategy || strategy.from !== normalizedType) {
      toast.error("This block cannot be replaced with that type");
      return;
    }

    if (!isLeafSwapCandidate(sourceNode)) {
      toast.error("Only leaf blocks can be replaced");
      return;
    }

    const usesRegistry = layoutUsesNodeRegistry(
      editorNodeRegistry,
      currentLayout?.value,
    );
    const persistLocally = usesRegistry;

    if (!persistLocally) {
      const mutationPath = resolveMutationPath();
      if (!mutationPath) {
        toast.error("Missing editor context for replace operation");
        return;
      }
    }

    swapInFlight = true;

    try {
      const built = await buildSwappedNode(
        sourceNode,
        parsedStrategyId.data,
        resolveOneIconSvgData,
      );
      if (!built) {
        const message =
          parsedStrategyId.data === "icon-to-svg"
            ? "Could not load icon SVG. Pick an icon in the Inspector first."
            : "Could not build replacement block";
        toast.error(message);
        return;
      }

      const parsedReplacement = BuilderNodeSchema.safeParse({
        ...built,
        id: sourceNode.id,
      });
      if (!parsedReplacement.success) {
        toast.error(
          parsedReplacement.error.issues[0]?.message ??
            "Invalid replacement block",
        );
        return;
      }

      const originalNode = cloneDeep(sourceNode);
      const replacementNode = parsedReplacement.data;

      const persistReplacement = async (
        node: BuilderNode,
      ): Promise<boolean> => {
        if (persistLocally) {
          return true;
        }

        const mutationPath = resolveMutationPath();
        if (!mutationPath) {
          toast.error("Missing editor context for replace operation");
          return false;
        }

        const result = await replaceNodeViaAction({
          mutationPath,
          node,
        });
        if (!result.ok) {
          toast.error(result.message);
          return false;
        }
        return true;
      };

      const applyLocal = (node: BuilderNode): void => {
        applyLocalReplacement({
          pageBlocks,
          treeContext,
          nodeId,
          replacement: node,
        });
        setSelectedBlock(nodeId);
      };

      const executeResult = await executeNodeEventOperation(
        {
          type: "update-node",
          description:
            parsedStrategyId.data === "svg-to-icon"
              ? "Replaced SVG with Icon"
              : "Replaced Icon with SVG",
          affectedNodeIds: [nodeId],
        },
        {
          undo: async () => {
            const ok = await persistReplacement(originalNode);
            if (!ok) {
              throw new Error("Failed to undo node replace");
            }
            applyLocal(originalNode);
          },
          redo: async () => {
            const ok = await persistReplacement(replacementNode);
            if (!ok) {
              throw new Error("Failed to replace node");
            }
            applyLocal(replacementNode);
          },
        },
      );

      if (!executeResult.success) {
        toast.error(executeResult.error ?? "Failed to replace block");
        return;
      }

      if (parsedStrategyId.data === "svg-to-icon") {
        toast.success("Replaced with Icon — choose an icon in the Inspector.");
      } else {
        toast.success("Replaced Icon with SVG");
      }
    } finally {
      swapInFlight = false;
    }
  };

  return {
    getSwapOptionsForNode,
    getSwapOptionsForNodes,
    swapNode,
  };
}
