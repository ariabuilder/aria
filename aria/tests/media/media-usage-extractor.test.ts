import { describe, expect, it } from "vitest";
import { extractMediaReferencesFromResource } from "../../lib/media/catalog/usage";

describe("extractMediaReferencesFromResource", () => {
  it("extracts canonical library references and ignores external media", () => {
    const resource = {
      id: "page-1",
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: {
            src: "/uploads/hero.jpg",
            alt: "Hero",
          },
        },
        {
          id: "n2",
          type: "Video",
          props: {
            src: "https://cdn.example.com/intro.mp4",
            poster: "/uploads/intro-poster.png",
          },
        },
        {
          id: "n3",
          type: "Image",
          props: {
            src: "/media/source/current/gallery/product%20shot.webp",
            alt: "Product",
          },
        },
      ],
      settings: {
        seo: {
          ogImage: "https://assets.example.com/uploads/social-share.jpg?x=1",
        },
      },
    };

    const refs = extractMediaReferencesFromResource(resource);
    const paths = refs.map((item) => item.logicalPath).sort();

    expect(paths).toEqual([
      "/uploads/hero.jpg",
      "/uploads/intro-poster.png",
      "/uploads/gallery/product shot.webp",
      "/uploads/social-share.jpg",
    ].sort());
  });

  it("ignores non-media strings", () => {
    const resource = {
      title: "About",
      slug: "/about",
      nodes: [
        {
          id: "n1",
          type: "Text",
          props: {
            href: "https://example.com/docs",
            content: "hello",
          },
        },
      ],
    };

    const refs = extractMediaReferencesFromResource(resource);
    expect(refs).toHaveLength(0);
  });
});
