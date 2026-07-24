import { describe, expect, it } from "vitest";

import {
  buildMediaSourceVersionObjectKey,
  inspectImageSource,
} from "../../lib/media/transforms/sourceInspection";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("media source inspection", () => {
  it("reads deterministic PNG dimensions from bytes", () => {
    expect(inspectImageSource(png(2400, 1600))).toEqual({
      mimeType: "image/png",
      width: 2400,
      height: 1600,
    });
  });

  it("reads GIF and WebP dimensions without a runtime dependency", () => {
    const gif = new Uint8Array([
      ...Buffer.from("GIF89a"),
      0x20,
      0x03,
      0x58,
      0x02,
    ]);
    expect(inspectImageSource(gif)).toMatchObject({ width: 800, height: 600 });

    const webp = new Uint8Array(30);
    webp.set(Buffer.from("RIFF"), 0);
    webp.set(Buffer.from("WEBP"), 8);
    webp.set(Buffer.from("VP8X"), 12);
    webp.set([0x7f, 0x02, 0x00], 24);
    webp.set([0xdf, 0x01, 0x00], 27);
    expect(inspectImageSource(webp)).toEqual({
      mimeType: "image/webp",
      width: 640,
      height: 480,
    });
  });

  it("rejects spoofed or unsupported bytes", () => {
    expect(() => inspectImageSource(Buffer.from("not-an-image"))).toThrow(
      "not a supported",
    );
  });

  it("builds stable non-listable immutable source keys", () => {
    const input = {
      assetPath: "/uploads/gallery/hero.png",
      version: 2,
      checksumSha256: "a".repeat(64),
      mimeType: "image/png" as const,
    };
    expect(buildMediaSourceVersionObjectKey(input)).toMatch(
      /^_aria-media\/source-versions\/[a-f0-9]{24}\/v2-a{16}\.png$/,
    );
    expect(buildMediaSourceVersionObjectKey(input)).toBe(
      buildMediaSourceVersionObjectKey(input),
    );
  });
});
