import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

import { useSignals } from "../../../composables/useSignals";

export const CanvasNodeTargetSchema = z
  .object({
    nodeId: z.string().trim().min(1).nullable(),
  })
  .strict();

export const CanvasSelectionGestureSchema = z
  .object({
    metaKey: z.boolean(),
    ctrlKey: z.boolean(),
    shiftKey: z.boolean(),
  })
  .strict();

export const CanvasSelectionTargetSchema = CanvasNodeTargetSchema.extend({
  triggerGesture: CanvasSelectionGestureSchema.optional(),
});

export const CanvasNodeLookupSchema = z
  .object({
    nodeId: z.string().trim().min(1),
  })
  .strict();

export const ClearInsertionContextPayloadSchema = z.union([
  z.object({}).strict(),
  z.undefined(),
]);

export type CanvasNodeTarget = z.infer<typeof CanvasNodeTargetSchema>;
export type CanvasSelectionGesture = z.infer<
  typeof CanvasSelectionGestureSchema
>;
export type CanvasSelectionTarget = z.infer<typeof CanvasSelectionTargetSchema>;
export type CanvasNodeLookup = z.infer<typeof CanvasNodeLookupSchema>;
export type ClearInsertionContextPayload = z.infer<
  typeof ClearInsertionContextPayloadSchema
>;

type CanvasInteractionEvent =
  | "hover-node"
  | "select-node"
  | "highlight-node"
  | "scroll-to-node"
  | "get-component-wrapper"
  | "clear-insertion-context";

function warnInvalidPayload(
  eventType: CanvasInteractionEvent,
  issues: $ZodIssue[],
): void {
  console.warn(
    `[useCanvasInteractionBridge] Ignored invalid ${eventType} payload`,
    { issues },
  );
}

export function useCanvasInteractionBridge() {
  const { signal, broadcast, on } = useSignals();

  function broadcastHoverNode(payload: CanvasNodeTarget): void {
    const parsed = CanvasNodeTargetSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("hover-node", parsed.error.issues);
      return;
    }

    broadcast("hover-node", parsed.data);
  }

  function broadcastSelectNode(payload: CanvasSelectionTarget): void {
    const parsed = CanvasSelectionTargetSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("select-node", parsed.error.issues);
      return;
    }

    broadcast("select-node", parsed.data);
  }

  function signalHighlightNode(payload: CanvasNodeTarget): void {
    const parsed = CanvasNodeTargetSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("highlight-node", parsed.error.issues);
      return;
    }

    signal("highlight-node", parsed.data);
  }

  function signalScrollToNode(payload: CanvasNodeLookup): void {
    const parsed = CanvasNodeLookupSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("scroll-to-node", parsed.error.issues);
      return;
    }

    signal("scroll-to-node", parsed.data);
  }

  function signalGetComponentWrapper(payload: CanvasNodeLookup): void {
    const parsed = CanvasNodeLookupSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("get-component-wrapper", parsed.error.issues);
      return;
    }

    signal("get-component-wrapper", parsed.data);
  }

  function signalClearInsertionContext(): void {
    signal("clear-insertion-context", {});
  }

  function onHoverNode(
    handler: (payload: CanvasNodeTarget) => void,
  ): (() => void) | void {
    return on("hover-node", (payload: unknown) => {
      const parsed = CanvasNodeTargetSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("hover-node", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onSelectNode(
    handler: (payload: CanvasSelectionTarget) => void,
  ): (() => void) | void {
    return on("select-node", (payload: unknown) => {
      const parsed = CanvasSelectionTargetSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("select-node", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onHighlightNode(
    handler: (payload: CanvasNodeTarget) => void,
  ): (() => void) | void {
    return on("highlight-node", (payload: unknown) => {
      const parsed = CanvasNodeTargetSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("highlight-node", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onScrollToNode(
    handler: (payload: CanvasNodeLookup) => void,
  ): (() => void) | void {
    return on("scroll-to-node", (payload: unknown) => {
      const parsed = CanvasNodeLookupSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("scroll-to-node", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onClearInsertionContext(handler: () => void): (() => void) | void {
    return on("clear-insertion-context", (payload: unknown) => {
      const parsed = ClearInsertionContextPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("clear-insertion-context", parsed.error.issues);
        return;
      }

      handler();
    });
  }

  return {
    broadcastHoverNode,
    broadcastSelectNode,
    signalHighlightNode,
    signalScrollToNode,
    signalGetComponentWrapper,
    signalClearInsertionContext,
    onHoverNode,
    onSelectNode,
    onHighlightNode,
    onScrollToNode,
    onClearInsertionContext,
  };
}
