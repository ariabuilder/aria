import { createClient, type Client } from "@libsql/client";
import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { replaceMediaSource } from "../../lib/media/transforms/sourceLifecycle";
import { MediaTransformConflictError } from "../../lib/media/transforms/storage";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createD1Mock } from "../helpers/d1Mock";

let client: Client;

function png(width: number, height: number, marker: number): Buffer {
  const bytes = Buffer.alloc(25);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set(Buffer.from("IHDR"), 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = marker;
  return bytes;
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(
    await fs.readFile(
      path.resolve("aria/migrations/0001_baseline_schema.sql"),
      "utf8",
    ),
  );
  await client.execute({
    sql: `INSERT INTO aria_schema_migrations (id, applied_at) VALUES (?, ?)`,
    args: ["0001_baseline_schema.sql", "2026-07-14T12:00:00.000Z"],
  });
});

afterEach(() => client.close());

const adapterFactories = [
  [
    "SQLite",
    () =>
      new SQLiteStorageAdapter(client, {
        seedStarterLayouts: false,
        seedStarterPages: false,
        seedStarterCms: false,
        seedStarterDesign: false,
        seedStarterSiteSettings: false,
      }),
  ],
  [
    "D1",
    () =>
      new CloudflareStorageAdapter({ aria_db: createD1Mock(client) } as never),
  ],
] as const;

async function setup(createAdapter: (typeof adapterFactories)[number][1]) {
  const adapter = createAdapter();
  const oldSource = png(1200, 800, 1);
  const nextSource = png(1600, 900, 2);
  const bytes = new Map<string, Buffer>([["hero.png", oldSource]]);
  adapter.getMedia = vi.fn(async (key: string) => bytes.get(key) ?? null);
  adapter.saveMedia = vi.fn(async (key: string, source: Buffer) => {
    bytes.set(key, Buffer.from(source));
    return `/uploads/${key}`;
  });
  adapter.deleteMedia = vi.fn(async (key: string) => {
    bytes.delete(key);
  });
  await adapter.registerMediaSourceVersion({
    assetPath: "/uploads/hero.png",
    version: 1,
    objectKey: "hero.png",
    checksumSha256: null,
    mimeType: "image/png",
    sizeBytes: oldSource.byteLength,
    width: null,
    height: null,
    createdAt: "2026-07-14T12:00:00.000Z",
  });
  const profile = await adapter.saveMediaAssetProfile({
    assetPath: "/uploads/hero.png",
    currentSourceVersion: 1,
    altText: "Hero",
    title: null,
    caption: null,
    credit: null,
    copyright: null,
    focalPoint: { x: 0.5, y: 0.5 },
  });
  await adapter.saveMediaTransformVariant({
    id: "hero-wide",
    assetPath: "/uploads/hero.png",
    name: "Wide",
    sourceVersion: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focalPoint: null,
    aspectRatio: { width: 16, height: 9 },
    output: { width: 1600, height: 900, format: "webp", quality: 90 },
  });
  return { adapter, bytes, oldSource, nextSource, profile };
}

describe("media source replacement adapter parity", () => {
  it.each(adapterFactories)(
    "escrows v1, promotes v2, and preserves pinned variants on %s",
    async (_name, createAdapter) => {
      const { adapter, bytes, nextSource, profile } =
        await setup(createAdapter);
      const result = await replaceMediaSource(adapter, {
        assetPath: "/uploads/hero.png",
        source: nextSource,
        endpointId: "local-fs",
        expectedUpdatedAt: profile.updatedAt,
      });

      expect(result).toMatchObject({
        status: "completed",
        promoted: true,
        previousSourceVersion: 1,
        currentSourceVersion: 2,
        variants: { preserved: 1, needsRebase: 1 },
      });
      expect(bytes.get("hero.png")).toEqual(nextSource);
      const state = await adapter.getMediaTransformState("/uploads/hero.png");
      expect(state.profile?.currentSourceVersion).toBe(2);
      expect(state.profile?.altText).toBe("Hero");
      expect(state.sourceVersions).toHaveLength(2);
      expect(
        state.sourceVersions.every((source) =>
          source.objectKey.startsWith("_aria-media/"),
        ),
      ).toBe(true);
      expect(state.variants[0]?.sourceVersion).toBe(1);
      expect(
        bytes.get(
          state.sourceVersions.find((source) => source.version === 1)!
            .objectKey,
        ),
      ).toEqual(png(1200, 800, 1));
    },
  );

  it.each(adapterFactories)(
    "rejects a losing promotion before changing the canonical object on %s",
    async (_name, createAdapter) => {
      const { adapter, bytes, oldSource, nextSource, profile } =
        await setup(createAdapter);
      adapter.promoteMediaSourceVersion = vi.fn(async () => {
        throw new MediaTransformConflictError("simulated conflict");
      });

      await expect(
        replaceMediaSource(adapter, {
          assetPath: "/uploads/hero.png",
          source: nextSource,
          endpointId: "local-fs",
          expectedUpdatedAt: profile.updatedAt,
        }),
      ).rejects.toThrow("simulated conflict");
      expect(bytes.get("hero.png")).toEqual(oldSource);
      expect(
        (await adapter.getMediaTransformState("/uploads/hero.png")).profile
          ?.currentSourceVersion,
      ).toBe(1);
    },
  );

  it.each(adapterFactories)(
    "retries an interrupted canonical projection without creating v3 on %s",
    async (_name, createAdapter) => {
      const { adapter, bytes, oldSource, nextSource, profile } =
        await setup(createAdapter);
      const save = adapter.saveMedia;
      let failCanonical = true;
      adapter.saveMedia = vi.fn(
        async (key: string, source: Buffer, metadata) => {
          if (key === "hero.png" && failCanonical) {
            throw new Error("simulated canonical write failure");
          }
          return save(key, source, metadata);
        },
      );

      const interrupted = await replaceMediaSource(adapter, {
        assetPath: "/uploads/hero.png",
        source: nextSource,
        endpointId: "local-fs",
        expectedUpdatedAt: profile.updatedAt,
      });
      expect(interrupted).toMatchObject({
        status: "incomplete",
        promoted: true,
        currentSourceVersion: 2,
        canonicalUpdated: false,
      });
      expect(bytes.get("hero.png")).toEqual(oldSource);

      failCanonical = false;
      const repaired = await replaceMediaSource(adapter, {
        assetPath: "/uploads/hero.png",
        source: nextSource,
        endpointId: "local-fs",
      });
      expect(repaired).toMatchObject({
        status: "completed",
        promoted: true,
        previousSourceVersion: 2,
        currentSourceVersion: 2,
        canonicalUpdated: true,
      });
      expect(bytes.get("hero.png")).toEqual(nextSource);
      expect(
        (await adapter.getMediaTransformState("/uploads/hero.png"))
          .sourceVersions,
      ).toHaveLength(2);
    },
  );

  it.each(adapterFactories)(
    "reports catalog failure after a successful promotion on %s",
    async (_name, createAdapter) => {
      const { adapter, nextSource, profile } = await setup(createAdapter);
      adapter.upsertMediaCatalogAsset = vi.fn(async () => {
        throw new Error("simulated catalog failure");
      });
      const result = await replaceMediaSource(adapter, {
        assetPath: "/uploads/hero.png",
        source: nextSource,
        endpointId: "local-fs",
        expectedUpdatedAt: profile.updatedAt,
      });
      expect(result).toMatchObject({
        status: "incomplete",
        promoted: true,
        canonicalUpdated: true,
        warnings: ["Catalog update failed: simulated catalog failure"],
      });
    },
  );
});
