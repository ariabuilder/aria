import { createClient, type Client } from "@libsql/client";
import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { MediaTransformConflictError } from "../../lib/media/transforms/storage";
import { createD1Mock } from "../helpers/d1Mock";

let client: Client;

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
      new CloudflareStorageAdapter({
        aria_db: createD1Mock(client),
      } as never),
  ],
] as const;

describe("media transform adapter parity", () => {
  it.each(adapterFactories)(
    "aggregates saved crop counts without per-asset queries on %s",
    async (_name, createAdapter) => {
      const adapter = createAdapter();
      const createVariant = (id: string, assetPath: string, name: string) =>
        adapter.saveMediaTransformVariant({
          id,
          assetPath,
          name,
          sourceVersion: 1,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          focalPoint: null,
          aspectRatio: { width: 1, height: 1 },
          output: { width: 800, height: 800, format: "webp", quality: 85 },
        });

      expect(await adapter.listMediaTransformVariantCounts()).toEqual({});
      await createVariant("hero-square", "hero.jpg", "Square");
      await createVariant("hero-wide", "/uploads/hero.jpg", "Wide");
      await createVariant("portrait-square", "portrait.jpg", "Square");

      expect(await adapter.listMediaTransformVariantCounts()).toEqual({
        "/uploads/hero.jpg": 2,
        "/uploads/portrait.jpg": 1,
      });

      await adapter.deleteMediaTransformVariant("hero.jpg", "hero-wide");
      expect(await adapter.listMediaTransformVariantCounts()).toEqual({
        "/uploads/hero.jpg": 1,
        "/uploads/portrait.jpg": 1,
      });

      await adapter.moveMediaTransformState("hero.jpg", "archive/hero.jpg");
      expect(await adapter.listMediaTransformVariantCounts()).toEqual({
        "/uploads/archive/hero.jpg": 1,
        "/uploads/portrait.jpg": 1,
      });
    },
  );

  it.each(adapterFactories)(
    "round-trips metadata, source versions, and normalized crop recipes on %s",
    async (_name, createAdapter) => {
      const adapter = createAdapter();
      await adapter.registerMediaSourceVersion({
        assetPath: "hero.jpg",
        version: 1,
        objectKey: "hero.jpg",
        checksumSha256: "a".repeat(64),
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 2400,
        height: 1600,
        createdAt: "2026-07-14T12:00:00.000Z",
      });
      const profile = await adapter.saveMediaAssetProfile({
        assetPath: "hero.jpg",
        currentSourceVersion: 1,
        altText: "A mountain at sunrise",
        title: "Homepage hero",
        caption: null,
        credit: "Aria Studio",
        copyright: null,
        focalPoint: { x: 0.6, y: 0.4 },
      });
      const variant = await adapter.saveMediaTransformVariant({
        id: "hero-wide",
        assetPath: "/uploads/hero.jpg",
        name: "Wide hero",
        sourceVersion: 1,
        crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.45 },
        focalPoint: { x: 0.6, y: 0.4 },
        aspectRatio: { width: 16, height: 9 },
        output: {
          width: 1600,
          height: 900,
          format: "auto",
          quality: 85,
        },
      });

      const state = await adapter.getMediaTransformState("hero.jpg");
      expect(state.profile).toEqual(profile);
      expect(state.sourceVersions).toHaveLength(1);
      expect(state.variants).toEqual([variant]);
      expect(state.variants[0]?.crop).toEqual({
        x: 0.1,
        y: 0.2,
        width: 0.8,
        height: 0.45,
      });

      await adapter.moveMediaTransformState("hero.jpg", "archive/hero.jpg");
      expect(
        (await adapter.getMediaTransformState("hero.jpg")).profile,
      ).toBeNull();
      const moved = await adapter.getMediaTransformState("archive/hero.jpg");
      expect(moved.profile?.assetPath).toBe("/uploads/archive/hero.jpg");
      expect(moved.sourceVersions[0]?.objectKey).toBe("archive/hero.jpg");
      expect(moved.variants[0]?.assetPath).toBe("/uploads/archive/hero.jpg");

      await adapter.deleteMediaTransformVariant("archive/hero.jpg", variant.id);
      expect(
        (await adapter.getMediaTransformState("archive/hero.jpg")).variants,
      ).toEqual([]);
      await adapter.deleteMediaTransformState("archive/hero.jpg");
      expect(await adapter.getMediaTransformState("archive/hero.jpg")).toEqual({
        profile: null,
        sourceVersions: [],
        variants: [],
      });
    },
  );

  it.each(adapterFactories)(
    "rejects stale source edits and concurrent profile writes on %s",
    async (_name, createAdapter) => {
      const adapter = createAdapter();
      const profile = await adapter.saveMediaAssetProfile({
        assetPath: "portrait.jpg",
        currentSourceVersion: 2,
        altText: null,
        title: null,
        caption: null,
        credit: null,
        copyright: null,
        focalPoint: null,
      });

      await expect(
        adapter.saveMediaTransformVariant({
          id: "stale-square",
          assetPath: "portrait.jpg",
          name: "Square",
          sourceVersion: 1,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          focalPoint: null,
          aspectRatio: { width: 1, height: 1 },
          output: { width: 800, height: 800, format: "webp", quality: 82 },
        }),
      ).rejects.toBeInstanceOf(MediaTransformConflictError);

      await expect(
        adapter.saveMediaAssetProfile({
          assetPath: "portrait.jpg",
          currentSourceVersion: 2,
          altText: "Changed elsewhere",
          title: null,
          caption: null,
          credit: null,
          copyright: null,
          focalPoint: null,
          expectedUpdatedAt: `${profile.updatedAt}-stale`,
        }),
      ).rejects.toBeInstanceOf(MediaTransformConflictError);

      await adapter.registerMediaSourceVersion({
        assetPath: "portrait.jpg",
        version: 2,
        objectKey: "portrait-v2.jpg",
        checksumSha256: "b".repeat(64),
        mimeType: "image/jpeg",
        sizeBytes: 3000,
        width: 1000,
        height: 1500,
        createdAt: "2026-07-14T12:00:00.000Z",
      });
      await expect(
        adapter.registerMediaSourceVersion({
          assetPath: "portrait.jpg",
          version: 2,
          objectKey: "different.jpg",
          checksumSha256: "c".repeat(64),
          mimeType: "image/jpeg",
          sizeBytes: 3000,
          width: 1000,
          height: 1500,
          createdAt: "2026-07-14T12:01:00.000Z",
        }),
      ).rejects.toBeInstanceOf(MediaTransformConflictError);
    },
  );
});
