import type { APIRoute } from "astro";
import { handleGetCollection } from "../../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const GET: APIRoute = (context) => handleGetCollection(context);
