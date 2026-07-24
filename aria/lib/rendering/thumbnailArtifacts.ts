import { createHash } from "node:crypto";
import { z } from "zod";

import { PageSnapshotStageSchema } from "./pageSnapshots";

export const THUMBNAIL_ARTIFACT_RENDERER_VERSION = "thumbnail-renderer-v3";

export const ThumbnailArtifactKindSchema = z.enum([
  "page",
  "component",
  "layout",
]);

export const ThumbnailArtifactStatusSchema = z.enum([
  "missing",
  "queued",
  "running",
  "ready",
  "stale",
  "failed",
]);

export const ThumbnailArtifactStageSchema = z.union([
  PageSnapshotStageSchema,
  z.literal("default"),
]);

export const ThumbnailStateSchema = z.object({
  url: z.string().trim().min(1).optional(),
  status: ThumbnailArtifactStatusSchema,
  stage: ThumbnailArtifactStageSchema,
  fingerprint: z.string().trim().min(1),
  updatedAt: z.string().nullable().optional(),
  error: z.string().trim().min(1).optional(),
});

export type ThumbnailArtifactKind = z.infer<typeof ThumbnailArtifactKindSchema>;
export type ThumbnailArtifactStatus = z.infer<typeof ThumbnailArtifactStatusSchema>;
export type ThumbnailArtifactStage = z.infer<typeof ThumbnailArtifactStageSchema>;
export type ThumbnailState = z.infer<typeof ThumbnailStateSchema>;

export function buildThumbnailFingerprint(input: {
  kind: ThumbnailArtifactKind;
  targetId: string;
  stage: ThumbnailArtifactStage;
  sourceVersion?: string | null;
  updatedAt?: string | null;
  styleRevision?: string | null;
  capturePreset?: string | null;
}): string {
  const hash = createHash("sha256");
  hash.update(THUMBNAIL_ARTIFACT_RENDERER_VERSION);
  hash.update("\0");
  hash.update(input.kind);
  hash.update("\0");
  hash.update(input.targetId);
  hash.update("\0");
  hash.update(input.stage);
  hash.update("\0");
  hash.update(input.sourceVersion ?? "");
  hash.update("\0");
  hash.update(input.updatedAt ?? "");
  hash.update("\0");
  hash.update(input.styleRevision ?? "");
  hash.update("\0");
  hash.update(input.capturePreset ?? "");
  return hash.digest("hex").slice(0, 32);
}

export function buildThumbnailArtifactKey(input: {
  kind: ThumbnailArtifactKind;
  targetId: string;
  stage: ThumbnailArtifactStage;
  fingerprint: string;
  extension?: "webp" | "png";
}): string {
  const extension = input.extension ?? "webp";
  return `thumbnails/v3/${input.kind}/${encodeURIComponent(input.targetId)}/${input.stage}/${input.fingerprint}.${extension}`;
}

export function buildThumbnailState(input: {
  url?: string;
  stage: ThumbnailArtifactStage;
  fingerprint: string;
  updatedAt?: string | null;
  error?: string | null;
}): ThumbnailState {
  const status = input.url ? "ready" : "missing";
  return ThumbnailStateSchema.parse({
    url: input.url || undefined,
    status,
    stage: input.stage,
    fingerprint: input.fingerprint,
    updatedAt: input.updatedAt ?? null,
    error: input.error || undefined,
  });
}
