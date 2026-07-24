import { describe, expect, it, vi } from "vitest";

import {
  cropToPixels,
  buildCurrentMediaSourceUrl,
  buildMediaSourceUrl,
  buildMediaTransformRevision,
  buildMediaTransformUrl,
  resolveCurrentMediaSourceVersion,
  resolveMediaTransformSourceObjectKey,
  renderWithCloudflareImages,
  renderWithLocalImageRuntime,
  resolveMediaOutputFormat,
  type RuntimeImagesBinding,
} from "../../lib/media/transforms/render";
import { MediaTransformOutputSchema } from "../../lib/media/transforms/schemas";
import {
  buildResponsiveDerivativeUrl,
  buildResponsiveSrcSet,
  resolveResponsiveDerivativeWidth,
} from "../../lib/media/transforms/responsive";

describe("media transform rendering", () => {
  it("builds versioned source and recipe URLs", () => {
    expect(
      buildCurrentMediaSourceUrl({
        assetPath: "/uploads/gallery/hero image.jpg",
      }),
    ).toBe("/media/source/current/gallery/hero%20image.jpg");
    expect(
      buildMediaSourceUrl({
        assetPath: "/uploads/gallery/hero image.jpg",
        sourceVersion: 3,
      }),
    ).toBe("/media/source/3/gallery/hero%20image.jpg");
    const revision = buildMediaTransformRevision({
      sourceVersion: 2,
      updatedAt: "2026-07-14T12:34:56.789Z",
    });
    expect(revision).toBe("2-20260714123456789");
    expect(
      buildMediaTransformUrl({
        id: "wide hero",
        sourceVersion: 2,
        updatedAt: "2026-07-14T12:34:56.789Z",
      }),
    ).toBe(`/media/transform/wide%20hero/${revision}`);
  });

  it("resolves current source pointers for profiled and legacy assets", () => {
    expect(
      resolveCurrentMediaSourceVersion({
        profile: { currentSourceVersion: 2 },
        sourceVersions: [{ version: 1 }, { version: 3 }],
      }),
    ).toBe(2);
    expect(
      resolveCurrentMediaSourceVersion({
        profile: null,
        sourceVersions: [{ version: 1 }, { version: 3 }, { version: 2 }],
      }),
    ).toBe(3);
  });

  it("defaults new transform output to full quality", () => {
    expect(
      MediaTransformOutputSchema.parse({
        width: 1600,
        height: 900,
        format: "webp",
      }).quality,
    ).toBe(100);
  });

  it("builds only bounded managed responsive derivatives", () => {
    expect(resolveResponsiveDerivativeWidth("960", 1_600)).toBe(960);
    expect(resolveResponsiveDerivativeWidth("1000", 1_600)).toBeNull();
    expect(resolveResponsiveDerivativeWidth("1920", 1_600)).toBeNull();
    expect(
      buildResponsiveDerivativeUrl("/media/transform/wide/1-revision", 640),
    ).toBe("/media/transform/wide/1-revision/640");
    expect(
      buildResponsiveDerivativeUrl("/media/source/current/hero.jpg", 640),
    ).toBe("/media/source/current/hero.jpg?width=640");
    expect(
      buildResponsiveSrcSet({
        url: "/media/transform/wide/1-revision",
        maxWidth: 1_600,
      }),
    ).toContain("/media/transform/wide/1-revision/960 960w");
    expect(
      buildResponsiveSrcSet({
        url: "https://example.com/hero.jpg",
        maxWidth: 1_600,
      }),
    ).toBeNull();
    expect(
      buildResponsiveSrcSet({
        url: "/media/source/current/legacy-large.jpg",
        maxWidth: 3_000,
        allowDerivatives: false,
      }),
    ).toBe("/media/source/current/legacy-large.jpg 3000w");
  });

  it("resolves legacy logical asset paths to storage object keys", () => {
    expect(
      resolveMediaTransformSourceObjectKey("/uploads/photos/hero.jpg"),
    ).toBe("photos/hero.jpg");
    expect(
      resolveMediaTransformSourceObjectKey(
        "/uploads/photos/hero.jpg",
        "source-versions/hero-v2.jpg",
      ),
    ).toBe("source-versions/hero-v2.jpg");
  });
  it("turns normalized crop geometry into bounded source pixels", () => {
    expect(
      cropToPixels({ x: 0.1, y: 0.2, width: 0.75, height: 0.5 }, 2400, 1600),
    ).toEqual({ left: 240, top: 320, width: 1800, height: 800 });
  });

  it("negotiates auto format without converting transparent PNGs to JPEG", () => {
    expect(
      resolveMediaOutputFormat("auto", "image/avif,image/webp", null),
    ).toBe("avif");
    expect(resolveMediaOutputFormat("auto", "image/webp", null)).toBe("webp");
    expect(resolveMediaOutputFormat("auto", "image/jpeg", "image/png")).toBe(
      "png",
    );
  });

  it("sends the same exact crop fractions to the Cloudflare binding", async () => {
    const calls: unknown[] = [];
    const transformer = {
      transform(options: unknown) {
        calls.push(options);
        return transformer;
      },
      async output(options: unknown) {
        calls.push(options);
        return {
          response: () =>
            new Response("image", {
              headers: { "Content-Type": "image/webp" },
            }),
        };
      },
    };
    const images = {
      input: vi.fn(() => transformer),
    } as unknown as RuntimeImagesBinding;

    await renderWithCloudflareImages(images, {
      source: new Uint8Array([1, 2, 3]),
      crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.5 },
      output: { width: 1200, height: 800, format: "webp", quality: 82 },
    });

    expect(calls).toEqual([
      {
        trim: {
          top: 0.2,
          left: 0.1,
          right: 0.2,
          bottom: 0.3,
        },
      },
      { width: 1200, height: 800, fit: "scale-down" },
      { format: "image/webp", quality: 82, anim: false },
    ]);
  });

  it("renders a real local transform through Astro's Node image runtime", async () => {
    const moduleName = "sharp";
    const { default: sharp } = await import(/* @vite-ignore */ moduleName);
    const source = await sharp({
      create: {
        width: 8,
        height: 4,
        channels: 4,
        background: { r: 30, g: 120, b: 220, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const rendered = await renderWithLocalImageRuntime({
      source,
      sourceMimeType: "image/png",
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      output: { width: 4, height: 4, format: "webp", quality: 80 },
    });
    const metadata = await sharp(rendered.bytes).metadata();

    expect(rendered.contentType).toBe("image/webp");
    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(4);
  });
});
