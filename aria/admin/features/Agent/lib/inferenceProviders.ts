import type {
  InferenceBackendId,
  AgentPlatform,
  ProviderInstance,
} from "./schemas";
import { defaultOpencodeModel } from "./inference/opencodeProviders";

export interface InferenceBackendDefinition {
  id: InferenceBackendId;
  label: string;
  description: string;
  cloudflareOnly: boolean;
  requiresCredentials: boolean;
  defaultModelId: string;
  seedModelIds: readonly string[];
  sortOrder: number;
  /** URL to get an API key for this provider. Null for providers that don't need keys. */
  keyUrl?: string;
}

export const INFERENCE_BACKEND_DEFINITIONS: readonly InferenceBackendDefinition[] =
  [
    {
      id: "workers_ai",
      label: "Workers AI",
      description: "Cloudflare-hosted models on the edge.",
      cloudflareOnly: true,
      requiresCredentials: false,
      defaultModelId: "@cf/meta/llama-3.2-3b-instruct",
      seedModelIds: [
        "@cf/meta/llama-3.2-3b-instruct",
        "@cf/meta/llama-3.2-1b-instruct",
        "@cf/mistral/mistral-small-3.1-24b-instruct",
        "@cf/qwen/qwq-32b",
      ],
      sortOrder: 0,
    },
    {
      id: "opencode",
      label: "OpenCode",
      description: "OpenCode Zen and Go models via your API key.",
      cloudflareOnly: false,
      requiresCredentials: true,
      defaultModelId: defaultOpencodeModel(),
      seedModelIds: [defaultOpencodeModel()],
      sortOrder: 1,
      keyUrl: "https://opencode.ai",
    },
    {
      id: "openai",
      label: "OpenAI",
      description: "OpenAI models with your API key.",
      cloudflareOnly: false,
      requiresCredentials: true,
      defaultModelId: "gpt-4.1-mini",
      seedModelIds: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
      sortOrder: 3,
      keyUrl: "https://platform.openai.com/api-keys",
    },
    {
      id: "anthropic",
      label: "Anthropic",
      description: "Claude models with your Anthropic API key.",
      cloudflareOnly: false,
      requiresCredentials: true,
      defaultModelId: "claude-sonnet-4-20250514",
      seedModelIds: ["claude-sonnet-4-20250514"],
      sortOrder: 4,
      keyUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "google",
      label: "Google AI",
      description: "Gemini models with your Google AI API key.",
      cloudflareOnly: false,
      requiresCredentials: true,
      defaultModelId: "gemini-2.5-flash",
      seedModelIds: ["gemini-2.5-flash"],
      sortOrder: 5,
      keyUrl: "https://aistudio.google.com/app/apikey",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      description: "Route to 300+ models with your OpenRouter API key.",
      cloudflareOnly: false,
      requiresCredentials: true,
      defaultModelId: "openai/gpt-4o-mini",
      seedModelIds: [
        "openai/gpt-4o-mini",
        "anthropic/claude-sonnet-4",
        "google/gemini-2.5-flash-preview",
      ],
      sortOrder: 2,
      keyUrl: "https://openrouter.ai/keys",
    },
    {
      id: "openai_compatible",
      label: "OpenAI-compatible",
      description:
        "Any OpenAI-compatible endpoint with your API key and base URL.",
      cloudflareOnly: false,
      requiresCredentials: true,
      defaultModelId: "",
      seedModelIds: [],
      sortOrder: 6,
    },
  ] as const;

export const CREDENTIAL_BACKEND_IDS = [
  "opencode",
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "openai_compatible",
] as const satisfies readonly InferenceBackendId[];

export type CredentialBackendId = (typeof CREDENTIAL_BACKEND_IDS)[number];

export function isCredentialBackend(
  backendId: InferenceBackendId,
): backendId is CredentialBackendId {
  return (CREDENTIAL_BACKEND_IDS as readonly string[]).includes(backendId);
}

export function getInferenceBackendDefinition(
  id: InferenceBackendId,
): InferenceBackendDefinition {
  const match = INFERENCE_BACKEND_DEFINITIONS.find(
    (provider) => provider.id === id,
  );
  if (!match) {
    throw new Error(`Unknown inference backend: ${id}`);
  }
  return match;
}

export function inferenceBackendsAvailableOnPlatform(
  platform: AgentPlatform,
): InferenceBackendDefinition[] {
  return INFERENCE_BACKEND_DEFINITIONS.filter(
    (provider) => !provider.cloudflareOnly || platform === "cloudflare",
  ).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function buildInitialProviderInstance(
  backendId: InferenceBackendId,
  label: string,
): ProviderInstance {
  const definition = getInferenceBackendDefinition(backendId);
  const seedIds = definition.seedModelIds.filter(Boolean);
  const defaultModelId = definition.defaultModelId || seedIds[0] || "";
  const enabledModelIds =
    seedIds.length > 0 ? [...seedIds] : defaultModelId ? [defaultModelId] : [];

  const instance: ProviderInstance = {
    id: crypto.randomUUID(),
    backend: backendId,
    label,
    enabled: true,
    defaultModelId,
    enabledModelIds,
  };

  return instance;
}
