import type { JSONSchema7 } from "ai";
import { applyChunkToParts } from "agents/chat";
import { z } from "zod";
import type { ClientToolSchema } from "./clientToolSchemas";
import type { AgentChatMessage } from "./schemas";
import {
  AgentComposerModeSchema,
  AgentSessionModelOverrideSchema,
  AgentShellContextSchema,
  AgentSeoContextSchema,
  AgentStreamEventSchema,
  type AgentChatRequestExtras,
  type AgentComposerMode,
  type AgentStreamEvent,
} from "./schemas";
import { toChatRequestExtras } from "./chatRequest";

type UiMessagePart = Parameters<typeof applyChunkToParts>[0][number];
type UiMessageChunk = Parameters<typeof applyChunkToParts>[1];

export type AgentStreamAccumulatorState = {
  parts: UiMessagePart[];
  lastTextDelta: string | null;
};

export function createAgentStreamAccumulatorState(): AgentStreamAccumulatorState {
  return {
    parts: [],
    lastTextDelta: null,
  };
}

export function textFromUiParts(parts: UiMessagePart[]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text;
}

export function reasoningFromUiParts(parts: UiMessagePart[]): string {
  let reasoning = "";
  for (const part of parts) {
    if (part.type === "reasoning") {
      reasoning += part.text;
    }
  }
  return reasoning;
}

/** Apply one AI SDK UI stream chunk using the same rules as @cloudflare/ai-chat. */
export function applyAgentStreamChunk(
  state: AgentStreamAccumulatorState,
  chunkBody: string,
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(chunkBody);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const chunk = parsed as UiMessageChunk;
  if (typeof chunk.type !== "string") {
    return null;
  }

  if (
    chunk.type === "text-delta" &&
    typeof chunk.delta === "string" &&
    chunk.delta === state.lastTextDelta
  ) {
    return textFromUiParts(state.parts);
  }

  if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
    state.lastTextDelta = chunk.delta;
  }

  applyChunkToParts(state.parts, chunk);
  return textFromUiParts(state.parts);
}

export const AgentWsChatResponseFrameSchema = z
  .object({
    type: z.literal("cf_agent_use_chat_response"),
    id: z.string().min(1),
    body: z.string().optional(),
    done: z.boolean().optional(),
    error: z.boolean().optional(),
    // @cloudflare/ai-chat adds these fields when a client-side tool resumes
    // the same assistant turn, and while replaying buffered stream chunks.
    // Keep the frame strict so protocol drift is still caught, but accept the
    // complete official response shape. Rejecting `continuation: true` drops
    // every resumed tool call and leaves the client waiting for a model event
    // that the server already delivered.
    continuation: z.boolean().optional(),
    replay: z.boolean().optional(),
    replayComplete: z.boolean().optional(),
  })
  .strict();

export type AgentWsChatResponseFrame = z.infer<
  typeof AgentWsChatResponseFrameSchema
>;

export const AgentWsTurnStatusFrameSchema = z
  .object({
    type: z.literal("aria_agent_turn_status"),
    id: z.string().min(1),
    phase: z.enum(["accepted", "preparing", "generating"]),
  })
  .strict();

export type AgentWsTurnStatusFrame = z.infer<
  typeof AgentWsTurnStatusFrameSchema
>;

export type AgentWsTurnStatusPhase = AgentWsTurnStatusFrame["phase"];

export function buildAgentWsTurnStatusFrame(
  id: string,
  phase: AgentWsTurnStatusPhase,
): AgentWsTurnStatusFrame {
  return AgentWsTurnStatusFrameSchema.parse({
    type: "aria_agent_turn_status",
    id,
    phase,
  });
}

export const AgentWsTextDeltaChunkSchema = z.looseObject({
  type: z.literal("text-delta"),
  delta: z.string(),
});

export function toUiMessages(messages: AgentChatMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text" as const, text: message.content }],
  }));
}

export const AgentWsUiTextPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
  })
  .strict();

export const AgentWsUiMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(AgentWsUiTextPartSchema).min(1),
  })
  .strict();

export const AgentWsClientToolSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.custom<JSONSchema7>().optional(),
  })
  .strict();

export const AgentWsChatRequestBodySchema = z
  .object({
    messages: z.array(AgentWsUiMessageSchema).min(1).max(250),
    trigger: z.literal("submit-message"),
    composerMode: AgentComposerModeSchema.default("agent"),
    sessionModel: AgentSessionModelOverrideSchema.optional(),
    shellContext: AgentShellContextSchema.optional(),
    seoContext: AgentSeoContextSchema.optional(),
    clientTools: z.array(AgentWsClientToolSchema).optional(),
  })
  .strict();

export type AgentWsChatRequestBody = z.infer<
  typeof AgentWsChatRequestBodySchema
>;

export function buildAgentChatRequestBody(input: {
  messages: AgentChatMessage[];
  composerMode: AgentComposerMode;
  sessionModel?: AgentChatRequestExtras["sessionModel"];
  shellContext?: AgentChatRequestExtras["shellContext"];
  seoContext?: AgentChatRequestExtras["seoContext"];
  clientToolSchemas?: ClientToolSchema[];
}): string {
  const extras = toChatRequestExtras({
    composerMode: input.composerMode,
    sessionModel: input.sessionModel,
    shellContext: input.shellContext,
    seoContext: input.seoContext,
  });

  const clientTools =
    input.clientToolSchemas && input.clientToolSchemas.length > 0
      ? input.clientToolSchemas
      : undefined;

  const body = AgentWsChatRequestBodySchema.parse({
    messages: toUiMessages(input.messages),
    trigger: "submit-message",
    composerMode: extras.composerMode,
    sessionModel: extras.sessionModel,
    shellContext: extras.shellContext,
    seoContext: extras.seoContext,
    ...(clientTools ? { clientTools } : {}),
  });

  return JSON.stringify(body);
}

export function buildAgentToolResultPayload(input: {
  toolCallId: string;
  toolName: string;
  output: unknown;
  state?: "output-available" | "output-error";
  errorText?: string;
  autoContinue?: boolean;
  clientToolSchemas?: ClientToolSchema[];
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: "cf_agent_tool_result",
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    output: input.output,
    autoContinue: input.autoContinue ?? false,
  };

  if (input.state) {
    payload.state = input.state;
  }
  if (input.errorText !== undefined) {
    payload.errorText = input.errorText;
  }
  if (input.clientToolSchemas?.length) {
    payload.clientTools = input.clientToolSchemas;
  }

  return payload;
}

/**
 * Convert a WebSocket chat response frame into a standardised `AgentStreamEvent`. The
 * WS frames contain raw AI SDK UI chunks wrapped in a.
 */
export function wsFrameToStreamEvent(
  frame: AgentWsChatResponseFrame,
  context: { toolNameByCallId?: Map<string, string> } = {},
): AgentStreamEvent | null {
  if (frame.error) {
    return {
      type: "error" as const,
      error: frame.body?.trim() || "Agent stream error",
    };
  }

  if (frame.done) {
    return { type: "finished" as const };
  }

  if (!frame.body) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.body);
  } catch {
    return null;
  }

  const result = AgentStreamEventSchema.safeParse(parsed);
  if (!result.success) {
    return normalizeUiStreamChunk(parsed, context);
  }

  return result.data;
}

function normalizeUiStreamChunk(
  chunk: unknown,
  context: { toolNameByCallId?: Map<string, string> },
): AgentStreamEvent | null {
  if (typeof chunk !== "object" || chunk === null || !("type" in chunk)) {
    return null;
  }

  const record = chunk as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";

  if (type === "text-delta" && typeof record.delta === "string") {
    return { type: "text-delta", delta: record.delta };
  }

  if (type === "error" && typeof record.errorText === "string") {
    return { type: "error", error: record.errorText };
  }

  if (type === "reasoning-delta" && typeof record.delta === "string") {
    return { type: "reasoning", delta: record.delta };
  }

  if (type === "reasoning-delta" && typeof record.text === "string") {
    return { type: "reasoning", delta: record.text };
  }

  if (type === "tool-input-available") {
    const toolCallId =
      typeof record.toolCallId === "string" ? record.toolCallId : "";
    const toolName = typeof record.toolName === "string" ? record.toolName : "";
    if (!toolCallId || !toolName) {
      return null;
    }

    context.toolNameByCallId?.set(toolCallId, toolName);
    return AgentStreamEventSchema.parse({
      type: "tool-call",
      toolCallId,
      toolName,
      args: record.input,
    });
  }

  if (type === "tool-output-available" || type === "tool-output-error") {
    const toolCallId =
      typeof record.toolCallId === "string" ? record.toolCallId : "";
    if (!toolCallId) {
      return null;
    }

    const toolName =
      (typeof record.toolName === "string" ? record.toolName : undefined) ??
      context.toolNameByCallId?.get(toolCallId) ??
      "unknown";

    return AgentStreamEventSchema.parse({
      type: "tool-result",
      toolCallId,
      toolName,
      result:
        type === "tool-output-error"
          ? {
              error:
                typeof record.errorText === "string"
                  ? record.errorText
                  : "Tool execution failed",
            }
          : record.output,
    });
  }

  if (type === "tool-input-error") {
    const toolName =
      typeof record.toolName === "string" ? record.toolName : "unknown";
    const rawError =
      typeof record.errorText === "string" ? record.errorText.trim() : "";
    return {
      type: "error",
      error: rawError
        ? rawError.length > 600
          ? `${toolName}: Tool input was invalid and could not be repaired.`
          : `${toolName}: ${rawError}`
        : `${toolName}: Tool input was invalid`,
    };
  }

  if (type === "finish") {
    const finishReasons = new Set([
      "stop",
      "length",
      "content-filter",
      "tool-calls",
      "error",
      "other",
    ]);
    const finishReason =
      typeof record.finishReason === "string" &&
      finishReasons.has(record.finishReason)
        ? record.finishReason
        : "stop";
    return AgentStreamEventSchema.parse({
      type: "finish",
      finishReason,
    });
  }

  return null;
}

// Re-export AgentStreamEvent for convenience
export type { AgentStreamEvent } from "./schemas";
