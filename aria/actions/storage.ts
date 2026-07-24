import { defineAction } from "astro:actions";
import { z } from "astro/zod";

import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  DEFAULT_RECENT_VERSION_LIMIT,
  VersionHistoryPruneResultSchema,
  VersionHistoryResourceTypeSchema,
} from "../lib/storage/versioning";
import { requireRole } from "./_shared";

const VersionHistoryPruneBatchInputSchema = z
  .object({
    resourceType: VersionHistoryResourceTypeSchema.optional(),
    resourceId: z.string().trim().min(1).optional(),
    keepLatest: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_RECENT_VERSION_LIMIT),
    dryRun: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.resourceId && !value.resourceType) {
      context.addIssue({
        code: "custom" as const,
        message: "resourceType is required when resourceId is provided",
        path: ["resourceType"],
      });
    }
  });

const VersionHistoryPruneBatchResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      dryRun: z.boolean(),
      keepLatest: z.int().min(1).max(100),
      results: z.array(VersionHistoryPruneResultSchema),
    }),
  })
  .strict();

export const storage = {
  pruneVersionHistory: defineAction({
    accept: "json",
    input: VersionHistoryPruneBatchInputSchema,
    handler: async (rawInput, context) => {
      await requireRole(context, "content-editor");

      const input = VersionHistoryPruneBatchInputSchema.parse(rawInput);
      const adapter = await getStorageAdapterAsync(context.locals);

      if (!adapter.pruneVersionHistory) {
        throw new Error(
          "Storage adapter does not support version-history pruning",
        );
      }

      const pageTargets =
        input.resourceType && input.resourceType !== "page"
          ? []
          : input.resourceId && input.resourceType === "page"
            ? [input.resourceId]
            : (await adapter.listPagesDSL({ limit: 1000, offset: 0 })).map(
                (page) => page.id,
              );
      const layoutTargets =
        input.resourceType && input.resourceType !== "layout"
          ? []
          : input.resourceId && input.resourceType === "layout"
            ? [input.resourceId]
            : (await adapter.listLayoutsDSL({ limit: 1000, offset: 0 })).map(
                (layout) => layout.id,
              );
      const componentTargets =
        input.resourceType && input.resourceType !== "component"
          ? []
          : input.resourceId && input.resourceType === "component"
            ? [input.resourceId]
            : (await adapter.listComponentsDSL({ limit: 1000, offset: 0 })).map(
                (component) => component.id,
              );

      const results = [
        ...(await Promise.all(
          pageTargets.map((resourceId) =>
            adapter.pruneVersionHistory!({
              resourceType: "page",
              resourceId,
              keepLatest: input.keepLatest,
              dryRun: input.dryRun,
            }),
          ),
        )),
        ...(await Promise.all(
          layoutTargets.map((resourceId) =>
            adapter.pruneVersionHistory!({
              resourceType: "layout",
              resourceId,
              keepLatest: input.keepLatest,
              dryRun: input.dryRun,
            }),
          ),
        )),
        ...(await Promise.all(
          componentTargets.map((resourceId) =>
            adapter.pruneVersionHistory!({
              resourceType: "component",
              resourceId,
              keepLatest: input.keepLatest,
              dryRun: input.dryRun,
            }),
          ),
        )),
      ];

      return VersionHistoryPruneBatchResponseSchema.parse({
        success: true,
        data: {
          dryRun: input.dryRun,
          keepLatest: input.keepLatest,
          results,
        },
      });
    },
  }),
};
