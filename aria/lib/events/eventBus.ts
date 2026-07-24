/**
 * Event system for node mutations, integrated with
 * undo/redo. Pub/sub pattern for cross-component communication.
 */

import type { BuilderNode } from "../types/nodes";
import type { NodeEvent, EventCallback, EventSubscription } from "./types";
import { log } from "../utils/logger";

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private eventHistory: NodeEvent[] = [];
  private maxHistorySize = 100;

  /**
   * Subscribe to events of a specific type
   */
  on(eventType: string, callback: EventCallback): EventSubscription {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(callback);

    return {
      unsubscribe: () => {
        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.listeners.delete(eventType);
          }
        }
      },
    };
  }

  /**
   * Subscribe to events matching a pattern (wildcard support)
   */
  onPattern(pattern: RegExp, callback: EventCallback): EventSubscription {
    const wrappedCallback = (event: NodeEvent) => {
      if (pattern.test(event.type)) {
        callback(event);
      }
    };

    // Subscribe to all events
    return this.on("*", wrappedCallback);
  }

  /**
   * Subscribe once - automatically unsubscribes after first call
   */
  once(eventType: string, callback: EventCallback): EventSubscription {
    const subscription = this.on(eventType, (event) => {
      callback(event);
      subscription.unsubscribe();
    });

    return subscription;
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: NodeEvent): void {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          log("error", `[EventBus] Error in ${event.type} callback`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    const wildcardCallbacks = this.listeners.get("*");
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          log("error", "[EventBus] Error in wildcard callback", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  /**
   * Remove all listeners for a specific event type
   */
  off(eventType: string): void {
    this.listeners.delete(eventType);
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.eventHistory = [];
  }

  /**
   * Get recent event history (for debugging)
   */
  getHistory(eventType?: string, limit = 50): NodeEvent[] {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter((e) => e.type === eventType);
    }

    return history.slice(-limit);
  }

  /**
   * Get active listener count
   */
  getListenerCount(eventType?: string): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size || 0;
    }

    let total = 0;
    this.listeners.forEach((callbacks) => {
      total += callbacks.size;
    });
    return total;
  }
}

export const eventBus = new EventBus();

export function emitNodeUpdated(
  nodeId: string,
  updates: Partial<BuilderNode>,
  source?: string,
): void {
  eventBus.emit({
    type: "node:updated",
    nodeId,
    timestamp: Date.now(),
    source,
    payload: { updates },
  });
}

export function emitNodeCreated(
  node: BuilderNode,
  parentId: string | null,
  source?: string,
): void {
  eventBus.emit({
    type: "node:created",
    nodeId: node.id,
    timestamp: Date.now(),
    source,
    payload: { node, parentId },
  });
}

export function emitNodeDeleted(
  nodeId: string,
  parentId: string | null,
  source?: string,
): void {
  eventBus.emit({
    type: "node:deleted",
    nodeId,
    timestamp: Date.now(),
    source,
    payload: { parentId },
  });
}

export function emitNodeMoved(
  nodeId: string,
  oldParentId: string | null,
  newParentId: string | null,
  newIndex: number,
  source?: string,
): void {
  eventBus.emit({
    type: "node:moved",
    nodeId,
    timestamp: Date.now(),
    source,
    payload: { oldParentId, newParentId, newIndex },
  });
}

export function emitBatchOperation(
  nodeIds: string[],
  operation: string,
  source?: string,
): void {
  eventBus.emit({
    type: "node:batch",
    nodeId: nodeIds.join(","),
    timestamp: Date.now(),
    source,
    payload: { nodeIds, operation },
  });
}
