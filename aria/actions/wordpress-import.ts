import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { requireCapability } from "./_shared";
import { computeSHA256 } from "../lib/media/utils/checksum";
import {
  analyzeWordPressImport,
  applyWxrWordPressImport,
  buildWordPressImportFile,
  createWordPressImportBatch,
  createWordPressImportEvent,
  normalizeWordPressImportScope,
} from "../lib/wordpress-import/service";
import {
  WordPressImportBatchSchema,
  WordPressImportEventSchema,
  WordPressImportFileSchema,
  WordPressImportItemSchema,
  WordPressImportMappingSchema,
  WordPressImportMediaSchema,
  WordPressImportReportSchema,
} from "../lib/wordpress-import/schemas";
import { extractImportSource } from "../lib/wordpress-import/source";
import { recordCmsAudit } from "./cms/accessPolicy";

const BatchIdInputSchema = z.object({
  batchId: z.string().trim().min(1),
});

const ImportScopeInputSchema = z
  .object({
    posts: z.boolean().optional(),
    pages: z.boolean().optional(),
    customPostTypes: z.boolean().optional(),
    attachments: z.boolean().optional(),
    authors: z.boolean().optional(),
    comments: z.boolean().optional(),
    terms: z.boolean().optional(),
    menus: z.boolean().optional(),
    customFields: z.boolean().optional(),
    seoFields: z.boolean().optional(),
  })
  .optional();

const ListInputSchema = z.object({
  limit: z.int().positive().max(100).optional(),
});

async function requireWordPressImportAccess(
  context: Parameters<typeof requireCapability>[0],
) {
  return requireCapability(context, "manageExports");
}

function safeImportFilename(filename: string): string {
  return (
    filename
      .trim()
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "wordpress-import.dat"
  );
}

async function readBatchSource(input: {
  adapter: Awaited<ReturnType<typeof getStorageAdapterAsync>>;
  batchId: string;
}): Promise<{ sourceText: string; sourceType: "wxr" }> {
  const [batch, files] = await Promise.all([
    input.adapter.getWordPressImportBatch(input.batchId),
    input.adapter.listWordPressImportFiles(input.batchId),
  ]);
  const file = files[0];
  if (!batch || !file) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "WordPress import batch not found.",
    });
  }
  const stored = await input.adapter.getMedia(file.objectKey);
  if (!stored) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "WordPress import source file expired or was removed.",
    });
  }
  const extracted = await extractImportSource({
    filename: file.filename,
    bytes: new Uint8Array(stored),
  });
  return {
    sourceText: extracted.text,
    sourceType: extracted.sourceType,
  };
}

export const wordpressImport = {
  upload: defineAction({
    accept: "form",
    input: z.object({
      file: z.instanceof(File),
    }),
    handler: async ({ file }, context) => {
      const user = await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const bytes = Buffer.from(await file.arrayBuffer());
      const extracted = await extractImportSource({
        filename: file.name,
        bytes,
      });
      const batch = createWordPressImportBatch({
        sourceType: extracted.sourceType,
        actorId: user.id,
      });
      const objectKey = `_imports/wordpress/${batch.id}/${safeImportFilename(file.name)}`;
      const checksum = computeSHA256(bytes);
      await adapter.saveMedia(objectKey, bytes, {
        contentType: file.type || "application/octet-stream",
      });

      await adapter.saveWordPressImportBatch(batch);
      await adapter.saveWordPressImportFile(
        buildWordPressImportFile({
          batchId: batch.id,
          filename: file.name,
          objectKey,
          contentType: file.type || null,
          sizeBytes: file.size,
          sha256: checksum,
        }),
      );
      await adapter.appendWordPressImportEvent(
        createWordPressImportEvent({
          batchId: batch.id,
          phase: "uploading",
          message: "WordPress source uploaded.",
          payload: {
            filename: file.name,
            sizeBytes: file.size,
            sourceType: extracted.sourceType,
          },
        }),
      );

      const analyzed = await analyzeWordPressImport({
        adapter,
        batch,
        sourceText: extracted.text,
        sourceType: extracted.sourceType,
      });

      return z
        .object({
          batch: WordPressImportBatchSchema,
          file: WordPressImportFileSchema,
        })
        .parse({
          batch: analyzed.batch,
          file: (await adapter.listWordPressImportFiles(batch.id))[0],
        });
    },
  }),

  analyze: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const batch = await adapter.getWordPressImportBatch(batchId);
      if (!batch) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "WordPress import batch not found.",
        });
      }
      const { sourceText, sourceType } = await readBatchSource({
        adapter,
        batchId,
      });
      const analyzed = await analyzeWordPressImport({
        adapter,
        batch,
        sourceText,
        sourceType,
      });
      return WordPressImportBatchSchema.parse(analyzed.batch);
    },
  }),

  plan: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const batch = await adapter.getWordPressImportBatch(batchId);
      if (!batch) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "WordPress import batch not found.",
        });
      }
      const [items, media, mappings, events] = await Promise.all([
        adapter.listWordPressImportItems(batchId),
        adapter.listWordPressImportMedia(batchId),
        adapter.listWordPressImportMappings(batchId),
        adapter.listWordPressImportEvents(batchId),
      ]);
      return WordPressImportReportSchema.parse({
        batch,
        items: z.array(WordPressImportItemSchema).parse(items),
        media: z.array(WordPressImportMediaSchema).parse(media),
        mappings: z.array(WordPressImportMappingSchema).parse(mappings),
        events,
      });
    },
  }),

  apply: defineAction({
    accept: "json",
    input: BatchIdInputSchema.extend({
      scope: ImportScopeInputSchema,
    }),
    handler: async ({ batchId, scope }, context) => {
      const user = await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const batch = await adapter.getWordPressImportBatch(batchId);
      if (!batch) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "WordPress import batch not found.",
        });
      }
      const { sourceText } = await readBatchSource({
        adapter,
        batchId,
      });
      const applied = await applyWxrWordPressImport({
        adapter,
        batch,
        sourceText,
        actor: user,
        scope: normalizeWordPressImportScope(scope),
      });
      await recordCmsAudit(adapter, {
        actor: user,
        action: "import.wordpress.apply",
        summary: "Applied WordPress import",
        metadata: { batchId, scope: normalizeWordPressImportScope(scope) },
      });
      return WordPressImportBatchSchema.parse(applied);
    },
  }),

  cancel: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const batch = await adapter.getWordPressImportBatch(batchId);
      if (!batch) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "WordPress import batch not found.",
        });
      }
      const next = WordPressImportBatchSchema.parse({
        ...batch,
        status: "cancelled",
        currentMessage: "Import cancelled.",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      await adapter.saveWordPressImportBatch(next);
      await adapter.appendWordPressImportEvent(
        createWordPressImportEvent({
          batchId,
          phase: "failed",
          level: "warn",
          message: "WordPress import cancelled.",
        }),
      );
      return next;
    },
  }),

  getBatch: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const batch = await adapter.getWordPressImportBatch(batchId);
      if (!batch) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "WordPress import batch not found.",
        });
      }
      return WordPressImportBatchSchema.parse(batch);
    },
  }),

  getEvents: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      return z
        .array(WordPressImportEventSchema)
        .parse(await adapter.listWordPressImportEvents(batchId));
    },
  }),

  listBatches: defineAction({
    accept: "json",
    input: ListInputSchema.optional(),
    handler: async (input, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      return z
        .array(WordPressImportBatchSchema)
        .parse(await adapter.listWordPressImportBatches(input ?? undefined));
    },
  }),

  getReport: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const [batch, items, media, mappings, events] = await Promise.all([
        adapter.getWordPressImportBatch(batchId),
        adapter.listWordPressImportItems(batchId),
        adapter.listWordPressImportMedia(batchId),
        adapter.listWordPressImportMappings(batchId),
        adapter.listWordPressImportEvents(batchId),
      ]);
      if (!batch) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "WordPress import batch not found.",
        });
      }
      return WordPressImportReportSchema.parse({
        batch,
        items: z.array(WordPressImportItemSchema).parse(items),
        media: z.array(WordPressImportMediaSchema).parse(media),
        mappings: z.array(WordPressImportMappingSchema).parse(mappings),
        events,
      });
    },
  }),

  deleteBatch: defineAction({
    accept: "json",
    input: BatchIdInputSchema,
    handler: async ({ batchId }, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const files = await adapter.listWordPressImportFiles(batchId);
      for (const file of files) {
        try {
          await adapter.deleteMedia(file.objectKey);
        } catch {
          // Source retention cleanup is best-effort.
        }
      }
      await adapter.deleteWordPressImportBatch(batchId);
      return z.object({ success: z.boolean() }).parse({ success: true });
    },
  }),

  cleanupExpiredFiles: defineAction({
    accept: "json",
    input: z.object({}).optional(),
    handler: async (_input, context) => {
      await requireWordPressImportAccess(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const expired = await adapter.listExpiredWordPressImportFiles(
        new Date().toISOString(),
      );
      let deleted = 0;
      for (const file of expired) {
        try {
          await adapter.deleteMedia(file.objectKey);
          await adapter.deleteWordPressImportFile(file.id);
          deleted += 1;
        } catch {
          // Keep the tracking record so a later cleanup can retry the object.
        }
      }
      return z
        .object({ success: z.boolean(), deleted: z.int().nonnegative() })
        .parse({ success: true, deleted });
    },
  }),
};
