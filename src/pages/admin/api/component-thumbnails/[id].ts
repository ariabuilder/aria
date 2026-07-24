import type { APIRoute, AstroCookies } from "astro";
import { z } from "zod";

import {
  getAuthAdapterAsync,
  getSessionIdFromCookies,
} from "../../../../../aria/lib/auth";
import { ComponentThumbnailIdSchema } from "../../../../../aria/lib/schemas/componentPreview";
import { getStorageAdapterAsync } from "../../../../../aria/lib/storage/getStorageAdapter";
import { readSessionUserFromLocals } from "../../../../../aria/lib/runtime/requestLocals";

async function readAuthenticatedSessionUser(input: {
  locals: Parameters<typeof readSessionUserFromLocals>[0];
  cookies: AstroCookies;
}): Promise<ReturnType<typeof readSessionUserFromLocals>> {
  let sessionUser = readSessionUserFromLocals(input.locals);
  if (!sessionUser) {
    const sessionId = getSessionIdFromCookies(input.cookies);
    if (sessionId) {
      const authAdapter = await getAuthAdapterAsync(input.locals);
      sessionUser = await authAdapter.getSessionUser(sessionId);
    }
  }

  return sessionUser;
}

export const GET: APIRoute = async ({ params, locals, cookies }) => {
  let componentId: string;

  try {
    componentId = ComponentThumbnailIdSchema.parse(params.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        error.issues[0]?.message || "Invalid thumbnail request",
        {
          status: 400,
        },
      );
    }
    throw error;
  }

  const sessionUser = await readAuthenticatedSessionUser({ locals, cookies });
  if (!sessionUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const adapter = await getStorageAdapterAsync(locals);
  const thumbnail = await adapter.readThumbnail("component", componentId);
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
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
};
