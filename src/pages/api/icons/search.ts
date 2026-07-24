import type { APIRoute } from "astro";
import { z } from "zod";
import { getStorageAdapterAsync } from "../../../../aria/lib/storage/getStorageAdapter";
import { log } from "../../../../aria/lib/utils/logger";
import { IconPackKeySchema } from "../../../lib/icons/packs";
import { getEnabledPackMap } from "../../../lib/icons/runtime";
import { searchIcons } from "../../../lib/icons/resolve";

const SearchParamsSchema = z.object({
  pack: IconPackKeySchema,
  q: z.string().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(100),
  cursor: z.string().max(512).optional().nullable(),
  /** Design showcase may preview packs that are currently disabled. */
  preview: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const parse = SearchParamsSchema.safeParse({
    pack: url.searchParams.get("pack"),
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? 100,
    cursor: url.searchParams.get("cursor"),
    preview: url.searchParams.get("preview") ?? undefined,
  });

  if (!parse.success) {
    return Response.json(
      {
        error: "Invalid search params",
        details: parse.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const { pack, preview } = parse.data;
    const adapter = await getStorageAdapterAsync(locals);
    const siteSettings = await adapter.getSiteSettings();
    const enabledPacks = getEnabledPackMap(siteSettings);

    if (!preview && !enabledPacks[pack]) {
      return Response.json(
        {
          error: "Pack disabled for this project",
        },
        { status: 403 },
      );
    }

    const result = await searchIcons({
      pack,
      q: parse.data.q,
      limit: parse.data.limit,
      cursor: parse.data.cursor ?? null,
      locals,
    });

    return Response.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    log("error", "Icon search route failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      {
        error: "Failed to search icons",
        ...(import.meta.env.DEV
          ? {
              detail: error instanceof Error ? error.message : String(error),
            }
          : {}),
      },
      {
        status: 500,
      },
    );
  }
};
