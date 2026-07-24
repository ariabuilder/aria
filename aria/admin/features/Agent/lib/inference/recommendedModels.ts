import { WORKERS_AI_STATIC_CATALOG } from "./workersAiStaticCatalog";
import { getInferenceBackendDefinition } from "../inferenceProviders";
import {
  catalogModelId,
  opencodePlanFromModelId,
  stripOpencodeModelPrefix,
} from "./opencodeProviders";
import type {
  AgentSettings,
  CatalogModel,
  InferenceBackendId,
  OpencodePlan,
} from "../schemas";

const OPENCODE_ZEN_RECOMMENDED_BARE = [
  "big-pickle",
  "deepseek-v4-flash-free",
  "mimo-v2.5-free",
  "north-mini-code-free",
  "nemotron-3-ultra-free",
  "claude-sonnet-4-6",
  "gpt-5.4-mini",
  "deepseek-v4-flash",
  "minimax-m2.5",
] as const;

const OPENCODE_GO_RECOMMENDED_BARE = [
  "deepseek-v4-flash",
  "kimi-k2.7-code",
  "kimi-k2.5",
  "kimi-k2.6",
  "minimax-m2.7",
] as const;

const OPENAI_RECOMMENDED = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
  "o3-mini",
] as const;

const OPENROUTER_RECOMMENDED = [
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash-preview",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "deepseek/deepseek-chat-v3-0324",
] as const satisfies readonly string[];

const ANTHROPIC_RECOMMENDED = [
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
] as const;

const GOOGLE_RECOMMENDED = ["gemini-2.5-flash", "gemini-2.5-pro"] as const;

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function catalogIdSet(catalog: CatalogModel[]): Set<string> {
  return new Set(catalog.map((model) => model.id));
}

function resolveCuratedCatalogIds(
  catalog: CatalogModel[],
  curatedIds: readonly string[],
): string[] {
  const ids = catalogIdSet(catalog);
  if (catalog.length === 0) {
    return [...curatedIds];
  }
  return curatedIds.filter((id) => ids.has(id));
}

function isOpencodeFreeModel(modelId: string): boolean {
  const bare = stripOpencodeModelPrefix(modelId);
  return bare.includes("-free") || bare === "big-pickle";
}

export function listOpencodeRecommendedModelIds(
  plan: OpencodePlan,
  catalog: CatalogModel[],
): string[] {
  const planCatalog = catalog.filter(
    (model) => opencodePlanFromModelId(model.id) === plan,
  );
  const catalogIds = catalogIdSet(planCatalog);
  const bareRecommended =
    plan === "go"
      ? OPENCODE_GO_RECOMMENDED_BARE
      : OPENCODE_ZEN_RECOMMENDED_BARE;

  const curated = bareRecommended
    .map((bareId) => catalogModelId(plan, bareId))
    .filter((id) => catalogIds.size === 0 || catalogIds.has(id));

  const freeModels = planCatalog
    .filter((model) => isOpencodeFreeModel(model.id))
    .map((model) => model.id);

  const merged = uniqueIds([...curated, ...freeModels]);

  if (merged.length > 0) {
    return merged;
  }

  return planCatalog.slice(0, 8).map((model) => model.id);
}

export function listOpenAiRecommendedModelIds(
  catalog: CatalogModel[],
  seedModelIds: readonly string[],
): string[] {
  const curated = resolveCuratedCatalogIds(catalog, OPENAI_RECOMMENDED);
  return uniqueIds([...seedModelIds, ...curated]);
}

export function listOpenRouterRecommendedModelIds(
  catalog: CatalogModel[],
  seedModelIds: readonly string[],
): string[] {
  const curated = resolveCuratedCatalogIds(catalog, OPENROUTER_RECOMMENDED);
  return uniqueIds([...seedModelIds, ...curated]);
}

export function listAnthropicRecommendedModelIds(
  catalog: CatalogModel[],
  seedModelIds: readonly string[],
): string[] {
  return uniqueIds([
    ...seedModelIds,
    ...resolveCuratedCatalogIds(catalog, ANTHROPIC_RECOMMENDED),
  ]);
}

export function listGoogleRecommendedModelIds(
  catalog: CatalogModel[],
  seedModelIds: readonly string[],
): string[] {
  return uniqueIds([
    ...seedModelIds,
    ...resolveCuratedCatalogIds(catalog, GOOGLE_RECOMMENDED),
  ]);
}

export function listWorkersAiRecommendedModelIds(
  catalog: CatalogModel[],
  seedModelIds: readonly string[],
): string[] {
  const staticIds = WORKERS_AI_STATIC_CATALOG.map((model) => model.id);
  const curated = uniqueIds([...seedModelIds, ...staticIds]);
  return resolveCuratedCatalogIds(catalog, curated);
}

export function listCompatibleRecommendedModelIds(
  catalog: CatalogModel[],
): string[] {
  if (catalog.length === 0) {
    return [];
  }

  const preferred = catalog.filter((model) => {
    const id = model.id.toLowerCase();
    return (
      id.includes("gpt") ||
      id.includes("claude") ||
      id.includes("llama") ||
      id.includes("mistral") ||
      id.includes("deepseek")
    );
  });

  const source = preferred.length > 0 ? preferred : catalog;
  return source.slice(0, 8).map((model) => model.id);
}

export function listRecommendedModelIds(input: {
  backendId: InferenceBackendId;
  catalog: CatalogModel[];
  settings: AgentSettings;
}): string[] {
  const definition = getInferenceBackendDefinition(input.backendId);

  switch (input.backendId) {
    case "opencode": {
      return uniqueIds([
        ...listOpencodeRecommendedModelIds("zen", input.catalog),
        ...listOpencodeRecommendedModelIds("go", input.catalog),
      ]);
    }
    case "openai":
      return listOpenAiRecommendedModelIds(
        input.catalog,
        definition.seedModelIds,
      );
    case "openrouter":
      return listOpenRouterRecommendedModelIds(
        input.catalog,
        definition.seedModelIds,
      );
    case "anthropic":
      return listAnthropicRecommendedModelIds(
        input.catalog,
        definition.seedModelIds,
      );
    case "google":
      return listGoogleRecommendedModelIds(
        input.catalog,
        definition.seedModelIds,
      );
    case "openai_compatible":
      return listCompatibleRecommendedModelIds(input.catalog);
    case "workers_ai":
      return listWorkersAiRecommendedModelIds(
        input.catalog,
        definition.seedModelIds,
      );
  }
}

export function pickRecommendedDefaultModelId(input: {
  backendId: InferenceBackendId;
  recommendedModelIds: string[];
  currentDefaultModelId?: string;
  settings: AgentSettings;
}): string | undefined {
  if (
    input.currentDefaultModelId &&
    input.recommendedModelIds.includes(input.currentDefaultModelId)
  ) {
    return input.currentDefaultModelId;
  }

  const definition = getInferenceBackendDefinition(input.backendId);
  if (
    definition.defaultModelId &&
    input.recommendedModelIds.includes(definition.defaultModelId)
  ) {
    return definition.defaultModelId;
  }

  return input.recommendedModelIds[0];
}
