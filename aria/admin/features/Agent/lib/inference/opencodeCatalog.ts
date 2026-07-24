import { z } from "zod";
import {
  getOpencodeModelsUrl,
  opencodeModelDisplayName,
  OPENCODE_ZEN_ENSURED_MODELS,
  stripOpencodeModelPrefix,
  type OpencodePlan,
} from "./opencodeProviders";

const OpencodeModelsResponseSchema = z
  .looseObject({
    data: z
      .array(
        z
          .looseObject({
            id: z.string().min(1),
          }),
      )
      .optional(),
    models: z
      .array(
        z.union([
          z.string().min(1),
          z.looseObject({ id: z.string().min(1) }),
        ]),
      )
      .optional(),
  });

function normalizeModelEntry(
  entry: string | { id: string; name?: string },
): { id: string; name: string } {
  if (typeof entry === "string") {
    const id = stripOpencodeModelPrefix(entry);
    return { id, name: id };
  }

  const id = stripOpencodeModelPrefix(entry.id);
  const name =
    typeof entry.name === "string" && entry.name.trim()
      ? entry.name.trim()
      : opencodeModelDisplayName(id);
  return { id, name };
}

export async function fetchOpencodeModels(
  plan: OpencodePlan,
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(getOpencodeModelsUrl(plan), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body.trim() ||
        `OpenCode ${plan} models request failed (${response.status})`,
    );
  }

  const json: unknown = await response.json();
  const parsed = OpencodeModelsResponseSchema.parse(json);

  const rawEntries =
    parsed.data?.map((item) => ({ id: item.id })) ??
    parsed.models?.map((item) =>
      typeof item === "string" ? item : { id: item.id },
    ) ??
    [];

  const unique = new Map<string, { id: string; name: string }>();
  for (const entry of rawEntries) {
    const normalized = normalizeModelEntry(entry);
    unique.set(normalized.id, normalized);
  }

  if (plan === "zen") {
    for (const model of OPENCODE_ZEN_ENSURED_MODELS) {
      if (!unique.has(model.id)) {
        unique.set(model.id, { id: model.id, name: model.name });
      }
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
