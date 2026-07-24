import type { APIRoute } from "astro";
import { z } from "zod";
import { parseCanonicalIconId } from "../../../lib/icons/packs";
import { resolveIconData } from "../../../lib/icons/resolve";
import { log } from "../../../../aria/lib/utils/logger";

const MAX_ICON_DATA_IDS = 10;

const DataParamsSchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((value) => [
      ...new Set(
        value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .refine((ids) => ids.length > 0 && ids.length <= MAX_ICON_DATA_IDS, {
      message: `ids must contain between 1 and ${MAX_ICON_DATA_IDS} icon ids`,
    }),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const parse = DataParamsSchema.safeParse({
    ids: url.searchParams.get("ids") ?? "",
  });

  if (!parse.success) {
    return Response.json(
      {
        error: "Invalid data params",
        details: parse.error.issues,
      },
      { status: 400 },
    );
  }

  const ids = parse.data.ids;
  const validIds: string[] = [];
  const invalidIds: string[] = [];

  for (const id of ids) {
    if (parseCanonicalIconId(id)) {
      validIds.push(id);
    } else {
      invalidIds.push(id);
    }
  }

  try {
    const result = await resolveIconData({
      ids: validIds,
      locals,
    });

    return Response.json(
      {
        icons: result.icons,
        missing: [...result.missing, ...invalidIds],
        snapshotVersion: result.snapshotVersion,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    log("error", "Icon data route failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      {
        error: "Failed to resolve icons",
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
