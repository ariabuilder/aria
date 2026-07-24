import { describe, expect, it } from "vitest";
import {
  buildSnapshotPreviewUrl,
  buildThumbnailPreviewUrl,
  isAdminPageThumbnailUrl,
} from "../../admin/features/Studio/pages/composables/pagePreviewUrls";

describe("pagePreviewUrls", () => {
  it("builds snapshot URLs with thumb mode for inert previews", () => {
    expect(
      buildSnapshotPreviewUrl({
        pageSlug: "home",
        inert: true,
        pageStatus: "draft",
      }),
    ).toBe("/admin/api/page-snapshots/home?stage=draft&thumb=1");
  });

  it("forces snapshot refresh when snapshotRefreshToken is set", () => {
    expect(
      buildSnapshotPreviewUrl({
        pageSlug: "home",
        pageStatus: "draft",
        snapshotUrl:
          "/admin/api/page-snapshots/home?stage=draft&v=2026-01-01T00%3A00%3A00.000Z",
        snapshotRefreshToken: "layout-1",
      }),
    ).toBe(
      "/admin/api/page-snapshots/home?stage=draft&v=2026-01-01T00%3A00%3A00.000Z&refresh=1&cv=layout-1",
    );
  });

  it("builds thumbnail URLs with refresh tokens", () => {
    expect(
      buildThumbnailPreviewUrl(
        {
          pageSlug: "home",
          thumbnailUrl: "/admin/api/page-thumbnails/page_123?stage=draft",
          thumbnailRefreshToken: "42",
        },
        "",
      ),
    ).toBe("/admin/api/page-thumbnails/page_123?stage=draft&cv=42");
  });

  it("detects admin thumbnail URLs", () => {
    expect(
      isAdminPageThumbnailUrl("/admin/api/page-thumbnails/page_123?stage=draft"),
    ).toBe(true);
    expect(isAdminPageThumbnailUrl("blob:preview")).toBe(false);
  });
});
