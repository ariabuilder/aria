import { describe, expect, it, vi } from "vitest";
import {
  resolveUploadsR2ObjectKey,
  serveUploadsFromR2Binding,
} from "../../../src/middleware/serveUploadsFromR2";

describe("serveUploadsFromR2", () => {
  it("extracts object keys from /uploads paths", () => {
    expect(resolveUploadsR2ObjectKey("/uploads/gallery/hero.jpg")).toBe(
      "gallery/hero.jpg",
    );
    expect(resolveUploadsR2ObjectKey("/uploads/")).toBeNull();
    expect(resolveUploadsR2ObjectKey("/admin/media")).toBeNull();
  });

  it("returns a response when the R2 object exists", async () => {
    const get = vi.fn(async () => ({
      body: new ReadableStream(),
      httpEtag: '"etag-1"',
      uploaded: new Date("2026-02-25T00:00:00.000Z"),
      httpMetadata: { contentType: "image/jpeg" },
    }));

    const response = await serveUploadsFromR2Binding({
      requestUrl: "http://localhost:4321/uploads/gallery/hero.jpg",
      bucket: { get },
    });

    expect(get).toHaveBeenCalledWith("gallery/hero.jpg");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response?.headers.get("ETag")).toBe('"etag-1"');
    expect(response?.headers.get("Last-Modified")).toBe(
      "Wed, 25 Feb 2026 00:00:00 GMT",
    );
    expect(response?.headers.get("Cache-Control")).toBe(
      "private, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("returns 304 when the browser already has the current object", async () => {
    const get = vi.fn(async () => ({
      body: new ReadableStream(),
      httpEtag: '"etag-1"',
      uploaded: new Date("2026-02-25T00:00:00.000Z"),
      httpMetadata: { contentType: "image/jpeg" },
    }));

    const response = await serveUploadsFromR2Binding({
      requestUrl: "http://localhost:4321/uploads/gallery/hero.jpg",
      requestHeaders: new Headers({ "If-None-Match": '"etag-1"' }),
      bucket: { get },
    });

    expect(response?.status).toBe(304);
    expect(response?.headers.get("ETag")).toBe('"etag-1"');
    expect(response?.headers.get("Cache-Control")).toBe(
      "private, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("returns null when the object is missing", async () => {
    const response = await serveUploadsFromR2Binding({
      requestUrl: "http://localhost:4321/uploads/missing.jpg",
      bucket: {
        get: vi.fn(async () => null),
      },
    });

    expect(response).toBeNull();
  });
});
