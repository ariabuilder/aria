import type { APIRoute } from "astro";
import { handleMcpRoute } from "../../aria/admin/features/Agent/server/routes";

export const prerender = false;

export const ALL: APIRoute = async ({ request, locals }) => {
  return handleMcpRoute(request, locals);
};
