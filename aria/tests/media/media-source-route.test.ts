import { beforeEach, describe, expect, it, vi } from "vitest";

const adapter = vi.hoisted(() => ({
  getMediaTransformState: vi.fn(),
  getMedia: vi.fn(),
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => adapter),
}));

import { GET } from "../../../src/pages/media/source/[...parts]";

function context(
  parts: string,
  search = "",
  locals: Record<string, unknown> = {},
) {
  return {
    params: { parts },
    request: new Request(`http://localhost/media/source/${parts}${search}`),
    locals,
  } as never;
}

describe("managed media source route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapter.getMediaTransformState.mockResolvedValue({
      profile: { currentSourceVersion: 2 },
      sourceVersions: [
        {
          version: 2,
          objectKey: "_aria-media/source-versions/hero-v2.jpg",
          mimeType: "image/jpeg",
          width: 2_400,
          height: 1_600,
        },
      ],
      variants: [],
    });
    adapter.getMedia.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("redirects the stable current pointer without caching it", async () => {
    const response = await GET(context("current/gallery/hero.jpg"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/media/source/2/gallery/hero.jpg",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(adapter.getMedia).not.toHaveBeenCalled();
  });

  it("falls back to source history for pre-profile uploads", async () => {
    adapter.getMediaTransformState.mockResolvedValue({
      profile: null,
      sourceVersions: [
        {
          version: 1,
          objectKey: "source-v1.jpg",
          mimeType: "image/jpeg",
          width: 1_200,
          height: 800,
        },
      ],
      variants: [],
    });

    const response = await GET(context("current/hero.jpg"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/media/source/1/hero.jpg");
  });

  it("preserves a validated derivative width through the current pointer", async () => {
    const response = await GET(
      context("current/gallery/hero.jpg", "?width=960"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/media/source/2/gallery/hero.jpg?width=960",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unsupported and upscaled derivative widths", async () => {
    const unsupported = await GET(
      context("current/gallery/hero.jpg", "?width=1000"),
    );
    const upscaled = await GET(
      context("current/gallery/hero.jpg", "?width=2560"),
    );

    expect(unsupported.status).toBe(404);
    expect(upscaled.status).toBe(404);
    expect(adapter.getMedia).not.toHaveBeenCalled();
  });

  it("renders a responsive derivative in local SQLite mode", async () => {
    const moduleName = "sharp";
    const { default: sharp } = await import(/* @vite-ignore */ moduleName);
    const source = await sharp({
      create: {
        width: 800,
        height: 400,
        channels: 4,
        background: { r: 24, g: 96, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    adapter.getMediaTransformState.mockResolvedValue({
      profile: { currentSourceVersion: 2 },
      sourceVersions: [
        {
          version: 2,
          objectKey: "source-v2.png",
          mimeType: "image/png",
          width: 800,
          height: 400,
        },
      ],
      variants: [],
    });
    adapter.getMedia.mockResolvedValue(source);

    const response = await GET(context("2/hero.png", "?width=640"));
    const metadata = await sharp(await response.arrayBuffer()).metadata();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("vary")).toBe("Accept");
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(320);
  });

  it("renders the same derivative contract through Cloudflare Images", async () => {
    const transformer = {
      transform: vi.fn(() => transformer),
      output: vi.fn(async () => ({
        response: () =>
          new Response("cloudflare-image", {
            headers: { "Content-Type": "image/webp" },
          }),
      })),
    };
    const images = { input: vi.fn(() => transformer) };

    const response = await GET(
      context("2/gallery/hero.jpg", "?width=640", {
        cfBindings: { aria_images: images },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(images.input).toHaveBeenCalledOnce();
    expect(transformer.transform).toHaveBeenCalledWith({
      trim: { top: 0, left: 0, right: 0, bottom: 0 },
    });
    expect(transformer.transform).toHaveBeenCalledWith({
      width: 640,
      fit: "scale-down",
    });
  });

  it("serves only the promoted immutable source version", async () => {
    const current = await GET(context("2/gallery/hero.jpg"));
    const stale = await GET(context("1/gallery/hero.jpg"));

    expect(current.status).toBe(200);
    expect(current.headers.get("cache-control")).toContain("immutable");
    expect(adapter.getMedia).toHaveBeenCalledWith(
      "_aria-media/source-versions/hero-v2.jpg",
    );
    expect(stale.status).toBe(404);
    expect(stale.headers.get("cache-control")).toBe("no-store");
  });
});
