import type { AgentStreamEvent, AgentToolStep } from "./schemas";
import { isClientToolName } from "./toolStream";
import { isReadToolName } from "./tools/constants";

/**
 * Accumulated state consumed from a stream of `AgentStreamEvent` values. Both
 * the WebSocket path (via adapter) and the HTTP NDJSON path.
 */
export interface StreamConsumerState {
  text: string;
  reasoning: string | undefined;
  toolSteps: AgentToolStep[];
  pendingClientTools: Array<{
    toolName: string;
    toolCallId: string;
    input: unknown;
  }>;
  finishReason?: string;
}

export function createStreamConsumerState(): StreamConsumerState {
  return {
    text: "",
    reasoning: undefined,
    toolSteps: [],
    pendingClientTools: [],
    finishReason: undefined,
  };
}

export interface StreamConsumerUpdate {
  contentUpdated: boolean;
  reasoningUpdated: boolean;
  toolStepsUpdated: boolean;
}

/**
 * Process a single stream event and update the consumer state.
 *
 * Returns a flags bitmask so callers know which parts of the UI
 * to re-render without diffing.
 *
 * @throws {Error} When event type is `"error"` — the caller should
 *   catch this and surface it to the user.
 */
export function consumeStreamEvent(
  state: StreamConsumerState,
  event: AgentStreamEvent,
): StreamConsumerUpdate {
  switch (event.type) {
    case "text-delta":
      state.text += event.delta;
      return {
        contentUpdated: true,
        reasoningUpdated: false,
        toolStepsUpdated: false,
      };

    case "reasoning":
      state.reasoning = (state.reasoning ?? "") + event.delta;
      return {
        contentUpdated: false,
        reasoningUpdated: true,
        toolStepsUpdated: false,
      };

    case "tool-call": {
      const existingStep = state.toolSteps.find(
        (step) => step.id === event.toolCallId,
      );
      if (!existingStep) {
        state.toolSteps.push({
          id: event.toolCallId,
          toolName: event.toolName,
          status: "running",
          isReadTool: isReadToolName(event.toolName),
        });
      }
      if (isClientToolName(event.toolName)) {
        const existingPending = state.pendingClientTools.some(
          (tool) => tool.toolCallId === event.toolCallId,
        );
        if (!existingPending) {
          state.pendingClientTools.push({
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            input: event.args,
          });
        }
      }
      return {
        contentUpdated: false,
        reasoningUpdated: false,
        toolStepsUpdated: true,
      };
    }

    case "tool-result": {
      state.pendingClientTools = state.pendingClientTools.filter(
        (tool) => tool.toolCallId !== event.toolCallId,
      );
      const idx = state.toolSteps.findIndex((s) => s.id === event.toolCallId);
      if (idx !== -1) {
        // Clone to preserve immutability contract
        const updated: AgentToolStep = {
          ...state.toolSteps[idx],
          status: "success",
        };
        state.toolSteps = [
          ...state.toolSteps.slice(0, idx),
          updated,
          ...state.toolSteps.slice(idx + 1),
        ];
      }
      return {
        contentUpdated: false,
        reasoningUpdated: false,
        toolStepsUpdated: true,
      };
    }

    case "error":
      throw new Error(event.error);

    case "finish":
      state.finishReason = event.finishReason;
      return {
        contentUpdated: false,
        reasoningUpdated: false,
        toolStepsUpdated: false,
      };

    case "finished":
      return {
        contentUpdated: false,
        reasoningUpdated: false,
        toolStepsUpdated: false,
      };

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return {
        contentUpdated: false,
        reasoningUpdated: false,
        toolStepsUpdated: false,
      };
    }
  }
}
