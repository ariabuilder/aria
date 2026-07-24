import type { APIRoute } from "astro";
import { handleListCollections } from "../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const GET: APIRoute = (context) => handleListCollections(context);
