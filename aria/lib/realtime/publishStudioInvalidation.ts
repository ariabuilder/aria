import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import {
  StudioInvalidationDeliverySchema,
  StudioLiveInvalidationSchema,
  type StudioInvalidationDelivery,
  type StudioLiveInvalidation,
} from "./studioLive";

type InvalidationContext = {
  locals?: RuntimeLocals;
  request?: Request;
};

/**
 * Publish after durable storage succeeds. Delivery is attached to
 * the request lifetime when Cloudflare supplies an ExecutionContext.
 */
export async function publishStudioInvalidation(
  context: InvalidationContext,
  input: Omit<StudioLiveInvalidation, "eventId">,
): Promise<StudioInvalidationDelivery> {
  const namespace = getCloudflareEnv(context.locals).aria_studio_live;
  const event = StudioLiveInvalidationSchema.parse({
    ...input,
    eventId: crypto.randomUUID(),
  });

  if (!namespace || !context.request) {
    return StudioInvalidationDeliverySchema.parse({
      status: "unavailable",
      eventId: event.eventId,
      siteRevision: event.siteRevision,
    });
  }

  const startedAt = performance.now();
  const host = new URL(context.request.url).host.toLowerCase();

  try {
    const stub = namespace.getByName(host);
    await stub.publishInvalidation(event);
    return StudioInvalidationDeliverySchema.parse({
      status: "delivered",
      eventId: event.eventId,
      siteRevision: event.siteRevision,
    });
  } catch (error: unknown) {
    console.warn("[Studio Live] Invalidation publication failed", {
      code: "STUDIO_LIVE_RPC_FAILED",
      eventId: event.eventId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      siteRevision: event.siteRevision,
      runtime: "cloudflare",
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
    return StudioInvalidationDeliverySchema.parse({
      status: "failed",
      eventId: event.eventId,
      siteRevision: event.siteRevision,
      code: "STUDIO_LIVE_RPC_FAILED",
    });
  }
}
