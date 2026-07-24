import type { APIRoute } from "astro";
import document from "../../../../aria/docs/openapi/site-api-v1.json";
import { apiRequestId } from "../../../../aria/lib/api/http";

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  return Response.json(document, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Aria-Request-Id": apiRequestId(request),
    },
  });
};
