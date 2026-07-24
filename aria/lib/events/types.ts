/**
 * Types for the event bus and node mutation events.
 */

import type { BuilderNode } from "../types/nodes";

/**
 * Shared event metadata for all node-system events.
 */
interface BaseNodeEvent<TType extends string, TPayload> {
  /** Event type (e.g., 'node:updated', 'node:created') */
  type: TType;
  nodeId: string;
  timestamp: number;
  /** Source of the event (e.g., 'inspector', 'canvas', 'undo', 'redo') */
  source?: string;
  transactionId?: string;
  recordInHistory?: boolean;

  /** Event payload (type-specific data) */
  payload: TPayload;
}

export interface HistoryEventOperation {
  type: string;
  timestamp: number;
  description?: string;
  affectedNodeIds?: readonly string[];
}

export interface NodeUpdatedEvent extends BaseNodeEvent<
  "node:updated",
  {
    updates: Partial<BuilderNode>;
    oldValues?: Partial<BuilderNode>;
  }
> {}

export interface NodeCreatedEvent extends BaseNodeEvent<
  "node:created",
  {
    node: BuilderNode;
    parentId: string | null;
    index?: number;
  }
> {}

export interface NodeDeletedEvent extends BaseNodeEvent<
  "node:deleted",
  {
    parentId: string | null;
    deletedNode?: BuilderNode; // For undo
  }
> {}

export interface NodeMovedEvent extends BaseNodeEvent<
  "node:moved",
  {
    oldParentId: string | null;
    newParentId: string | null;
    oldIndex?: number;
    newIndex: number;
  }
> {}

/**
 * Batch operation event
 */
export interface NodeBatchEvent extends BaseNodeEvent<
  "node:batch",
  {
    nodeIds: string[];
    operation: string;
    operations?: NodeEvent[];
  }
> {}

export interface NodeSelectedEvent extends BaseNodeEvent<
  "node:selected",
  {
    previousNodeId?: string;
  }
> {}

export interface NodePropertyChangePayload<TValue = unknown> {
  property: string;
  oldValue?: TValue;
  newValue: TValue;
}

export interface NodeStyleUpdatedEvent extends BaseNodeEvent<
  "node:style-updated",
  NodePropertyChangePayload
> {}

export interface NodePropsUpdatedEvent extends BaseNodeEvent<
  "node:props-updated",
  NodePropertyChangePayload
> {}

export interface HistoryEvent extends BaseNodeEvent<
  "history:undo" | "history:redo",
  {
    operation: HistoryEventOperation;
  }
> {}

export type NodeEvent =
  | NodeUpdatedEvent
  | NodeCreatedEvent
  | NodeDeletedEvent
  | NodeMovedEvent
  | NodeBatchEvent
  | NodeSelectedEvent
  | NodeStyleUpdatedEvent
  | NodePropsUpdatedEvent
  | HistoryEvent;

export type EventCallback = (event: NodeEvent) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
}

export type EventFilter = (event: NodeEvent) => boolean;

/**
 * Transaction interface for grouping related events
 */
export interface EventTransaction {
  id: string;
  events: NodeEvent[];
  startTime: number;
  endTime?: number;
  committed: boolean;
}
