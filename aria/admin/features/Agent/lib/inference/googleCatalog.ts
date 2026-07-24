import { z } from "zod";
import { CatalogModelSchema, type CatalogModel } from "../schemas";

const GOOGLE_MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models" as const;

const GoogleModelsResponseSchema = z.looseObject({
  models: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        displayName: z.string().min(1).optional(),
        supportedGenerationMethods: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().min(1).optional(),
});

function googleModelId(name: string): string {
  return name.trim().replace(/^models\//, "");
}

/** Load every text-generation model the supplied Google AI key can access. */
export async function fetchGoogleCatalog(
  apiKey: string,
): Promise<CatalogModel[]> {
  const models = new Map<string, CatalogModel>();
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const url = new URL(GOOGLE_MODELS_URL);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        "x-goog-api-key": apiKey,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Google AI models request failed (${response.status})`);
    }

    const payload = GoogleModelsResponseSchema.parse(await response.json());
    for (const entry of payload.models) {
      if (!entry.supportedGenerationMethods?.includes("generateContent")) {
        continue;
      }
      const id = googleModelId(entry.name);
      if (!id) {
        continue;
      }
      models.set(
        id,
        CatalogModelSchema.parse({
          id,
          name: entry.displayName?.trim() || id,
        }),
      );
    }

    if (!payload.nextPageToken || payload.nextPageToken === pageToken) {
      break;
    }
    pageToken = payload.nextPageToken;
  }

  return Array.from(models.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
