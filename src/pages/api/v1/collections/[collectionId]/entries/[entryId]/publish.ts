import type { APIRoute } from "astro";
import { handlePublishEntry } from "../../../../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const POST: APIRoute = (context) => handlePublishEntry(context);
