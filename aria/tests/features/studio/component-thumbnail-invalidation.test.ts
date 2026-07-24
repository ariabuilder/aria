import { afterEach, describe, expect, it } from "vitest";

import {
  clearComponentThumbnailStale,
  clearStaleComponentThumbnailIds,
  consumeStaleComponentThumbnailIds,
  isComponentThumbnailStale,
  markComponentThumbnailStale,
} from "../../../admin/features/Studio/components/composables/componentThumbnailInvalidation";

describe("componentThumbnailInvalidation", () => {
  afterEach(() => {
    clearStaleComponentThumbnailIds();
  });

  it("marks and consumes stale component ids", () => {
    markComponentThumbnailStale("hero-cta");
    markComponentThumbnailStale("pricing-card");

    expect(isComponentThumbnailStale("hero-cta")).toBe(true);
    expect(consumeStaleComponentThumbnailIds()).toEqual([
      "hero-cta",
      "pricing-card",
    ]);
    expect(consumeStaleComponentThumbnailIds()).toEqual([]);
    expect(isComponentThumbnailStale("hero-cta")).toBe(false);
  });

  it("ignores empty component ids", () => {
    markComponentThumbnailStale("");
    markComponentThumbnailStale("   ");

    expect(consumeStaleComponentThumbnailIds()).toEqual([]);
  });

  it("clears individual stale markers", () => {
    markComponentThumbnailStale("hero-cta");
    clearComponentThumbnailStale("hero-cta");

    expect(isComponentThumbnailStale("hero-cta")).toBe(false);
    expect(consumeStaleComponentThumbnailIds()).toEqual([]);
  });
});
