import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

import { log } from "@/lib/utils/logger";
import { CanvasSelectionTargetSchema } from "../../Core/composables/useCanvasInteractionBridge";
import {
  CanvasClassUpdateSchema,
  CanvasPropsUpdateSchema,
} from "../../Core/composables/useCanvasSignalBridge";
import type {
  FocusRequestPayload,
  NodeFocusedPayload,
} from "../types/beacon.types";

export const BEACON_CHANNEL_NAME = "aria-beacon";
export const NODE_FOCUSED_EVENT_NAME = "aria:node-focused";

export interface BeaconChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  close(): void;
}

const BeaconSourceSchema = z.enum([
  "canvas",
  "layers",
  "inspector",
  "keyboard",
  "api",
]);

export const NodeFocusedPayloadSchema: z.ZodType<NodeFocusedPayload> = z
  .object({
    nodeId: z.string().trim().min(1).nullable(),
    path: z.array(z.string().trim().min(1)),
    source: BeaconSourceSchema,
  })
  .strict();

export const FocusRequestPayloadSchema: z.ZodType<FocusRequestPayload> = z
  .object({
    nodeId: z.string().trim().min(1),
    source: BeaconSourceSchema,
  })
  .strict();

const BeaconFocusedMessageSchema = z
  .object({
    type: z.literal("node-focused"),
    payload: NodeFocusedPayloadSchema,
  })
  .strict();

const BeaconFocusRequestMessageSchema = z
  .object({
    type: z.literal("focus-request"),
    payload: FocusRequestPayloadSchema,
  })
  .strict();

const ComposerSelectNodeMessageSchema = z
  .object({
    source: z.literal("aria-composer"),
    type: z.literal("select-node"),
    payload: CanvasSelectionTargetSchema,
  })
  .strict();

const ComposerClassUpdateMessageSchema = z
  .object({
    source: z.literal("aria-composer"),
    type: z.literal("update-classes"),
    payload: CanvasClassUpdateSchema,
  })
  .strict();

const ComposerPropsUpdateMessageSchema = z
  .object({
    source: z.literal("aria-composer"),
    type: z.literal("update-props"),
    payload: CanvasPropsUpdateSchema,
  })
  .strict();

const BeaconChannelMessageSchema = z.union([
  BeaconFocusedMessageSchema,
  BeaconFocusRequestMessageSchema,
]);

const ComposerBeaconMessageSchema = z.union([
  ComposerSelectNodeMessageSchema,
  ComposerClassUpdateMessageSchema,
  ComposerPropsUpdateMessageSchema,
]);

const ComposerMessageEnvelopeSchema = z
  .looseObject({
    source: z.literal("aria-composer"),
    type: z.string().trim().min(1),
  });

const BEACON_COMPOSER_MESSAGE_TYPES = new Set<ComposerBeaconMessage["type"]>([
  "select-node",
  "update-classes",
  "update-props",
]);

export type BeaconChannelMessage = z.infer<typeof BeaconChannelMessageSchema>;
export type ComposerBeaconMessage = z.infer<typeof ComposerBeaconMessageSchema>;

function warnInvalidPayload(context: string, issues: $ZodIssue[]): void {
  log("warn", `[Beacon] Ignored invalid ${context}`, {
    issues,
  });
}

export function parseComposerBeaconMessage(
  data: unknown,
): ComposerBeaconMessage | null {
  const parsedEnvelope = ComposerMessageEnvelopeSchema.safeParse(data);
  if (!parsedEnvelope.success) {
    return null;
  }

  if (
    !BEACON_COMPOSER_MESSAGE_TYPES.has(
      parsedEnvelope.data.type as ComposerBeaconMessage["type"],
    )
  ) {
    return null;
  }

  const parsed = ComposerBeaconMessageSchema.safeParse(data);
  if (!parsed.success) {
    warnInvalidPayload("composer beacon message", parsed.error.issues);
    return null;
  }

  return parsed.data;
}

export function parseBeaconChannelMessage(
  data: unknown,
): BeaconChannelMessage | null {
  const parsed = BeaconChannelMessageSchema.safeParse(data);
  if (!parsed.success) {
    warnInvalidPayload("beacon channel message", parsed.error.issues);
    return null;
  }

  return parsed.data;
}

export function parseNodeFocusedPayload(
  payload: unknown,
): NodeFocusedPayload | null {
  const parsed = NodeFocusedPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    warnInvalidPayload("node-focused payload", parsed.error.issues);
    return null;
  }

  return parsed.data;
}

export function createNodeFocusedMessage(input: {
  nodeId: string | null;
  path: string[];
  source: NodeFocusedPayload["source"];
}): BeaconChannelMessage | null {
  const parsedPayload = NodeFocusedPayloadSchema.safeParse({
    nodeId: input.nodeId,
    path: [...input.path],
    source: input.source,
  });
  if (!parsedPayload.success) {
    warnInvalidPayload("node-focused payload", parsedPayload.error.issues);
    return null;
  }

  return {
    type: "node-focused",
    payload: parsedPayload.data,
  };
}

export function createFocusRequestMessage(input: {
  nodeId: string;
  source: FocusRequestPayload["source"];
}): BeaconChannelMessage | null {
  const parsedPayload = FocusRequestPayloadSchema.safeParse({
    nodeId: input.nodeId,
    source: input.source,
  });
  if (!parsedPayload.success) {
    warnInvalidPayload("focus-request payload", parsedPayload.error.issues);
    return null;
  }

  return {
    type: "focus-request",
    payload: parsedPayload.data,
  };
}

export function createBeaconChannel(): BeaconChannelLike | null {
  if (typeof BroadcastChannel !== "function") {
    return null;
  }

  return new BroadcastChannel(BEACON_CHANNEL_NAME);
}

export function postBeaconChannelMessage(
  channel: BeaconChannelLike | null,
  message: BeaconChannelMessage,
): boolean {
  if (!channel) {
    return false;
  }

  channel.postMessage(message);
  return true;
}

export function addComposerBeaconMessageListener(
  listener: (message: ComposerBeaconMessage) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) {
      return;
    }

    const message = parseComposerBeaconMessage(event.data);
    if (!message) {
      return;
    }

    listener(message);
  };

  window.addEventListener("message", handleMessage);

  return () => {
    window.removeEventListener("message", handleMessage);
  };
}

export function addBeaconChannelMessageListener(
  channel: BeaconChannelLike | null,
  listener: (message: BeaconChannelMessage) => void,
): () => void {
  if (!channel) {
    return () => undefined;
  }

  const handleMessage = (event: MessageEvent): void => {
    const message = parseBeaconChannelMessage(event.data);
    if (!message) {
      return;
    }

    listener(message);
  };

  channel.addEventListener("message", handleMessage);

  return () => {
    channel.removeEventListener("message", handleMessage);
  };
}

export function dispatchNodeFocusedEvent(payload: unknown): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const parsed = parseNodeFocusedPayload(payload);
  if (!parsed) {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent(NODE_FOCUSED_EVENT_NAME, { detail: parsed }),
  );
  return true;
}

export function addNodeFocusedListener(
  listener: (payload: NodeFocusedPayload) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleEvent = (event: Event): void => {
    const payload = parseNodeFocusedPayload(
      (event as CustomEvent<unknown>).detail,
    );
    if (!payload) {
      return;
    }

    listener(payload);
  };

  window.addEventListener(NODE_FOCUSED_EVENT_NAME, handleEvent);

  return () => {
    window.removeEventListener(NODE_FOCUSED_EVENT_NAME, handleEvent);
  };
}
