import { AGENT_MAX_MESSAGES } from "./constants";
import {
  AgentChatMessageSchema,
  LocalChatHistorySchema,
  type AgentChatMessage,
} from "./schemas";
import type { SessionHistoryAdapter } from "./sessionHistory";

export const LOCAL_CHAT_HISTORY_STORAGE_KEY =
  "aria-engineer-chat-history" as const;

export function readLocalChatHistory(): AgentChatMessage[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(LOCAL_CHAT_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return LocalChatHistorySchema.parse(parsed).messages;
  } catch {
    localStorage.removeItem(LOCAL_CHAT_HISTORY_STORAGE_KEY);
    return [];
  }
}

export function writeLocalChatHistory(
  messages: readonly AgentChatMessage[],
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  const userOrAssistantMessages = messages.filter(
    (message) => message.role !== "tool",
  );

  const validatedMessages = userOrAssistantMessages.map((message) =>
    AgentChatMessageSchema.parse(message),
  );
  const pruned =
    validatedMessages.length > AGENT_MAX_MESSAGES
      ? validatedMessages.slice(-AGENT_MAX_MESSAGES)
      : validatedMessages;

  const payload = LocalChatHistorySchema.parse({
    version: 1,
    messages: pruned,
  });

  localStorage.setItem(LOCAL_CHAT_HISTORY_STORAGE_KEY, JSON.stringify(payload));
}

export function clearLocalChatHistory(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.removeItem(LOCAL_CHAT_HISTORY_STORAGE_KEY);
}

/**
 * Read messages from session adapter with localStorage fallback.
 */
export async function readChatHistory(
  sessionId: string,
  userId: string,
  adapter?: SessionHistoryAdapter | null,
): Promise<AgentChatMessage[]> {
  if (adapter) {
    const messages = await adapter.read(sessionId, userId);
    if (messages.length > 0) return messages;
  }

  // Fallback to localStorage (fast boot, offline, no D1 available)
  return readLocalChatHistory();
}

/**
 * Write messages to session adapter AND localStorage.
 * The session adapter is the source of truth; localStorage is the fallback.
 */
export async function writeChatHistory(
  sessionId: string,
  userId: string,
  messages: readonly AgentChatMessage[],
  adapter?: SessionHistoryAdapter | null,
): Promise<void> {
  // Always write to localStorage for fast local reads
  writeLocalChatHistory(messages);

  // Also persist to session adapter when available
  if (adapter) {
    await adapter.write(sessionId, userId, messages);
  }
}

/**
 * Clear messages from both session adapter and localStorage.
 */
export async function clearChatHistory(
  sessionId: string,
  userId: string,
  adapter?: SessionHistoryAdapter | null,
): Promise<void> {
  clearLocalChatHistory();

  if (adapter) {
    await adapter.clear(sessionId, userId);
  }
}
