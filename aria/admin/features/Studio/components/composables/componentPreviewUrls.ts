import type { z } from "zod";

import {
  ComponentSnapshotQuerySchema,
  ComponentThumbnailIdSchema,
} from "@/lib/schemas/componentPreview";
function resolveOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

export interface ComponentPreviewUrlInput {
  componentId: string;
  snapshotUrl?: string | null;
  thumbnailUrl?: string | null;
  snapshotRefreshToken?: string | null;
  thumbnailRefreshToken?: string | null;
  inert?: boolean;
}

export function buildComponentSnapshotPreviewUrl(
  input: ComponentPreviewUrlInput,
): string {
  if (
    typeof input.snapshotUrl === "string" &&
    input.snapshotUrl.trim().length > 0
  ) {
    const snapshotUrl = new URL(input.snapshotUrl.trim(), resolveOrigin());

    if (input.inert) {
      snapshotUrl.searchParams.set("thumb", "1");
    }

    return `${snapshotUrl.pathname}${snapshotUrl.search}`;
  }

  const searchParams = new URLSearchParams();
  if (input.inert) {
    searchParams.set("thumb", "1");
  }

  const query = searchParams.toString();
  const path = `/admin/api/component-snapshots/${encodeURIComponent(input.componentId)}`;
  return query ? `${path}?${query}` : path;
}

export function buildComponentThumbnailPreviewUrl(
  input: ComponentPreviewUrlInput,
  generatedThumbnailUrl = "",
): string {
  if (
    typeof generatedThumbnailUrl === "string" &&
    generatedThumbnailUrl.trim().length > 0
  ) {
    return generatedThumbnailUrl;
  }

  if (
    typeof input.thumbnailUrl === "string" &&
    input.thumbnailUrl.trim().length > 0
  ) {
    const thumbnailUrl = new URL(input.thumbnailUrl.trim(), resolveOrigin());

    if (
      typeof input.thumbnailRefreshToken === "string" &&
      input.thumbnailRefreshToken.trim().length > 0
    ) {
      thumbnailUrl.searchParams.set("cv", input.thumbnailRefreshToken);
    }

    return `${thumbnailUrl.pathname}${thumbnailUrl.search}`;
  }

  return "";
}

export function buildStoredComponentThumbnailPreviewUrl(
  input: ComponentPreviewUrlInput,
): string {
  const componentId = ComponentThumbnailIdSchema.safeParse(input.componentId);
  if (!componentId.success) {
    return "";
  }

  const searchParams = new URLSearchParams();
  if (
    typeof input.thumbnailRefreshToken === "string" &&
    input.thumbnailRefreshToken.trim().length > 0
  ) {
    searchParams.set("cv", input.thumbnailRefreshToken.trim());
  }

  const path = `/admin/api/component-thumbnails/${encodeURIComponent(componentId.data)}`;
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function parseComponentSnapshotQuery(
  searchParams: URLSearchParams,
): z.infer<typeof ComponentSnapshotQuerySchema> {
  return ComponentSnapshotQuerySchema.parse({
    thumb: searchParams.get("thumb") === "1" ? "1" : undefined,
    refresh: searchParams.get("refresh") === "1" ? "1" : undefined,
  });
}

export function isAdminComponentThumbnailUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return false;
  }

  try {
    const parsed = new URL(url, resolveOrigin());
    return parsed.pathname.startsWith("/admin/api/component-thumbnails/");
  } catch {
    return false;
  }
}
