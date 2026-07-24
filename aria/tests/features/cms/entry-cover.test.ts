import { describe, expect, it } from "vitest";
import { extractCmsEntryCover } from "../../../admin/features/CMS/lib/entryCover";
import { resolveCmsMediaPreviewUrl } from "../../../admin/features/CMS/lib/resolveMediaPreviewUrl";

describe("CMS entry cover", () => {
  it("extracts picker media records from cover-like fields", () => {
    expect(
      extractCmsEntryCover({
        summary: "Intro",
        hero_image: {
          mediaId: "media-hero",
          alt: "Hero image",
        },
      }),
    ).toEqual({
      mediaId: "media-hero",
      url: null,
      alt: "Hero image",
    });
  });

  it("supports direct image URLs", () => {
    expect(
      extractCmsEntryCover({
        cover: "/uploads/hero.jpg",
      }),
    ).toEqual({
      mediaId: null,
      url: "/uploads/hero.jpg",
      alt: "",
    });
  });

  it("ignores non-cover fields", () => {
    expect(
      extractCmsEntryCover({
        avatar: { mediaId: "media-avatar" },
      }),
    ).toBeNull();
  });

  it("builds a preview URL when the media catalog has not resolved an ID", () => {
    expect(resolveCmsMediaPreviewUrl("slo-background3-d42191.webp")).toBe(
      "/uploads/slo-background3-d42191.webp",
    );
    expect(resolveCmsMediaPreviewUrl("/uploads/hero.jpg")).toBe(
      "/uploads/hero.jpg",
    );
    expect(resolveCmsMediaPreviewUrl("https://cdn.example.com/hero.jpg")).toBe(
      "https://cdn.example.com/hero.jpg",
    );
  });
});
