import {
  createClient,
  type Client,
} from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { MediaUsageRepository } from "../../lib/media/catalog/usage";
import type { AriaCloudflareEnv, RuntimeLocals } from "../../lib/cloudflare/env";
import { createD1Mock } from "../helpers/d1Mock";

const pageResource = {
  nodes: [
    {
      id: "n1",
      type: "Image",
      props: {
        image: {
          src: "/uploads/images/logo.svg",
        },
      },
    },
  ],
};

describe("MediaUsageRepository aria_media_* parity", () => {
  let client: Client;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-media-usage-test-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
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

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createLocals(): RuntimeLocals {
    return {
      cfBindings: {
        aria_db: createD1Mock(client) as unknown as AriaCloudflareEnv["aria_db"],
      },
    };
  }

  async function seedMediaAsset(now: string): Promise<void> {
    await client.execute({
      sql: `INSERT INTO aria_media_assets (
              id,
              logical_path,
              filename,
              extension,
              mime_type,
              size_bytes,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "media-logo",
        "/uploads/images/logo.svg",
        "logo.svg",
        "svg",
        "image/svg+xml",
        4,
        "active",
        now,
        now,
      ],
    });
  }

  it("writes usage rows to aria_media_usage for SQLite adapter reads", async () => {
    const uploadDir = path.join(tempDir, "uploads");
    const adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
      uploadDir,
      snapshotDir: path.join(tempDir, "snapshots"),
      thumbnailsDir: path.join(tempDir, "thumbnails"),
    });
    await adapter.getSiteSettings();

    const now = new Date().toISOString();
    await seedMediaAsset(now);

    const repository = MediaUsageRepository.tryCreate(createLocals());
    expect(repository).not.toBeNull();

    const syncResult = await repository!.syncResourceUsage({
      kind: "page",
      refId: "home",
      resource: pageResource,
      updatedAt: now,
    });

    expect(syncResult).toEqual({
      scanned: 1,
      inserted: 1,
      unresolved: 0,
    });

    await expect(
      adapter.listMediaUsageByLogicalPath("images/logo.svg"),
    ).resolves.toEqual([
      {
        kind: "page",
        refId: "home",
        refPath: "nodes[0].props.image.src",
      },
    ]);

    await expect(
      repository!.listUsageByLogicalPath("/uploads/images/logo.svg"),
    ).resolves.toEqual([
      {
        kind: "page",
        refId: "home",
        refPath: "nodes[0].props.image.src",
      },
    ]);

    await expect(
      adapter.syncMediaUsage({
        kind: "cms-entry",
        refId: "post-1",
        resource: {
          hero: "/uploads/images/missing.jpg",
          external: "https://images.example.com/remote.jpg",
        },
        updatedAt: now,
      }),
    ).resolves.toEqual({ scanned: 1, inserted: 1, unresolved: 1 });
    await expect(
      adapter.listMediaUsageByLogicalPath("images/missing.jpg"),
    ).resolves.toEqual([
      {
        kind: "cms-entry",
        refId: "post-1",
        refPath: "hero",
      },
    ]);
  });

  it("writes usage rows to aria_media_usage for Cloudflare adapter reads", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as unknown as AriaCloudflareEnv["aria_db"],
    });
    await adapter.getSiteSettings();

    const now = new Date().toISOString();
    await seedMediaAsset(now);

    const repository = MediaUsageRepository.tryCreate(createLocals());
    expect(repository).not.toBeNull();

    const syncResult = await repository!.syncResourceUsage({
      kind: "page",
      refId: "home",
      resource: pageResource,
      updatedAt: now,
    });

    expect(syncResult).toEqual({
      scanned: 1,
      inserted: 1,
      unresolved: 0,
    });

    await expect(
      adapter.listMediaUsageByLogicalPath("images/logo.svg"),
    ).resolves.toEqual([
      {
        kind: "page",
        refId: "home",
        refPath: "nodes[0].props.image.src",
      },
    ]);

    await expect(
      adapter.syncMediaUsage({
        kind: "page-locale",
        refId: "home:fr-CA",
        resource: { image: "/uploads/images/traduction.jpg" },
        updatedAt: now,
      }),
    ).resolves.toEqual({ scanned: 1, inserted: 1, unresolved: 1 });
    await expect(
      adapter.listMediaUsageByLogicalPath("images/traduction.jpg"),
    ).resolves.toEqual([
      {
        kind: "page-locale",
        refId: "home:fr-CA",
        refPath: "image",
      },
    ]);
  });
});
