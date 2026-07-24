import { describe, expect, it } from "vitest";
import { resolveSiteMetadata } from "../../lib/rendering/resolveSiteMetadata";

describe("metadata resolution precedence", () => {
  it("uses page SEO overrides first, then page fields, then site defaults", () => {
    const metadata = resolveSiteMetadata({
      siteSettings: {
        siteName: "General Site Name",
        siteDescription: "General Description",
        seoTitle: "SEO Default Title",
        seoDescription: "SEO Default Description",
        siteUrl: "https://example.com",
        favicon: "/uploads/favicon.png",
        ogImage: "https://example.com/default-og.png",
      },
      pageTitle: "Page Title",
      pageDescription: "Page Description",
      pageSeo: {
        title: "Page SEO Title",
        description: "Page SEO Description",
        canonical: "https://canonical.example.com/custom",
        ogImage: "https://example.com/page-og.png",
      },
      pathOrSlug: "/about",
    });

    expect(metadata.title).toBe("Page SEO Title");
    expect(metadata.description).toBe("Page SEO Description");
    expect(metadata.seo?.canonical).toBe(
      "https://canonical.example.com/custom",
    );
    expect(metadata.seo?.ogImage).toBe("https://example.com/page-og.png");
    expect(metadata.faviconHeadHTML).toBe(
      '<link rel="icon" href="/uploads/favicon.png">',
    );
  });

  it("falls back to General settings when SEO fields are empty and computes canonical from site URL", () => {
    const metadata = resolveSiteMetadata({
      siteSettings: {
        siteName: "General Site Name",
        siteDescription: "General Description",
        seoTitle: "",
        seoDescription: "",
        siteUrl: "https://example.com/",
        favicon: "",
      },
      pageTitle: "",
      pageDescription: "",
      pageSeo: {
        title: "",
        description: "",
      },
      pathOrSlug: "contact",
    });

    expect(metadata.title).toBe("General Site Name");
    expect(metadata.description).toBe("General Description");
    expect(metadata.seo?.canonical).toBe("https://example.com/contact");
    expect(metadata.faviconHeadHTML).toBe("");
  });
});
