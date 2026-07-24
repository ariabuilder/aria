import type { CatalogModel } from "../schemas";

type OpenAiModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

const OPENAI_CHAT_MODEL_PREFIXES = ["gpt-", "o1", "o3", "o4", "chatgpt-"];

function isChatCapableOpenAiModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes("embedding") || normalized.includes("tts")) {
    return false;
  }

  return OPENAI_CHAT_MODEL_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export async function fetchOpenAiCatalog(
  apiKey: string,
): Promise<CatalogModel[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI models request failed (${response.status})`);
  }

  const payload = (await response.json()) as OpenAiModelsResponse;
  const models = (payload.data ?? [])
    .map((entry) => entry.id?.trim())
    .filter((id): id is string => Boolean(id && isChatCapableOpenAiModel(id)))
    .map((id) => ({ id, name: id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return models;
}
