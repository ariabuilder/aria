import { describe, expect, it } from "vitest";

import {
  buildPageSnapshotAdminUrl,
  resolvePagePreviewStage,
} from "../../../lib/rendering/pageSnapshots";
import {
  buildPageThumbnailAdminUrl,
  buildPageThumbnailAdminUrlWhenStored,
  buildStoredPageThumbnailKey,
} from "../../../lib/rendering/pageThumbnails";

describe("resolvePagePreviewStage", () => {
  it("uses published artifacts for a clean published page", () => {
    expect(
      resolvePagePreviewStage({
        status: "published",
        isModifiedSincePublish: false,
      }),
    ).toBe("published");
  });

  it("uses draft artifacts for a published page with unpublished edits", () => {
    expect(
      resolvePagePreviewStage({
        status: "published",
        isModifiedSincePublish: true,
      }),
    ).toBe("draft");
  });

  it("uses draft artifacts for draft and archived pages", () => {
    expect(resolvePagePreviewStage({ status: "draft" })).toBe("draft");
    expect(resolvePagePreviewStage({ status: "archived" })).toBe("draft");
  });
});

describe("preview admin URLs", () => {
  it("builds draft snapshot and thumbnail URLs for modified published pages", () => {
    const page = {
      id: "contact",
      slug: "contact",
      status: "published" as const,
      isModifiedSincePublish: true,
      updatedAt: "2026-05-01T12:00:00.000Z",
    };
    const stage = resolvePagePreviewStage(page);

    expect(
      buildPageSnapshotAdminUrl(
        page.slug,
        stage,
        page.updatedAt,
        "style-1",
      ),
    ).toBe(
      "/admin/api/page-snapshots/contact?stage=draft&v=2026-05-01T12%3A00%3A00.000Z&sr=style-1",
    );
    expect(
      buildPageThumbnailAdminUrl(
        page.id,
        stage,
        page.updatedAt,
        "style-1",
      ),
    ).toBe(
      "/admin/api/page-thumbnails/contact?stage=draft&v=2026-05-01T12%3A00%3A00.000Z&sr=style-1",
    );
  });

  it("only returns thumbnail URLs for the matching preview stage", () => {
    const pageId = "test2-1";
    const stage = "draft";
    const storedKeys = new Set([
      buildStoredPageThumbnailKey(pageId, "published"),
    ]);

    expect(
      buildPageThumbnailAdminUrlWhenStored(
        storedKeys,
        pageId,
        stage,
        "2026-06-24T20:16:54.157Z",
        "style-1",
      ),
    ).toBeUndefined();

    storedKeys.add(buildStoredPageThumbnailKey(pageId, stage));

    expect(
      buildPageThumbnailAdminUrlWhenStored(
        storedKeys,
        pageId,
        stage,
        "2026-06-24T20:16:54.157Z",
        "style-1",
      ),
    ).toBe(
      "/admin/api/page-thumbnails/test2-1?stage=draft&v=2026-06-24T20%3A16%3A54.157Z&sr=style-1",
    );
  });
});
