import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  getTransformState: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: { media: actionMocks },
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useComposerMediaVariants } from "../../admin/features/Inspector/composables/useComposerMediaVariants";

const timestamp = "2026-07-14T14:00:00.000Z";
const asset = {
  id: "/uploads/hero.jpg",
  mediaId: "media-hero",
  name: "hero.jpg",
  type: "image" as const,
  url: "/uploads/hero.jpg",
  deliveryUrl: "/uploads/hero.jpg",
  size: 1_024,
  dimensions: { width: 2_400, height: 1_600 },
};
const profile = {
  assetPath: asset.url,
  currentSourceVersion: 2,
  altText: null,
  title: null,
  caption: null,
  credit: null,
  copyright: null,
  focalPoint: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const variant = {
  id: "hero-wide",
  assetPath: asset.url,
  name: "Wide",
  sourceVersion: 1,
  crop: { x: 0, y: 0.2, width: 1, height: 0.5 },
  focalPoint: null,
  aspectRatio: { width: 16, height: 9 },
  output: { width: 1_600, height: 900, format: "webp" as const, quality: 90 },
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("useComposerMediaVariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.getTransformState.mockResolvedValue({
      data: {
        profile,
        sourceVersions: [
          {
            assetPath: asset.url,
            version: 2,
            objectKey: "source-v2.jpg",
            mimeType: "image/jpeg",
            sizeBytes: asset.size,
            width: 2_400,
            height: 1_600,
            checksumSha256: null,
            createdAt: timestamp,
          },
        ],
        variants: [variant],
      },
      error: undefined,
    });
  });

  it("keeps original selections stable and pins variants to their revision", async () => {
    const media = useComposerMediaVariants();
    await media.loadForAsset(asset);

    expect(media.selectVariant(null)).toEqual({
      url: "/media/source/current/hero.jpg",
      reference: { mediaId: asset.mediaId, variantId: null },
      width: 2_400,
      height: 1_600,
      supportsResponsiveDelivery: true,
    });
    expect(media.selectVariant(variant.id)).toEqual({
      url: "/media/transform/hero-wide/1-20260714140000000",
      reference: { mediaId: asset.mediaId, variantId: variant.id },
      width: 1_600,
      height: 900,
      supportsResponsiveDelivery: true,
    });
    expect(media.isStaleVariant.value).toBe(true);
  });

  it("keeps legacy oversized originals on raw delivery", async () => {
    const media = useComposerMediaVariants();
    await media.loadForAsset({ ...asset, size: 21 * 1024 * 1024 });

    expect(media.selectVariant(null)?.supportsResponsiveDelivery).toBe(false);
  });

  it("hydrates a persisted selection by catalog media id", async () => {
    const media = useComposerMediaVariants();
    await media.hydrate({ mediaId: asset.mediaId, variantId: variant.id }, [
      asset,
    ]);

    expect(media.asset.value).toEqual(asset);
    expect(media.selectedVariantId.value).toBe(variant.id);
  });
});
