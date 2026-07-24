import type { APIRoute } from "astro";
import { serveDiscoverySitemapChunk } from "../lib/discoveryRoutes";

export const GET: APIRoute = async ({ params, locals }) => {
  const rawChunk = params.chunk;
  const chunkNumber = Number.parseInt(String(rawChunk ?? ""), 10);
  if (!Number.isFinite(chunkNumber) || chunkNumber < 1) {
    return new Response("Not found", { status: 404 });
  }
  return serveDiscoverySitemapChunk(locals, chunkNumber);
};
