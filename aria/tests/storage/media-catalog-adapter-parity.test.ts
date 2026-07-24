import { createClient, type Client } from "@libsql/client";
import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createD1Mock } from "../helpers/d1Mock";
import { buildCmsMediaReferenceUrlMap } from "../../lib/cms/resolveCmsMediaReference";

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

describe("media catalog adapter parity", () => {
  it.each(adapterFactories)(
    "creates catalog state and resolves mediaId usage on %s",
    async (_name, createAdapter) => {
      const adapter = createAdapter();
      const created = await adapter.upsertMediaCatalogAsset({
        logicalPath: "/uploads/hero.jpg",
        filename: "hero.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 4096,
        checksumSha256: "a".repeat(64),
        endpointId: "local-fs",
        objectKey: "hero.jpg",
        publicUrl: "/uploads/hero.jpg",
        updatedAt: "2026-07-14T12:00:00.000Z",
      });

      await expect(
        adapter.listMediaCatalogAssetsByIds([created.mediaId]),
      ).resolves.toMatchObject([
        {
          id: created.mediaId,
          logical_path: "/uploads/hero.jpg",
          status: "active",
        },
      ]);

      await expect(
        adapter.syncMediaUsage({
          kind: "cms-entry",
          refId: "post-1",
          resource: {
            cover: { mediaId: created.mediaId },
            body: [{ _type: "image", mediaId: created.mediaId, alt: "Hero" }],
          },
          updatedAt: "2026-07-14T12:01:00.000Z",
        }),
      ).resolves.toEqual({ scanned: 1, inserted: 1, unresolved: 0 });

      await expect(
        adapter.listMediaUsageByLogicalPath("/uploads/hero.jpg"),
      ).resolves.toEqual([
        {
          kind: "cms-entry",
          refId: "post-1",
          refPath: "cover.mediaId",
        },
      ]);

      const urls = await buildCmsMediaReferenceUrlMap({
        references: [created.mediaId],
        catalog: null,
        adapter,
      });
      expect(urls.get(created.mediaId)).toBe("/uploads/hero.jpg");
    },
  );

  it.each(adapterFactories)(
    "moves and marks catalog state deleted on %s",
    async (_name, createAdapter) => {
      const adapter = createAdapter();
      await adapter.upsertMediaCatalogAsset({
        logicalPath: "/uploads/hero.jpg",
        filename: "hero.jpg",
        extension: "jpg",
        sizeBytes: 4096,
        checksumSha256: "a".repeat(64),
        endpointId: "local-fs",
        updatedAt: "2026-07-14T12:00:00.000Z",
      });
      await adapter.moveMediaCatalogAsset({
        oldLogicalPath: "/uploads/hero.jpg",
        newLogicalPath: "/uploads/archive/hero.jpg",
        filename: "hero.jpg",
        extension: "jpg",
        sizeBytes: 4096,
        checksumSha256: "a".repeat(64),
        endpointId: "local-fs",
        updatedAt: "2026-07-14T12:01:00.000Z",
      });
      await adapter.markMediaCatalogAssetDeleted({
        logicalPath: "/uploads/archive/hero.jpg",
        updatedAt: "2026-07-14T12:02:00.000Z",
      });

      await expect(
        adapter.listMediaCatalogAssetsByLogicalPaths([
          "/uploads/archive/hero.jpg",
        ]),
      ).resolves.toMatchObject([
        {
          logical_path: "/uploads/archive/hero.jpg",
          status: "deleted",
        },
      ]);
    },
  );
});
