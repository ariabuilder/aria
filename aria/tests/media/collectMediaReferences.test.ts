import { describe, expect, it } from "vitest";
import { collectMediaReferencesFromResource } from "../../lib/media/catalog/collectMediaReferences";

describe("collectMediaReferencesFromResource", () => {
  it("collects bare Unsplash photo paths on image src props", () => {
    const refs = collectMediaReferencesFromResource({
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: {
            src: "photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80",
            alt: "Team",
          },
        },
      ],
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]?.rawUrl).toMatch(/^photo-1560250097/);
    expect(refs[0]?.refPath).toContain("props.src");
  });

  it("extracts https URLs embedded in utility class strings", () => {
    const refs = collectMediaReferencesFromResource({
      nodes: [
        {
          id: "n1",
          type: "Container",
          classNames: {
            base: [
              "bg-[url('https://images.unsplash.com/photo-1462917882517-e150004895fa?q=80&w=1920&auto=format&fit=crop')]",
            ],
          },
        },
      ],
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]?.rawUrl).toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  it("keeps Astro build paths as URL references without uploads prefix", () => {
    const rawUrl = "/_astro/hero.DlKDY3ml_Z1MqY6c.png";
    const refs = collectMediaReferencesFromResource({
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: {
            src: rawUrl,
            alt: "Hero",
          },
        },
      ],
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]?.rawUrl).toBe(rawUrl);
    expect(refs[0]?.logicalPath).toBe(rawUrl);
    expect(refs[0]?.logicalPath).not.toContain("/uploads/_astro");
  });
});
