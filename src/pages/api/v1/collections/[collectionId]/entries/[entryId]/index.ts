import type { APIRoute } from "astro";
import {
  handleGetEntry,
  handleUpdateEntry,
} from "../../../../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const GET: APIRoute = (context) => handleGetEntry(context);
export const PATCH: APIRoute = (context) => handleUpdateEntry(context);
