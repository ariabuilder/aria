import { describe, expect, it } from "vitest";

import {
  enrichComponentWithPreviewUrls,
  enrichComponentsWithPreviewUrls,
} from "@/lib/rendering/componentPreviewInventory";

describe("componentPreviewInventory", () => {
  it("builds snapshot and stored thumbnail admin urls for a component", () => {
    const urls = enrichComponentWithPreviewUrls(
      { id: "hero-cta", updatedAt: "2026-06-01T00:00:00.000Z" },
      "rev-42",
      new Set(["hero-cta"]),
    );

    expect(urls.snapshotUrl).toContain(
      "/admin/api/component-snapshots/hero-cta",
    );
    expect(urls.thumbnailUrl).toContain(
      "/admin/api/component-thumbnails/hero-cta",
    );
    expect(urls.snapshotUrl).toContain("sr=rev-42");
    expect(urls.thumbnailUrl).toContain("sr=rev-42");
  });

  it("omits thumbnail urls for components without stored thumbnails", () => {
    const urls = enrichComponentWithPreviewUrls(
      { id: "hero-cta", updatedAt: "2026-06-01T00:00:00.000Z" },
      "rev-42",
      new Set(),
    );

    expect(urls.snapshotUrl).toContain(
      "/admin/api/component-snapshots/hero-cta",
    );
    expect(urls.thumbnailUrl).toBeUndefined();
  });

  it("enriches component lists with stored thumbnails only", () => {
    const enriched = enrichComponentsWithPreviewUrls(
      [
        { id: "hero-cta", updatedAt: undefined },
        { id: "pricing-card", updatedAt: "2026-06-02T00:00:00.000Z" },
      ],
      null,
      new Set(["pricing-card"]),
    );

    expect(enriched).toHaveLength(2);
    expect(enriched[0]?.id).toBe("hero-cta");
    expect(enriched[0]?.snapshotUrl).toContain("hero-cta");
    expect(enriched[0]?.thumbnailUrl).toBeUndefined();
    expect(enriched[1]?.thumbnailUrl).toContain("pricing-card");
  });
});
