import { describe, expect, it } from "vitest";
import { inferImageSourceMode } from "../../../admin/features/Inspector/schemas/image.schema";

describe("inferImageSourceMode", () => {
  it("uses url mode for root-relative build artifact paths", () => {
    expect(inferImageSourceMode("/_astro/hero.png")).toBe("url");
  });

  it("uses url mode for absolute CDN URLs", () => {
    expect(inferImageSourceMode("https://cdn.example.com/hero.webp")).toBe(
      "url",
    );
  });

  it("uses media mode for Aria uploads", () => {
    expect(inferImageSourceMode("/uploads/hero.jpg")).toBe("media");
  });

  it("uses media mode for data URLs", () => {
    expect(inferImageSourceMode("data:image/png;base64,abc")).toBe("media");
  });
});
