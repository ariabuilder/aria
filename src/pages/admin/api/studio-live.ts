import type { APIRoute } from "astro";
import { getCloudflareEnv } from "../../../../aria/lib/cloudflare/env";
import { requireAdminApiCapabilities } from "./_auth";

export const prerender = false;

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

  const identity = encodeURIComponent(
    JSON.stringify({
      userId: auth.user.id,
      displayName: auth.user.username,
      avatarUrl: auth.user.avatarUrl ?? null,
    }),
  );
  const headers = new Headers(request.headers);
  headers.set("x-aria-studio-live-user", identity);

  const room = namespace.get(namespace.idFromName(url.host.toLowerCase())) as {
    fetch(request: Request): Promise<Response>;
  };
  return room.fetch(new Request(request, { headers }));
};
