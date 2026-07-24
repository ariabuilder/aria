import { z } from "zod";

export const MediaGroupIdSchema = z.string().trim().min(1);
export const MediaGroupRouteValueSchema = z.string().trim().min(1);

export type MediaViewFilterId =
  | "all"
  | "image"
  | "video"
  | "font"
  | "icon"
  | "file";

const MediaTypeFilterSchema = z.enum([
  "all",
  "image",
  "video",
  "font",
  "icon",
  "file",
]);

export interface MediaListRouteOptions {
  filter?: MediaViewFilterId;
  group?: string | null;
}

export function parseMediaGroupFilter(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const parsed = MediaGroupRouteValueSchema.safeParse(String(raw));
  return parsed.success ? parsed.data : null;
}

export function parseMediaTypeFilter(raw: unknown): MediaViewFilterId {
  if (raw === undefined || raw === null || raw === "") {
    return "all";
  }
  const parsed = MediaTypeFilterSchema.safeParse(String(raw));
  return parsed.success ? parsed.data : "all";
}

export function toMediaListPath(options: MediaListRouteOptions = {}): string {
  const params = new URLSearchParams();
  const filter = options.filter ?? "all";
  const group = options.group ?? null;

  if (filter !== "all") {
    params.set("filter", filter);
  }
  if (group) {
    params.set("group", group);
  }

  const query = params.toString();
  return query.length > 0 ? `/media?${query}` : "/media";
}

export function toMediaGroupNavFilter(groupId: string | null): string {
  return groupId ? `group:${groupId}` : "all";
}

export function getGroupIdFromNavFilter(activeFilter: string): string | null {
  if (!activeFilter.startsWith("group:")) {
    return null;
  }
  const groupId = activeFilter.slice("group:".length);
  return groupId.length > 0 ? groupId : null;
}
