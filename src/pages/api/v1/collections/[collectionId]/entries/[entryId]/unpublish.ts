import type { APIRoute } from "astro";
import { handleUnpublishEntry } from "../../../../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const POST: APIRoute = (context) => handleUnpublishEntry(context);
