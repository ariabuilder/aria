import { describe, expect, it } from "vitest";
import {
  collectMediaReferenceLocations,
  matchesLogicalMediaPath,
  migrateMediaReferencesInResource,
  parseRefPath,
  resolveMigratedMediaRawUrl,
  scrubMediaReferencesFromResource,
  setValueAtRefPath,
} from "../../lib/media/catalog/scrubMediaReferences";

const pageWithHero = {
  nodes: [
    {
      id: "n1",
      type: "Image",
      props: {
        src: "/uploads/gallery/hero.jpg",
        alt: "Hero",
      },
    },
  ],
  featuredImage: {
    src: "https://cdn.example.com/uploads/gallery/hero.jpg",
    alt: "Cover",
  },
  settings: {
    seo: {
      ogImage: "/uploads/gallery/hero.jpg",
    },
  },
};

describe("parseRefPath", () => {
  it("parses nested object and array segments", () => {
    expect(parseRefPath("nodes[0].props.src")).toEqual([
      "nodes",
      0,
      "props",
      "src",
    ]);
  });

  it("returns an empty array for root aliases", () => {
    expect(parseRefPath("$root")).toEqual([]);
    expect(parseRefPath("")).toEqual([]);
  });
});

describe("setValueAtRefPath", () => {
  it("updates a nested DSL path without mutating the original resource", () => {
    const result = setValueAtRefPath(
      pageWithHero,
      "nodes[0].props.src",
      "/uploads/gallery/new-hero.jpg",
    );

    expect(result.success).toBe(true);
    expect(
      (result.resource as typeof pageWithHero).nodes[0]?.props.src,
    ).toBe("/uploads/gallery/new-hero.jpg");
    expect(pageWithHero.nodes[0]?.props.src).toBe("/uploads/gallery/hero.jpg");
  });

  it("replaces the root value when refPath is $root", () => {
    const result = setValueAtRefPath(
      "/uploads/gallery/hero.jpg",
      "$root",
      "",
    );

    expect(result).toEqual({ success: true, resource: "" });
  });
});

describe("matchesLogicalMediaPath", () => {
  it("matches logical, relative, and CDN URLs for the same asset", () => {
    const logicalPath = "/uploads/gallery/hero.jpg";

    expect(matchesLogicalMediaPath("/uploads/gallery/hero.jpg", logicalPath)).toBe(
      true,
    );
    expect(matchesLogicalMediaPath("uploads/gallery/hero.jpg", logicalPath)).toBe(
      true,
    );
    expect(
      matchesLogicalMediaPath(
        "https://cdn.example.com/uploads/gallery/hero.jpg?v=1",
        logicalPath,
      ),
    ).toBe(true);
  });

  it("ignores query strings and rejects unrelated assets", () => {
    expect(
      matchesLogicalMediaPath(
        "/uploads/gallery/hero.jpg?cache=1",
        "/uploads/gallery/hero.jpg",
      ),
    ).toBe(true);
    expect(
      matchesLogicalMediaPath(
        "/uploads/gallery/other.jpg",
        "/uploads/gallery/hero.jpg",
      ),
    ).toBe(false);
    expect(
      matchesLogicalMediaPath(
        "https://images.unsplash.com/photo-123",
        "/uploads/gallery/hero.jpg",
      ),
    ).toBe(false);
  });
});

describe("resolveMigratedMediaRawUrl", () => {
  it("preserves CDN URL shape while swapping the logical path", () => {
    expect(
      resolveMigratedMediaRawUrl(
        "https://cdn.example.com/uploads/gallery/hero.jpg",
        "/uploads/gallery/renamed.jpg",
      ),
    ).toBe("https://cdn.example.com/uploads/gallery/renamed.jpg");
  });

  it("returns the normalized logical path for library URLs", () => {
    expect(
      resolveMigratedMediaRawUrl(
        "/uploads/gallery/hero.jpg",
        "/uploads/gallery/renamed.jpg",
      ),
    ).toBe("/uploads/gallery/renamed.jpg");
  });
});

describe("scrubMediaReferencesFromResource", () => {
  it("clears every matching library reference in the resource tree", () => {
    const result = scrubMediaReferencesFromResource(
      pageWithHero,
      "/uploads/gallery/hero.jpg",
    );

    expect(result.changed).toBe(true);
    expect(result.updatedCount).toBe(3);
    expect(
      (result.resource as typeof pageWithHero).nodes[0]?.props.src,
    ).toBe("");
    expect((result.resource as typeof pageWithHero).featuredImage?.src).toBe(
      "",
    );
    expect(
      (result.resource as typeof pageWithHero).settings?.seo?.ogImage,
    ).toBe("");
  });

  it("supports a custom fallback value", () => {
    const result = scrubMediaReferencesFromResource(
      pageWithHero,
      "/uploads/gallery/hero.jpg",
      "about:blank",
    );

    expect(
      (result.resource as typeof pageWithHero).nodes[0]?.props.src,
    ).toBe("about:blank");
  });
});

describe("migrateMediaReferencesInResource", () => {
  it("rewrites every matching reference to the new logical path", () => {
    const result = migrateMediaReferencesInResource(
      pageWithHero,
      "/uploads/gallery/hero.jpg",
      "/uploads/gallery/renamed.jpg",
    );

    expect(result.changed).toBe(true);
    expect(result.updatedCount).toBe(3);
    expect(
      (result.resource as typeof pageWithHero).nodes[0]?.props.src,
    ).toBe("/uploads/gallery/renamed.jpg");
    expect((result.resource as typeof pageWithHero).featuredImage?.src).toBe(
      "https://cdn.example.com/uploads/gallery/renamed.jpg",
    );
    expect(
      (result.resource as typeof pageWithHero).settings?.seo?.ogImage,
    ).toBe("/uploads/gallery/renamed.jpg");
  });
});

describe("collectMediaReferenceLocations", () => {
  it("returns all media reference locations without deduping by logical path", () => {
    const locations = collectMediaReferenceLocations({
      nodes: [
        {
          props: { src: "/uploads/a.jpg" },
        },
        {
          props: { src: "/uploads/a.jpg" },
        },
      ],
    });

    expect(locations).toHaveLength(2);
    expect(locations[0]?.refPath).toContain("props.src");
    expect(locations[1]?.refPath).toContain("props.src");
  });
});
