import type { APIRoute } from "astro";

import { buildIntegrationsDiscovery } from "../../../aria/lib/oauth/discovery";
import { oauthErrorResponse, oauthJson } from "../../../aria/lib/oauth/http";

export const prerender = false;

// Unauthenticated integration discovery: wildcard CORS, cache-disabled, and
// limited to public site-identity and endpoint metadata.
export const GET: APIRoute = async (context) => {
  try {
    return oauthJson(
      await buildIntegrationsDiscovery({
        locals: context.locals,
        request: context.request,
      }),
      { cors: true },
    );
  } catch (cause) {
    return oauthErrorResponse(cause, { cors: true });
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Cache-Control": "no-store",
    },
  });
