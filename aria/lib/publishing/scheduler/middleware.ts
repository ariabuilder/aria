import type { RuntimeLocals } from "../../cloudflare/env";
import { log } from "../../utils/logger";
import { getScheduleSqlExecutor } from "./index";
import { reconcileScheduledPublications } from "./reconcile";
import { getStorageAdapterAsync } from "../../storage/getStorageAdapter";

const RECONCILE_INTERVAL_MS = 60_000;

let lastReconcileAt = 0;
let reconcileInFlight: Promise<void> | null = null;

export async function maybeReconcileScheduledPublications(
  locals: RuntimeLocals,
): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }

  const now = Date.now();
  if (now - lastReconcileAt < RECONCILE_INTERVAL_MS) {
    return;
  }

  if (reconcileInFlight) {
    return;
  }

  lastReconcileAt = now;
  reconcileInFlight = (async () => {
    const adapter = await getStorageAdapterAsync(locals);
    const sql = await getScheduleSqlExecutor(locals);
    await reconcileScheduledPublications(adapter, sql);
  })()
    .catch((error) => {
      log("warn", "[publishing-scheduler] Dev reconcile failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      reconcileInFlight = null;
    });

  await reconcileInFlight;
}
