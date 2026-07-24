import { LocalMediaEndpoint } from "../media/endpoints/local";
import { CloudflareR2Endpoint } from "../media/endpoints/cloudflare-r2";
import { createRemoteR2HttpBucket } from "../media/endpoints/r2-http-bucket";
import { createWranglerCliR2Bucket } from "../media/endpoints/r2-wrangler-cli-bucket";
import { MediaSyncPlanner } from "../media/sync/planner";
import { MediaSyncExecutor } from "../media/sync/executor";
import type { ConflictPolicy } from "../media/types";
import { readR2PublicUrlFromWrangler, readWranglerToml } from "../storage/wrangler-config";

export type CliMediaSyncResult = {
  summary: {
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    conflicted: number;
    failed: number;
  };
};

export async function runCliMediaSync(input: {
  localTarget: boolean;
  conflictPolicy?: ConflictPolicy;
  includeDeletes?: boolean;
  dryRun?: boolean;
}): Promise<CliMediaSyncResult> {
  const conflictPolicy = input.conflictPolicy ?? "local-wins";
  const includeDeletes = input.includeDeletes ?? false;
  const source = new LocalMediaEndpoint();
  const toml = readWranglerToml();
  const publicUrl = readR2PublicUrlFromWrangler(toml) ?? "";

  const bucket = input.localTarget
    ? createWranglerCliR2Bucket({ local: true })
    : await createRemoteR2HttpBucket();

  const target = new CloudflareR2Endpoint({
    bucket,
    baseUrl: publicUrl,
  });

  const planner = new MediaSyncPlanner();
  const plan = await planner.plan({
    direction: "push",
    source,
    target,
    conflictPolicy,
    includeDeletes,
  });

  if (input.dryRun) {
    return {
      summary: {
        created: plan.summary.created,
        updated: plan.summary.updated,
        deleted: plan.summary.deleted,
        skipped: plan.summary.skipped,
        conflicted: plan.summary.conflicted,
        failed: 0,
      },
    };
  }

  const executor = new MediaSyncExecutor();
  const applied = await executor.apply({
    plan,
    source,
    target,
  });

  return {
    summary: {
      created: applied.summary.created,
      updated: applied.summary.updated,
      deleted: applied.summary.deleted,
      skipped: applied.summary.skipped,
      conflicted: applied.summary.conflicted,
      failed: applied.summary.failed,
    },
  };
}
