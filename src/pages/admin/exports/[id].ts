import type { APIRoute } from "astro";
import { z } from "astro/zod";
import {
  getAuthAdapterAsync,
  getSessionIdFromCookies,
} from "../../../../aria/lib/auth";
import { createSiteExportStore } from "../../../../aria/lib/export/storage";

const ExportRouteParamsSchema = z.object({
  id: z.uuid(),
});

export const GET: APIRoute = async ({ params, cookies, locals }) => {
  const parsedParams = ExportRouteParamsSchema.safeParse(params);
  if (!parsedParams.success) {
    return new Response("Invalid export id", {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const sessionId = getSessionIdFromCookies(cookies);
  if (!sessionId) {
    return new Response("Authentication required", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const authAdapter = await getAuthAdapterAsync(locals);
  const user = await authAdapter.getSessionUser(sessionId);

  if (!user) {
    return new Response("Session expired or invalid", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const store = createSiteExportStore(locals);
  await store.cleanupExpired();

  const result = await store.readForUser(parsedParams.data.id, user);
  if (!result) {
    return new Response("Export not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const archiveBuffer = new Uint8Array(result.bytes).buffer;

  return new Response(archiveBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.record.filename}"`,
      "Content-Length": String(result.bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
