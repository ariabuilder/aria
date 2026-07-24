/**
 * Type definitions for the Beacon feature - Aria's node selection/focus system.
 */

import type { BuilderNode } from "../../../../lib/types/nodes";
import { z } from "zod";

export const BeaconNodeIdSchema = z.string().min(1);
export const BeaconNodeIdOrNullSchema = BeaconNodeIdSchema.nullable();
export const BeaconPathSchema = z.array(BeaconNodeIdSchema);
export const BeaconSelectionNodeIdsSchema = z.array(BeaconNodeIdSchema);

/**
 * Current beacon state - what node is "illuminated" (focused/selected)
 */
export interface BeaconState {
  nodeId: string | null;
  /** Path from root to focused node (ancestor IDs, excludes focused node) */
  path: string[];
}

/**
 * Snapshot for undo/redo operations
 */
export interface BeaconSnapshot {
  nodeId: string | null;
  path: string[];
  primarySelectedNodeId?: string | null;
  selectedNodeIds?: string[];
  selectionAnchorNodeId?: string | null;
}

export const BeaconSnapshotSchema = z.object({
  nodeId: BeaconNodeIdOrNullSchema.optional(),
  path: BeaconPathSchema.optional().default([]),
  primarySelectedNodeId: BeaconNodeIdOrNullSchema.optional(),
  selectedNodeIds: BeaconSelectionNodeIdsSchema.optional(),
  selectionAnchorNodeId: BeaconNodeIdOrNullSchema.optional(),
});

/**
 * Payload for node-focused signal
 * Emitted when beacon illuminates a new node
 */
export interface NodeFocusedPayload {
  nodeId: string | null;
  path: string[];
  source: "canvas" | "layers" | "inspector" | "keyboard" | "api";
}

/**
 * Payload for focus-request signal
 * Used to request beacon to focus a specific node
 */
export interface FocusRequestPayload {
  nodeId: string;
  source: "canvas" | "layers" | "inspector" | "keyboard" | "api";
}

export interface UseBeaconReturn {
  // State (refs - singleton pattern ensures single source of truth)
  focusedNodeId: import("vue").Ref<string | null>;
  primarySelectedNodeId: import("vue").Ref<string | null>;
  selectedNodeIds: import("vue").Ref<string[]>;
  /** Anchor used for range extension semantics */
  selectionAnchorNodeId: import("vue").Ref<string | null>;
  /** Currently focused node data, derived from the selection tree */
  focusedNode: import("vue").Ref<BuilderNode | null>;
  focusedPath: import("vue").Ref<string[]>;

  hasFocus: import("vue").ComputedRef<boolean>;
  focusDepth: import("vue").ComputedRef<number>;
  isRootLevel: import("vue").ComputedRef<boolean>;

  /** Focus a specific node */
  illuminate: (nodeId: string | null, path?: string[]) => void;
  dim: () => void;
  replaceSelection: (
    nodeIds: string[],
    options?: {
      primarySelectedNodeId?: string | null;
      selectionAnchorNodeId?: string | null;
      emitFocusSignal?: boolean;
    },
  ) => void;
  addSelection: (nodeId: string) => void;
  /** Remove one node from the current selection */
  removeSelection: (nodeId: string) => void;
  toggleSelection: (nodeId: string) => void;
  clearSelection: () => void;
  /** Focus a node by searching the tree */
  illuminateById: (nodeId: string, rootNodes: BuilderNode[]) => boolean;
  /** Focus parent of currently focused node */
  illuminateParent: () => void;
  /** Replace the root nodes used for tree-derived selection lookups */
  setRootNodes: (nodes: BuilderNode[], selectedNodeId?: string | null) => void;

  // Snapshot for undo/redo
  getSnapshot: () => BeaconSnapshot;
  restoreSnapshot: (snapshot: BeaconSnapshot) => void;
}
