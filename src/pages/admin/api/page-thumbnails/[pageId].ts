import type { APIRoute } from "astro";
import { z } from "zod";

import {
  PageThumbnailPageIdSchema,
  resolvePageThumbnailStage,
} from "../../../../../aria/lib/rendering/pageThumbnails";
import { getStorageAdapterAsync } from "../../../../../aria/lib/storage/getStorageAdapter";
import { requireAdminApiCapabilities } from "../_auth";

function badRequest(message: string): Response {
  return Response.json(
    {
      success: false,
      error: {
        code: "BAD_REQUEST",
        message,
      },
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export const GET: APIRoute = async ({ params, locals, cookies, request }) => {
  let pageId: string;
  let requestedStage: "draft" | "published";

  try {
    pageId = PageThumbnailPageIdSchema.parse(params.pageId);
    requestedStage = resolvePageThumbnailStage(
      new URL(request.url).searchParams.get("stage"),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(
        error.issues[0]?.message || "Invalid thumbnail request",
      );
    }

    throw error;
  }

  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["reviewContent", "editPageContent", "editPages"],
  });
  if (!auth.ok) {
    return auth.response;
  }

  const adapter = await getStorageAdapterAsync(locals);
  const thumbnail = await adapter.readPageThumbnail(pageId, requestedStage);

  if (!thumbnail) {
    return new Response("Thumbnail not found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new Response(new Uint8Array(thumbnail.buffer), {
    status: 200,
    headers: {
      "Content-Type": thumbnail.contentType,
      // The admin URL embeds the page `updatedAt` + site `styleRevision`
      // (see `buildPageThumbnailAdminUrl`), so the URL is content-addressed
      // and the browser can safely reuse cached bytes between Pages-grid
      // visits and full refreshes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
};
