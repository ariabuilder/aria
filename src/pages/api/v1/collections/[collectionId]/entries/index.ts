import type { APIRoute } from "astro";
import {
  handleCreateEntry,
  handleListEntries,
} from "../../../../../../../aria/lib/api/siteApi";

export const prerender = false;
export const GET: APIRoute = (context) => handleListEntries(context);
export const POST: APIRoute = (context) => handleCreateEntry(context);
