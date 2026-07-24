import type { APIRoute } from "astro";
import { serveDiscoveryImageSitemap } from "../lib/discoveryRoutes";

export const GET: APIRoute = async ({ locals }) =>
  serveDiscoveryImageSitemap(locals);
