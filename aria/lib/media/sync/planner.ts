import type {
  ConflictPolicy,
  MediaObjectRef,
  MediaPlanAction,
  MediaSyncPlan,
  MediaSyncPlanItem,
  SyncDirection,
  MediaEndpoint,
} from "../types";
import { MediaSyncPlanSchema } from "../types";

type PlannerInput = {
  direction: SyncDirection;
  source: MediaEndpoint;
  target: MediaEndpoint;
  conflictPolicy: ConflictPolicy;
  includeDeletes: boolean;
};

const LIST_PAGE_LIMIT = 1000;

function toTimestamp(input?: string): number | null {
  if (!input) return null;
  const value = new Date(input).getTime();
  return Number.isFinite(value) ? value : null;
}

function resolveUpdateOrSkip(
  direction: SyncDirection,
  conflictPolicy: ConflictPolicy,
  source: MediaObjectRef,
  target: MediaObjectRef,
): Pick<MediaSyncPlanItem, "action" | "reason"> {
  if (conflictPolicy === "manual") {
    return { action: "conflict", reason: "manual-conflict-required" };
  }

  if (conflictPolicy === "local-wins") {
    return direction === "push"
      ? { action: "update", reason: "local-wins-source-overwrites-target" }
      : { action: "skip", reason: "local-wins-target-preserved" };
  }

  if (conflictPolicy === "remote-wins") {
    return direction === "pull"
      ? { action: "update", reason: "remote-wins-source-overwrites-target" }
      : { action: "skip", reason: "remote-wins-target-preserved" };
  }

  const sourceTs = toTimestamp(source.updatedAt);
  const targetTs = toTimestamp(target.updatedAt);

  if (sourceTs !== null && targetTs !== null) {
    if (sourceTs > targetTs) {
      return { action: "update", reason: "newest-wins-source-newer" };
    }
    if (sourceTs < targetTs) {
      return { action: "skip", reason: "newest-wins-target-newer" };
    }
  }

  return { action: "conflict", reason: "newest-wins-insufficient-timestamp" };
}

function resolveDeleteOrSkip(
  direction: SyncDirection,
  conflictPolicy: ConflictPolicy,
): Pick<MediaSyncPlanItem, "action" | "reason"> {
  if (conflictPolicy === "manual") {
    return { action: "conflict", reason: "manual-delete-conflict" };
  }

  if (conflictPolicy === "local-wins") {
    return direction === "push"
      ? { action: "delete", reason: "local-wins-source-delete" }
      : { action: "skip", reason: "local-wins-delete-skipped" };
  }

  if (conflictPolicy === "remote-wins") {
    return direction === "pull"
      ? { action: "delete", reason: "remote-wins-source-delete" }
      : { action: "skip", reason: "remote-wins-delete-skipped" };
  }

  return { action: "conflict", reason: "newest-wins-delete-requires-manual" };
}

function comparePair(
  direction: SyncDirection,
  conflictPolicy: ConflictPolicy,
  source: MediaObjectRef,
  target: MediaObjectRef | null,
): MediaSyncPlanItem {
  if (!target) {
    return {
      logicalPath: source.key,
      action: "create",
      reason: "target-missing",
      sourceChecksum: source.checksumSha256,
      sourceEtag: source.etag,
      sourceSizeBytes: source.sizeBytes,
    };
  }

  if (source.checksumSha256 && target.checksumSha256) {
    if (source.checksumSha256 === target.checksumSha256) {
      return {
        logicalPath: source.key,
        action: "skip",
        reason: "same-checksum",
        sourceChecksum: source.checksumSha256,
        targetChecksum: target.checksumSha256,
        sourceSizeBytes: source.sizeBytes,
        targetSizeBytes: target.sizeBytes,
      };
    }

    const resolution = resolveUpdateOrSkip(
      direction,
      conflictPolicy,
      source,
      target,
    );

    return {
      logicalPath: source.key,
      action: resolution.action,
      reason: `checksum-mismatch-${resolution.reason}`,
      sourceChecksum: source.checksumSha256,
      targetChecksum: target.checksumSha256,
      sourceEtag: source.etag,
      targetEtag: target.etag,
      sourceSizeBytes: source.sizeBytes,
      targetSizeBytes: target.sizeBytes,
    };
  }

  if (source.etag && target.etag) {
    if (source.etag === target.etag) {
      return {
        logicalPath: source.key,
        action: "skip",
        reason: "same-etag",
        sourceEtag: source.etag,
        targetEtag: target.etag,
        sourceSizeBytes: source.sizeBytes,
        targetSizeBytes: target.sizeBytes,
      };
    }

    const resolution = resolveUpdateOrSkip(
      direction,
      conflictPolicy,
      source,
      target,
    );

    return {
      logicalPath: source.key,
      action: resolution.action,
      reason: `etag-mismatch-${resolution.reason}`,
      sourceEtag: source.etag,
      targetEtag: target.etag,
      sourceSizeBytes: source.sizeBytes,
      targetSizeBytes: target.sizeBytes,
    };
  }

  const sameSize =
    source.sizeBytes !== undefined &&
    target.sizeBytes !== undefined &&
    source.sizeBytes === target.sizeBytes;
  const sameTimestamp =
    source.updatedAt !== undefined &&
    target.updatedAt !== undefined &&
    source.updatedAt === target.updatedAt;

  if (sameSize && sameTimestamp) {
    return {
      logicalPath: source.key,
      action: "skip",
      reason: "same-size-timestamp",
      sourceSizeBytes: source.sizeBytes,
      targetSizeBytes: target.sizeBytes,
    };
  }

  const resolution = resolveUpdateOrSkip(
    direction,
    conflictPolicy,
    source,
    target,
  );
  return {
    logicalPath: source.key,
    action: resolution.action,
    reason: `metadata-fallback-${resolution.reason}`,
    sourceChecksum: source.checksumSha256,
    targetChecksum: target.checksumSha256,
    sourceEtag: source.etag,
    targetEtag: target.etag,
    sourceSizeBytes: source.sizeBytes,
    targetSizeBytes: target.sizeBytes,
  };
}

function summarize(items: MediaSyncPlanItem[]): MediaSyncPlan["summary"] {
  const counters: Record<MediaPlanAction, number> = {
    create: 0,
    update: 0,
    delete: 0,
    skip: 0,
    conflict: 0,
  };

  for (const item of items) {
    counters[item.action] += 1;
  }

  return {
    total: items.length,
    created: counters.create,
    updated: counters.update,
    deleted: counters.delete,
    skipped: counters.skip,
    conflicted: counters.conflict,
  };
}

async function listAllObjects(
  endpoint: MediaEndpoint,
): Promise<MediaObjectRef[]> {
  const allObjects: MediaObjectRef[] = [];
  let cursor: string | undefined;

  do {
    const page = await endpoint.list({
      limit: LIST_PAGE_LIMIT,
      cursor,
    });

    allObjects.push(...page.objects);
    cursor = page.nextCursor;
  } while (cursor);

  return allObjects;
}

export class MediaSyncPlanner {
  async plan(input: PlannerInput): Promise<MediaSyncPlan> {
    const sourceObjects = await listAllObjects(input.source);
    const targetObjects = await listAllObjects(input.target);

    const sourceByKey = new Map(sourceObjects.map((obj) => [obj.key, obj]));
    const targetByKey = new Map(targetObjects.map((obj) => [obj.key, obj]));

    const items: MediaSyncPlanItem[] = [];

    for (const sourceObject of sourceByKey.values()) {
      const targetHead = await input.target.head(sourceObject.key);
      const targetObject =
        targetHead ?? targetByKey.get(sourceObject.key) ?? null;
      items.push(
        comparePair(
          input.direction,
          input.conflictPolicy,
          sourceObject,
          targetObject,
        ),
      );
    }

    if (input.includeDeletes) {
      for (const targetObject of targetByKey.values()) {
        if (sourceByKey.has(targetObject.key)) continue;
        const resolution = resolveDeleteOrSkip(
          input.direction,
          input.conflictPolicy,
        );
        items.push({
          logicalPath: targetObject.key,
          action: resolution.action,
          reason: resolution.reason,
          targetChecksum: targetObject.checksumSha256,
          targetEtag: targetObject.etag,
          targetSizeBytes: targetObject.sizeBytes,
        });
      }
    }

    return MediaSyncPlanSchema.parse({
      sourceEndpointId: input.source.id,
      targetEndpointId: input.target.id,
      direction: input.direction,
      conflictPolicy: input.conflictPolicy,
      includeDeletes: input.includeDeletes,
      items,
      summary: summarize(items),
    });
  }
}
