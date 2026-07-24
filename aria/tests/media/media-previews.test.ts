import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleThumbnailError } from "../../admin/features/Studio/media/utils/media-previews";

describe("media preview fallbacks", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back from thumbnail to delivery to original URL", () => {
    const img = document.createElement("img");
    const thumbnailPath =
      "/cdn-cgi/image/width=320,quality=82,format=auto/uploads/missing.jpg";
    img.src = `${window.location.origin}${thumbnailPath}`;

    const asset = {
      id: "1",
      name: "missing.jpg",
      type: "image" as const,
      url: "/uploads/missing.jpg",
      deliveryUrl:
        "/cdn-cgi/image/width=1600,quality=85,format=auto/uploads/missing.jpg",
      thumbnailUrl: thumbnailPath,
      size: 10,
    };

    handleThumbnailError({ target: img } as unknown as Event, asset);
    expect(img.src).toBe(
      `${window.location.origin}/cdn-cgi/image/width=1600,quality=85,format=auto/uploads/missing.jpg`,
    );
    expect(img.dataset.previewFallbackAttempted).toBe("partial");

    handleThumbnailError({ target: img } as unknown as Event, asset);
    expect(img.src).toBe(`${window.location.origin}/uploads/missing.jpg`);
    expect(img.dataset.previewFallbackAttempted).toBe("true");

    handleThumbnailError({ target: img } as unknown as Event, asset);

    expect(img.src).toBe(`${window.location.origin}/uploads/missing.jpg`);
    expect(img.dataset.previewFallbackAttempted).toBe("true");
  });

  it("does not retry when already at fallback URL", () => {
    const img = document.createElement("img");
    img.src = `${window.location.origin}/uploads/existing.jpg`;

    const asset = {
      id: "2",
      name: "existing.jpg",
      type: "image" as const,
      url: "/uploads/existing.jpg",
      size: 10,
    };

    handleThumbnailError({ target: img } as unknown as Event, asset);

    expect(img.dataset.previewFallbackAttempted).toBeUndefined();
    expect(img.src).toBe(`${window.location.origin}/uploads/existing.jpg`);
  });
});
