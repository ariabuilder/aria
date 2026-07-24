import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import type { IntegrationEventCommit } from "./events";

function hasWaitUntil(
  value: unknown,
): value is { waitUntil(promise: Promise<unknown>): void } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { waitUntil?: unknown }).waitUntil === "function"
  );
}

/**
 * Wake the delivery queue after the outbox row has committed. The durable
 * outbox remains the source of truth, so a transient Queue failure is.
 */
export async function scheduleIntegrationEventWakeup(
  locals: RuntimeLocals | undefined,
  event: IntegrationEventCommit,
): Promise<void> {
  const queue = getCloudflareEnv(locals).aria_integration_queue;
  if (!queue) return;

  const send = queue.send({ outboxId: event.outboxId }).catch((error) => {
    console.error(
      JSON.stringify({
        event: "integration.queue.wakeup_failed",
        eventId: event.id,
        outboxId: event.outboxId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  if (hasWaitUntil(locals?.cfContext)) {
    locals.cfContext.waitUntil(send);
    return;
  }
  await send;
}
