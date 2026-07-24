#!/usr/bin/env -S npx tsx

import { getApiSqlDatabase } from "../lib/api/database";
import { readApiKeyring } from "../lib/api/crypto";
import { runNodeIntegrationWorker } from "../lib/integrations/nodeWorker";
import { readWebhookEgressPolicy } from "../lib/integrations/webhooks/egress";

const controller = new AbortController();
let stopping = false;

function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.info(
    JSON.stringify({ event: "integration.worker.stopping", signal }),
  );
  controller.abort();
}

process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));

const policy = readWebhookEgressPolicy();
if (policy.mode !== "proxy") {
  throw new Error("NODE_WEBHOOK_EGRESS_PROXY_REQUIRED");
}
readApiKeyring();
const database = await getApiSqlDatabase();
await database.queryFirst(
  `SELECT id FROM aria_event_outbox ORDER BY created_at LIMIT 1`,
);
await database.queryFirst(
  `SELECT id FROM aria_webhook_deliveries ORDER BY created_at LIMIT 1`,
);

console.info(
  JSON.stringify({
    event: "integration.worker.ready",
    egressMode: policy.mode,
  }),
);

await runNodeIntegrationWorker({
  database,
  signal: controller.signal,
  intervalMs: Number(process.env.ARIA_INTEGRATION_WORKER_INTERVAL_MS ?? 5_000),
});

console.info(JSON.stringify({ event: "integration.worker.stopped" }));
