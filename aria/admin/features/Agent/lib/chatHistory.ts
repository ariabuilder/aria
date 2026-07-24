import type { UIMessage } from "ai";
import {
  AgentChatMessageSchema,
  type AgentChatMessage,
  type AgentChatMessageRole,
} from "./schemas";
import { sanitizeAgentUserFacingContent } from "./userFacingContent";

function isAgentChatRole(role: string): role is AgentChatMessageRole {
  return role === "user" || role === "assistant" || role === "system";
}

function textFromUiMessageParts(parts: UIMessage["parts"]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text;
}

function resolveCreatedAt(
  message: UIMessage,
  timestampById: ReadonlyMap<string, string>,
): string {
  const fromDb = timestampById.get(message.id);
  if (fromDb) {
    return fromDb;
  }

  const metadata = message.metadata;
  if (metadata && typeof metadata === "object" && "createdAt" in metadata) {
    const candidate = metadata.createdAt;
    if (typeof candidate === "string") {
      const parsed =
        AgentChatMessageSchema.shape.createdAt.safeParse(candidate);
      if (parsed.success) {
        return parsed.data;
      }
    }
  }

  return new Date().toISOString();
}

export function mapUiMessageToAgentChatMessage(
  message: UIMessage,
  timestampById: ReadonlyMap<string, string>,
): AgentChatMessage | null {
  if (!isAgentChatRole(message.role)) {
    return null;
  }

  // Tool messages are transient loop state and must not persist.
  if (message.role === ("tool" as string)) {
    return null;
  }

  return AgentChatMessageSchema.parse({
    id: message.id,
    role: message.role,
    content:
      message.role === "assistant"
        ? sanitizeAgentUserFacingContent(textFromUiMessageParts(message.parts))
        : textFromUiMessageParts(message.parts),
    createdAt: resolveCreatedAt(message, timestampById),
  });
}

export function mapUiMessagesToAgentChatMessages(
  messages: readonly UIMessage[],
  timestampById: ReadonlyMap<string, string> = new Map(),
): AgentChatMessage[] {
  const mapped: AgentChatMessage[] = [];
  for (const message of messages) {
    const next = mapUiMessageToAgentChatMessage(message, timestampById);
    if (next) {
      mapped.push(next);
    }
  }
  return mapped;
}
