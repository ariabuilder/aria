import { z } from "astro/zod";
import {
  ContentMutationKindSchema,
  ContentSiteStateSchema,
  type ContentMutationKind,
  type ContentSiteState,
  type TouchContentRevisionInput,
} from "../storage/adapter";

export {
  ContentMutationKindSchema,
  ContentSiteStateSchema,
  type ContentMutationKind,
  type ContentSiteState,
  type TouchContentRevisionInput,
};

export const CONTENT_SITE_STATE_SCOPE = "default" as const;
export const CONTENT_SCHEMA_VERSION = "1" as const;

export const ContentSiteStateScopeSchema = z
  .string()
  .trim()
  .min(1)
  .default(CONTENT_SITE_STATE_SCOPE);

export const TouchContentRevisionInputSchema = z
  .object({
    scope: ContentSiteStateScopeSchema.optional(),
    updatedBy: z.string().trim().min(1).optional(),
    mutationKind: ContentMutationKindSchema,
    mutationTarget: z.string().trim().min(1).optional(),
    timestamp: z.string().trim().min(1).optional(),
    contentDigest: z.string().trim().min(1).optional(),
    schemaVersion: z.string().trim().min(1).optional(),
  })
  .strict();

export type ParsedTouchContentRevisionInput = z.infer<
  typeof TouchContentRevisionInputSchema
>;

export const ContentSyncStatusSchema = z.enum([
  "in-sync",
  "ahead",
  "behind",
  "diverged",
  "unknown",
]);

export type ContentSyncStatus = z.infer<typeof ContentSyncStatusSchema>;

export function normalizeTouchContentRevisionInput(
  input: TouchContentRevisionInput,
): ParsedTouchContentRevisionInput {
  const parsed = TouchContentRevisionInputSchema.parse(input);

  return {
    ...parsed,
    scope: parsed.scope ?? CONTENT_SITE_STATE_SCOPE,
    schemaVersion: parsed.schemaVersion ?? CONTENT_SCHEMA_VERSION,
  };
}

export function createTouchedContentSiteState(input: {
  previousState?: ContentSiteState | null;
  mutation: TouchContentRevisionInput;
  revisionId?: string;
}): ContentSiteState {
  const normalized = normalizeTouchContentRevisionInput(input.mutation);
  const previousRevisionSeq = input.previousState?.revisionSeq ?? 0;
  const updatedAt = normalized.timestamp ?? new Date().toISOString();
  const currentRevisionId = input.revisionId ?? crypto.randomUUID();

  return ContentSiteStateSchema.parse({
    scope: normalized.scope,
    currentRevisionId,
    revisionSeq: previousRevisionSeq + 1,
    contentDigest: normalized.contentDigest,
    updatedAt,
    updatedBy: normalized.updatedBy,
    lastMutationKind: normalized.mutationKind,
    lastMutationTarget: normalized.mutationTarget,
    schemaVersion: normalized.schemaVersion,
  });
}

export function isTerminalContentMutationKind(
  kind: ContentMutationKind,
): boolean {
  return (
    kind === "push" ||
    kind === "pull" ||
    kind === "seed" ||
    kind === "migrate-json"
  );
}
