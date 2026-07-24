import {
  MediaPlanActionSchema,
  type MediaEndpoint,
  type MediaSyncPlan,
  type MediaSyncPlanItem,
} from "../types";
import type { PersistedSyncItem } from "./repository";
import { enforceMediaSyncPolicy } from "../utils/policy";
import {
  buildMediaAuthorshipContext,
  type MediaAuthorshipMutationKind,
} from "../../authorship/stamping";
import type { MediaAssetAuthorshipContext } from "../catalog/repository";
import type { MediaCatalogRepository } from "../catalog/repository";
import type { EndpointId } from "../endpoints/registry";
import { computeSHA256 } from "../utils/checksum";

export type MediaApplySummary = {
  total: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicted: number;
  failed: number;
};

export type MediaApplyResult = {
  summary: MediaApplySummary;
  items: PersistedSyncItem[];
};

export type MediaSyncCatalogContext = {
  repository: MediaCatalogRepository;
  targetEndpointId: EndpointId;
  authorship: MediaAssetAuthorshipContext;
};

function emptySummary(total: number): MediaApplySummary {
  return {
    total,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    conflicted: 0,
    failed: 0,
  };
}

function catalogMutationKindForPlanAction(
  action: MediaSyncPlanItem["action"],
): MediaAuthorshipMutationKind {
  switch (action) {
    case "delete":
      return "delete";
    case "create":
      return "restore";
    case "update":
      return "update";
    default:
      return "update";
  }
}

function authorshipForPlanItem(
  baseAuthorship: MediaAssetAuthorshipContext,
  action: MediaSyncPlanItem["action"],
): MediaAssetAuthorshipContext {
  const mutationKind = catalogMutationKindForPlanAction(action);
  return buildMediaAuthorshipContext(baseAuthorship.actor, mutationKind);
}

export class MediaSyncExecutor {
  async apply(input: {
    plan: MediaSyncPlan;
    source: MediaEndpoint;
    target: MediaEndpoint;
    catalog?: MediaSyncCatalogContext;
  }): Promise<MediaApplyResult> {
    const summary = emptySummary(input.plan.items.length);
    const items: PersistedSyncItem[] = [];

    for (const planItem of input.plan.items) {
      const action = MediaPlanActionSchema.parse(planItem.action);
      const itemId = crypto.randomUUID();

      if (action === "skip") {
        summary.skipped += 1;
        items.push({
          id: itemId,
          logicalPath: planItem.logicalPath,
          action,
          reason: planItem.reason,
          sourceChecksum: planItem.sourceChecksum,
          targetChecksum: planItem.targetChecksum,
          sourceEtag: planItem.sourceEtag,
          targetEtag: planItem.targetEtag,
          resultStatus: "skipped",
        });
        continue;
      }

      if (action === "conflict") {
        summary.conflicted += 1;
        items.push({
          id: itemId,
          logicalPath: planItem.logicalPath,
          action,
          reason: planItem.reason,
          sourceChecksum: planItem.sourceChecksum,
          targetChecksum: planItem.targetChecksum,
          sourceEtag: planItem.sourceEtag,
          targetEtag: planItem.targetEtag,
          resultStatus: "skipped",
          errorMessage: "Conflict requires manual resolution",
        });
        continue;
      }

      try {
        if (action === "delete") {
          const targetMeta = await input.target.head(planItem.logicalPath);
          enforceMediaSyncPolicy({
            logicalPath: planItem.logicalPath,
            mimeType: targetMeta?.mimeType,
          });

          await input.target.delete(planItem.logicalPath);

          if (input.catalog) {
            try {
              await input.catalog.repository.markDeleted(
                {
                  logicalPath: planItem.logicalPath,
                  updatedAt: new Date().toISOString(),
                },
                authorshipForPlanItem(input.catalog.authorship, action),
              );
            } catch {
              // best-effort catalog sync
            }
          }

          summary.deleted += 1;

          items.push({
            id: itemId,
            logicalPath: planItem.logicalPath,
            action,
            reason: planItem.reason,
            sourceChecksum: planItem.sourceChecksum,
            targetChecksum: planItem.targetChecksum,
            sourceEtag: planItem.sourceEtag,
            targetEtag: planItem.targetEtag,
            resultStatus: "applied",
          });
          continue;
        }

        const sourceBuffer = await input.source.get(planItem.logicalPath);
        if (!sourceBuffer) {
          throw new Error(`Source object not found: ${planItem.logicalPath}`);
        }

        const sourceMeta = await input.source.head(planItem.logicalPath);
        enforceMediaSyncPolicy({
          logicalPath: planItem.logicalPath,
          mimeType: sourceMeta?.mimeType,
        });

        const targetMeta = await input.target.put(
          planItem.logicalPath,
          sourceBuffer,
          {
            mimeType: sourceMeta?.mimeType,
          },
        );

        if (input.catalog) {
          const filename =
            planItem.logicalPath.split("/").pop() || planItem.logicalPath;
          const extension = (() => {
            const dot = filename.lastIndexOf(".");
            if (dot <= 0 || dot === filename.length - 1) return undefined;
            return filename.slice(dot + 1).toLowerCase();
          })();

          const checksumSha256 =
            sourceMeta?.checksumSha256 ??
            planItem.sourceChecksum ??
            computeSHA256(sourceBuffer);

          try {
            await input.catalog.repository.upsertUploadedMedia(
              {
                logicalPath: planItem.logicalPath,
                filename,
                extension,
                mimeType: sourceMeta?.mimeType,
                sizeBytes: sourceBuffer.byteLength,
                checksumSha256,
                endpointId: input.catalog.targetEndpointId,
                publicUrl: targetMeta.url,
                objectKey: targetMeta.key,
                etag: targetMeta.etag,
                updatedAt: new Date().toISOString(),
              },
              authorshipForPlanItem(input.catalog.authorship, action),
            );
          } catch {
            // best-effort catalog sync
          }
        }

        if (action === "create") summary.created += 1;
        if (action === "update") summary.updated += 1;

        items.push({
          id: itemId,
          logicalPath: planItem.logicalPath,
          action,
          reason: planItem.reason,
          sourceChecksum: planItem.sourceChecksum,
          targetChecksum: planItem.targetChecksum,
          sourceEtag: planItem.sourceEtag,
          targetEtag: planItem.targetEtag,
          resultStatus: "applied",
        });
      } catch (error) {
        summary.failed += 1;
        items.push({
          id: itemId,
          logicalPath: planItem.logicalPath,
          action,
          reason: planItem.reason,
          sourceChecksum: planItem.sourceChecksum,
          targetChecksum: planItem.targetChecksum,
          sourceEtag: planItem.sourceEtag,
          targetEtag: planItem.targetEtag,
          resultStatus: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      summary,
      items,
    };
  }
}
