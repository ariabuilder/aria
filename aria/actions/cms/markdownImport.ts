import { defineAction } from "astro:actions";
import { z } from "zod";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  MarkdownImportApplyReportSchema,
  MarkdownImportModeSchema,
  MarkdownImportPreviewSchema,
  MarkdownImportSelectedFieldSchema,
  applyMarkdownImport,
  extractMarkdownImportSources,
  previewMarkdownImport,
} from "../../lib/cms/markdown-import";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import { requireOperation, resolveAuthorizedMutation } from "../_shared";
import {
  recordCmsAudit,
  requireCmsCollectionPolicy,
  resolveCmsPolicyLocale,
} from "./accessPolicy";
import { CmsServiceError } from "../../lib/cms/errors";
import { getEntryFromAdapter } from "../../lib/cms/services/entries";

const MarkdownImportFormSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    mode: MarkdownImportModeSchema.default("create"),
    addFields: z
      .string()
      .optional()
      .transform((value, context) => {
        if (!value) return [];
        try {
          return z
            .array(MarkdownImportSelectedFieldSchema)
            .max(64)
            .parse(JSON.parse(value));
        } catch {
          context.addIssue({
            code: "custom",
            message: "Selected schema fields must be a valid JSON field array.",
          });
          return z.NEVER;
        }
      }),
    file: z.instanceof(File),
  })
  .strict();

async function sourceFromFile(file: File) {
  return extractMarkdownImportSources({
    filename: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
}

export const markdownImport = {
  preview: defineAction({
    accept: "form",
    input: MarkdownImportFormSchema,
    handler: async ({ collectionId, mode, file }, context) => {
      const user = await requireOperation(
        context,
        "cms.markdownImport.preview",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId,
          action: "read",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        return MarkdownImportPreviewSchema.parse(
          await previewMarkdownImport(adapter, {
            collectionId,
            mode,
            sources: await sourceFromFile(file),
          }),
        );
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  apply: defineAction({
    accept: "form",
    input: MarkdownImportFormSchema,
    handler: async ({ collectionId, mode, addFields = [], file }, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.markdownImport.apply",
        "cms-collection-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId,
          action: "read",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        if (addFields.length > 0) {
          await requireCmsCollectionPolicy(adapter, {
            actor: user,
            collectionId,
            action: "schema_edit",
            locale: await resolveCmsPolicyLocale(adapter),
          });
        }
        const sources = await sourceFromFile(file);
        const preview = await previewMarkdownImport(adapter, {
          collectionId,
          mode,
          sources,
        });
        for (const item of preview.items) {
          if (!item.locale || !item.slug) continue;
          if (item.action === "create") {
            const decision = await requireCmsCollectionPolicy(adapter, {
              actor: user,
              collectionId,
              action: "create",
              locale: item.locale,
            });
            if (decision.editableFields) {
              throw new CmsServiceError(
                "FORBIDDEN",
                "Restricted field policies cannot apply a Markdown import",
              );
            }
          }
          if (item.action === "update") {
            const entry = await getEntryFromAdapter(adapter, {
              collectionId,
              idOrSlug: item.slug,
              locale: item.locale,
            });
            const decision = await requireCmsCollectionPolicy(adapter, {
              actor: user,
              collectionId,
              action: "update",
              locale: item.locale,
              entry,
            });
            if (decision.editableFields) {
              throw new CmsServiceError(
                "FORBIDDEN",
                "Restricted field policies cannot apply a Markdown import",
              );
            }
          }
        }
        const report = await applyMarkdownImport(
          adapter,
          {
            collectionId,
            mode,
            addFields: addFields ?? [],
            sources,
          },
          authorship.actor,
        );
        await recordCmsAudit(adapter, {
          actor: user,
          action: "import.markdown.apply",
          collectionId,
          summary: "Applied Markdown import",
          metadata: {
            mode,
            sourceCount: report.items.length,
            addedFieldCount: addFields.length,
          },
        });
        return MarkdownImportApplyReportSchema.parse(report);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
};
