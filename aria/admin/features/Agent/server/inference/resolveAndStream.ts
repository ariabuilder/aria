import { streamText, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { resolveLanguageModel } from "../../lib/inference/resolveModel";
import { getAgentInferenceEnv } from "../../lib/inference/runtimeEnv";
import { formatInferenceError } from "../../lib/inference/inferenceErrors";
import { repairCompactedAriaToolCall } from "../../lib/inference/toolCallRepair";
import { shouldRetry, waitForRetryBackoff } from "./retry";
import { combineAbortSignals } from "./combineSignals";
import { AGENT_MAX_STEPS } from "../../lib/constants";
import {
  PROVIDER_TIMEOUT_MS,
  PROVIDER_MAX_ATTEMPTS,
  type ResolveAndStreamInput,
  type ResolveAndStreamResult,
  type ResolveAndStreamCallbacks,
} from "./types";

/**
 * Resolve a language model and run the streaming tool loop.
 *
 * - Provider timeout via AbortController
 * - Retry up to 2 times on retryable errors (PROVIDER_ERROR, TIMEOUT, STREAM_ERROR)
 * - Exponential backoff: 1s, 3s
 * - Stream chunks consumed and forwarded via callbacks
 *
 * @throws `{ code: "PROVIDER_ERROR", message: string, retries: number }`
 *         or `DOMException("Aborted")` on abort signal.
 */
export async function resolveAndStream(
  input: ResolveAndStreamInput,
  callbacks?: ResolveAndStreamCallbacks,
): Promise<ResolveAndStreamResult> {
  let lastError: unknown;
  let totalRetries = 0;

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt++) {
    // Wait before retry (not before first attempt)
    if (attempt > 1) {
      const aborted = await waitForRetryBackoff(attempt, input.abortSignal);
      if (aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      totalRetries++;
    }

    // Re-resolve the LanguageModel on each attempt
    // (handles transient provider-side issues).
    const model = await resolveLanguageModel({
      platform: input.platform,
      backend: input.resolved.provider,
      modelId: input.resolved.modelId,
      env: getAgentInferenceEnv(input.deps.locals),
      authAdapter: input.deps.authAdapter,
      openaiCompatibleBaseUrl: input.resolved.openaiCompatibleBaseUrl,
      route: input.resolved.route,
      requestMetadata: input.requestMetadata,
    });

    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(
      () => timeoutController.abort(),
      PROVIDER_TIMEOUT_MS,
    );

    // Combine caller's abort signal with timeout signal
    const combinedSignal = combineAbortSignals(
      input.abortSignal,
      timeoutController.signal,
    );

    try {
      const result = streamText({
        model,
        system: input.system,
        messages: input.messages ?? [],
        tools: input.tools as ToolSet,
        experimental_repairToolCall: repairCompactedAriaToolCall,
        stopWhen: stepCountIs(input.maxSteps ?? AGENT_MAX_STEPS),
        abortSignal: combinedSignal,
        onError: (error) => {
          const msg = formatInferenceError(error);
          callbacks?.onError?.(msg);
        },
      });

      // Consume the fullStream
      let text = "";
      let reasoning: string | undefined;
      let finishReason = "unknown";
      let usage: { promptTokens: number; completionTokens: number } | undefined;

      for await (const chunk of result.fullStream) {
        if (combinedSignal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        switch (chunk.type) {
          case "text-delta":
            text += chunk.text;
            callbacks?.onTextDelta?.(chunk.text);
            break;
          case "reasoning-delta":
            reasoning = (reasoning ?? "") + chunk.text;
            callbacks?.onReasoning?.(chunk.text);
            break;
          case "tool-call":
            callbacks?.onToolCall?.(
              chunk.toolCallId,
              chunk.toolName,
              chunk.input,
            );
            break;
          case "tool-result":
            callbacks?.onToolResult?.(
              chunk.toolCallId,
              chunk.toolName,
              chunk.output,
            );
            break;
          case "error":
            callbacks?.onError?.(formatInferenceError(chunk.error));
            throw {
              code: "PROVIDER_ERROR",
              message: formatInferenceError(chunk.error),
            };
          case "finish":
            finishReason = chunk.finishReason;
            usage = {
              promptTokens: chunk.totalUsage.inputTokens ?? 0,
              completionTokens: chunk.totalUsage.outputTokens ?? 0,
            };
            break;
          // SDK-internal types (text-start, text-end, start-step,
          // finish-step, tool-input-start, tool-input-delta, source,
          // file, abort, raw, etc.) pass through unvalidated.
        }
      }

      clearTimeout(timeoutHandle);

      const final: ResolveAndStreamResult = {
        text,
        reasoning,
        finishReason,
        usage,
        retries: totalRetries,
      };

      callbacks?.onFinish?.(final);
      return final;
    } catch (error) {
      clearTimeout(timeoutHandle);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      lastError = error;

      if (shouldRetry(attempt, error)) {
        continue;
      }

      // Non-retryable or exhausted — wrap and throw
      throw {
        code: "PROVIDER_ERROR",
        message: formatInferenceError(error),
        retries: totalRetries,
      };
    }
  }

  throw {
    code: "PROVIDER_ERROR",
    message: `Provider request failed after ${totalRetries} retries: ${formatInferenceError(lastError)}`,
    retries: totalRetries,
  };
}
