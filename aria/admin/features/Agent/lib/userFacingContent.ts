import type { AgentChatMessage } from "./schemas";

const INTERNAL_IDENTIFIER_PATTERN =
  /\b(?:aria_[a-z0-9_]+|insert_nodes|insert_designed_section|open_in_composer|select_block|update_node_motion|upload_custom_font|BuilderNode|classNames|customClasses)\b/iu;

const INTERNAL_IMPLEMENTATION_PATTERN =
  /\b(?:inline styles?|custom classes? mode|creation API|tool (?:call|result|schema|input|output)s?|node (?:tree|schema|payload)s?|block schema)\b/iu;

const PROCESS_NARRATION_PATTERN =
  /^\s*(?:let me|i(?:['’]ll| will| am going to)|first,? i|next,? i)\b.*\b(?:try|use|check|inspect|diagnos\w*|create|build|insert|start|call|take (?:a|the) approach)\b/iu;

function shouldHideUnit(unit: string): boolean {
  return (
    INTERNAL_IDENTIFIER_PATTERN.test(unit) ||
    INTERNAL_IMPLEMENTATION_PATTERN.test(unit) ||
    PROCESS_NARRATION_PATTERN.test(unit)
  );
}

/**
 * Keep model implementation chatter out of the user-facing
 * conversation. The system prompt is the primary contract.
 */
export function sanitizeAgentUserFacingContent(content: string): string {
  if (!content.trim() || !shouldHideUnit(content)) {
    return content;
  }

  const units = content
    // Some providers omit whitespace between streamed sentence boundaries.
    .replace(/([.!?])(?=[A-Z])/gu, "$1\n")
    .split(/(?<=[.!?])(?:\s+|\n+)|\n{2,}/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const visible = units.filter((unit) => !shouldHideUnit(unit));

  return visible.join(" ").trim();
}

export function sanitizeAgentUserFacingMessages(
  messages: readonly AgentChatMessage[],
): AgentChatMessage[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? {
          ...message,
          content: sanitizeAgentUserFacingContent(message.content),
        }
      : message,
  );
}

export function sanitizeAgentUserFacingError(message: string): string {
  return (
    sanitizeAgentUserFacingContent(message).trim() ||
    "I couldn't complete this step. Please try again."
  );
}
