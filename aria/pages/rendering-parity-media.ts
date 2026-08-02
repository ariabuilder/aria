import type { APIRoute } from "astro";
import { isRenderingParityLoopbackHostname } from "./renderingParityRoute";

export const prerender = false;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="727" height="621" viewBox="0 0 727 621"><rect width="727" height="621" fill="#0f766e"/><path d="M120 310.5h487" stroke="#ffffff" stroke-width="32"/></svg>`;

export const GET: APIRoute = async ({ url }) => {
  if (!isRenderingParityLoopbackHostname(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(SVG, {
    headers: {
      "cache-control": "no-store",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
};
