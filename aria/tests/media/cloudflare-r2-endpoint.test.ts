import { describe, expect, it, vi } from "vitest";
import { CloudflareR2Endpoint } from "../../lib/media/endpoints/cloudflare-r2";

describe("CloudflareR2Endpoint", () => {
  it("does not pass sha256 option to bucket.put", async () => {
    const put = vi.fn(async () => ({
      key: "hero.jpg",
      size: 4,
      etag: "etag-1",
      uploaded: new Date("2026-02-25T00:00:00.000Z"),
      checksums: {},
      httpMetadata: { contentType: "image/jpeg" },
    }));

    const endpoint = new CloudflareR2Endpoint({
      bucket: {
        head: vi.fn(async () => null),
        list: vi.fn(async () => ({ objects: [], truncated: false })),
        put,
        get: vi.fn(async () => null),
        delete: vi.fn(async () => undefined),
      },
    });

    await endpoint.put("hero.jpg", Buffer.from("test"), {
      mimeType: "image/jpeg",
    });

    const firstCall = put.mock.calls[0] as unknown as
      | [
          string,
          Uint8Array,
          { httpMetadata?: { contentType?: string; cacheControl?: string } }?,
        ]
      | undefined;
    const payload = firstCall?.[1];
    const options = firstCall?.[2] as
      | { httpMetadata?: { contentType?: string; cacheControl?: string } }
      | undefined;

    expect(payload).toBeInstanceOf(Uint8Array);
    expect(options?.httpMetadata?.contentType).toBe("image/jpeg");
    expect(options?.httpMetadata?.cacheControl).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
    expect(options && "sha256" in options).toBe(false);
  });

  it("sets cache metadata when mime type is unavailable", async () => {
    const put = vi.fn(async () => ({
      key: "asset.bin",
      size: 4,
      etag: "etag-1",
      uploaded: new Date("2026-02-25T00:00:00.000Z"),
      checksums: {},
      httpMetadata: {},
    }));

    const endpoint = new CloudflareR2Endpoint({
      bucket: {
        head: vi.fn(async () => null),
        list: vi.fn(async () => ({ objects: [], truncated: false })),
        put,
        get: vi.fn(async () => null),
        delete: vi.fn(async () => undefined),
      },
    });

    await endpoint.put("asset.bin", Buffer.from("test"));

    const firstCall = put.mock.calls[0] as unknown as
      | [
          string,
          Uint8Array,
          { httpMetadata?: { contentType?: string; cacheControl?: string } }?,
        ]
      | undefined;

    expect(firstCall?.[2]?.httpMetadata?.contentType).toBeUndefined();
    expect(firstCall?.[2]?.httpMetadata?.cacheControl).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });
});
