/**
 * Dual-tree node registry — page roots vs layout slot defaultContent.
 */

import type { Ref } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import {
  deleteNodeById,
  findNodeById as findNodeInTree,
  insertNode as insertNodeInTree,
} from "../../../../lib/blocks/nodeUtils";
import { cloneDeep } from "../utils/clone";
import {
  getEditorSlotScope,
  getSlotDefaultContent,
  normalizeRootNodeForSlot,
  replaceRootNodesForSlot,
  setSlotDefaultContent,
  stripOrphanPageSlotRoots,
  type LayoutWithSlotsLike,
} from "../../../../lib/layouts/slotEditing";
import {
  getLayoutDefaultSlotName,
  isNodeInLayoutDefaultSlot,
  resolveNodeSlotForLayout,
} from "../../../../lib/layouts/resolveNodeSlot";
import { resolveSlotRootsForDisplay } from "../../../../lib/layouts/canvasSlotMerge";
import type { ActiveLayoutSlot } from "../../../../lib/schemas/slotEditing";

export type EditorNodeStore =
  | { kind: "page-root"; slotName: string }
  | { kind: "layout-slot"; slotName: string };

export interface LocatedEditorNode {
  node: BuilderNode;
  store: EditorNodeStore;
  parentId: string | null;
  index: number;
}

export type RootSlotMovePlacement =
  | { kind: "end" }
  | { kind: "index"; index: number }
  | { kind: "before"; targetNodeId: string }
  | { kind: "after"; targetNodeId: string };

export interface MoveNodeBetweenSlotsResult {
  success: boolean;
  sourceSlot?: string;
  targetSlot?: string;
  error?: string;
}

export type MoveRootNodeBetweenSlotsResult = MoveNodeBetweenSlotsResult;

export interface UseEditorNodeRegistryOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentLayout: Ref<LayoutDSL | null>;
  activeSlot: Ref<ActiveLayoutSlot>;
  currentItemType?: Ref<"page" | "layout" | "component">;
}

export function useEditorNodeRegistry(options: UseEditorNodeRegistryOptions) {
  const { pageBlocks, currentLayout, activeSlot, currentItemType } = options;

  function layoutAsContext(): LayoutWithSlotsLike | null {
    return currentLayout.value;
  }

  function slotScope(slotName: string): "page" | "layout" {
    return getEditorSlotScope(
      currentItemType?.value ?? "page",
      slotName,
      layoutAsContext(),
    );
  }

  function editablePageRoots(): BuilderNode[] {
    return pageBlocks.value.filter(
      (node) => !node.metadata?.layoutDefaultInjected,
    );
  }

  function getEditableNodesForSlot(slotName: string): BuilderNode[] {
    const layout = layoutAsContext();
    const scope = slotScope(slotName);
    if (scope === "layout") {
      return getSlotDefaultContent(layout, slotName);
    }

    const defaultSlot = getLayoutDefaultSlotName(layout);
    if (!layout?.slots?.length) {
      return editablePageRoots();
    }

    if (slotName === defaultSlot) {
      return editablePageRoots().filter((node) =>
        isNodeInLayoutDefaultSlot(node, layout),
      );
    }

    return editablePageRoots().filter(
      (node) => resolveNodeSlotForLayout(node, layout) === slotName,
    );
  }

  function getDisplayNodesForSlot(slotName: string): BuilderNode[] {
    const layout = layoutAsContext();
    const scope = slotScope(slotName);
    if (scope === "layout") {
      return getSlotDefaultContent(layout, slotName);
    }

    if (!layout?.slots?.length) {
      return editablePageRoots();
    }

    return resolveSlotRootsForDisplay(pageBlocks.value, layout, slotName);
  }

  function setRootNodesForSlot(
    slotName: string,
    nodes: readonly BuilderNode[],
  ): void {
    const layout = layoutAsContext();
    const scope = slotScope(slotName);

    if (scope === "layout" && currentLayout.value) {
      currentLayout.value = setSlotDefaultContent(
        currentLayout.value,
        slotName,
        nodes,
      ) as LayoutDSL;
      return;
    }

    pageBlocks.value = replaceRootNodesForSlot(
      pageBlocks.value,
      layout,
      slotName,
      nodes.map(stripLayoutInheritedMetadata),
    );
  }

  function findNodeInLayoutDefaults(
    nodeId: string,
  ): { node: BuilderNode; slotName: string } | null {
    const layout = layoutAsContext();
    if (!layout?.slots?.length) {
      return null;
    }

    for (const slot of layout.slots) {
      const slotNodes = slot.defaultContent ?? [];
      const found = findNodeInTree(slotNodes, nodeId);
      if (found) {
        return { node: found, slotName: slot.name };
      }
    }

    return null;
  }

  function findNode(nodeId: string): BuilderNode | null {
    const inPage = findNodeInTree(pageBlocks.value, nodeId);
    if (inPage) {
      return inPage;
    }

    const itemType = currentItemType?.value ?? "page";
    if (itemType === "layout" || itemType === "page") {
      const inLayout = findNodeInLayoutDefaults(nodeId);
      if (inLayout) {
        return inLayout.node;
      }
    }

    return null;
  }

  function locateNodeInLayoutDefaults(
    nodeId: string,
  ): LocatedEditorNode | null {
    const layout = layoutAsContext();
    if (!layout?.slots?.length) {
      return null;
    }

    for (const slot of layout.slots) {
      const slotNodes = slot.defaultContent ?? [];
      const slotResult = findParentInStore(slotNodes, nodeId);
      if (!slotResult) {
        continue;
      }

      const itemType = currentItemType?.value ?? "page";
      if (itemType === "layout") {
        return {
          node: slotResult.node,
          store: { kind: "layout-slot", slotName: slot.name },
          parentId: slotResult.parentId,
          index: slotResult.index,
        };
      }

      if (itemType === "page") {
        const scope = getEditorSlotScope("page", slot.name, layout);
        return {
          node: slotResult.node,
          store:
            scope === "layout"
              ? { kind: "layout-slot", slotName: slot.name }
              : { kind: "page-root", slotName: slot.name },
          parentId: slotResult.parentId,
          index: slotResult.index,
        };
      }
    }

    return null;
  }

  function locateNode(nodeId: string): LocatedEditorNode | null {
    const layout = layoutAsContext();

    const pageParentResult = findParentInStore(pageBlocks.value, nodeId);
    if (pageParentResult) {
      const rootNode = findRootNodeContainingId(pageBlocks.value, nodeId);
      const rootSlot = resolveNodeSlotForLayout(
        rootNode ?? pageParentResult.node,
        layout,
      );
      return {
        node: pageParentResult.node,
        store: { kind: "page-root", slotName: rootSlot },
        parentId: pageParentResult.parentId,
        index: pageParentResult.index,
      };
    }

    return locateNodeInLayoutDefaults(nodeId);
  }

  function getMutableSourceRoots(slotName: string): BuilderNode[] {
    const editable = getEditableNodesForSlot(slotName);
    if (editable.length > 0) {
      return cloneDeep(editable);
    }
    return cloneDeep(getDisplayNodesForSlot(slotName));
  }

  function getActiveRootList(): BuilderNode[] {
    return getEditableNodesForSlot(activeSlot.value.name);
  }

  function applyActiveRootList(nodes: readonly BuilderNode[]): void {
    setRootNodesForSlot(activeSlot.value.name, nodes);
  }

  function mutateActiveTree(
    mutator: (nodes: BuilderNode[]) => BuilderNode[],
  ): void {
    const current = getActiveRootList();
    setRootNodesForSlot(activeSlot.value.name, mutator([...current]));
  }

  function insertIntoActiveTree(
    parentId: string | null,
    node: BuilderNode,
    index: number,
  ): void {
    const roots = getActiveRootList();
    const next =
      parentId === null
        ? (() => {
            const copy = [...roots];
            copy.splice(index, 0, node);
            return copy;
          })()
        : insertNodeInTree(roots, parentId, node, index);

    setRootNodesForSlot(activeSlot.value.name, next);
  }

  function getEditableTreeForNode(nodeId: string): {
    roots: BuilderNode[];
    commit: (roots: BuilderNode[]) => void;
  } | null {
    const located = locateNode(nodeId);
    if (!located) {
      return null;
    }

    if (located.store.kind === "layout-slot") {
      const slotName = located.store.slotName;
      return {
        roots: getEditableNodesForSlot(slotName),
        commit: (roots) => {
          setRootNodesForSlot(slotName, roots);
        },
      };
    }

    if (findNodeInTree(pageBlocks.value, nodeId)) {
      return {
        roots: pageBlocks.value,
        commit: (roots) => {
          pageBlocks.value = roots;
        },
      };
    }

    const slotName = located.store.slotName;
    return {
      roots: getMutableSourceRoots(slotName),
      commit: (roots) => {
        setRootNodesForSlot(slotName, roots);
      },
    };
  }

  function patchNodeInRegistry(
    nodeId: string,
    patch: (node: BuilderNode) => void,
  ): BuilderNode | null {
    const editable = getEditableTreeForNode(nodeId);
    if (!editable) {
      return null;
    }

    const result = patchNodeInMutableTree(editable.roots, nodeId, patch);
    if (result) {
      editable.commit(editable.roots);
    }

    return result;
  }

  function getEditableTreeForSlot(slotName: string): {
    roots: BuilderNode[];
    commit: (roots: BuilderNode[]) => void;
  } {
    return {
      roots: getEditableNodesForSlot(slotName),
      commit: (roots) => {
        setRootNodesForSlot(slotName, roots);
      },
    };
  }

  function resolveRootSlotName(located: LocatedEditorNode): string {
    return located.store.slotName;
  }

  function computeRootInsertIndex(
    targetRoots: readonly BuilderNode[],
    placement: RootSlotMovePlacement,
  ): number | null {
    if (placement.kind === "end") {
      return targetRoots.length;
    }
    if (placement.kind === "index") {
      return Math.min(Math.max(placement.index, 0), targetRoots.length);
    }

    const targetIndex = targetRoots.findIndex(
      (node) => node.id === placement.targetNodeId,
    );
    if (targetIndex < 0) {
      return null;
    }

    return placement.kind === "before" ? targetIndex : targetIndex + 1;
  }

  function extractNodeFromTree(
    nodes: readonly BuilderNode[],
    nodeId: string,
  ): { tree: BuilderNode[]; node: BuilderNode | null } {
    let extractedNode: BuilderNode | null = null;

    function removeFromArray(arr: readonly BuilderNode[]): BuilderNode[] {
      return arr
        .filter((node) => {
          if (node.id === nodeId) {
            extractedNode = node;
            return false;
          }
          return true;
        })
        .map((node) => {
          if (node.children?.length) {
            return {
              ...node,
              children: removeFromArray(node.children),
            };
          }
          return node;
        });
    }

    return { tree: removeFromArray(nodes), node: extractedNode };
  }

  function insertNodeAtRoot(
    nodes: readonly BuilderNode[],
    nodeToInsert: BuilderNode,
    index: number,
  ): BuilderNode[] {
    const next = [...nodes];
    next.splice(index, 0, nodeToInsert);
    return next;
  }

  function moveNodeBetweenSlots(
    nodeId: string,
    targetSlotName: string,
    placement: RootSlotMovePlacement,
  ): MoveNodeBetweenSlotsResult {
    const located = locateNode(nodeId);
    if (!located) {
      return { success: false, error: "Node not found" };
    }

    const sourceSlotName = resolveRootSlotName(located);
    if (sourceSlotName === targetSlotName) {
      return { success: false };
    }

    const layout = layoutAsContext();

    if (located.parentId === null) {
      const sourceRoots = getMutableSourceRoots(sourceSlotName);
      const rootIndex = sourceRoots.findIndex((node) => node.id === nodeId);
      if (rootIndex < 0) {
        return { success: false, error: "Root node not in source slot" };
      }

      const [movedNode] = sourceRoots.splice(rootIndex, 1);
      if (!movedNode) {
        return { success: false, error: "Root node not in source slot" };
      }

      const normalizedNode = normalizeRootNodeForSlot(
        stripLayoutInheritedMetadata(movedNode),
        targetSlotName,
        layout,
      );

      const targetRoots = [...getEditableNodesForSlot(targetSlotName)];
      const insertIndex = computeRootInsertIndex(targetRoots, placement);
      if (insertIndex === null) {
        sourceRoots.splice(rootIndex, 0, movedNode);
        return { success: false, error: "Invalid placement in target slot" };
      }

      targetRoots.splice(insertIndex, 0, normalizedNode);
      setRootNodesForSlot(sourceSlotName, sourceRoots);
      setRootNodesForSlot(targetSlotName, targetRoots);

      return {
        success: true,
        sourceSlot: sourceSlotName,
        targetSlot: targetSlotName,
      };
    }

    const sourceRoots = getMutableSourceRoots(sourceSlotName);
    const { tree: sourceWithoutNode, node: movedNode } = extractNodeFromTree(
      sourceRoots,
      nodeId,
    );

    if (!movedNode) {
      return { success: false, error: "Node not found in source slot tree" };
    }

    const normalizedNode = normalizeRootNodeForSlot(
      stripLayoutInheritedMetadata(movedNode),
      targetSlotName,
      layout,
    );

    const targetRoots = [...getEditableNodesForSlot(targetSlotName)];
    const insertIndex = computeRootInsertIndex(targetRoots, placement);
    if (insertIndex === null) {
      return { success: false, error: "Invalid placement in target slot" };
    }

    const nextTargetRoots = insertNodeAtRoot(
      targetRoots,
      normalizedNode,
      insertIndex,
    );

    setRootNodesForSlot(sourceSlotName, sourceWithoutNode);
    setRootNodesForSlot(targetSlotName, nextTargetRoots);

    return {
      success: true,
      sourceSlot: sourceSlotName,
      targetSlot: targetSlotName,
    };
  }

  function moveRootNodeBetweenSlots(
    nodeId: string,
    targetSlotName: string,
    placement: RootSlotMovePlacement,
  ): MoveRootNodeBetweenSlotsResult {
    return moveNodeBetweenSlots(nodeId, targetSlotName, placement);
  }

  function deleteFromRegistry(nodeId: string): boolean {
    const located = locateNode(nodeId);
    if (!located) {
      return false;
    }

    if (located.store.kind === "layout-slot") {
      const slotNodes = getSlotDefaultContent(
        layoutAsContext(),
        located.store.slotName,
      );
      setRootNodesForSlot(
        located.store.slotName,
        deleteNodeById(slotNodes, nodeId),
      );
      return true;
    }

    if (findParentInStore(pageBlocks.value, nodeId)) {
      pageBlocks.value = deleteNodeById(pageBlocks.value, nodeId);
      return true;
    }

    if ((currentItemType?.value ?? "page") === "page") {
      const slotName = located.store.slotName;
      const displayRoots = getDisplayNodesForSlot(slotName);
      setRootNodesForSlot(slotName, deleteNodeById(displayRoots, nodeId));
      return true;
    }

    return false;
  }

  function getSelectionTreeRoots(): BuilderNode[] {
    const layout = layoutAsContext();
    if (!layout?.slots?.length) {
      return [...pageBlocks.value];
    }

    const roots: BuilderNode[] = stripOrphanPageSlotRoots(
      editablePageRoots(),
      layout,
    );
    const itemType = currentItemType?.value ?? "page";

    if (itemType === "layout") {
      for (const slot of layout.slots) {
        roots.push(...getEditableNodesForSlot(slot.name));
      }
      return roots;
    }

    if (itemType === "page") {
      for (const slot of layout.slots) {
        for (const displayNode of getDisplayNodesForSlot(slot.name)) {
          if (
            findNodeInTree(pageBlocks.value, displayNode.id) ||
            findNodeInTree(roots, displayNode.id)
          ) {
            continue;
          }

          const liveNode = findNode(displayNode.id);
          if (liveNode) {
            roots.push(liveNode);
          }
        }
      }
    }

    return roots;
  }

  return {
    getDisplayNodesForSlot,
    getEditableNodesForSlot,
    setRootNodesForSlot,
    getActiveRootList,
    applyActiveRootList,
    mutateActiveTree,
    insertIntoActiveTree,
    findNode,
    locateNode,
    getEditableTreeForNode,
    getEditableTreeForSlot,
    patchNodeInRegistry,
    deleteFromRegistry,
    moveNodeBetweenSlots,
    moveRootNodeBetweenSlots,
    getSelectionTreeRoots,
  };
}

function stripLayoutInheritedMetadata(node: BuilderNode): BuilderNode {
  if (!node.metadata?.layoutDefaultInjected && !node.metadata?.locked) {
    if (!node.children?.length) {
      return node;
    }
    return {
      ...node,
      children: node.children.map(stripLayoutInheritedMetadata),
    };
  }

  const { layoutDefaultInjected, layoutDefaultSource, locked, ...restMeta } =
    node.metadata ?? {};
  const metadata =
    Object.keys(restMeta).length > 0 ? restMeta : undefined;

  return {
    ...node,
    metadata,
    children: node.children?.map(stripLayoutInheritedMetadata),
  };
}

function findRootNodeContainingId(
  roots: readonly BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const root of roots) {
    if (findParentInStore([root], nodeId)) {
      return root;
    }
  }
  return null;
}

function patchNodeInMutableTree(
  nodes: BuilderNode[],
  nodeId: string,
  patch: (node: BuilderNode) => void,
): BuilderNode | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;

    if (node.id === nodeId) {
      patch(node);
      return node;
    }

    if (node.children?.length) {
      const found = patchNodeInMutableTree(node.children, nodeId, patch);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findParentInStore(
  nodes: readonly BuilderNode[],
  nodeId: string,
): { node: BuilderNode; parentId: string | null; index: number } | null {
  const rootIndex = nodes.findIndex((node) => node.id === nodeId);
  if (rootIndex >= 0) {
    return {
      node: nodes[rootIndex]!,
      parentId: null,
      index: rootIndex,
    };
  }

  for (const root of nodes) {
    const stack: Array<{ parent: BuilderNode; children: BuilderNode[] }> = [];
    if (root.children?.length) {
      stack.push({ parent: root, children: root.children });
    }

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) continue;

      const childIndex = frame.children.findIndex((child) => child.id === nodeId);
      if (childIndex >= 0) {
        return {
          node: frame.children[childIndex]!,
          parentId: frame.parent.id,
          index: childIndex,
        };
      }

      for (const child of frame.children) {
        if (child.children?.length) {
          stack.push({ parent: child, children: child.children });
        }
      }
    }
  }

  return null;
}
