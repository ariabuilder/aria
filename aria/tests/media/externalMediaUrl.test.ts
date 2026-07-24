import { describe, expect, it } from "vitest";
import {
  extractHttpUrlsFromText,
  isLikelyExternalImageReference,
  normalizeExternalMediaUrl,
} from "../../lib/media/utils/externalMediaUrl";
import { resolvePageMediaAssets } from "../../lib/media/catalog/resolvePageMediaAssets";
import { GetPageMediaOutputSchema } from "../../lib/schemas/pageMedia";
import type { PageDSL } from "../../lib/types/nodes";
import type { StorageAdapter } from "../../lib/storage/adapter";

describe("normalizeExternalMediaUrl", () => {
  it("prefixes scheme-less Unsplash host paths with https", () => {
    expect(
      normalizeExternalMediaUrl(
        "images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
      ),
    ).toBe("https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200");
  });

  it("prefixes bare Unsplash photo paths with the images host", () => {
    expect(
      normalizeExternalMediaUrl(
        "photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80",
      ),
    ).toBe(
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80",
    );
  });
});

describe("resolvePageMediaAssets external previews", () => {
  it("returns image external assets for Unsplash src URLs", async () => {
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: {
            src: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80",
            alt: "Team",
          },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const adapter = {
      constructor: { name: "SQLiteStorageAdapter" },
      getComponentDSL: async () => null,
      listMedia: async () => [],
    } as unknown as StorageAdapter;

    const output = GetPageMediaOutputSchema.parse(
      await resolvePageMediaAssets(page, adapter, null),
    );

    expect(output.external).toHaveLength(1);
    expect(output.external[0]?.type).toBe("image");
    expect(output.external[0]?.url).toMatch(
      /^https:\/\/images\.unsplash\.com\//,
    );
  });
});

describe("extractHttpUrlsFromText", () => {
  it("extracts URLs from Tailwind bg url classes", () => {
    const urls = extractHttpUrlsFromText(
      "bg-[url('https://images.unsplash.com/photo-1462917882517-e150004895fa?q=80')]",
    );

    expect(urls).toEqual([
      "https://images.unsplash.com/photo-1462917882517-e150004895fa?q=80",
    ]);
  });
});

describe("isLikelyExternalImageReference", () => {
  it("detects image props on nodes without extensions", () => {
    expect(
      isLikelyExternalImageReference({
        rawUrl: "https://cdn.example.com/assets/team-photo",
        refPath: "nodes[0].props.src",
      }),
    ).toBe(true);
  });
});
