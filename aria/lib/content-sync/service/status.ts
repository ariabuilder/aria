import {
  ContentSyncStatusDataSchema,
  type ContentSyncEndpointId,
  type ContentSyncJob,
} from "../schema";
import { ContentSyncStatusSchema, type ContentSyncStatus } from "../types";
import { toContentSyncRevisionSnapshot } from "../schema";
import type { StorageAdapter } from "../../storage/adapter";
import { ContentSyncRepository } from "./repository";

export interface DeriveContentSyncStatusInput {
  localAdapter: StorageAdapter;
  remoteAdapter: StorageAdapter;
  repository: ContentSyncRepository;
  localEndpointId: ContentSyncEndpointId;
  remoteEndpointId: ContentSyncEndpointId;
  evaluatedAt?: string;
}

function isSameRevision(
  leftRevisionId?: string,
  rightRevisionId?: string,
): boolean {
  return (
    typeof leftRevisionId === "string" &&
    typeof rightRevisionId === "string" &&
    leftRevisionId.length > 0 &&
    leftRevisionId === rightRevisionId
  );
}

function deriveStatusFromAnchor(input: {
  localRevisionId?: string;
  remoteRevisionId?: string;
  anchorLocalRevisionId?: string;
  anchorRemoteRevisionId?: string;
}): ContentSyncStatus {
  const {
    localRevisionId,
    remoteRevisionId,
    anchorLocalRevisionId,
    anchorRemoteRevisionId,
  } = input;

  if (!localRevisionId || !remoteRevisionId) {
    return "unknown";
  }

  if (localRevisionId === remoteRevisionId) {
    return "in-sync";
  }

  if (!anchorLocalRevisionId || !anchorRemoteRevisionId) {
    return "unknown";
  }

  const localChanged = localRevisionId !== anchorLocalRevisionId;
  const remoteChanged = remoteRevisionId !== anchorRemoteRevisionId;

  if (localChanged && !remoteChanged) {
    return "ahead";
  }

  if (!localChanged && remoteChanged) {
    return "behind";
  }

  if (localChanged && remoteChanged) {
    return "diverged";
  }

  return "unknown";
}

function getLatestJobIdByMode(
  jobs: readonly ContentSyncJob[],
  mode: "dry-run" | "apply",
): string | undefined {
  const match = jobs.find((job) => job.mode === mode);
  return match?.id;
}

export async function deriveContentSyncStatus(
  input: DeriveContentSyncStatusInput,
) {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();

  const [localState, remoteState, latestSuccessfulSync, recentJobs] =
    await Promise.all([
      input.localAdapter.getContentSiteState(),
      input.remoteAdapter.getContentSiteState(),
      input.repository.getLatestSuccessfulSyncAnchor(),
      input.repository.listRecentJobs({ limit: 10 }),
    ]);

  const localRevision = toContentSyncRevisionSnapshot(localState);
  const remoteRevision = toContentSyncRevisionSnapshot(remoteState);

  const status = deriveStatusFromAnchor({
    localRevisionId: localRevision?.revisionId,
    remoteRevisionId: remoteRevision?.revisionId,
    anchorLocalRevisionId: latestSuccessfulSync?.localRevisionId,
    anchorRemoteRevisionId: latestSuccessfulSync?.remoteRevisionId,
  });

  return ContentSyncStatusDataSchema.parse({
    status,
    localEndpointId: input.localEndpointId,
    remoteEndpointId: input.remoteEndpointId,
    localRevision,
    remoteRevision,
    latestSuccessfulSync: latestSuccessfulSync
      ? {
          jobId: latestSuccessfulSync.jobId,
          direction: latestSuccessfulSync.direction,
          completedAt: latestSuccessfulSync.completedAt,
          localRevisionId: latestSuccessfulSync.localRevisionId,
          remoteRevisionId: latestSuccessfulSync.remoteRevisionId,
        }
      : null,
    latestPlanJobId: getLatestJobIdByMode(recentJobs, "dry-run"),
    latestApplyJobId: getLatestJobIdByMode(recentJobs, "apply"),
    evaluatedAt,
  });
}

export interface DetermineContentSyncStatusInput {
  localRevisionId?: string;
  remoteRevisionId?: string;
  latestSuccessfulSync: {
    localRevisionId?: string;
    remoteRevisionId?: string;
  } | null;
}

export function determineContentSyncStatus(
  input: DetermineContentSyncStatusInput,
): ContentSyncStatus {
  return ContentSyncStatusSchema.parse(
    deriveStatusFromAnchor({
      localRevisionId: input.localRevisionId,
      remoteRevisionId: input.remoteRevisionId,
      anchorLocalRevisionId: input.latestSuccessfulSync?.localRevisionId,
      anchorRemoteRevisionId: input.latestSuccessfulSync?.remoteRevisionId,
    }),
  );
}

export function hasMatchingCurrentRevisions(input: {
  localRevisionId?: string;
  remoteRevisionId?: string;
}): boolean {
  return isSameRevision(input.localRevisionId, input.remoteRevisionId);
}
