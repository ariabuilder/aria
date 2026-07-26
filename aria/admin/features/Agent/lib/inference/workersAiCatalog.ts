import { readCloudflareAccountIdFromEnvironment } from "../../../../../lib/cloudflare/account";
import type { CatalogModel } from "../schemas";
import { WORKERS_AI_STATIC_CATALOG } from "./workersAiStaticCatalog";

export { WORKERS_AI_STATIC_CATALOG } from "./workersAiStaticCatalog";

type CloudflareModelSearchResponse = {
  result?: Array<{
    id?: string;
    name?: string;
    description?: string;
  }>;
  success?: boolean;
};

function resolveWorkersAiApiToken(): string | undefined {
  return (
    process.env.ARIA_CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    undefined
  );
}

/** Resolves the Workers AI account without importing Node-only tooling in Workers. */
async function resolveWorkersAiAccountId(): Promise<string | undefined> {
  const fromEnvironment = readCloudflareAccountIdFromEnvironment();
  if (fromEnvironment) {
    return fromEnvironment;
  }
  if (import.meta.env.PUBLIC_ARIA_RUNTIME === "node") {
    const { resolveCloudflareAccountId } =
      await import("../../../../../scripts/lib/cloudflare-account");
    return resolveCloudflareAccountId();
  }
  return undefined;
}

function normalizeWorkersAiModel(entry: {
  id?: string;
  name?: string;
  description?: string;
}): CatalogModel | null {
  const id = entry.id?.trim();
  if (!id) {
    return null;
  }

  const name =
    entry.name?.trim() || entry.description?.trim() || id.replace(/^@cf\//, "");

  return { id, name };
}

/** Fetches the Workers AI model catalog with a static fallback on failure. */
export async function fetchWorkersAiCatalog(): Promise<CatalogModel[]> {
  const token = resolveWorkersAiApiToken();
  if (!token) {
    return [...WORKERS_AI_STATIC_CATALOG];
  }

  try {
    const accountId = await resolveWorkersAiAccountId();
    if (!accountId) {
      return [...WORKERS_AI_STATIC_CATALOG];
    }
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=text-generation`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return [...WORKERS_AI_STATIC_CATALOG];
    }

    const payload = (await response.json()) as CloudflareModelSearchResponse;
    const models = (payload.result ?? [])
      .map(normalizeWorkersAiModel)
      .filter((model): model is CatalogModel => model !== null);

    if (models.length === 0) {
      return [...WORKERS_AI_STATIC_CATALOG];
    }

    return models.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [...WORKERS_AI_STATIC_CATALOG];
  }
}
