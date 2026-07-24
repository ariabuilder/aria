import { afterEach, describe, expect, it } from "vitest";

import {
  clearStalePageThumbnailIds,
  clearPageThumbnailStale,
  consumeStalePageThumbnailIds,
  isPageThumbnailStale,
  markPageThumbnailStale,
} from "../../../admin/features/Studio/pages/composables/pageThumbnailInvalidation";

describe("pageThumbnailInvalidation", () => {
  afterEach(() => {
    clearStalePageThumbnailIds();
  });

  it("marks and consumes stale page ids", () => {
    markPageThumbnailStale("page-a");
    markPageThumbnailStale("page-b");

    expect(isPageThumbnailStale("page-a")).toBe(true);
    expect(consumeStalePageThumbnailIds()).toEqual(["page-a", "page-b"]);
    expect(consumeStalePageThumbnailIds()).toEqual([]);
    expect(isPageThumbnailStale("page-a")).toBe(false);
  });

  it("ignores empty page ids", () => {
    markPageThumbnailStale("");
    markPageThumbnailStale("   ");

    expect(consumeStalePageThumbnailIds()).toEqual([]);
  });

  it("clears individual stale markers", () => {
    markPageThumbnailStale("page-a");
    clearPageThumbnailStale("page-a");

    expect(isPageThumbnailStale("page-a")).toBe(false);
    expect(consumeStalePageThumbnailIds()).toEqual([]);
  });
});
