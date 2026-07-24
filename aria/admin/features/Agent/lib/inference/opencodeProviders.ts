import type { OpencodePlan } from "../schemas";

export const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1" as const;
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1" as const;

export const OPENCODE_AUTH_URL = "https://opencode.ai/auth" as const;

export type { OpencodePlan };

export type OpencodeTransport =
  | "openai-responses"
  | "openai-compatible"
  | "anthropic-messages"
  | "google-generative-ai";

export function isOpencodeProvider(
  provider: string | undefined,
): provider is "opencode" {
  return provider === "opencode";
}

export function opencodePlanFromModelId(modelId: string): OpencodePlan {
  return modelId.trim().startsWith("opencode-go/") ? "go" : "zen";
}

export function isOpencodeModelForPlan(
  modelId: string,
  plan: OpencodePlan,
): boolean {
  return opencodePlanFromModelId(modelId) === plan;
}

export function filterOpencodeModelsForPlan(
  modelIds: readonly string[],
  plan: OpencodePlan,
): string[] {
  return modelIds.filter((modelId) => isOpencodeModelForPlan(modelId, plan));
}

export function getOpencodeBaseUrlForPlan(plan: OpencodePlan): string {
  return plan === "go" ? OPENCODE_GO_BASE_URL : OPENCODE_ZEN_BASE_URL;
}

/**
 * OpenCode uses one credential, but routes models through the API
 * protocol their upstream provider expects. The persisted model prefix.
 */
export function getOpencodeTransport(modelId: string): OpencodeTransport {
  const plan = opencodePlanFromModelId(modelId);
  const bare = stripOpencodeModelPrefix(modelId).toLowerCase();

  if (plan === "zen") {
    if (bare.startsWith("gpt-")) return "openai-responses";
    if (bare.startsWith("claude-") || bare.startsWith("qwen")) {
      return "anthropic-messages";
    }
    if (bare.startsWith("gemini-")) return "google-generative-ai";
    return "openai-compatible";
  }

  if (bare.startsWith("minimax-") || bare.startsWith("qwen")) {
    return "anthropic-messages";
  }
  return "openai-compatible";
}

export function getOpencodeModelsUrl(plan: OpencodePlan): string {
  return plan === "go"
    ? `${OPENCODE_GO_BASE_URL}/models`
    : `${OPENCODE_ZEN_BASE_URL}/models`;
}

/** Strip OpenCode config prefix (`opencode/` or `opencode-go/`). */
export function stripOpencodeModelPrefix(modelId: string): string {
  return modelId.replace(/^opencode-go\//, "").replace(/^opencode\//, "");
}

export function catalogModelId(plan: OpencodePlan, bareModelId: string): string {
  const bare = stripOpencodeModelPrefix(bareModelId.trim());
  if (!bare) {
    return plan === "go" ? "opencode-go/" : "opencode/";
  }
  return plan === "go" ? `opencode-go/${bare}` : `opencode/${bare}`;
}

/** Bare model id for OpenCode gateway API requests (config keeps `opencode/` prefixes). */
export function opencodeApiModelId(modelId: string): string {
  const bare = stripOpencodeModelPrefix(modelId.trim());
  if (!bare) {
    throw new Error("OpenCode model id is required");
  }
  return bare;
}

export function prefixOpencodeModelId(
  plan: OpencodePlan,
  bareModelId: string,
): string {
  const bare = stripOpencodeModelPrefix(bareModelId.trim());
  if (!bare) {
    throw new Error("OpenCode model id is required");
  }
  if (bare.startsWith("opencode-go/") || bare.startsWith("opencode/")) {
    return bare;
  }
  return catalogModelId(plan, bare);
}

export function resolveOpencodeRequestModel(modelId?: string): {
  plan: OpencodePlan;
  modelId: string;
} {
  const trimmed = modelId?.trim() ?? "";
  if (trimmed.startsWith("opencode-go/")) {
    return { plan: "go", modelId: trimmed };
  }
  if (trimmed.startsWith("opencode/")) {
    return { plan: "zen", modelId: trimmed };
  }

  const bare = stripOpencodeModelPrefix(trimmed) || "big-pickle";
  return { plan: "zen", modelId: catalogModelId("zen", bare) };
}

export function defaultOpencodeModel(): string {
  return catalogModelId("zen", "big-pickle");
}

const OPENCODE_MODEL_DISPLAY_NAMES: Record<string, string> = {
  "big-pickle": "Big Pickle",
};

export function opencodeModelDisplayName(bareModelId: string): string {
  const bare = stripOpencodeModelPrefix(bareModelId.trim());
  if (!bare) {
    return bareModelId;
  }

  const known = OPENCODE_MODEL_DISPLAY_NAMES[bare];
  if (known) {
    return known;
  }

  return bare
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Models that should always appear in the Zen catalog even if omitted from /models. */
export const OPENCODE_ZEN_ENSURED_MODELS = [
  { id: "big-pickle", name: "Big Pickle" },
] as const;
