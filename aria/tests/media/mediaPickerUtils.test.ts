import { describe, expect, it } from "vitest";

import type { MediaAsset, UploadMediaResult } from "../../admin/features/Studio/media/types/media";
import {
  assetMatchesMediaTypeFilter,
  findUploadedAssetInList,
  getUploadAcceptForMediaType,
} from "../../admin/features/Studio/media/utils/mediaPickerUtils";
import { getMediaTypeFromMimeOrFilename } from "../../lib/media/utils/mediaType";
import { enforceMediaSyncPolicy } from "../../lib/media/utils/policy";

const sampleAsset: MediaAsset = {
  id: "image-1",
  name: "hero.jpg",
  type: "image",
  url: "/uploads/hero.jpg",
  size: 128,
};

describe("mediaPickerUtils", () => {
  it("returns upload accept strings per media type", () => {
    expect(getUploadAcceptForMediaType("image")).toBe("image/*");
    expect(getUploadAcceptForMediaType("video")).toBe("video/*");
    expect(getUploadAcceptForMediaType("icon")).toBe("image/svg+xml,.svg,.ico");
    expect(getUploadAcceptForMediaType(["image", "icon"])).toBe(
      "image/*,image/svg+xml,.svg,.ico",
    );
    expect(getUploadAcceptForMediaType(undefined)).toContain("image/*");
  });

  it("matches assets against optional media type filters", () => {
    expect(assetMatchesMediaTypeFilter(sampleAsset, "image")).toBe(true);
    expect(assetMatchesMediaTypeFilter(sampleAsset, "video")).toBe(false);
    expect(assetMatchesMediaTypeFilter(sampleAsset, undefined)).toBe(true);
    expect(
      assetMatchesMediaTypeFilter(
        { ...sampleAsset, name: "favicon.ico", type: "icon" },
        ["image", "icon"],
      ),
    ).toBe(true);
  });

  it("infers an image when the asset type is stale but its filename is an image", () => {
    expect(
      assetMatchesMediaTypeFilter(
        {
          ...sampleAsset,
          type: "other",
          mimeType: "application/octet-stream",
        },
        "image",
      ),
    ).toBe(true);
  });

  it("falls back to the filename when stored MIME metadata is generic", () => {
    expect(
      getMediaTypeFromMimeOrFilename(
        "application/octet-stream",
        "slo-background3-d42191.webp",
      ),
    ).toBe("image");
  });

  it("recognizes and permits ICO favicon assets", () => {
    expect(
      getMediaTypeFromMimeOrFilename("application/octet-stream", "favicon.ico"),
    ).toBe("icon");
    expect(() =>
      enforceMediaSyncPolicy({ logicalPath: "/uploads/favicon.ico" }),
    ).not.toThrow();
  });

  it("finds uploaded assets in a parsed list", () => {
    const upload: UploadMediaResult = {
      success: true,
      url: "/uploads/hero.jpg",
      publicUrl: "/uploads/hero.jpg",
      name: "hero.jpg",
      size: 128,
      type: "image",
      endpointId: "local-fs",
    };

    expect(findUploadedAssetInList([sampleAsset], upload)).toEqual(sampleAsset);
    expect(
      findUploadedAssetInList([], upload),
    ).toBeNull();
  });
});
