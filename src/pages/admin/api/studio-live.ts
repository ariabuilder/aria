import type { APIRoute } from "astro";
import { z } from "zod";
import { getCloudflareEnv } from "../../../../aria/lib/cloudflare/env";
import { requireAdminApiCapabilities } from "./_auth";

export const prerender = false;

const StudioLiveQuerySchema = z
  .object({
    sessionId: z.uuid(),
    connectedAt: z.coerce.number().int().nonnegative(),
  })
  .strict();

export const HEAD: APIRoute = async ({ locals, cookies }) => {
  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["editPages", "editPageContent", "reviewContent"],
  });
  if (!auth.ok) return auth.response;

  const namespace = getCloudflareEnv(locals).aria_studio_live;
  return new Response(null, {
    status: namespace ? 204 : 503,
    headers: {
      "Cache-Control": "no-store",
      ...(namespace ? {} : { "X-Aria-Studio-Live": "unavailable" }),
    },
  });
};

export const GET: APIRoute = async ({ request, locals, cookies, url }) => {
  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["editPages", "editPageContent", "reviewContent"],
  });
  if (!auth.ok) return auth.response;

  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const namespace = getCloudflareEnv(locals).aria_studio_live;
  if (!namespace) {
    return new Response("Studio live service unavailable", { status: 503 });
  }

  const query = StudioLiveQuerySchema.safeParse({
    sessionId: url.searchParams.get("sessionId"),
    connectedAt: url.searchParams.get("connectedAt"),
  });
  if (!query.success) {
    return new Response("Invalid Studio live session", { status: 400 });
  }

  const identity = encodeURIComponent(
    JSON.stringify({
      sessionId: query.data.sessionId,
      connectedAt: query.data.connectedAt,
      userId: auth.user.id,
      displayName: auth.user.username,
      avatarUrl: auth.user.avatarUrl ?? null,
    }),
  );
  const headers = new Headers(request.headers);
  headers.set("x-aria-studio-live-user", identity);

  const room = namespace.getByName(url.host.toLowerCase());
  return room.fetch(new Request(request, { headers }));
};
