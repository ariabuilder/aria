import type {
  AgentChatMessage,
  InferenceBackendId,
} from "./schemas";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "@cf/meta/llama-3.2-3b-instruct": 8192,
  "@cf/meta/llama-3.2-1b-instruct": 8192,
  "@cf/mistral/mistral-small-3.1-24b-instruct": 32768,
  "@cf/qwen/qwq-32b": 32768,
  "opencode/big-pickle": 128000,
  "gpt-4.1": 128000,
  "gpt-4.1-mini": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "o4-mini": 128000,
  "o3-mini": 128000,
};

const PROVIDER_DEFAULT_CONTEXT_LIMITS: Record<InferenceBackendId, number> = {
  workers_ai: 8192,
  opencode: 128000,
  openai: 128000,
  anthropic: 200000,
  google: 128000,
  openrouter: 128000,
  openai_compatible: 128000,
};

export type ContextUsageTone = "normal" | "warning" | "critical";

export interface AgentContextUsage {
  estimatedTokens: number;
  contextLimit: number;
  /** 0–1 fraction for ring progress (not rounded). */
  fillRatio: number;
  percentUsed: number;
  tone: ContextUsageTone;
  breakdown: {
    messageTokens: number;
    draftTokens: number;
  };
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.ceil(trimmed.length / 3.8);
}

export function getModelContextLimit(
  modelId: string,
  provider: InferenceBackendId,
): number {
  const normalizedModelId = modelId.trim();
  if (normalizedModelId && MODEL_CONTEXT_LIMITS[normalizedModelId]) {
    return MODEL_CONTEXT_LIMITS[normalizedModelId]!;
  }

  return PROVIDER_DEFAULT_CONTEXT_LIMITS[provider];
}

export function resolveContextUsageTone(percentUsed: number): ContextUsageTone {
  if (percentUsed >= 90) {
    return "critical";
  }

  if (percentUsed >= 70) {
    return "warning";
  }

  return "normal";
}

export function formatTokenCount(tokens: number): string {
  if (tokens === 0) {
    return "0";
  }

  if (tokens >= 1000) {
    const rounded = tokens >= 10000 ? Math.round(tokens / 1000) : tokens / 1000;
    return `~${rounded}k`;
  }

  return `~${tokens}`;
}

export function computeAgentContextUsage(input: {
  messages: AgentChatMessage[];
  draft: string;
  provider: InferenceBackendId;
  modelId: string;
}): AgentContextUsage {
  const messageTokens = input.messages.reduce(
    (total, message) => total + estimateTokenCount(message.content),
    0,
  );
  const draftTokens = estimateTokenCount(input.draft);
  const estimatedTokens = messageTokens + draftTokens;
  const contextLimit = getModelContextLimit(input.modelId, input.provider);
  const fillRatio =
    estimatedTokens === 0
      ? 0
      : Math.min(1, estimatedTokens / Math.max(contextLimit, 1));
  const percentUsed = Math.round(fillRatio * 100);

  return {
    estimatedTokens,
    contextLimit,
    fillRatio,
    percentUsed,
    tone: resolveContextUsageTone(percentUsed),
    breakdown: {
      messageTokens,
      draftTokens,
    },
  };
}
