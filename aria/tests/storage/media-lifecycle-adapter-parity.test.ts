import { createClient, type Client } from "@libsql/client";
import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import type { SessionUser } from "../../lib/auth/types";
import {
  deleteMediaWithReferenceSafety,
  renameMediaWithReferenceMigration,
} from "../../lib/media/catalog/mediaLifecycle";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createD1Mock } from "../helpers/d1Mock";

let client: Client;

const administrator: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
};
const authorship = buildAuthorshipSaveContext(administrator, "save-page");

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

describe("media lifecycle adapter parity", () => {
  it.each(adapterFactories)(
    "moves catalog and transform state before deleting source bytes on %s",
    async (_name, createAdapter) => {
      const adapter = createAdapter();
      const bytes = new Map<string, Buffer>([
        ["gallery/hero.jpg", Buffer.from("hero-bytes")],
      ]);
      adapter.getMedia = vi.fn(async (key: string) => bytes.get(key) ?? null);
      adapter.saveMedia = vi.fn(async (key: string, buffer: Buffer) => {
        bytes.set(key, buffer);
        return `/uploads/${key}`;
      });
      adapter.deleteMedia = vi.fn(async (key: string) => {
        bytes.delete(key);
      });

      const catalog = await adapter.upsertMediaCatalogAsset({
        logicalPath: "/uploads/gallery/hero.jpg",
        filename: "hero.jpg",
        extension: "jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        checksumSha256: "a".repeat(64),
        endpointId: "local-fs",
        objectKey: "gallery/hero.jpg",
        publicUrl: "/uploads/gallery/hero.jpg",
        updatedAt: "2026-07-14T12:00:00.000Z",
      });
      await adapter.syncMediaUsage({
        kind: "cms-entry",
        refId: "post-1",
        resource: { cover: { mediaId: catalog.mediaId } },
        updatedAt: "2026-07-14T12:00:00.000Z",
      });
      await adapter.registerMediaSourceVersion({
        assetPath: "/uploads/gallery/hero.jpg",
        version: 1,
        objectKey: "gallery/hero.jpg",
        checksumSha256: "a".repeat(64),
        mimeType: "image/jpeg",
        sizeBytes: 10,
        width: 100,
        height: 100,
        createdAt: "2026-07-14T12:00:00.000Z",
      });

      const renamed = await renameMediaWithReferenceMigration(
        adapter,
        { authorship },
        {
          oldKey: "gallery/hero.jpg",
          newName: "renamed.jpg",
          endpointId: "local-fs",
        },
      );

      expect(renamed).toMatchObject({
        status: "completed",
        oldRetained: false,
      });
      expect(bytes.has("gallery/hero.jpg")).toBe(false);
      expect(bytes.has("gallery/renamed.jpg")).toBe(true);
      await expect(
        adapter.listMediaCatalogAssetsByLogicalPaths([
          "/uploads/gallery/renamed.jpg",
        ]),
      ).resolves.toMatchObject([{ status: "active" }]);
      await expect(
        adapter.listMediaUsageByLogicalPath("/uploads/gallery/renamed.jpg"),
      ).resolves.toMatchObject([{ kind: "cms-entry", refId: "post-1" }]);
      expect(
        (await adapter.getMediaTransformState("/uploads/gallery/renamed.jpg"))
          .sourceVersions,
      ).toHaveLength(1);

      const deleted = await deleteMediaWithReferenceSafety(
        adapter,
        { authorship },
        {
          objectKey: "gallery/renamed.jpg",
          logicalPath: "/uploads/gallery/renamed.jpg",
          updatedAt: "2026-07-14T12:05:00.000Z",
        },
      );

      expect(deleted).toMatchObject({ status: "completed", deleted: true });
      expect(bytes.has("gallery/renamed.jpg")).toBe(false);
      await expect(
        adapter.listMediaCatalogAssetsByLogicalPaths([
          "/uploads/gallery/renamed.jpg",
        ]),
      ).resolves.toMatchObject([{ status: "deleted" }]);
      expect(
        (await adapter.getMediaTransformState("/uploads/gallery/renamed.jpg"))
          .sourceVersions,
      ).toHaveLength(0);
    },
  );
});
