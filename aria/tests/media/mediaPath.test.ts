import { describe, expect, it } from "vitest";
import {
  isAriaLibraryMediaPath,
  isUrlReferencedMediaPath,
  resolveCollectedLogicalPath,
} from "../../lib/media/utils/path";

describe("media path classification", () => {
  it("identifies Aria library paths", () => {
    expect(isAriaLibraryMediaPath("/uploads/hero.jpg")).toBe(true);
    expect(isAriaLibraryMediaPath("uploads/hero.jpg")).toBe(true);
    expect(isAriaLibraryMediaPath("/_astro/hero.png")).toBe(false);
  });

  it("identifies URL-referenced paths including build artifacts", () => {
    expect(isUrlReferencedMediaPath("/_astro/hero.png")).toBe(true);
    expect(isUrlReferencedMediaPath("https://cdn.example.com/hero.webp")).toBe(
      true,
    );
    expect(isUrlReferencedMediaPath("/uploads/hero.jpg")).toBe(false);
  });

  it("preserves URL-referenced logical paths without uploads prefix", () => {
    const raw = "/_astro/hero.DlKDY3ml_Z1MqY6c.png";
    expect(resolveCollectedLogicalPath(raw)).toBe(raw);
  });

  it("normalizes library paths under uploads", () => {
    expect(resolveCollectedLogicalPath("/uploads/hero.jpg")).toBe(
      "/uploads/hero.jpg",
    );
  });
});
