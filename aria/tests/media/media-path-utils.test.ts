import { describe, expect, it } from "vitest";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../../lib/media/utils/path";

describe("media logical path utils", () => {
  it("normalizes local uploads path", () => {
    expect(normalizeLogicalMediaPath("/uploads/hero.jpg")).toBe(
      "/uploads/hero.jpg",
    );
  });

  it("normalizes absolute URL to logical uploads path", () => {
    expect(
      normalizeLogicalMediaPath(
        "https://cdn.example.com/1739800000000-banner.webp?x=1#hash",
      ),
    ).toBe("/uploads/1739800000000-banner.webp");
  });

  it("normalizes nested slashes and windows separators", () => {
    expect(normalizeLogicalMediaPath("uploads\\gallery//cover.png")).toBe(
      "/uploads/gallery/cover.png",
    );
  });

  it("maps managed source delivery URLs back to their catalog path", () => {
    expect(
      normalizeLogicalMediaPath(
        "/media/source/current/gallery/hero%20image.jpg",
      ),
    ).toBe("/uploads/gallery/hero image.jpg");
    expect(
      normalizeLogicalMediaPath(
        "https://example.com/media/source/3/gallery/hero.jpg",
      ),
    ).toBe("/uploads/gallery/hero.jpg");
  });

  it("extracts object key from logical path", () => {
    expect(logicalPathToObjectKey("/uploads/gallery/cover.png")).toBe(
      "gallery/cover.png",
    );
  });
});
