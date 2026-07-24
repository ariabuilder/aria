/**
 * The Beacon illuminates the currently focused node in the builder.
 * Uses signals for cross-feature communication so features stay decoupled.
 */

import {
  ref,
  shallowRef,
  computed,
  watch,
  watchEffect,
  getCurrentInstance,
  onMounted,
  onUnmounted,
} from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  BeaconSnapshot,
  NodeFocusedPayload,
  UseBeaconReturn,
} from "../types/beacon.types";
import {
  BeaconSelectionNodeIdsSchema,
  BeaconSnapshotSchema,
} from "../types/beacon.types";
import {
  addBeaconChannelMessageListener,
  addComposerBeaconMessageListener,
  addNodeFocusedListener,
  createBeaconChannel,
  createFocusRequestMessage,
  createNodeFocusedMessage,
  dispatchNodeFocusedEvent,
  postBeaconChannelMessage,
  type BeaconChannelMessage,
} from "./useBeaconSignals";
import { useBeaconTreeState } from "./useBeaconTreeState";

interface SelectionGestureLite {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

type ComposerBeaconMessageLite =
  | {
      type: "select-node";
      payload: {
        nodeId: string | null;
        triggerGesture?: SelectionGestureLite;
      };
    }
  | {
      type: "update-classes";
      payload: {
        nodeId: string;
        classNames: Record<string, string[]>;
      };
    }
  | {
      type: "update-props";
      payload: {
        nodeId: string;
        props: BuilderNode["props"];
        source?: string;
      };
    };

type BeaconRootNodesRef = { value: BuilderNode[] };

function toComposerBeaconMessageLite(
  value: unknown,
): ComposerBeaconMessageLite | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as { type?: unknown; payload?: unknown };
  if (!message.payload || typeof message.payload !== "object") {
    return null;
  }

  const payload = message.payload as {
    nodeId?: unknown;
    triggerGesture?: unknown;
    classNames?: unknown;
    props?: unknown;
    source?: unknown;
  };

  if (message.type === "select-node") {
    const triggerGesture =
      payload.triggerGesture && typeof payload.triggerGesture === "object"
        ? (payload.triggerGesture as {
            metaKey?: unknown;
            ctrlKey?: unknown;
            shiftKey?: unknown;
          })
        : undefined;

    if (payload.nodeId === null || typeof payload.nodeId === "string") {
      return {
        type: "select-node",
        payload: {
          nodeId: payload.nodeId,
          triggerGesture:
            triggerGesture &&
            typeof triggerGesture.metaKey === "boolean" &&
            typeof triggerGesture.ctrlKey === "boolean" &&
            typeof triggerGesture.shiftKey === "boolean"
              ? {
                  metaKey: triggerGesture.metaKey,
                  ctrlKey: triggerGesture.ctrlKey,
                  shiftKey: triggerGesture.shiftKey,
                }
              : undefined,
        },
      };
    }

    return null;
  }

  if (message.type === "update-classes") {
    if (
      typeof payload.nodeId === "string" &&
      payload.classNames &&
      typeof payload.classNames === "object"
    ) {
      return {
        type: "update-classes",
        payload: {
          nodeId: payload.nodeId,
          classNames: payload.classNames as Record<string, string[]>,
        },
      };
    }

    return null;
  }

  if (
    message.type === "update-props" &&
    typeof payload.nodeId === "string" &&
    payload.props &&
    typeof payload.props === "object"
  ) {
    return {
      type: "update-props",
      payload: {
        nodeId: payload.nodeId,
        props: payload.props as BuilderNode["props"],
        source: typeof payload.source === "string" ? payload.source : undefined,
      },
    };
  }

  return null;
}

const focusedNodeId = ref<string | null>(null);
/** Primary selected node ID. Kept as the same ref as focusedNodeId for compatibility. */
const primarySelectedNodeId = focusedNodeId;
const selectedNodeIds = ref<string[]>([]);
/** Anchor used for range selection semantics. */
const selectionAnchorNodeId = ref<string | null>(null);
let isApplyingSelectionState = false;

let debugMode = false;

const {
  focusedPath,
  rootNodes: beaconRootNodes,
  findNodeInTree,
  findNodeWithPath,
  updateNodeClassNamesInTree,
  updateNodePropsInTree,
  setFocusedPath,
  clearFocusedPath,
  setRootNodes,
} = useBeaconTreeState();
const rootNodes = beaconRootNodes as unknown as BeaconRootNodesRef;

const focusedNode = shallowRef<BuilderNode | null>(null);

function dedupeNodeIds(nodeIds: readonly string[]): string[] {
  return Array.from(new Set(nodeIds));
}

function resolvePrimarySelectedNodeId(
  nodeIds: readonly string[],
  requestedPrimarySelectedNodeId?: string | null,
): string | null {
  if (
    requestedPrimarySelectedNodeId &&
    nodeIds.includes(requestedPrimarySelectedNodeId)
  ) {
    return requestedPrimarySelectedNodeId;
  }

  return nodeIds[nodeIds.length - 1] ?? null;
}

function syncFocusedPathForPrimarySelection(nodeId: string | null): void {
  if (!nodeId) {
    clearFocusedPath();
    return;
  }

  const result = findNodeWithPath(rootNodes.value, nodeId);
  if (result) {
    setFocusedPath(result.path);
    return;
  }

  clearFocusedPath();
}

function syncFocusedNodeForPrimarySelection(nodeId: string | null): void {
  if (!nodeId) {
    focusedNode.value = null;
    return;
  }

  focusedNode.value = findNodeInTree(rootNodes.value, nodeId);
}

function applySelectionState(
  nodeIds: readonly string[],
  options: {
    primarySelectedNodeId?: string | null;
    selectionAnchorNodeId?: string | null;
  } = {},
): void {
  const parsedNodeIds = BeaconSelectionNodeIdsSchema.safeParse(nodeIds);
  const normalizedNodeIds = dedupeNodeIds(
    parsedNodeIds.success ? parsedNodeIds.data : [],
  );
  const nextPrimarySelectedNodeId = resolvePrimarySelectedNodeId(
    normalizedNodeIds,
    options.primarySelectedNodeId,
  );

  let nextSelectionAnchorNodeId = options.selectionAnchorNodeId ?? null;
  if (
    nextSelectionAnchorNodeId &&
    !normalizedNodeIds.includes(nextSelectionAnchorNodeId)
  ) {
    nextSelectionAnchorNodeId =
      normalizedNodeIds[0] ?? nextPrimarySelectedNodeId;
  }

  if (!nextSelectionAnchorNodeId && normalizedNodeIds.length > 0) {
    nextSelectionAnchorNodeId =
      normalizedNodeIds[0] ?? nextPrimarySelectedNodeId;
  }

  isApplyingSelectionState = true;
  primarySelectedNodeId.value = nextPrimarySelectedNodeId;
  selectedNodeIds.value = normalizedNodeIds;
  selectionAnchorNodeId.value = nextSelectionAnchorNodeId;
  syncFocusedNodeForPrimarySelection(nextPrimarySelectedNodeId);
  syncFocusedPathForPrimarySelection(nextPrimarySelectedNodeId);
  isApplyingSelectionState = false;
}

function toggleSelectionState(nodeId: string): void {
  const nextSelectedNodeIds = selectedNodeIds.value.includes(nodeId)
    ? selectedNodeIds.value.filter(
        (selectedNodeId) => selectedNodeId !== nodeId,
      )
    : [...selectedNodeIds.value, nodeId];

  applySelectionState(nextSelectedNodeIds, {
    primarySelectedNodeId: nextSelectedNodeIds.includes(nodeId)
      ? nodeId
      : (nextSelectedNodeIds[nextSelectedNodeIds.length - 1] ?? null),
    selectionAnchorNodeId:
      selectionAnchorNodeId.value === nodeId &&
      !nextSelectedNodeIds.includes(nodeId)
        ? (nextSelectedNodeIds[0] ?? null)
        : selectionAnchorNodeId.value,
  });
}

watchEffect(() => {
  const nodeId = focusedNodeId.value;
  if (!nodeId) {
    focusedNode.value = null;
    return;
  }

  focusedNode.value = findNodeInTree(rootNodes.value, nodeId);
});

watch(
  focusedNodeId,
  (nextFocusedNodeId) => {
    if (isApplyingSelectionState) {
      return;
    }

    if (!nextFocusedNodeId) {
      applySelectionState([]);
      return;
    }

    applySelectionState([nextFocusedNodeId], {
      primarySelectedNodeId: nextFocusedNodeId,
      selectionAnchorNodeId: nextFocusedNodeId,
    });
  },
  { flush: "sync" },
);

const broadcastChannel = createBeaconChannel();

/**
 * Emit node-focused signal to all listeners
 */
function emitFocusSignal(source: NodeFocusedPayload["source"]): void {
  const path = [...focusedPath.value];
  const message = createNodeFocusedMessage({
    nodeId: focusedNodeId.value,
    path,
    source,
  });
  if (!message) {
    return;
  }

  const payload = message.payload;

  if (debugMode) {
    console.log("[Beacon] emit node-focused", payload);
  }

  // Broadcast to same-window listeners
  postBeaconChannelMessage(broadcastChannel, message);

  // Also dispatch custom event for Vue components
  dispatchNodeFocusedEvent(payload);
}

// SIGNAL LISTENER (SINGLETON)

function handleComposerMessage(rawMessage: unknown): void {
  const message = toComposerBeaconMessageLite(rawMessage);
  if (!message) {
    return;
  }

  if (message.type === "select-node") {
    const nodeId = message.payload.nodeId;
    const isAdditiveSelection =
      message.payload.triggerGesture?.metaKey === true ||
      message.payload.triggerGesture?.ctrlKey === true;

    if (!nodeId) {
      applySelectionState([]);
      return;
    }

    if (isAdditiveSelection) {
      toggleSelectionState(nodeId);
      return;
    }

    const currentRootNodes = rootNodes.value;
    const result = findNodeWithPath(currentRootNodes, nodeId);

    applySelectionState([result?.node.id ?? nodeId], {
      primarySelectedNodeId: result?.node.id ?? nodeId,
      selectionAnchorNodeId: result?.node.id ?? nodeId,
    });
    return;
  }

  if (message.type === "update-classes") {
    const payload = message.payload;

    updateNodeClassNamesInTree(
      rootNodes.value,
      payload.nodeId,
      payload.classNames,
    );
    return;
  }

  const payload = message.payload;

  if (payload.source) {
    return;
  }

  updateNodePropsInTree(rootNodes.value, payload.nodeId, payload.props);
}

if (typeof window !== "undefined") {
  addComposerBeaconMessageListener(handleComposerMessage);
}

/**
 * Beacon composable - manages node focus state across the application.
 *
 * @example
 * ```ts
 * const { focusedNodeId, focusedNode, illuminate, dim } = useBeacon();
 *
 * // Focus a node
 * illuminate('node-123');
 *
 * // Clear focus
 * dim();
 *
 * // React to focus changes
 * watch(focusedNode, (node) => {
 *   console.log('Focused:', node?.id);
 * });
 * ```
 */
export function useBeacon(options: { debug?: boolean } = {}): UseBeaconReturn {
  debugMode = options.debug ?? false;

  const hasFocus = computed(() => focusedNodeId.value !== null);

  const focusDepth = computed(() => focusedPath.value.length);

  const isRootLevel = computed(() => focusedPath.value.length === 0);

  /**
   * Illuminate (focus) a node
   */
  function illuminate(nodeId: string | null, path?: string[]): void {
    if (debugMode) {
      console.log("[Beacon] illuminate", { nodeId, path });
    }

    if (!nodeId) {
      applySelectionState([]);
      emitFocusSignal("api");
      return;
    }

    if (path) {
      applySelectionState([nodeId], {
        primarySelectedNodeId: nodeId,
        selectionAnchorNodeId: nodeId,
      });
      setFocusedPath(path);
      emitFocusSignal("api");
      return;
    }

    const result = findNodeWithPath(rootNodes.value, nodeId);
    if (result) {
      applySelectionState([result.node.id], {
        primarySelectedNodeId: result.node.id,
        selectionAnchorNodeId: result.node.id,
      });
      emitFocusSignal("api");
      return;
    }

    applySelectionState([nodeId], {
      primarySelectedNodeId: nodeId,
      selectionAnchorNodeId: nodeId,
    });

    emitFocusSignal("api");
  }

  /**
   * Dim the beacon (clear focus)
   */
  function dim(): void {
    if (debugMode) {
      console.log("[Beacon] dim");
    }

    applySelectionState([]);

    emitFocusSignal("api");
  }

  function replaceSelection(
    nodeIds: string[],
    options: {
      primarySelectedNodeId?: string | null;
      selectionAnchorNodeId?: string | null;
      emitFocusSignal?: boolean;
    } = {},
  ): void {
    applySelectionState(nodeIds, {
      primarySelectedNodeId: options.primarySelectedNodeId,
      selectionAnchorNodeId: options.selectionAnchorNodeId,
    });

    if (options.emitFocusSignal !== false) {
      emitFocusSignal("api");
    }
  }

  function clearSelection(): void {
    replaceSelection([], { emitFocusSignal: true });
  }

  function addSelection(nodeId: string): void {
    const parsedNodeId = BeaconSelectionNodeIdsSchema.element.safeParse(nodeId);
    if (!parsedNodeId.success) {
      return;
    }

    replaceSelection([...selectedNodeIds.value, parsedNodeId.data], {
      primarySelectedNodeId: parsedNodeId.data,
      selectionAnchorNodeId: selectionAnchorNodeId.value,
      emitFocusSignal: true,
    });
  }

  function removeSelection(nodeId: string): void {
    const parsedNodeId = BeaconSelectionNodeIdsSchema.element.safeParse(nodeId);
    if (!parsedNodeId.success) {
      return;
    }

    const nextSelectedNodeIds = selectedNodeIds.value.filter(
      (selectedNodeId) => selectedNodeId !== parsedNodeId.data,
    );

    replaceSelection(nextSelectedNodeIds, {
      primarySelectedNodeId:
        primarySelectedNodeId.value === parsedNodeId.data
          ? (nextSelectedNodeIds[nextSelectedNodeIds.length - 1] ?? null)
          : primarySelectedNodeId.value,
      selectionAnchorNodeId:
        selectionAnchorNodeId.value === parsedNodeId.data
          ? (nextSelectedNodeIds[0] ?? null)
          : selectionAnchorNodeId.value,
      emitFocusSignal: true,
    });
  }

  function toggleSelection(nodeId: string): void {
    toggleSelectionState(nodeId);
    emitFocusSignal("api");
  }

  /**
   * Focus a node by searching the tree
   */
  function illuminateById(nodeId: string, nodes: BuilderNode[]): boolean {
    const result = findNodeWithPath(nodes, nodeId);

    if (result) {
      applySelectionState([result.node.id], {
        primarySelectedNodeId: result.node.id,
        selectionAnchorNodeId: result.node.id,
      });
      emitFocusSignal("api");
      return true;
    }

    if (debugMode) {
      console.warn("[Beacon] Node not found:", nodeId);
    }
    return false;
  }

  /**
   * Focus the parent of the currently focused node
   */
  function illuminateParent(): void {
    if (focusedPath.value.length === 0) {
      if (debugMode) {
        console.log("[Beacon] illuminateParent: already at root");
      }
      return;
    }

    const parentId = focusedPath.value[focusedPath.value.length - 1];
    const parentNode = findNodeInTree(rootNodes.value, parentId);

    if (parentNode) {
      const parentPath = focusedPath.value.slice(0, -1);
      applySelectionState([parentId], {
        primarySelectedNodeId: parentId,
        selectionAnchorNodeId: parentId,
      });
      setFocusedPath(parentPath);
      emitFocusSignal("api");
    }
  }

  // SNAPSHOT (for undo/redo)

  function getSnapshot(): BeaconSnapshot {
    return {
      nodeId: focusedNodeId.value,
      path: [...focusedPath.value],
      primarySelectedNodeId: primarySelectedNodeId.value,
      selectedNodeIds: [...selectedNodeIds.value],
      selectionAnchorNodeId: selectionAnchorNodeId.value,
    };
  }

  function restoreSnapshot(snapshot: BeaconSnapshot): void {
    const parsedSnapshot = BeaconSnapshotSchema.safeParse(snapshot);
    const normalizedSnapshot = parsedSnapshot.success
      ? parsedSnapshot.data
      : {
          nodeId: null,
          path: [],
          primarySelectedNodeId: null,
          selectedNodeIds: [],
          selectionAnchorNodeId: null,
        };

    const nextPrimarySelectedNodeId =
      normalizedSnapshot.primarySelectedNodeId ??
      normalizedSnapshot.nodeId ??
      null;
    const nextSelectedNodeIds =
      normalizedSnapshot.selectedNodeIds ??
      (nextPrimarySelectedNodeId ? [nextPrimarySelectedNodeId] : []);

    applySelectionState(nextSelectedNodeIds, {
      primarySelectedNodeId: nextPrimarySelectedNodeId,
      selectionAnchorNodeId:
        normalizedSnapshot.selectionAnchorNodeId ?? nextPrimarySelectedNodeId,
    });

    if (!nextPrimarySelectedNodeId) {
      emitFocusSignal("api");
      return;
    }

    setFocusedPath(normalizedSnapshot.path);
    emitFocusSignal("api");
  }

  function handleBroadcastMessage(message: BeaconChannelMessage): void {
    if (message.type === "focus-request") {
      const payload = message.payload;

      if (debugMode) {
        console.log("[Beacon] focus-request received", payload);
      }

      illuminateById(payload.nodeId, rootNodes.value);
    }
  }

  // Setup listeners when Beacon is used from component setup.
  if (getCurrentInstance()) {
    let removeBroadcastListener: (() => void) | null = null;

    onMounted(() => {
      removeBroadcastListener = addBeaconChannelMessageListener(
        broadcastChannel,
        handleBroadcastMessage,
      );
    });

    onUnmounted(() => {
      removeBroadcastListener?.();
      removeBroadcastListener = null;
    });
  }

  return {
    // State (refs - singleton pattern ensures single source of truth)
    focusedNodeId,
    primarySelectedNodeId,
    selectedNodeIds,
    selectionAnchorNodeId,
    focusedNode,
    focusedPath,

    hasFocus,
    focusDepth,
    isRootLevel,

    illuminate,
    dim,
    replaceSelection,
    addSelection,
    removeSelection,
    toggleSelection,
    clearSelection,
    illuminateById,
    illuminateParent,
    setRootNodes,

    getSnapshot,
    restoreSnapshot,
  };
}

// UTILITY: Listen for focus changes from any component

/**
 * Subscribe to beacon focus changes via custom event.
 * Use this in components that don't need the full composable.
 *
 * @example
 * ```ts
 * onMounted(() => {
 *   const cleanup = onNodeFocused((payload) => {
 *     console.log('Focused:', payload.nodeId);
 *   });
 *   onUnmounted(cleanup);
 * });
 * ```
 */
export function onNodeFocused(
  handler: (payload: NodeFocusedPayload) => void,
): () => void {
  return addNodeFocusedListener(handler);
}

/**
 * Request beacon to focus a specific node.
 * Use from any component without importing useBeacon.
 *
 * @example
 * ```ts
 * requestFocus('node-123', 'layers');
 * ```
 */
export function requestFocus(
  nodeId: string,
  source: NodeFocusedPayload["source"] = "api",
): void {
  const message = createFocusRequestMessage({ nodeId, source });
  if (!message) {
    return;
  }

  const channel = createBeaconChannel();
  postBeaconChannelMessage(channel, message);
  channel?.close();
}
