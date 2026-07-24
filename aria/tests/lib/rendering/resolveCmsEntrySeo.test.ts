import { describe, expect, it } from "vitest";
import { resolveCmsEntrySeoOverride } from "../../../lib/rendering/resolveCmsEntrySeo";

describe("resolveCmsEntrySeoOverride", () => {
  it("prefers entry seo frontmatter over title fallback", () => {
    const seo = resolveCmsEntrySeoOverride({
      entryTitle: "Launch Notes",
      frontmatter: {
        seo_title: "Custom SEO Title",
        seo_description: "Custom description",
        og_image: "https://example.com/og.jpg",
      },
    });

    expect(seo).toEqual({
      title: "Custom SEO Title",
      description: "Custom description",
      ogImage: "https://example.com/og.jpg",
    });
  });
});
