import { describe, expect, it, vi } from "vitest";
import {
  collectComposerVariantReferences,
  readComposerNodeMediaReferences,
  readComposerResponsiveImage,
  transformComposerMediaReferencesForAsset,
  withComposerBackgroundReference,
  withComposerImageReference,
} from "../../lib/media/composerReference";
import { findComposerVariantUsage } from "../../lib/media/transforms/composerUsage";
import type { StorageAdapter } from "../../lib/storage/adapter";

const mediaId = "media-123";
const variantId = "variant-wide";

function composerPage() {
  return {
    id: "home",
    title: "Home",
    slug: "home",
    nodes: [
      {
        id: "image",
        type: "Image",
        props: { src: "/media/transform/variant-wide/1-recipe" },
        styles: {},
        children: [],
        metadata: {
          mediaReferences: {
            image: { mediaId, variantId },
          },
        },
      },
      {
        id: "hero",
        type: "Container",
        props: {},
        styles: {
          backgroundImage: {
            base: 'url("/uploads/hero.jpg")',
            mobile: 'url("/media/transform/variant-wide/1-recipe")',
          },
        },
        children: [],
        metadata: {
          mediaReferences: {
            background: {
              base: { mediaId, variantId: null },
              mobile: { mediaId, variantId },
            },
          },
        },
      },
    ],
  };
}

describe("composer media references", () => {
  it("updates image and responsive background ownership without discarding metadata", () => {
    let metadata = withComposerImageReference(
      { label: "Hero" },
      { mediaId, variantId },
    );
    metadata = withComposerBackgroundReference(metadata, "mobile", {
      mediaId,
      variantId: null,
    });

    expect(metadata?.label).toBe("Hero");
    expect(readComposerNodeMediaReferences(metadata)).toEqual({
      image: { mediaId, variantId },
      background: { mobile: { mediaId, variantId: null } },
    });
  });

  it("collects variant placements and scrubs their rendered values with the source", () => {
    const page = composerPage();
    expect(collectComposerVariantReferences(page)).toHaveLength(2);

    const result = transformComposerMediaReferencesForAsset(page, {
      mediaId,
      mode: "scrub",
    });
    const next = result.resource as ReturnType<typeof composerPage>;

    expect(result.updatedCount).toBe(3);
    expect(next.nodes[0]?.props.src).toBe("");
    expect(next.nodes[1]?.styles.backgroundImage).toBeUndefined();
    expect(
      readComposerNodeMediaReferences(next.nodes[0]?.metadata).image,
    ).toBeUndefined();
    expect(
      readComposerNodeMediaReferences(next.nodes[1]?.metadata).background,
    ).toBeUndefined();
  });

  it("migrates original delivery values while keeping variant URLs pinned", () => {
    const result = transformComposerMediaReferencesForAsset(composerPage(), {
      mediaId,
      mode: "migrate",
      newLogicalPath: "/uploads/renamed.jpg",
    });
    const next = result.resource as ReturnType<typeof composerPage>;

    expect(result.updatedCount).toBe(1);
    expect(next.nodes[0]?.props.src).toContain("/media/transform/");
    expect(next.nodes[1]?.styles.backgroundImage).toEqual({
      base: 'url("/media/source/current/renamed.jpg")',
      mobile: 'url("/media/transform/variant-wide/1-recipe")',
    });
  });

  it("tracks, migrates, and scrubs responsive image source ownership", () => {
    const page = composerPage();
    const imageMetadata = page.nodes[0]!.metadata as Record<string, unknown>;
    imageMetadata.responsiveImage = {
      sizes: "100vw",
      default: {
        url: "/media/source/current/hero.jpg",
        reference: { mediaId, variantId: null },
        width: 2_400,
        height: 1_600,
      },
      sources: {
        mobile: {
          url: "/media/transform/variant-wide/1-recipe",
          reference: { mediaId, variantId },
          width: 640,
          height: 800,
        },
      },
    };

    expect(collectComposerVariantReferences(page)).toHaveLength(3);
    const migrated = transformComposerMediaReferencesForAsset(page, {
      mediaId,
      mode: "migrate",
      newLogicalPath: "/uploads/renamed.jpg",
    });
    const migratedPage = migrated.resource as ReturnType<typeof composerPage>;
    expect(
      readComposerResponsiveImage(migratedPage.nodes[0]?.metadata)?.default.url,
    ).toBe("/media/source/current/renamed.jpg");
    expect(
      readComposerResponsiveImage(migratedPage.nodes[0]?.metadata)?.sources
        .mobile?.url,
    ).toBe("/media/transform/variant-wide/1-recipe");

    const scrubbed = transformComposerMediaReferencesForAsset(page, {
      mediaId,
      mode: "scrub",
    });
    const scrubbedPage = scrubbed.resource as ReturnType<typeof composerPage>;
    expect(
      readComposerResponsiveImage(scrubbedPage.nodes[0]?.metadata),
    ).toBeUndefined();
  });

  it("finds draft and published usages before recipe mutation", async () => {
    const page = composerPage();
    const adapter = {
      listPagesDSL: vi.fn(async () => [
        {
          id: "home",
          slug: "home",
          title: "Home",
          status: "draft",
          isModifiedSincePublish: false,
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
        },
      ]),
      getPageDSL: vi.fn(async () => page),
      getPublishedPageDSL: vi.fn(async () => page),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getDesignSystem: vi.fn(async () => null),
      listPageLocaleRecords: vi.fn(async () => []),
      listLayoutLocaleRecords: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const usages = await findComposerVariantUsage(adapter, variantId);
    expect(usages).toHaveLength(4);
    expect(new Set(usages.map((usage) => usage.kind))).toEqual(
      new Set(["page", "published-page"]),
    );
  });
});
