import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";

describe("CloudflareStorageAdapter media URL fallback", () => {
  it("lists local uploads alongside R2 objects during development", async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-media-"));
    try {
      await fs.writeFile(path.join(uploadDir, "local-cover.webp"), "image");
      await fs.writeFile(
        path.join(uploadDir, "local-cover.webp.meta.json"),
        JSON.stringify({ contentType: "image/webp" }),
      );

      const adapter = new CloudflareStorageAdapter({
        localUploadDir: uploadDir,
        aria_r2: {
          list: vi.fn(async () => ({ objects: [], truncated: false })),
        },
      } as any);

      const items = await adapter.listMedia();

      expect(items).toEqual([
        expect.objectContaining({
          path: "local-cover.webp",
          url: "/uploads/local-cover.webp",
          contentType: "image/webp",
        }),
      ]);
    } finally {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });

  it("listMedia falls back to /uploads URLs when R2_PUBLIC_URL is missing", async () => {
    const adapter = new CloudflareStorageAdapter({
      mirrorMediaLocally: false,
      aria_r2: {
        list: vi.fn(async () => ({
          objects: [
            {
              key: "Dude.jpeg",
              size: 123,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
              httpMetadata: { contentType: "image/jpeg" },
            },
          ],
          truncated: false,
        })),
      } as any,
    });

    const items = await adapter.listMedia();

    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe("Dude.jpeg");
    expect(items[0]?.url).toBe("/uploads/Dude.jpeg");
  });

  it("listMedia ignores hidden objects", async () => {
    const adapter = new CloudflareStorageAdapter({
      mirrorMediaLocally: false,
      aria_r2: {
        list: vi.fn(async () => ({
          objects: [
            {
              key: ".DS_Store",
              size: 12,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
            },
            {
              key: "images/.DS_Store",
              size: 12,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
            },
            {
              key: "images/logo.svg",
              size: 123,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
              httpMetadata: { contentType: "image/svg+xml" },
            },
          ],
          truncated: false,
        })),
      } as any,
    });

    const items = await adapter.listMedia();

    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe("images/logo.svg");
  });

  it("listMedia ignores site export objects", async () => {
    const adapter = new CloudflareStorageAdapter({
      mirrorMediaLocally: false,
      aria_r2: {
        list: vi.fn(async () => ({
          objects: [
            {
              key: "_exports/site/export-id/aria-site-export-2026-05-31T12-00-00-000Z.zip",
              size: 4096,
              uploaded: new Date("2026-05-31T00:00:00.000Z"),
              httpMetadata: { contentType: "application/zip" },
            },
            {
              key: "_exports/site/export-id/meta.json",
              size: 256,
              uploaded: new Date("2026-05-31T00:00:00.000Z"),
              httpMetadata: {
                contentType: "application/json; charset=utf-8",
              },
            },
            {
              key: "gallery/logo.svg",
              size: 123,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
              httpMetadata: { contentType: "image/svg+xml" },
            },
          ],
          truncated: false,
        })),
      } as any,
    });

    const items = await adapter.listMedia();

    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe("gallery/logo.svg");
  });

  it("listMedia ignores generated thumbnail objects", async () => {
    const adapter = new CloudflareStorageAdapter({
      mirrorMediaLocally: false,
      aria_r2: {
        list: vi.fn(async () => ({
          objects: [
            {
              key: "thumbnails/page/home/published.webp",
              size: 2048,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
              httpMetadata: { contentType: "image/webp" },
            },
            {
              key: "gallery/logo.svg",
              size: 123,
              uploaded: new Date("2026-02-25T00:00:00.000Z"),
              httpMetadata: { contentType: "image/svg+xml" },
            },
          ],
          truncated: false,
        })),
      } as any,
    });

    const items = await adapter.listMedia();

    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe("gallery/logo.svg");
  });

  it("uploadMedia falls back to /uploads URL when R2_PUBLIC_URL is missing", async () => {
    const put = vi.fn(async () => ({ key: "uploads/photo.jpg" }));
    const adapter = new CloudflareStorageAdapter({
      mirrorMediaLocally: false,
      aria_r2: {
        put,
      } as any,
    });

    const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
    const result = await adapter.uploadMedia(file);

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({
        httpMetadata: {
          contentType: "image/jpeg",
          cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
        },
      }),
    );
    expect(result.startsWith("/uploads/")).toBe(true);
    expect(result.endsWith(".jpg")).toBe(true);
  });
});
