import type { AriaCloudflareEnv, RuntimeLocals } from "../lib/cloudflare/env";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";

const RATE_RESERVATION_RETENTION_MS = 48 * 60 * 60 * 1_000;

/** Bounded scheduled retention for non-canonical workflow and UGC support rows. */
export async function reconcileWorkflowRetention(env: AriaCloudflareEnv): Promise<void> {
  const locals: RuntimeLocals = { cfBindings: env };
  const adapter = await getStorageAdapterAsync(locals);
  const now = new Date();
  await Promise.all([
    adapter.pruneCmsEntryAutosaves(now.toISOString()),
    adapter.prunePublicCommentRateReservations(
      new Date(now.getTime() - RATE_RESERVATION_RETENTION_MS).toISOString(),
    ),
  ]);
}
