import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createWorkersAI } from "workers-ai-provider";
import type { LanguageModel } from "ai";
import type { AuthAdapter } from "../../../../../lib/auth/adapter";
import type { AgentPlatform, InferenceBackendId } from "../schemas";
import { loadProviderCredentials } from "./byokStore";
import {
  getOpencodeBaseUrlForPlan,
  getOpencodeTransport,
  opencodeApiModelId,
  resolveOpencodeRequestModel,
} from "./opencodeProviders";
import { rejectWorkersAiOnLocal } from "./systemPrompt";
import { fetchWorkersAiCatalog } from "./workersAiCatalog";
import { OPENROUTER_API_BASE } from "./openrouterCatalog";
import type { InferenceRoute } from "../schemas";
import {
  buildCloudflareGatewayRequestConfig,
  type InferenceRequestMetadata,
} from "../usage/gatewayMetadata";

export interface AgentInferenceEnv {
  ai?: Ai;
}

export interface ResolveLanguageModelInput {
  platform: AgentPlatform;
  backend: InferenceBackendId;
  modelId: string;
  env: AgentInferenceEnv;
  authAdapter: AuthAdapter;
  openaiCompatibleBaseUrl?: string;
  route?: InferenceRoute;
  requestMetadata?: InferenceRequestMetadata;
}

export async function resolveLanguageModel(
  input: ResolveLanguageModelInput,
): Promise<LanguageModel> {
  const modelId = input.modelId.trim();
  if (!modelId) {
    throw new Error("Model id is required");
  }

  const route = input.route ?? { type: "direct" as const };
  let gateway = null;
  if (route.type === "cloudflare_ai_gateway") {
    if (!input.requestMetadata) {
      throw new Error(
        "Inference request metadata is required for AI Gateway routing",
      );
    }
    gateway = await buildCloudflareGatewayRequestConfig({
      route,
      backend: input.backend,
      metadata: input.requestMetadata,
    });
  }

  if (input.backend === "workers_ai") {
    rejectWorkersAiOnLocal(input.platform);

    if (!input.env.ai) {
      throw new Error("Workers AI binding is not configured");
    }

    const workersAi = createWorkersAI({ binding: input.env.ai });
    return workersAi(modelId);
  }

  if (input.backend === "opencode") {
    const credentials = await loadProviderCredentials(
      input.authAdapter,
      "opencode",
    );
    if (!credentials) {
      throw new Error("OpenCode credentials are not configured");
    }

    const plan = resolveOpencodeRequestModel(modelId).plan;
    const requestModelId = opencodeApiModelId(modelId);
    const baseURL = getOpencodeBaseUrlForPlan(plan);

    switch (getOpencodeTransport(modelId)) {
      case "openai-responses": {
        const opencode = createOpenAI({ apiKey: credentials.apiKey, baseURL });
        return opencode.responses(requestModelId) as unknown as LanguageModel;
      }
      case "anthropic-messages": {
        const opencode = createAnthropic({
          apiKey: credentials.apiKey,
          baseURL,
        });
        return opencode(requestModelId) as unknown as LanguageModel;
      }
      case "google-generative-ai": {
        const opencode = createGoogle({
          apiKey: credentials.apiKey,
          baseURL,
        });
        return opencode(requestModelId) as unknown as LanguageModel;
      }
      case "openai-compatible": {
        const opencode = createOpenAI({
          apiKey: credentials.apiKey,
          baseURL,
        });
        return opencode.chat(requestModelId) as unknown as LanguageModel;
      }
    }
  }

  if (input.backend === "openai") {
    const credentials = await loadProviderCredentials(
      input.authAdapter,
      "openai",
    );
    if (!credentials) {
      throw new Error("OpenAI credentials are not configured");
    }

    const openai = createOpenAI({
      apiKey: credentials.apiKey,
      baseURL: gateway?.baseURL,
      headers: gateway?.headers,
    });
    return openai(modelId);
  }

  if (input.backend === "anthropic") {
    const credentials = await loadProviderCredentials(
      input.authAdapter,
      "anthropic",
    );
    if (!credentials) {
      throw new Error("Anthropic credentials are not configured");
    }

    const anthropic = createAnthropic({ apiKey: credentials.apiKey });
    return anthropic(modelId) as unknown as LanguageModel;
  }

  if (input.backend === "google") {
    const credentials = await loadProviderCredentials(
      input.authAdapter,
      "google",
    );
    if (!credentials) {
      throw new Error("Google AI credentials are not configured");
    }

    const google = createGoogle({ apiKey: credentials.apiKey });
    return google(modelId) as unknown as LanguageModel;
  }

  if (input.backend === "openrouter") {
    const credentials = await loadProviderCredentials(
      input.authAdapter,
      "openrouter",
    );
    if (!credentials) {
      throw new Error("OpenRouter credentials are not configured");
    }

    const openrouter = createOpenAI({
      apiKey: credentials.apiKey,
      baseURL: gateway?.baseURL ?? OPENROUTER_API_BASE,
      headers: gateway?.headers,
    });
    return openrouter.chat(modelId) as unknown as LanguageModel;
  }

  if (input.backend === "openai_compatible") {
    const credentials = await loadProviderCredentials(
      input.authAdapter,
      "openai_compatible",
    );
    if (!credentials) {
      throw new Error("OpenAI-compatible credentials are not configured");
    }

    const baseURL = input.openaiCompatibleBaseUrl ?? credentials.baseUrl;
    if (!baseURL?.trim()) {
      throw new Error("OpenAI-compatible base URL is not configured");
    }

    const openai = createOpenAI({
      apiKey: credentials.apiKey,
      baseURL,
    });
    return openai(modelId);
  }

  throw new Error(`Unsupported inference backend: ${input.backend}`);
}

export async function listWorkersAiModels(
  _env: AgentInferenceEnv,
): Promise<Array<{ id: string; name: string }>> {
  return fetchWorkersAiCatalog();
}
