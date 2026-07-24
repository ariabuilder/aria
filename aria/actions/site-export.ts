import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { requireOperation } from "./_shared";
import { getDesignSystem } from "./_designSystemPersist";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { generateSiteExportArchive } from "../lib/export/generator";
import {
  buildSiteExportRecord,
  createSiteExportStore,
} from "../lib/export/storage";
import {
  CreateSiteExportInputSchema,
  DeleteSiteExportInputSchema,
  SiteExportActionPayloadSchema,
  SiteExportListPayloadSchema,
} from "../lib/export/schema";
import { createDefaultUniversalDesignSystem } from "../lib/styles/universalDesignSystem";

export const siteExport = {
  create: defineAction({
    accept: "json",
    input: CreateSiteExportInputSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "siteExport.create");
      const adapter = await getStorageAdapterAsync(context.locals);
      const store = createSiteExportStore(context.locals);

      await store.cleanupExpired();

      let exportDesignSystem = await getDesignSystem(adapter);
      // On Cloudflare Workers, CSS recompilation (via buildGlobalCSSArtifactsSnapshot)
      // can fail because dependencies call fileURLToPath(import.meta.url) where
      // import.meta.url is not a file:// URL. Fall back to stored artifacts.
      if (!exportDesignSystem) {
        exportDesignSystem = createDefaultUniversalDesignSystem();
      }

      const archive = await generateSiteExportArchive({
        adapter,
        designSystemOverride: exportDesignSystem,
        selection: input.selection,
        locals: context.locals,
      });
      const createdAt = new Date();
      const expiresAt = new Date(
        createdAt.getTime() + input.ttlMinutes * 60 * 1000,
      );
      const record = buildSiteExportRecord({
        id: crypto.randomUUID(),
        filename: archive.filename,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdBy: {
          id: user.id,
          username: user.username,
        },
        pageCount: archive.pageCount,
        mediaCount: archive.mediaCount,
        cmsCollectionCount: archive.cmsCollectionCount,
        cmsEntryCount: archive.cmsEntryCount,
        redirectCount: archive.redirectCount,
        sizeBytes: archive.bytes.byteLength,
      });

      await store.save(record, archive.bytes);

      return SiteExportActionPayloadSchema.parse({
        export: record,
        estimatedMediaBytes: archive.estimatedMediaBytes,
      });
    },
  }),

  list: defineAction({
    accept: "json",
    handler: async (_, context) => {
      const user = await requireOperation(context, "siteExport.list");
      const store = createSiteExportStore(context.locals);

      await store.cleanupExpired();

      return SiteExportListPayloadSchema.parse({
        exports: await store.listForUser(user),
      });
    },
  }),

  getLatest: defineAction({
    accept: "json",
    handler: async (_, context) => {
      const user = await requireOperation(context, "siteExport.getLatest");
      const store = createSiteExportStore(context.locals);

      await store.cleanupExpired();

      return SiteExportActionPayloadSchema.parse({
        export: await store.getLatestForUser(user),
      });
    },
  }),

  delete: defineAction({
    accept: "json",
    input: DeleteSiteExportInputSchema,
    handler: async ({ id }, context) => {
      const user = await requireOperation(context, "siteExport.delete");
      const store = createSiteExportStore(context.locals);

      await store.cleanupExpired();
      const deleted = await store.deleteForUser(id, user);

      return z
        .object({
          success: z.boolean(),
          deletedId: z.uuid().optional(),
        })
        .parse({
          success: deleted,
          deletedId: deleted ? id : undefined,
        });
    },
  }),
};
