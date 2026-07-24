import { z } from "zod";
import { CatalogModelSchema, type CatalogModel } from "../schemas";

const ANTHROPIC_API_VERSION = "2023-06-01" as const;
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models" as const;

const AnthropicModelsResponseSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        id: z.string().min(1),
        display_name: z.string().min(1).optional(),
      }),
    )
    .default([]),
  has_more: z.boolean().default(false),
  last_id: z.string().min(1).optional(),
});

/** Load every model the supplied Anthropic key can access. */
export async function fetchAnthropicCatalog(
  apiKey: string,
): Promise<CatalogModel[]> {
  const models = new Map<string, CatalogModel>();
  let afterId: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const url = new URL(ANTHROPIC_MODELS_URL);
    url.searchParams.set("limit", "1000");
    if (afterId) {
      url.searchParams.set("after_id", afterId);
    }

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Anthropic models request failed (${response.status})`);
    }

    const payload = AnthropicModelsResponseSchema.parse(await response.json());
    for (const entry of payload.data) {
      const id = entry.id.trim();
      models.set(
        id,
        CatalogModelSchema.parse({
          id,
          name: entry.display_name?.trim() || id,
        }),
      );
    }

    if (!payload.has_more || !payload.last_id || payload.last_id === afterId) {
      break;
    }
    afterId = payload.last_id;
  }

  return Array.from(models.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
