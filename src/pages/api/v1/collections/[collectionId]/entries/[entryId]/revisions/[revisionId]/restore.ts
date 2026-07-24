import type { APIRoute } from "astro";
import { handleRestoreRevision } from "../../../../../../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const POST: APIRoute = (context) => handleRestoreRevision(context);
