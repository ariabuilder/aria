import { computed, ref, shallowRef, type Ref } from "vue";
import { toast } from "vue-sonner";
import { z } from "zod";
import { cloneDeep } from "../../Core";
import { createListItemNode } from "../../../../lib/blocks/listNodes";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { snapshotLayoutSlots } from "../../../../lib/layouts/slotEditing";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import type {
  CollapseState,
  DropPosition,
  LayerDragEvent,
  LayerListChangeEvent,
} from "../types";
import type { LayoutWithSlotsLike } from "../../../../lib/layouts/slotEditing";
import {
  getLayoutDefaultSlotName,
  isNodeInLayoutDefaultSlot,
  resolveNodeSlotForLayout,
} from "../../../../lib/layouts/resolveNodeSlot";
import type { RootSlotMovePlacement } from "../../Core/composables/useEditorNodeRegistry";
import type { EditorNodeRegistry } from "../../Core/types/injectionKeys";
import { findNodeById, findParentNode } from "../utils/nodeHelpers";
import { useDropRules } from "./useDropRules";
import { useTreeSorting } from "./useTreeSorting";
import type { LayerStateChangeRecord } from "./useLayerHistory";

export interface LayerLayoutInfo extends LayoutWithSlotsLike {
  id?: string;
  name?: string;
  slots?: Array<{
    name: string;
    label?: string;
    description?: string;
    isDefault?: boolean;
    defaultContent?: BuilderNode[];
  }>;
}

export interface LayerVirtualSlotNames {
  PAGE_CONTENT: string;
  COMPONENT_CONTENT: string;
}

const DraggedNodeIdSchema = z
  .object({
    id: z.string().trim().min(1),
  })
  .strict();

const DropPositionSchema = z.enum(["before", "after", "inside"]);

const LayerListMovedChangeSchema = z
  .object({
    element: BuilderNodeSchema,
    oldIndex: z.int().min(0),
    newIndex: z.int().min(0),
  })
  .strict();

const LayerListAddedChangeSchema = z
  .object({
    element: BuilderNodeSchema,
    newIndex: z.int().min(0),
  })
  .strict();

const LayerListRemovedChangeSchema = z
  .object({
    element: BuilderNodeSchema,
  })
  .strict();

const LayerListChangeEventSchema = z
  .object({
    moved: LayerListMovedChangeSchema.optional(),
    added: LayerListAddedChangeSchema.optional(),
    removed: LayerListRemovedChangeSchema.optional(),
  })
  .strict();

const LayerDropRequestSchema = z
  .object({
    draggedNodeId: z.string().trim().min(1),
    targetNodeId: z.string().trim().min(1),
    position: DropPositionSchema,
    description: z.string().trim().min(1),
    targetSlotName: z.string().trim().min(1).optional(),
  })
  .strict();

const RootSlotInsertRequestSchema = z
  .object({
    draggedNodeId: z.string().trim().min(1),
    description: z.string().trim().min(1),
    targetSlotName: z.string().trim().min(1),
  })
  .strict();

export interface UseLayerTreeActionsOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentLayout: Ref<LayerLayoutInfo | undefined>;
  currentItemType: Ref<"page" | "layout" | "component" | undefined>;
  virtualSlotNames: LayerVirtualSlotNames;
  hasChildren: (node: BuilderNode) => boolean;
  expandedNodes: Ref<Set<string>>;
  collapseState: Ref<Map<string, CollapseState>>;
  updateBlocksWithHistory: (
    newBlocks: BuilderNode[],
    description: string,
  ) => void;
  recordStateChange?: (input: LayerStateChangeRecord) => void;
  nodeRegistry?: EditorNodeRegistry | null;
  onLayoutSlotsDirty?: () => void;
  /** Bumps layer draggable keys so vuedraggable resyncs after cross-list moves. */
  onTreeStructureChanged?: () => void;
}

export function useLayerTreeActions(options: UseLayerTreeActionsOptions) {
  const {
    blocks,
    currentLayout,
    currentItemType,
    virtualSlotNames,
    expandedNodes,
    collapseState,
    updateBlocksWithHistory,
    recordStateChange,
    nodeRegistry = null,
    onLayoutSlotsDirty,
    onTreeStructureChanged,
  } = options;

  const { canDrop } = useDropRules();
  const { calculateInsertionIndex, extractNode, insertNode } = useTreeSorting();

  const draggedNodeId = ref<string | null>(null);
  const dropCommitted = ref(false);

  type PendingListChange =
    | {
        kind: "slot";
        changeEvent: LayerListChangeEvent;
        slotName: string;
      }
    | {
        kind: "children";
        changeEvent: LayerListChangeEvent;
        parentNode: BuilderNode;
      };

  const pendingListChange = shallowRef<PendingListChange | null>(null);

  const isLayerDragActive = (): boolean => draggedNodeId.value !== null;

  const getNodeTypeKey = (node: BuilderNode | null | undefined): string =>
    String(node?.type ?? "").toLowerCase();

  const isListNode = (node: BuilderNode | null | undefined): boolean =>
    getNodeTypeKey(node) === "list";

  const isListItemNode = (node: BuilderNode | null | undefined): boolean =>
    getNodeTypeKey(node) === "listitem";

  const currentVirtualSlot = computed<string>(() => {
    return currentItemType.value === "page"
      ? virtualSlotNames.PAGE_CONTENT
      : virtualSlotNames.COMPONENT_CONTENT;
  });

  const getNodesInSlot = (slotName: string): BuilderNode[] => {
    if (nodeRegistry) {
      if (
        slotName === virtualSlotNames.PAGE_CONTENT &&
        !currentLayout.value?.slots?.length
      ) {
        return blocks.value ?? [];
      }

      if (slotName === virtualSlotNames.COMPONENT_CONTENT) {
        return blocks.value ?? [];
      }

      return nodeRegistry.getDisplayNodesForSlot(slotName);
    }

    const nodeList = blocks.value || [];

    const layoutHasSlots =
      currentLayout.value?.slots && currentLayout.value.slots.length > 0;

    if (
      slotName === virtualSlotNames.PAGE_CONTENT &&
      (!currentLayout.value || !layoutHasSlots)
    ) {
      return nodeList;
    }

    if (slotName === virtualSlotNames.COMPONENT_CONTENT) {
      return nodeList;
    }

    const isDefaultSlot = currentLayout.value?.slots?.find(
      (slot) => slot.name === slotName,
    )?.isDefault;

    if (isDefaultSlot) {
      return nodeList.filter((node) =>
        isNodeInLayoutDefaultSlot(node, currentLayout.value),
      );
    }

    return nodeList.filter(
      (node) =>
        resolveNodeSlotForLayout(node, currentLayout.value) === slotName,
    );
  };

  const commitTreeChange = (
    slotName: string | undefined,
    nextRoots: BuilderNode[],
    description: string,
  ): void => {
    const previousBlocks = cloneDeep(blocks.value ?? []);
    const previousLayoutSnapshot = currentLayout.value
      ? snapshotLayoutSlots(currentLayout.value)
      : undefined;

    if (nodeRegistry && slotName) {
      nodeRegistry.setRootNodesForSlot(slotName, nextRoots);
      if (currentItemType.value === "layout") {
        onLayoutSlotsDirty?.();
      }

      if (recordStateChange) {
        recordStateChange({
          previousBlocks,
          nextBlocks: cloneDeep(blocks.value ?? []),
          description,
          previousLayoutSnapshot,
          nextLayoutSnapshot: currentLayout.value
            ? snapshotLayoutSlots(currentLayout.value)
            : undefined,
        });
        return;
      }

      updateBlocksWithHistory(blocks.value ?? [], description);
      return;
    }

    updateBlocksWithHistory(nextRoots, description);
  };

  const resolveEditableContext = (
    targetSlotName?: string,
    nodeIdForContext?: string | null,
  ): {
    read: () => BuilderNode[];
    commit: (next: BuilderNode[], description: string) => void;
  } => {
    if (nodeRegistry) {
      if (targetSlotName) {
        const editable = nodeRegistry.getEditableTreeForSlot(targetSlotName);
        return {
          read: () => editable.roots,
          commit: (next, description) =>
            commitTreeChange(targetSlotName, next, description),
        };
      }

      if (nodeIdForContext) {
        const editable = nodeRegistry.getEditableTreeForNode(nodeIdForContext);
        if (editable) {
          const scopeSlot =
            nodeRegistry.locateNode(nodeIdForContext)?.store.kind ===
            "layout-slot"
              ? (
                  nodeRegistry.locateNode(nodeIdForContext)?.store as {
                    kind: "layout-slot";
                    slotName: string;
                  }
                ).slotName
              : undefined;

          return {
            read: () => editable.roots,
            commit: (next, description) => {
              if (scopeSlot) {
                commitTreeChange(scopeSlot, next, description);
                return;
              }
              editable.commit(next);
              updateBlocksWithHistory(next, description);
            },
          };
        }
      }
    }

    return {
      read: () => blocks.value ?? [],
      commit: (next, description) => updateBlocksWithHistory(next, description),
    };
  };

  const normalizeRootSlotName = (
    slotName: string | undefined,
  ): string | undefined => {
    if (!slotName) {
      return undefined;
    }

    if (
      slotName === virtualSlotNames.PAGE_CONTENT ||
      slotName === virtualSlotNames.COMPONENT_CONTENT
    ) {
      return undefined;
    }

    return slotName;
  };

  const updateNodeSlot = (
    nodes: readonly BuilderNode[],
    nodeId: string,
    slotName: string | undefined,
  ): BuilderNode[] => {
    return nodes.map((node) => {
      if (node.id === nodeId) {
        return {
          ...node,
          slot: slotName,
        };
      }

      if (node.children?.length) {
        return {
          ...node,
          children: updateNodeSlot(node.children, nodeId, slotName),
        };
      }

      return node;
    });
  };

  const applyMovedNodeDestinationMetadata = (
    nodes: readonly BuilderNode[],
    movedNodeId: string,
    targetSlotName?: string,
  ): BuilderNode[] => {
    const parentNode = findParentNode(nodes, movedNodeId);

    if (parentNode) {
      return updateNodeSlot(nodes, movedNodeId, undefined);
    }

    if (!targetSlotName) {
      return [...nodes];
    }

    return updateNodeSlot(
      nodes,
      movedNodeId,
      normalizeRootSlotName(targetSlotName),
    );
  };

  const resolveSlotNameForMove = (
    slotName: string | undefined,
  ): string | undefined => {
    if (!slotName?.trim()) {
      return undefined;
    }

    if (slotName === virtualSlotNames.PAGE_CONTENT) {
      return getLayoutDefaultSlotName(currentLayout.value);
    }

    if (slotName === virtualSlotNames.COMPONENT_CONTENT) {
      return slotName;
    }

    const normalized = normalizeRootSlotName(slotName);
    return normalized ?? slotName;
  };

  const resolveTargetSlotName = (
    targetNodeId: string,
    explicitSlotName?: string,
  ): string | undefined => {
    if (explicitSlotName) {
      return resolveSlotNameForMove(explicitSlotName);
    }

    const located = nodeRegistry?.locateNode(targetNodeId);
    if (!located) {
      return undefined;
    }

    return resolveSlotNameForMove(located.store.slotName);
  };

  const resolveSourceSlotForMove = (
    draggedNodeId: string,
  ): string | undefined => {
    if (!nodeRegistry) {
      return undefined;
    }

    const located = nodeRegistry.locateNode(draggedNodeId);
    if (!located) {
      return undefined;
    }

    return resolveSlotNameForMove(located.store.slotName);
  };

  const isCrossSlotMove = (
    draggedNodeId: string,
    targetSlotName: string | undefined,
  ): boolean => {
    const targetSlotForMove = resolveSlotNameForMove(targetSlotName);
    if (!targetSlotForMove) {
      return false;
    }

    const sourceSlotForMove = resolveSourceSlotForMove(draggedNodeId);
    return Boolean(
      sourceSlotForMove && sourceSlotForMove !== targetSlotForMove,
    );
  };

  const tryMoveAcrossSlots = (params: {
    draggedNodeId: string;
    targetSlotName: string;
    placement: RootSlotMovePlacement;
    description: string;
  }): boolean => {
    if (!nodeRegistry) {
      return false;
    }

    const targetSlotName = resolveSlotNameForMove(params.targetSlotName);
    if (!targetSlotName) {
      return false;
    }

    if (!isCrossSlotMove(params.draggedNodeId, targetSlotName)) {
      return false;
    }

    const previousBlocks = cloneDeep(blocks.value ?? []);
    const previousLayoutSnapshot = currentLayout.value
      ? snapshotLayoutSlots(currentLayout.value)
      : undefined;

    const moveResult = nodeRegistry.moveNodeBetweenSlots(
      params.draggedNodeId,
      targetSlotName,
      params.placement,
    );

    if (!moveResult.success) {
      if (moveResult.error) {
        toast.error(moveResult.error);
      } else {
        toast.error("Could not move block between slots");
      }
      onTreeStructureChanged?.();
      return false;
    }

    if (recordStateChange) {
      recordStateChange({
        previousBlocks,
        nextBlocks: cloneDeep(blocks.value ?? []),
        description: params.description,
        previousLayoutSnapshot,
        nextLayoutSnapshot: currentLayout.value
          ? snapshotLayoutSlots(currentLayout.value)
          : undefined,
      });
    } else {
      updateBlocksWithHistory(blocks.value ?? [], params.description);
    }

    onLayoutSlotsDirty?.();
    onTreeStructureChanged?.();
    return true;
  };

  const executeLayerDrop = (rawParams: {
    draggedNodeId: string;
    targetNodeId: string;
    position: DropPosition;
    description: string;
    targetSlotName?: string;
  }): boolean => {
    const parsedParams = LayerDropRequestSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return false;
    }

    const {
      draggedNodeId,
      targetNodeId,
      position,
      description,
      targetSlotName: explicitTargetSlot,
    } = parsedParams.data;

    const resolvedTargetSlot = resolveTargetSlotName(
      targetNodeId,
      explicitTargetSlot,
    );
    const targetSlotForMove =
      resolveSlotNameForMove(explicitTargetSlot ?? resolvedTargetSlot) ??
      resolvedTargetSlot;

    const attemptCrossSlotMove = (
      placement: RootSlotMovePlacement,
    ): boolean => {
      if (!targetSlotForMove) {
        return false;
      }

      return tryMoveAcrossSlots({
        draggedNodeId,
        targetSlotName: targetSlotForMove,
        placement,
        description,
      });
    };

    if (
      targetSlotForMove &&
      position !== "inside" &&
      isCrossSlotMove(draggedNodeId, targetSlotForMove)
    ) {
      if (attemptCrossSlotMove({ kind: position, targetNodeId })) {
        return true;
      }
      return false;
    }

    if (targetSlotForMove && position === "inside" && nodeRegistry) {
      const targetLocated = nodeRegistry.locateNode(targetNodeId);

      if (targetLocated && isCrossSlotMove(draggedNodeId, targetSlotForMove)) {
        if (attemptCrossSlotMove({ kind: "end" })) {
          return true;
        }
        return false;
      }
    }

    if (
      targetSlotForMove &&
      isCrossSlotMove(draggedNodeId, targetSlotForMove)
    ) {
      onTreeStructureChanged?.();
      return false;
    }

    const editable = resolveEditableContext(
      explicitTargetSlot ?? resolvedTargetSlot,
      draggedNodeId,
    );
    const currentBlocks = editable.read();

    const draggedNodeForValidation =
      nodeRegistry?.findNode(draggedNodeId) ??
      findNodeById(currentBlocks, draggedNodeId);
    const validationNodes =
      draggedNodeForValidation &&
      !findNodeById(currentBlocks, draggedNodeId) &&
      draggedNodeForValidation
        ? [...currentBlocks, draggedNodeForValidation]
        : currentBlocks;

    const validation = canDrop({
      draggedNodeId,
      targetNodeId,
      position,
      allNodes: validationNodes,
    });

    if (!validation.valid) {
      return false;
    }

    const { tree: treeWithoutDragged, node: draggedNode } = extractNode(
      currentBlocks,
      draggedNodeId,
    );

    if (!draggedNode) {
      return false;
    }

    const targetNode = findNodeById(treeWithoutDragged, targetNodeId);

    if (!targetNode) {
      return false;
    }

    const targetParent =
      position === "inside"
        ? null
        : findParentNode(treeWithoutDragged, targetNodeId);
    const destinationParentId =
      position === "inside" ? targetNodeId : (targetParent?.id ?? null);
    const destinationParentNode =
      position === "inside" ? targetNode : targetParent;

    if (!isListNode(destinationParentNode) && isListItemNode(draggedNode)) {
      return false;
    }

    const insertedNode =
      isListNode(destinationParentNode) && !isListItemNode(draggedNode)
        ? createListItemNode([draggedNode])
        : draggedNode;

    let nextTree: BuilderNode[];

    if (position === "inside") {
      const insertionIndex = targetNode.children?.length ?? 0;
      nextTree = insertNode(
        treeWithoutDragged,
        insertedNode,
        targetNodeId,
        insertionIndex,
      );
    } else {
      const siblings =
        destinationParentId === null
          ? treeWithoutDragged
          : targetParent?.children || [];
      const insertionIndex = calculateInsertionIndex(
        siblings,
        targetNodeId,
        position,
      );

      nextTree = insertNode(
        treeWithoutDragged,
        insertedNode,
        destinationParentId,
        insertionIndex,
      );
    }

    const nextBlocks = applyMovedNodeDestinationMetadata(
      nextTree,
      draggedNodeId,
      explicitTargetSlot ?? resolvedTargetSlot,
    );

    editable.commit(nextBlocks, description);

    if (position === "inside") {
      expandedNodes.value.add(targetNodeId);
      collapseState.value.set(targetNodeId, "expanded");
    }

    return true;
  };

  const moveNodeToEmptyRootSlot = (rawParams: {
    draggedNodeId: string;
    description: string;
    targetSlotName: string;
  }): boolean => {
    const parsedParams = RootSlotInsertRequestSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return false;
    }

    const { draggedNodeId, description, targetSlotName } = parsedParams.data;
    const targetSlotForMove = resolveSlotNameForMove(targetSlotName);

    if (
      targetSlotForMove &&
      isCrossSlotMove(draggedNodeId, targetSlotForMove) &&
      tryMoveAcrossSlots({
        draggedNodeId,
        targetSlotName: targetSlotForMove,
        placement: { kind: "end" },
        description,
      })
    ) {
      return true;
    }

    if (
      targetSlotForMove &&
      isCrossSlotMove(draggedNodeId, targetSlotForMove)
    ) {
      onTreeStructureChanged?.();
      return false;
    }

    const editable = resolveEditableContext(targetSlotName, draggedNodeId);
    const currentBlocks = editable.read();
    const { tree: treeWithoutDragged, node: draggedNode } = extractNode(
      currentBlocks,
      draggedNodeId,
    );

    if (!draggedNode) {
      return false;
    }

    const insertedNode: BuilderNode = {
      ...draggedNode,
      slot: normalizeRootSlotName(targetSlotName),
    };

    const nextBlocks = insertNode(
      treeWithoutDragged,
      insertedNode,
      null,
      treeWithoutDragged.length,
    );

    editable.commit(nextBlocks, description);
    return true;
  };

  const executeListChange = (params: {
    changeEvent: LayerListChangeEvent;
    siblings: readonly BuilderNode[];
    description: string;
    parentNodeId: string | null;
    targetSlotName?: string;
  }): boolean => {
    const parsedChangeEvent = LayerListChangeEventSchema.safeParse(
      params.changeEvent,
    );

    if (!parsedChangeEvent.success) {
      return false;
    }

    const { moved, added, removed } = parsedChangeEvent.data;

    if (moved && moved.oldIndex === moved.newIndex) {
      return false;
    }

    const draggedNodeId =
      added?.element.id ?? moved?.element.id ?? removed?.element.id;
    const requestedIndex = added?.newIndex ?? moved?.newIndex;

    if (!draggedNodeId) {
      return false;
    }

    if (removed && !added && !moved) {
      return false;
    }

    if (requestedIndex === undefined) {
      return false;
    }

    const siblingIdsWithoutDragged = params.siblings
      .filter((node) => node.id !== draggedNodeId)
      .map((node) => node.id);
    const clampedIndex = Math.min(
      Math.max(requestedIndex, 0),
      siblingIdsWithoutDragged.length,
    );

    const targetSlotForMove = resolveSlotNameForMove(params.targetSlotName);
    if (
      targetSlotForMove &&
      isCrossSlotMove(draggedNodeId, targetSlotForMove)
    ) {
      const placement: RootSlotMovePlacement =
        siblingIdsWithoutDragged.length === 0
          ? { kind: "end" }
          : clampedIndex < siblingIdsWithoutDragged.length
            ? {
                kind: "before",
                targetNodeId: siblingIdsWithoutDragged[clampedIndex]!,
              }
            : {
                kind: "after",
                targetNodeId:
                  siblingIdsWithoutDragged[
                    siblingIdsWithoutDragged.length - 1
                  ]!,
              };

      return tryMoveAcrossSlots({
        draggedNodeId,
        targetSlotName: targetSlotForMove,
        placement,
        description: params.description,
      });
    }

    if (siblingIdsWithoutDragged.length === 0) {
      if (params.parentNodeId) {
        return executeLayerDrop({
          draggedNodeId,
          targetNodeId: params.parentNodeId,
          position: "inside",
          description: params.description,
          targetSlotName: params.targetSlotName,
        });
      }

      if (!params.targetSlotName) {
        return false;
      }

      return moveNodeToEmptyRootSlot({
        draggedNodeId,
        description: params.description,
        targetSlotName: params.targetSlotName,
      });
    }

    if (clampedIndex < siblingIdsWithoutDragged.length) {
      return executeLayerDrop({
        draggedNodeId,
        targetNodeId: siblingIdsWithoutDragged[clampedIndex],
        position: "before",
        description: params.description,
        targetSlotName: params.targetSlotName,
      });
    }

    return executeLayerDrop({
      draggedNodeId,
      targetNodeId:
        siblingIdsWithoutDragged[siblingIdsWithoutDragged.length - 1],
      position: "after",
      description: params.description,
      targetSlotName: params.targetSlotName,
    });
  };

  const resolveDraggedNodeId = (evt: LayerDragEvent): string | null => {
    const candidateNode =
      evt.item?.__vueParentComponent?.props?.element ??
      evt.item?.__draggable_context?.element;

    const parsedNode = BuilderNodeSchema.safeParse(candidateNode);
    if (!parsedNode.success) {
      return null;
    }

    const parsedNodeId = DraggedNodeIdSchema.safeParse({
      id: parsedNode.data.id,
    });
    return parsedNodeId.success ? parsedNodeId.data.id : null;
  };

  const applySlotChange = (
    evt: LayerListChangeEvent,
    slotName: string,
  ): boolean => {
    const description = evt.moved
      ? `Reorder in ${slotName} slot`
      : `Move node to ${slotName} slot`;

    return executeListChange({
      changeEvent: evt,
      siblings: getNodesInSlot(slotName),
      description,
      parentNodeId: null,
      targetSlotName: slotName,
    });
  };

  const applyChildrenUpdate = (
    parentNode: BuilderNode,
    changeEvent: LayerListChangeEvent,
  ): boolean =>
    executeListChange({
      changeEvent,
      siblings: parentNode.children || [],
      description: "Reordered layer",
      parentNodeId: parentNode.id,
    });

  const flushPendingListChange = (): void => {
    const pending = pendingListChange.value;
    pendingListChange.value = null;

    if (!pending || dropCommitted.value) {
      return;
    }

    const committed =
      pending.kind === "slot"
        ? applySlotChange(pending.changeEvent, pending.slotName)
        : applyChildrenUpdate(pending.parentNode, pending.changeEvent);

    if (committed) {
      dropCommitted.value = true;
    }
  };

  const handleDragStart = (evt: LayerDragEvent): void => {
    pendingListChange.value = null;
    draggedNodeId.value = resolveDraggedNodeId(evt);
    dropCommitted.value = false;
  };

  const handleDragEnd = (): void => {
    flushPendingListChange();
    draggedNodeId.value = null;
    dropCommitted.value = false;
  };

  const handleDropOnNode = (
    targetNode: BuilderNode,
    position: DropPosition,
  ): void => {
    if (dropCommitted.value || pendingListChange.value) {
      return;
    }

    const parsedTargetNode = BuilderNodeSchema.safeParse(targetNode);
    const parsedPosition = DropPositionSchema.safeParse(position);
    if (
      !parsedTargetNode.success ||
      !parsedPosition.success ||
      !draggedNodeId.value
    ) {
      return;
    }

    const targetSlotName = resolveTargetSlotName(parsedTargetNode.data.id);

    const committed = executeLayerDrop({
      draggedNodeId: draggedNodeId.value,
      targetNodeId: parsedTargetNode.data.id,
      position: parsedPosition.data,
      description:
        parsedPosition.data === "inside"
          ? `Nest node into ${parsedTargetNode.data.type}`
          : `Move node ${parsedPosition.data} ${parsedTargetNode.data.type}`,
      targetSlotName,
    });
    if (committed) {
      dropCommitted.value = true;
      draggedNodeId.value = null;
      pendingListChange.value = null;
    }
  };

  const handleSlotChange = (
    evt: LayerListChangeEvent,
    slotName: string,
  ): void => {
    if (dropCommitted.value) {
      return;
    }

    if (isLayerDragActive()) {
      pendingListChange.value = {
        kind: "slot",
        changeEvent: evt,
        slotName,
      };
      return;
    }

    if (applySlotChange(evt, slotName)) {
      dropCommitted.value = true;
    }
  };

  const handleChildrenUpdate = (
    parentNode: BuilderNode,
    changeEvent: LayerListChangeEvent,
  ): void => {
    if (dropCommitted.value) {
      return;
    }

    if (isLayerDragActive()) {
      pendingListChange.value = {
        kind: "children",
        changeEvent,
        parentNode,
      };
      return;
    }

    if (applyChildrenUpdate(parentNode, changeEvent)) {
      dropCommitted.value = true;
    }
  };

  return {
    currentVirtualSlot,
    getNodesInSlot,
    handleDragStart,
    handleDragEnd,
    handleDropOnNode,
    handleSlotChange,
    handleChildrenUpdate,
  };
}
