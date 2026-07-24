import type { APIRoute } from "astro";
import { serveDiscoveryArtifact } from "../lib/discoveryRoutes";

export const GET: APIRoute = async ({ locals }) =>
  serveDiscoveryArtifact(locals, "robots");
