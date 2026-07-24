import {
  ref,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  toRaw,
  type Ref,
} from "vue";
import { z } from "zod";
import { log } from "@/lib/utils/logger";

/**
 * Type-safe message structure for cross-window communication.
 * All postMessage events must conform to this interface.
 */
interface ComposerMessage<T = unknown> {
  source: "aria-composer";
  type: string;
  payload?: T;
}

const SignalTypeSchema = z.string().trim().min(1);

const ComposerMessageSchema = z.object({
  source: z.literal("aria-composer"),
  type: SignalTypeSchema,
  payload: z.unknown().optional(),
});

/**
 * Event handler function signature.
 * @template T - The payload type for this event
 */
type EventHandler<T = unknown> = (payload: T) => void;

interface SignalsOptions {
  debug?: boolean;
}

/**
 * Deep converts Vue reactive proxies to plain objects.
 * Required for postMessage which uses structured clone algorithm.
 */
function deepToRaw<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Convert the top-level object
  const raw = toRaw(obj);

  if (Array.isArray(raw)) {
    return raw.map(deepToRaw) as T;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(raw as object)) {
    result[key] = deepToRaw((raw as Record<string, unknown>)[key]);
  }
  return result as T;
}

// These are shared across ALL useSignals instances to enable true global
// event broadcasting between components that don't share the same instance.

/** Global registry of event listeners - shared across all useSignals instances */
const globalListeners = new Map<string, Set<EventHandler>>();

let globalHandlerInstalled = false;

/** Reference count for cleanup - only remove handler when all instances unmount */
let instanceCount = 0;

function parseSignalType(type: string): string | null {
  const parsed = SignalTypeSchema.safeParse(type);
  return parsed.success ? parsed.data : null;
}

function createComposerMessage<T = unknown>(
  type: string,
  payload?: T,
): ComposerMessage<T> | null {
  const normalizedType = parseSignalType(type);
  if (!normalizedType) {
    log("warn", "[useSignals] Ignored signal with invalid type", { type });
    return null;
  }

  return {
    source: "aria-composer",
    type: normalizedType,
    payload,
  };
}

function parseComposerMessage(data: unknown): ComposerMessage | null {
  const parsed = ComposerMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * Global message handler that routes to all registered listeners.
 * Installed once and shared by all useSignals instances.
 */
function globalHandleMessage(event: MessageEvent<ComposerMessage>): void {
  // Security: Reject cross-origin messages
  if (event.origin !== window.location.origin) {
    return;
  }

  const parsedMessage = parseComposerMessage(event.data);
  if (!parsedMessage) {
    return;
  }

  const { type, payload } = parsedMessage;
  const handlers = globalListeners.get(type);

  if (handlers && handlers.size > 0) {
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        log("error", `[useSignals] Handler error for \"${type}\"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}

/**
 * Cross-window messaging system for Aria composer.
 *
 * Origin-validated signals between:
 * - Parent window ↔ Canvas iframe (via signal)
 * - Same window components (via broadcast)
 *
 * @example
 * ```ts
 * const { signal, broadcast, on } = useSignals();
 *
 * // Send to iframe
 * signal('highlight-node', { nodeId: '123' });
 *
 * // Send to parent window components
 * broadcast('hover-node', { nodeId: '456' });
 *
 * // Listen for events
 * on('node-selected', (payload) => {
 *   console.log('Selected:', payload.nodeId);
 * });
 * ```
 */
export function useSignals(options: SignalsOptions = {}) {
  const { debug = false } = options;
  const hasLifecycleOwner = Boolean(getCurrentInstance());

  /** Reference to the iframe element for cross-window messaging */
  const frameRef = ref<HTMLIFrameElement>();

  const instanceCleanups: (() => void)[] = [];

  /**
   * Sends a message to the canvas iframe's contentWindow.
   * Falls back to window.parent if iframe not available.
   *
   * @param type - Event type identifier
   * @param payload - Event data (must be serializable)
   */
  function signal<T = unknown>(type: string, payload?: T): void {
    const target = frameRef.value?.contentWindow ?? window.parent;
    const message = createComposerMessage(type, payload);
    if (!message) {
      return;
    }

    if (debug) {
      log("debug", "[useSignals] signal", { type: message.type, payload });
    }

    target.postMessage(message, window.location.origin);
  }

  /**
   * Broadcasts a message to all listeners in the current window.
   * Used for parent-to-parent component communication.
   *
   * @param type - Event type identifier
   * @param payload - Event data (must be serializable)
   */
  function broadcast<T = unknown>(type: string, payload?: T): void {
    // CRITICAL: Convert Vue reactive proxies to plain objects.
    // postMessage uses structured clone which cannot handle Proxy objects.
    const rawPayload = deepToRaw(payload);
    const message = createComposerMessage(type, rawPayload);
    if (!message) {
      return;
    }

    if (debug) {
      log("debug", "[useSignals] broadcast", {
        type: message.type,
        payload: rawPayload,
      });
    }

    try {
      window.postMessage(message, window.location.origin);
    } catch (error) {
      log("error", "[useSignals] postMessage failed", {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Registers an event listener for a specific message type.
   * Supports multiple handlers per event type.
   * Uses the GLOBAL listeners map so handlers are accessible across all instances.
   *
   * @param type - Event type to listen for
   * @param handler - Callback invoked when event fires
   * @returns Cleanup function to remove this specific listener
   */
  function on<T = unknown>(type: string, handler: EventHandler<T>): () => void {
    const normalizedType = parseSignalType(type);
    if (!normalizedType) {
      log(
        "warn",
        "[useSignals] Ignored listener registration with invalid type",
        {
          type,
        },
      );
      return () => undefined;
    }

    // CRITICAL: Ensure global handler is installed immediately when first handler registers.
    // This fixes timing issues where handlers are registered in script setup but
    // the global listener wasn't installed until onMounted.
    if (!globalHandlerInstalled) {
      window.addEventListener("message", globalHandleMessage);
      globalHandlerInstalled = true;

      if (debug) {
        log("debug", "[useSignals] Global handler installed early");
      }
    }

    if (!globalListeners.has(normalizedType)) {
      globalListeners.set(normalizedType, new Set());
    }

    const handlers = globalListeners.get(normalizedType)!;
    handlers.add(handler as EventHandler);

    if (debug) {
      log("debug", "[useSignals] listener registered", {
        type: normalizedType,
        handlerCount: handlers.size,
      });
    }

    const cleanup = () => {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        globalListeners.delete(normalizedType);
      }
    };

    // Track for automatic cleanup on unmount
    instanceCleanups.push(cleanup);

    return cleanup;
  }

  /**
   * Removes all listeners for a specific event type.
   *
   * @param type - Event type to clear
   */
  function off(type: string): void {
    const normalizedType = parseSignalType(type);
    if (!normalizedType) {
      log("warn", "[useSignals] Ignored listener removal with invalid type", {
        type,
      });
      return;
    }

    const removed = globalListeners.delete(normalizedType);

    if (debug && removed) {
      log("debug", "[useSignals] listeners removed", {
        type: normalizedType,
      });
    }
  }

  // Lifecycle: Setup and teardown
  if (hasLifecycleOwner) {
    onMounted(() => {
      instanceCount++;

      if (!globalHandlerInstalled) {
        window.addEventListener("message", globalHandleMessage);
        globalHandlerInstalled = true;

        if (debug) {
          log("debug", "[useSignals] Global handler installed");
        }
      }

      if (debug) {
        log("debug", "[useSignals] Mounted", { instanceCount });
      }
    });

    onUnmounted(() => {
      // Clean up this instance's handlers
      instanceCleanups.forEach((cleanup) => cleanup());
      instanceCleanups.length = 0;

      instanceCount--;

      // Only remove global handler when all instances are gone
      if (instanceCount === 0 && globalHandlerInstalled) {
        window.removeEventListener("message", globalHandleMessage);
        globalHandlerInstalled = false;
        globalListeners.clear();

        if (debug) {
          log("debug", "[useSignals] Global handler removed");
        }
      }

      if (debug) {
        log("debug", "[useSignals] Unmounted", { instanceCount });
      }
    });
  }

  return {
    /** Reference to iframe element for cross-window messaging */
    frameRef: frameRef as Ref<HTMLIFrameElement | undefined>,
    /** Send message to iframe contentWindow */
    signal,
    /** Send message to current window (parent-to-parent) */
    broadcast,
    /** Register event listener */
    on,
    /** Remove all listeners for an event type */
    off,
  };
}
