import type { StepResult, ToolSet } from "ai";
import type { AgentToolStep } from "./schemas";
import { isReadToolName } from "./tools/constants";
import type { AgentStreamAccumulatorState } from "./wsChatProtocol";

export const CLIENT_TOOL_NAMES = [
  "open_in_composer",
  "insert_designed_section",
  "insert_nodes",
  "select_block",
  "update_node_motion",
  "upload_custom_font",
] as const;
export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

export function isClientToolName(name: string): name is ClientToolName {
  return (CLIENT_TOOL_NAMES as readonly string[]).includes(name);
}

type ToolStreamPart = AgentStreamAccumulatorState["parts"][number];

function isToolPart(part: ToolStreamPart): part is ToolStreamPart & {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
} {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    "toolCallId" in part &&
    typeof part.toolCallId === "string" &&
    "toolName" in part &&
    typeof part.toolName === "string"
  );
}

function isPendingClientExecutionOutput(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    "pendingClientExecution" in output &&
    (output as { pendingClientExecution?: boolean }).pendingClientExecution ===
      true
  );
}

function hasSettledClientToolOutput(output: unknown): boolean {
  if (output === undefined || output === null) {
    return false;
  }
  return !isPendingClientExecutionOutput(output);
}

function getToolPartErrorText(part: ToolStreamPart): string | undefined {
  const value =
    (part as { errorText?: unknown; error?: unknown }).errorText ??
    (part as { errorText?: unknown; error?: unknown }).error;
  return typeof value === "string" ? value : undefined;
}

function getToolResultOutput(toolResult: unknown): unknown {
  if (toolResult && typeof toolResult === "object") {
    const result = toolResult as { result?: unknown; output?: unknown };
    return result.result ?? result.output;
  }
  return undefined;
}

export function extractPendingClientToolsFromParts(
  parts: readonly ToolStreamPart[],
): Array<{ toolName: string; toolCallId: string; input: unknown }> {
  const pending: Array<{
    toolName: string;
    toolCallId: string;
    input: unknown;
  }> = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (!isToolPart(part) || !isClientToolName(part.toolName)) {
      continue;
    }

    const needsClient =
      part.state === "input-available" ||
      part.state === "input-streaming" ||
      (part.state === "output-available" &&
        !hasSettledClientToolOutput(part.output));

    if (!needsClient || seen.has(part.toolCallId)) {
      continue;
    }

    seen.add(part.toolCallId);
    pending.push({
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      input: part.input,
    });
  }

  return pending;
}

function toolStepStatusFromPart(
  part: ToolStreamPart & {
    toolCallId: string;
    toolName: string;
    state: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
  },
): AgentToolStep["status"] {
  if (part.state === "output-error") {
    return "error";
  }
  if (
    isClientToolName(part.toolName) &&
    (part.state === "input-available" ||
      part.state === "input-streaming" ||
      (part.state === "output-available" &&
        !hasSettledClientToolOutput(part.output)))
  ) {
    return "running";
  }
  if (part.state === "output-available" || part.state === "input-available") {
    return "success";
  }
  return "running";
}

function toolStepSummaryFromPart(
  part: ToolStreamPart & { toolName: string; state: string; output?: unknown },
): string | undefined {
  if (isReadToolName(part.toolName) && part.state === "output-available") {
    return "Read complete";
  }
  if (
    isClientToolName(part.toolName) &&
    isPendingClientExecutionOutput(part.output)
  ) {
    return "Running in composer…";
  }
  if (
    isClientToolName(part.toolName) &&
    part.state === "output-available" &&
    !isPendingClientExecutionOutput(part.output)
  ) {
    return "Done";
  }
  return undefined;
}

/**
 * Detect if an error text represents a CONFIRMATION_REQUIRED response
 * and extract structured confirmation metadata.
 */
function parseConfirmationError(errorText: string): {
  code: string;
  message: string;
  confirmationToken?: string;
  confirmationCategory?: string;
} | null {
  if (errorText.startsWith("[CONFIRMATION_REQUIRED]")) {
    return {
      code: "CONFIRMATION_REQUIRED",
      message: errorText,
    };
  }
  return null;
}

export function extractToolStepsFromStreamParts(
  parts: readonly ToolStreamPart[],
): AgentToolStep[] {
  const steps: AgentToolStep[] = [];
  const indexById = new Map<string, number>();

  for (const part of parts) {
    if (!isToolPart(part)) {
      continue;
    }

    const errorText = getToolPartErrorText(part);
    const confirmationError =
      part.state === "output-error" && errorText
        ? parseConfirmationError(errorText)
        : null;

    const step: AgentToolStep = {
      id: part.toolCallId,
      toolName: part.toolName,
      status: toolStepStatusFromPart(part),
      summary: toolStepSummaryFromPart(part),
      isReadTool: isReadToolName(part.toolName),
      ...(confirmationError
        ? { error: confirmationError }
        : part.state === "output-error" && errorText
          ? {
              error: {
                code: "TOOL_ERROR",
                message: errorText,
              },
            }
          : {}),
    };

    const existingIndex = indexById.get(part.toolCallId);
    if (existingIndex === undefined) {
      indexById.set(part.toolCallId, steps.length);
      steps.push(step);
    } else {
      steps[existingIndex] = step;
    }
  }

  return steps;
}

export function extractPendingClientToolsFromGenerateSteps(
  steps: StepResult<ToolSet>[],
): Array<{ toolName: string; toolCallId: string; input: unknown }> {
  const pending: Array<{
    toolName: string;
    toolCallId: string;
    input: unknown;
  }> = [];
  const seen = new Set<string>();

  for (const step of steps) {
    for (const toolCall of step.toolCalls) {
      if (
        !isClientToolName(toolCall.toolName) ||
        seen.has(toolCall.toolCallId)
      ) {
        continue;
      }
      seen.add(toolCall.toolCallId);
      pending.push({
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      });
    }
  }

  return pending;
}

export function extractToolStepsFromGenerateSteps(
  steps: StepResult<ToolSet>[],
): AgentToolStep[] {
  const toolSteps: AgentToolStep[] = [];

  for (const step of steps) {
    for (const toolCall of step.toolCalls) {
      const toolResult = step.toolResults.find(
        (result) => result.toolCallId === toolCall.toolCallId,
      );
      const isReadTool = isReadToolName(toolCall.toolName);
      const isClient = isClientToolName(toolCall.toolName);

      let status: AgentToolStep["status"] = "success";
      let summary: string | undefined;
      let error: AgentToolStep["error"];

      if (!toolResult) {
        status = "running";
      } else {
        const result = getToolResultOutput(toolResult);
        if (isClient && isPendingClientExecutionOutput(result)) {
          status = "running";
          summary = "Running in composer…";
        } else if (
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error
        ) {
          const errorText = String(result.error);
          const confirmationError = parseConfirmationError(errorText);
          status = "error";
          error = confirmationError ?? {
            code: "TOOL_ERROR",
            message: errorText,
          };
        } else if (isReadTool) {
          summary = "Read complete";
        } else if (isClient) {
          summary = "Done";
        }
      }

      toolSteps.push({
        id: toolCall.toolCallId,
        toolName: toolCall.toolName,
        status,
        summary,
        error,
        isReadTool,
      });
    }
  }

  return toolSteps;
}

export function markUnexecutedClientToolSteps(
  steps: readonly AgentToolStep[],
  executedToolCallIds: ReadonlySet<string>,
): AgentToolStep[] {
  return steps.map((step) => {
    if (
      isClientToolName(step.toolName) &&
      step.status === "running" &&
      !executedToolCallIds.has(step.id)
    ) {
      return {
        ...step,
        status: "error" as const,
        summary: undefined,
        error: {
          code: "CLIENT_TOOL_NOT_RUN",
          message: "Client insert did not run — retry or reload.",
        },
      };
    }
    return step;
  });
}

export function mergeToolSteps(
  existing: readonly AgentToolStep[],
  incoming: readonly AgentToolStep[],
): AgentToolStep[] {
  const merged = new Map<string, AgentToolStep>();
  for (const step of existing) {
    merged.set(step.id, step);
  }
  for (const step of incoming) {
    const current = merged.get(step.id);
    // A transport snapshot can still describe a client tool as running after
    // the client has already applied its result. Never regress that terminal
    // state while merging the final stream snapshot.
    if (current?.status !== "running" && step.status === "running") {
      continue;
    }
    merged.set(step.id, step);
  }
  return [...merged.values()];
}

/**
 * Collapse tool steps where the same tool name appears multiple times (e. g.
 */
export function collapseToolSteps(
  steps: readonly AgentToolStep[],
): AgentToolStep[] {
  const seen = new Set<string>();
  const collapsed: AgentToolStep[] = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!seen.has(step.toolName)) {
      seen.add(step.toolName);
      collapsed.push(step);
    }
  }
  return collapsed.reverse();
}

export function applyClientToolResultToSteps(
  steps: readonly AgentToolStep[],
  toolCallId: string,
  _toolName: string,
  result:
    | { ok: true; data: unknown }
    | {
        ok: false;
        error: { code: string; message: string; suggestedFix?: string };
      },
): AgentToolStep[] {
  return steps.map((step) => {
    if (step.id !== toolCallId) {
      return step;
    }
    if (result.ok) {
      return {
        ...step,
        status: "success" as const,
        summary: "Done",
        error: undefined,
      };
    }
    return {
      ...step,
      status: "error" as const,
      summary: undefined,
      error: {
        code: result.error.code,
        message: result.error.message,
        suggestedFix: result.error.suggestedFix,
      },
    };
  });
}
