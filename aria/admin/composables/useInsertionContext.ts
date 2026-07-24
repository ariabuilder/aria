/**
 * When a structural element (Section, Container, or a legacy alias) is added,
 * subsequent elements are automatically inserted as children of that element. Signal.
 */

import { ref, computed, getCurrentInstance, onMounted } from "vue";
import type { BuilderNode } from "../../lib/types/nodes";
import { isStructuralContainerNodeType } from "../../lib/blocks/containerTypes";
import { onNodeFocused } from "../features/Beacon";
import { useCanvasInteractionBridge } from "../features/Core/composables/useCanvasInteractionBridge";
import { useSelectionTreeState } from "../features/Core/composables/useSelectionTreeState";

/** ID of the node that is the current insertion context (or null for root) */
const insertionContextId = ref<string | null>(null);

const isContextActive = computed(() => insertionContextId.value !== null);

/**
 * Check if an element type is structural (can contain children)
 */
function isStructuralElement(type: string): boolean {
  return isStructuralContainerNodeType(type);
}

function setInsertionContext(nodeId: string | null, nodeType?: string): void {
  if (nodeId) {
    insertionContextId.value = nodeId;
    if (import.meta.env.DEV) {
      console.log(
        `[InsertionContext] Context set to: ${nodeType ?? "node"} (${nodeId})`,
      );
    }
  } else {
    clearInsertionContext();
  }
}

function clearInsertionContext(): void {
  if (insertionContextId.value) {
    if (import.meta.env.DEV) {
      console.log("[InsertionContext] Context cleared");
    }
  }
  insertionContextId.value = null;
}

/**
 * Clear the insertion context singleton directly.
 * Call this when loading a new page/layout/component to prevent
 * stale insertion context from leaking across item loads.
 */
export function clearInsertionContextSingleton(): void {
  clearInsertionContext();
}

/**
 * Get the current insertion parent ID
 * Returns null if inserting at root level
 */
function getInsertionParentId(): string | null {
  return insertionContextId.value;
}

function findPreferredStructuralInsertionTarget(
  node: BuilderNode,
): BuilderNode {
  let currentNode = node;

  while (currentNode.children?.length === 1) {
    const [onlyChild] = currentNode.children;
    if (!isStructuralElement(onlyChild.type)) {
      break;
    }

    currentNode = onlyChild;
  }

  return currentNode;
}

/**
 * Called when a new element is added.
 * If it's a structural element, it becomes the new insertion context.
 * Returns the parent ID for insertion.
 */
function handleElementAdded(newNode: BuilderNode): string | null {
  const parentId = insertionContextId.value;

  // If the new element is structural, it becomes the new context
  if (isStructuralElement(newNode.type)) {
    const preferredContextNode =
      findPreferredStructuralInsertionTarget(newNode);
    setInsertionContext(preferredContextNode.id, preferredContextNode.type);
  }

  return parentId;
}

// KEYBOARD & SIGNAL HANDLERS

let isListenerSetup = false;
const canvasInteractionBridge = useCanvasInteractionBridge();
const { selectionTreeRootNodes } = useSelectionTreeState();

function findNodeById(
  nodes: BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children?.length) {
      const childNode = findNodeById(node.children, nodeId);
      if (childNode) {
        return childNode;
      }
    }
  }

  return null;
}

function setupKeyboardListener(): void {
  if (isListenerSetup || typeof window === "undefined") return;

  window.addEventListener("keydown", handleKeyDown);

  onNodeFocused((payload) => {
    handleNodeFocusChange(payload);
  });

  canvasInteractionBridge.onClearInsertionContext(() => {
    clearInsertionContext();
  });

  isListenerSetup = true;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && isContextActive.value) {
    event.preventDefault();
    clearInsertionContext();
  }
}

function handleNodeFocusChange(payload: { nodeId: string | null }): void {
  const { nodeId } = payload;

  // If user deselects (nodeId is null), clear insertion context
  if (nodeId === null) {
    clearInsertionContext();
    return;
  }

  const rootNodes = selectionTreeRootNodes.value as BuilderNode[];
  const node = findNodeById(rootNodes, nodeId);

  // If user selects a structural element, set it as the insertion context
  if (node && isStructuralElement(node.type)) {
    if (import.meta.env.DEV) {
      console.log(
        `[InsertionContext] Selected structural element, setting as context: ${node.type} (${nodeId})`,
      );
    }
    setInsertionContext(nodeId, node.type);
  }
}

export interface UseInsertionContextReturn {
  /** ID of current insertion context (or null for root) */
  insertionContextId: typeof insertionContextId;
  isContextActive: typeof isContextActive;
  isStructuralElement: typeof isStructuralElement;
  setInsertionContext: typeof setInsertionContext;
  clearInsertionContext: typeof clearInsertionContext;
  getInsertionParentId: typeof getInsertionParentId;
  /** Handle when a new element is added - may update context */
  handleElementAdded: typeof handleElementAdded;
}

/**
 * Composable for managing contextual insertion mode.
 * Tracks which structural element (if any) should receive new children.
 */
export function useInsertionContext(): UseInsertionContextReturn {
  // Set up listeners when component mounts
  if (getCurrentInstance()) {
    onMounted(() => {
      setupKeyboardListener();
    });
  }

  return {
    insertionContextId,
    isContextActive,
    isStructuralElement,
    setInsertionContext,
    clearInsertionContext,
    getInsertionParentId,
    handleElementAdded,
  };
}

if (typeof window !== "undefined") {
  setupKeyboardListener();
}
