import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { SQLiteStorageAdapter } from "../../../../lib/storage/sqlite";
import { ListPagesOutputSchema } from "../../../../admin/features/Agent/lib/tools/content/schemas";
import { getSiteStyleRevision } from "../../../../lib/storage/adapter";
import {
  buildPageSnapshotAdminUrl,
  resolvePagePreviewStage,
} from "../../../../lib/rendering/pageSnapshots";
import { buildPageThumbnailAdminUrlWhenStored } from "../../../../lib/rendering/pageThumbnails";

describe("pages.listInventory agent schema", () => {
  it("matches ListPagesOutputSchema for real sqlite inventory", async () => {
    const client = createClient({ url: "file::memory:" });
    const adapter = new SQLiteStorageAdapter(client, {
      seedStarterPages: true,
    });

    try {
      const inventory = await adapter.listPagesDSL();
      expect(inventory.length).toBeGreaterThan(0);

      const siteSettings = await adapter.getSiteSettings();
      const storedThumbnailKeys =
        await adapter.listStoredPageThumbnailKeys();
      const styleRevision = getSiteStyleRevision(siteSettings);

      const output = {
        pages: inventory.map((page) => ({
          ...page,
          systemRole: page.systemRole ?? "standard",
          accessMode: page.accessMode ?? "public",
          hasPassword: page.hasPassword ?? false,
          isModifiedSincePublish: page.isModifiedSincePublish ?? false,
          authorship: page.authorship,
          snapshotUrl: buildPageSnapshotAdminUrl(
            page.slug ?? page.id,
            resolvePagePreviewStage(page),
            page.updatedAt,
            styleRevision,
          ),
          thumbnailUrl: buildPageThumbnailAdminUrlWhenStored(
            storedThumbnailKeys,
            page.id,
            resolvePagePreviewStage(page),
            page.updatedAt,
            styleRevision,
          ),
        })),
      };

      const parsed = ListPagesOutputSchema.safeParse(output);
      expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(
        true,
      );
    } finally {
      client.close();
    }
  });
});
