import type { PagePreviewFrameProps } from "./pagePreviewTypes";

function resolveOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

export function buildSnapshotPreviewUrl(props: PagePreviewFrameProps): string {
  let pathWithSearch = "";

  if (
    typeof props.snapshotUrl === "string" &&
    props.snapshotUrl.trim().length > 0
  ) {
    const snapshotUrl = new URL(props.snapshotUrl.trim(), resolveOrigin());

    if (props.inert) {
      snapshotUrl.searchParams.set("thumb", "1");
    }

    pathWithSearch = `${snapshotUrl.pathname}${snapshotUrl.search}`;
  } else {
    const stage = props.pageStatus === "published" ? "published" : "draft";
    const searchParams = new URLSearchParams({ stage });

    if (props.inert) {
      searchParams.set("thumb", "1");
    }

    pathWithSearch = `/admin/api/page-snapshots/${encodeURIComponent(props.pageSlug)}?${searchParams.toString()}`;
  }

  if (
    typeof props.snapshotRefreshToken === "string" &&
    props.snapshotRefreshToken.trim().length > 0
  ) {
    const snapshotUrl = new URL(pathWithSearch, resolveOrigin());
    snapshotUrl.searchParams.set("refresh", "1");
    snapshotUrl.searchParams.set("cv", props.snapshotRefreshToken.trim());
    return `${snapshotUrl.pathname}${snapshotUrl.search}`;
  }

  return pathWithSearch;
}

export function buildThumbnailPreviewUrl(
  props: PagePreviewFrameProps,
  generatedThumbnailUrl = "",
): string {
  if (generatedThumbnailUrl) {
    return generatedThumbnailUrl;
  }

  if (
    typeof props.thumbnailUrl === "string" &&
    props.thumbnailUrl.trim().length > 0
  ) {
    const thumbnailUrl = new URL(props.thumbnailUrl.trim(), resolveOrigin());

    if (
      typeof props.thumbnailRefreshToken === "string" &&
      props.thumbnailRefreshToken.trim().length > 0
    ) {
      thumbnailUrl.searchParams.set("cv", props.thumbnailRefreshToken);
    }

    return `${thumbnailUrl.pathname}${thumbnailUrl.search}`;
  }

  return "";
}

export function isAdminPageThumbnailUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return false;
  }

  try {
    const parsed = new URL(url, resolveOrigin());
    return parsed.pathname.startsWith("/admin/api/page-thumbnails/");
  } catch {
    return false;
  }
}
