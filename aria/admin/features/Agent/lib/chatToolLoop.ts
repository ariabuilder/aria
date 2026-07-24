import { streamText, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { combineAbortSignals } from "../server/inference/combineSignals";
import { shouldRetry, waitForRetryBackoff } from "../server/inference/retry";
import {
  PROVIDER_TIMEOUT_MS,
  PROVIDER_MAX_ATTEMPTS,
  type ResolvedModel,
} from "../server/inference/types";
import { AGENT_MAX_STEPS } from "./constants";
import { resolveLanguageModel } from "./inference/resolveModel";
import { getAgentInferenceEnv } from "./inference/runtimeEnv";
import { formatInferenceError } from "./inference/inferenceErrors";
import {
  buildClientAiTools,
  buildServerAiTools,
  canAgentWriteDesignSystem,
} from "./tools/buildAiTools";
import { buildAgentSystemPrompt } from "./inference/systemPrompt";
import { repairCompactedAriaToolCall } from "./inference/toolCallRepair";
import type { AgentToolActionContext, ToolContext } from "./tools/types";
import { isClientToolName } from "./toolStream";
import { isReadToolName } from "./tools/constants";
import type { ModelMessage } from "ai";
import type {
  AgentComposerMode,
  AgentPlatform,
  AgentSettings,
  AgentShellContext,
  AgentSeoContext,
  AgentStreamEvent,
  AgentToolStep,
} from "./schemas";
import { AgentStreamEventSchema } from "./schemas";
import type { RuntimeLocals } from "../../../../lib/cloudflare/env";
import type { AuthAdapter } from "../../../../lib/auth/adapter";
import { normalizeAiSdkUsage, startAiUsageRun } from "./usage/service";

export interface RunAgentChatWithToolsInput {
  requestId: string;
  turnId: string;
  siteId: string;
  platform: AgentPlatform;
  resolved: ResolvedModel;
  deps: {
    locals: RuntimeLocals;
    authAdapter: AuthAdapter;
  };
  settings: AgentSettings;
  composerMode: AgentComposerMode;
  messages: ModelMessage[];
  actionContext: AgentToolActionContext;
  shellContext?: AgentShellContext;
  seoContext?: AgentSeoContext;
  transport: ToolContext["transport"];
  abortSignal?: AbortSignal;
  maxSteps?: number;
}

export interface RunAgentChatWithToolsResult {
  text: string;
  reasoning: string | undefined;
  toolSteps: AgentToolStep[];
  pendingClientTools: Array<{
    toolName: string;
    toolCallId: string;
    input: unknown;
  }>;
}

/**
 * Async generator that yields streaming events during a chat with tools.
 * Retry behaviour: - Startup failures (before any chunk is yielded).
 */
export async function* runAgentChatWithToolsStreaming(
  input: RunAgentChatWithToolsInput,
): AsyncGenerator<AgentStreamEvent, void, void> {
  const userId = input.actionContext.user?.id;
  if (!userId) {
    throw new Error("Authenticated user is required for metered inference");
  }
  const usageRun = await startAiUsageRun(input.deps.locals, {
    requestId: input.requestId,
    turnId: input.turnId,
    siteId: input.siteId,
    userId,
    providerInstanceId: input.resolved.instanceId,
    backend: input.resolved.provider,
    modelId: input.resolved.modelId,
    billingMode: input.resolved.billingMode,
    routeType: input.resolved.route.type,
    transport: input.transport,
    feature: "studio_agent",
  });
  const serverTools = buildServerAiTools({
    transport: input.transport,
    actionContext: input.actionContext,
    siteId: input.siteId,
    shellContext: input.shellContext,
    seoContext: input.seoContext,
    composerMode: input.composerMode,
  });
  const clientTools = buildClientAiTools(
    input.shellContext,
    input.seoContext,
    input.composerMode,
  );
  const tools = { ...serverTools, ...clientTools } satisfies ToolSet;

  const system = buildAgentSystemPrompt({
    settings: input.settings,
    mode: input.composerMode,
    shellContext: input.shellContext,
    seoContext: input.seoContext,
    canWriteDesignSystem: canAgentWriteDesignSystem(input.actionContext),
  });

  let lastError: unknown;
  let hasYielded = false;

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      if (hasYielded) break; // Can't retry — client has partial data
      const aborted = await waitForRetryBackoff(attempt, input.abortSignal);
      if (aborted) throw new DOMException("Aborted", "AbortError");
    }

    // Re-resolve the language model on each attempt
    // (handles transient provider-side issues).
    const model = await resolveLanguageModel({
      platform: input.platform,
      backend: input.resolved.provider,
      modelId: input.resolved.modelId,
      env: getAgentInferenceEnv(input.deps.locals),
      authAdapter: input.deps.authAdapter,
      openaiCompatibleBaseUrl: input.resolved.openaiCompatibleBaseUrl,
      route: input.resolved.route,
      requestMetadata: {
        siteId: input.siteId,
        userId,
        requestId: input.requestId,
        turnId: input.turnId,
        feature: "studio_agent",
      },
    });

    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(
      () => timeoutController.abort(),
      PROVIDER_TIMEOUT_MS,
    );
    const combinedSignal = combineAbortSignals(
      input.abortSignal,
      timeoutController.signal,
    );

    try {
      const result = streamText({
        model,
        system,
        messages: input.messages,
        // `tools` accepts ToolSet or undefined. The `as` cast is required
        // because the spread of server/client tools may not perfectly
        // satisfy the strict mapped type in all edge cases.
        tools: tools as ToolSet,
        experimental_repairToolCall: repairCompactedAriaToolCall,
        stopWhen: stepCountIs(input.maxSteps ?? AGENT_MAX_STEPS),
        abortSignal: combinedSignal,
      });

      for await (const chunk of result.fullStream) {
        hasYielded = true;

        switch (chunk.type) {
          case "text-delta":
            yield AgentStreamEventSchema.parse({
              type: "text-delta" as const,
              delta: chunk.text,
            });
            break;
          case "reasoning-delta":
            yield AgentStreamEventSchema.parse({
              type: "reasoning" as const,
              delta: chunk.text,
            });
            break;
          case "tool-call":
            yield AgentStreamEventSchema.parse({
              type: "tool-call" as const,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: chunk.input,
            });
            break;
          case "tool-result":
            // Don't yield tool-result for client tools — the client
            // must execute them and send the result back. The client
            // detects pending tools by the absence of a result event.
            if (!isClientToolName(chunk.toolName)) {
              yield AgentStreamEventSchema.parse({
                type: "tool-result" as const,
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                result: chunk.output,
              });
            }
            break;
          case "error":
            yield AgentStreamEventSchema.parse({
              type: "error" as const,
              error: formatInferenceError(chunk.error),
            });
            break;
          case "finish":
            await usageRun.complete({
              status: "succeeded",
              finishReason: chunk.finishReason,
              errorCode: null,
              usage: normalizeAiSdkUsage({
                inputTokens: chunk.totalUsage.inputTokens,
                outputTokens: chunk.totalUsage.outputTokens,
              }),
            });
            yield AgentStreamEventSchema.parse({
              type: "finish" as const,
              finishReason: chunk.finishReason,
              usage: {
                promptTokens: chunk.totalUsage.inputTokens ?? 0,
                completionTokens: chunk.totalUsage.outputTokens ?? 0,
              },
            });
            break;
          // SDK-internal types (text-start, text-end, start-step,
          // finish-step, tool-input-start, tool-input-delta, source,
          // file, abort, raw, tool-error, tool-output-denied) are
          // forwarded silently — not user-facing.
        }
      }

      clearTimeout(timeoutHandle);
      yield { type: "finished" as const };
      return;
    } catch (error) {
      clearTimeout(timeoutHandle);

      if (error instanceof DOMException && error.name === "AbortError") {
        await usageRun.complete({
          status: "aborted",
          finishReason: "abort",
          errorCode: "ABORTED",
        });
        throw error;
      }

      lastError = error;

      if (!hasYielded && shouldRetry(attempt, error)) {
        continue;
      }

      // Non-retryable or already yielded data — forward error, don't retry
      yield { type: "error" as const, error: formatInferenceError(error) };
      await usageRun.complete({
        status: "failed",
        finishReason: "error",
        errorCode: "PROVIDER_ERROR",
      });
      yield { type: "finished" as const };
      return;
    }
  }

  // All retries exhausted without yielding any chunk
  yield { type: "error" as const, error: formatInferenceError(lastError) };
  await usageRun.complete({
    status: "failed",
    finishReason: "error",
    errorCode: "PROVIDER_ERROR",
  });
  yield { type: "finished" as const };
}

/**
 * Convenience wrapper around `runAgentChatWithToolsStreaming` that collects all events
 * and returns the aggregated result. Callers that want.
 */
export async function runAgentChatWithTools(
  input: RunAgentChatWithToolsInput,
): Promise<RunAgentChatWithToolsResult> {
  const gen = runAgentChatWithToolsStreaming(input);

  let text = "";
  let reasoning: string | undefined;
  const toolSteps: AgentToolStep[] = [];
  const pendingClientTools: RunAgentChatWithToolsResult["pendingClientTools"] =
    [];

  for await (const event of gen) {
    switch (event.type) {
      case "text-delta":
        text += event.delta;
        break;
      case "reasoning":
        reasoning = (reasoning ?? "") + event.delta;
        break;
      case "tool-call":
        toolSteps.push({
          id: event.toolCallId,
          toolName: event.toolName,
          status: "running",
          isReadTool: isReadToolName(event.toolName),
        });
        if (isClientToolName(event.toolName)) {
          pendingClientTools.push({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.args,
          });
        }
        break;
      case "tool-result": {
        const idx = toolSteps.findIndex((s) => s.id === event.toolCallId);
        if (idx !== -1) {
          toolSteps[idx] = { ...toolSteps[idx], status: "success" };
        }
        break;
      }
      case "error":
        throw new Error(event.error);
      case "finish":
        // Metadata — no user-facing state
        break;
      case "finished":
        break;
    }
  }

  return {
    text,
    reasoning,
    toolSteps,
    pendingClientTools,
  };
}
