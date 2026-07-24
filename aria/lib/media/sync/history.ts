import { z } from "astro/zod";
import { log as baseLog } from "../../utils/logger";

const MediaMutationHistoryEventSchema = z.object({
  type: z.enum([
    "media-upload",
    "media-upload-failed",
    "media-rename",
    "media-rename-failed",
    "media-delete",
    "media-delete-failed",
    "media-duplicate",
    "media-duplicate-failed",
    "media-source-replace",
  ]),
  actorId: z.string().min(1),
  timestamp: z.string(),
  assetId: z.string().min(1).optional(),
  endpointId: z.string().min(1).optional(),
  result: z
    .object({
      success: z.boolean(),
      error: z.string().min(1).optional(),
      status: z.enum(["completed", "incomplete"]).optional(),
      cleanupComplete: z.boolean().optional(),
    })
    .optional(),
  details: z
    .object({
      fromKey: z.string().min(1).optional(),
      toKey: z.string().min(1).optional(),
      filename: z.string().min(1).optional(),
      url: z.string().min(1).optional(),
      sourceUrl: z.string().min(1).optional(),
      sizeBytes: z.int().nonnegative().optional(),
      mimeType: z.string().min(1).optional(),
      fromVersion: z.int().positive().optional(),
      toVersion: z.int().positive().optional(),
      promoted: z.boolean().optional(),
      variantsNeedingRebase: z.int().nonnegative().optional(),
    })
    .optional(),
});

const MediaSyncHistoryEventSchema = z.object({
  type: z.enum(["media-sync-apply", "media-sync-apply-failed"]),
  actorId: z.string().min(1),
  timestamp: z.string(),
  endpointId: z.string().min(1),
  jobId: z.string().min(1),
  result: z.object({
    total: z.int().nonnegative(),
    created: z.int().nonnegative(),
    updated: z.int().nonnegative(),
    deleted: z.int().nonnegative(),
    skipped: z.int().nonnegative(),
    conflicted: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }),
  details: z
    .object({
      direction: z.enum(["push", "pull"]),
      sourceEndpointId: z.string().min(1),
      targetEndpointId: z.string().min(1),
      failureCount: z.int().nonnegative(),
    })
    .optional(),
});

const MediaHistoryEventSchema = z.union([
  MediaMutationHistoryEventSchema,
  MediaSyncHistoryEventSchema,
]);

export type MediaHistoryEvent = z.infer<typeof MediaHistoryEventSchema>;
export type MediaSyncHistoryEvent = z.infer<typeof MediaSyncHistoryEventSchema>;

export function emitMediaHistoryEvent(event: MediaHistoryEvent): void {
  const parsed = MediaHistoryEventSchema.parse(event);
  baseLog("info", `[media.history] ${parsed.type}`, parsed);
}

export function emitMediaSyncHistoryEvent(event: MediaSyncHistoryEvent): void {
  emitMediaHistoryEvent(event);
}
