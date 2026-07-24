import { describe, expect, it, vi } from "vitest";
import type { ComponentDSL, PageDSL } from "../../lib/types/nodes";
import type { StorageAdapter } from "../../lib/storage/adapter";
import { resolvePageMediaAssets } from "../../lib/media/catalog/resolvePageMediaAssets";
import { GetPageMediaOutputSchema } from "../../lib/schemas/pageMedia";
import { collectComponentReferenceIds } from "../../lib/blocks/nodeUtils";
import { collectPageMediaReferences } from "../../lib/media/catalog/collectPageMediaReferences";
import {
  inferMediaTypeForReference,
  isRemoteImagePreviewUrl,
} from "../../lib/media/utils/mediaType";

describe("inferMediaTypeForReference", () => {
  it("uses the raw URL extension for external Supabase images", () => {
    const type = inferMediaTypeForReference({
      rawUrl:
        "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/hero_1600w.jpg",
      logicalPath: "/uploads/storage/v1/object/public/assets/hero_1600w.jpg",
      refPath: "nodes[0].props.src",
    });

    expect(type).toBe("image");
    expect(
      isRemoteImagePreviewUrl(
        "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/hero_1600w.jpg",
      ),
    ).toBe(true);
  });

  it("classifies external CDN video URLs as video", () => {
    const type = inferMediaTypeForReference({
      rawUrl: "https://cdn.example.com/intro.mp4",
      logicalPath: "/uploads/intro.mp4",
      refPath: "nodes[0].props.src",
    });

    expect(type).toBe("video");
  });

  it("classifies Unsplash URLs without file extensions as image", () => {
    const rawUrl =
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80";

    const type = inferMediaTypeForReference({
      rawUrl,
      logicalPath: "/uploads/photo-1560250097-0b93528c311a",
      refPath: "nodes[2].props.src",
    });

    expect(type).toBe("image");
    expect(isRemoteImagePreviewUrl(rawUrl)).toBe(true);
  });
});

describe("collectComponentReferenceIds", () => {
  it("collects reference.id, props.componentId, and componentRef", () => {
    const ids = collectComponentReferenceIds([
      {
        id: "n1",
        type: "Component",
        props: { componentId: "hero-block" },
        styles: {},
        children: [],
        customClasses: [],
        reference: { type: "instance", masterId: "hero-block" },
      },
      {
        id: "n2",
        type: "Container",
        props: {},
        styles: {},
        children: [],
        customClasses: [],
        componentRef: "footer-block",
      },
    ]);

    expect(ids.sort()).toEqual(["footer-block", "hero-block"].sort());
  });
});

describe("collectPageMediaReferences", () => {
  it("includes media from nested component DSL", async () => {
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Component",
          props: { componentId: "comp-a" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const componentDsl: ComponentDSL = {
      id: "comp-a",
      name: "comp-a",
      title: "Comp A",
      nodes: [
        {
          id: "img1",
          type: "Image",
          props: { src: "/uploads/inside-component.jpg", alt: "x" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const getComponentDSL = vi.fn(async (id: string) => {
      if (id === "comp-a") {
        return componentDsl;
      }
      return null;
    });

    const result = await collectPageMediaReferences(page, getComponentDSL);

    expect(
      result.references.some(
        (ref) => ref.logicalPath === "/uploads/inside-component.jpg",
      ),
    ).toBe(true);
  });

  it("terminates on circular component references", async () => {
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Component",
          props: { componentId: "comp-a" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const compA: ComponentDSL = {
      id: "comp-a",
      name: "comp-a",
      title: "A",
      nodes: [
        {
          id: "n2",
          type: "Component",
          props: { componentId: "comp-b" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const compB: ComponentDSL = {
      id: "comp-b",
      name: "comp-b",
      title: "B",
      nodes: [
        {
          id: "n3",
          type: "Component",
          props: { componentId: "comp-a" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const getComponentDSL = vi.fn(async (id: string) => {
      if (id === "comp-a") return compA;
      if (id === "comp-b") return compB;
      return null;
    });

    const result = await collectPageMediaReferences(page, getComponentDSL);

    expect(getComponentDSL).toHaveBeenCalled();
    expect(result.missingComponents).toEqual([]);
  });
});

describe("resolvePageMediaAssets", () => {
  it("resolves bare Unsplash src paths as external image assets", async () => {
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: {
            src: "photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80",
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
      getComponentDSL: vi.fn(async () => null),
      listMedia: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const output = GetPageMediaOutputSchema.parse(
      await resolvePageMediaAssets(page, adapter, null),
    );

    expect(output.external).toHaveLength(1);
    expect(output.external[0]?.type).toBe("image");
    expect(output.external[0]?.url).toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  it("classifies external CDN URLs as external when not in catalog", async () => {
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Video",
          props: {
            src: "https://cdn.example.com/intro.mp4",
            poster: "/uploads/poster.png",
          },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const adapter = {
      constructor: { name: "SQLiteStorageAdapter" },
      getComponentDSL: vi.fn(async () => null),
      listMedia: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const output = await resolvePageMediaAssets(
      page,
      adapter,
      null,
    );

    const parsed = GetPageMediaOutputSchema.parse(output);

    expect(parsed.external).toHaveLength(1);
    expect(parsed.external[0]?.rawUrl).toBe("https://cdn.example.com/intro.mp4");
    expect(
      parsed.missing.some((item) => item.logicalPath === "/uploads/intro.mp4"),
    ).toBe(false);
  });

  it("resolves library paths from local listMedia", async () => {
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: { src: "/uploads/hero.jpg", alt: "Hero" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const adapter = {
      constructor: { name: "SQLiteStorageAdapter" },
      getComponentDSL: vi.fn(async () => null),
      listMedia: vi.fn(async () => [
        {
          path: "hero.jpg",
          url: "/uploads/hero.jpg",
          size: 1200,
          contentType: "image/jpeg",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ]),
    } as unknown as StorageAdapter;

    const output = await resolvePageMediaAssets(page, adapter, null);
    const parsed = GetPageMediaOutputSchema.parse(output);

    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]?.url).toBe("/uploads/hero.jpg");
    expect(parsed.assets[0]?.source).toBe("library");
  });

  it("resolves root-relative build artifact src as external, not missing library", async () => {
    const rawUrl = "/_astro/hero.DlKDY3ml_Z1MqY6c.png";
    const page: PageDSL = {
      id: "p1",
      title: "Test",
      slug: "test",
      nodes: [
        {
          id: "n1",
          type: "Image",
          props: { src: rawUrl, alt: "Hero" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
    };

    const adapter = {
      constructor: { name: "SQLiteStorageAdapter" },
      getComponentDSL: vi.fn(async () => null),
      listMedia: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const parsed = GetPageMediaOutputSchema.parse(
      await resolvePageMediaAssets(page, adapter, null),
    );

    expect(parsed.external).toHaveLength(1);
    expect(parsed.external[0]?.rawUrl).toBe(rawUrl);
    expect(parsed.missing).toHaveLength(0);
  });
});
