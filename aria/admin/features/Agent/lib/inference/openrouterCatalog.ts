import { z } from "zod";
import { CatalogModelSchema, type CatalogModel } from "../schemas";

export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1" as const;

const OpenRouterModelsResponseSchema = z
  .looseObject({
    data: z
      .array(
        z
          .looseObject({
            id: z.string().min(1),
            name: z.string().min(1).optional(),
          }),
      )
      .optional(),
  });

export async function fetchOpenRouterCatalog(
  apiKey: string,
): Promise<CatalogModel[]> {
  const url = new URL(`${OPENROUTER_API_BASE}/models`);
  url.searchParams.set("supported_parameters", "tools");
  url.searchParams.set("output_modalities", "text");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed (${response.status})`);
  }

  const json: unknown = await response.json();
  const parsed = OpenRouterModelsResponseSchema.parse(json);

  const models = (parsed.data ?? [])
    .map((entry) =>
      CatalogModelSchema.parse({
        id: entry.id,
        name: entry.name?.trim() || entry.id,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return models;
}
