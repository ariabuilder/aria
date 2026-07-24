import type { AriaCloudflareEnv, RuntimeLocals } from "../lib/cloudflare/env";
import { getScheduleSqlExecutor } from "../lib/publishing/scheduler";
import { reconcileScheduledPublications } from "../lib/publishing/scheduler/reconcile";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";

function locals(env: AriaCloudflareEnv): RuntimeLocals {
  return { cfBindings: env };
}

export async function reconcileScheduledPublish(
  env: AriaCloudflareEnv,
): Promise<void> {
  const runtimeLocals = locals(env);
  const [adapter, sql] = await Promise.all([
    getStorageAdapterAsync(runtimeLocals),
    getScheduleSqlExecutor(runtimeLocals),
  ]);
  await reconcileScheduledPublications(adapter, sql, {
    cacheLocals: runtimeLocals,
  });
}
