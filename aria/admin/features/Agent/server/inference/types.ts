import type {
  AgentPlatform,
  InferenceBackendId,
} from "../../lib/schemas";
import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";
import type { AuthAdapter } from "../../../../../lib/auth/adapter";
import type { InferenceBillingMode } from "../../lib/usage/schemas";
import type { InferenceRoute } from "../../lib/schemas";
import type { InferenceRequestMetadata } from "../../lib/usage/gatewayMetadata";

/**
 * Provider + model the router should use.
 * Pre-resolved by the caller (assertModelAllowed already called).
 */
export interface ResolvedModel {
  instanceId: string;
  provider: InferenceBackendId;
  modelId: string;
  billingMode: InferenceBillingMode;
  route: InferenceRoute;
  openaiCompatibleBaseUrl?: string;
}

export interface ResolveAndStreamInput {
  platform: AgentPlatform;
  resolved: ResolvedModel;
  messages: Parameters<typeof import("ai").streamText>[0]["messages"];
  /** System prompt already built by buildAgentSystemPrompt(). */
  system: string;
  /** Tools (server + client) already assembled. */
  tools: Record<string, unknown>;
  /** Tool loop max steps. Default AGENT_MAX_STEPS (16). */
  maxSteps?: number;
  abortSignal?: AbortSignal;
  requestMetadata?: InferenceRequestMetadata;
  /** Dependencies needed for resolveLanguageModel. */
  deps: {
    locals: RuntimeLocals;
    authAdapter: AuthAdapter;
  };
}

export interface ResolveAndStreamResult {
  text: string;
  reasoning: string | undefined;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number } | undefined;
  retries: number;
}

/** Callbacks for real-time streaming during the call. */
export interface ResolveAndStreamCallbacks {
  onTextDelta?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onToolCall?: (toolCallId: string, toolName: string, args: unknown) => void;
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void;
  onError?: (error: string) => void;
  onFinish?: (result: ResolveAndStreamResult) => void;
}

/** Per-provider request timeout in milliseconds. */
export const PROVIDER_TIMEOUT_MS = 120_000;

/** Max total attempts (initial + 2 retries = 3). */
export const PROVIDER_MAX_ATTEMPTS = 3;

/** Base delay for exponential backoff (attempt 2 → 1s, attempt 3 → 3s). */
export const PROVIDER_RETRY_BASE_DELAY_MS = 1_000;

/** Cap for backoff delay in milliseconds. */
export const PROVIDER_RETRY_MAX_DELAY_MS = 10_000;
