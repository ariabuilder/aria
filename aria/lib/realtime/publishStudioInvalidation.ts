import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import {
  StudioLiveInvalidationSchema,
  type StudioLiveInvalidation,
} from "./studioLive";

type StudioLiveRpcStub = {
  publishInvalidation(input: StudioLiveInvalidation): Promise<void>;
};

type InvalidationContext = {
  locals?: RuntimeLocals;
  request?: Request;
};

/**
 * Publish after durable storage succeeds. Delivery is attached to
 * the request lifetime when Cloudflare supplies an ExecutionContext, so.
 */
export async function publishStudioInvalidation(
  context: InvalidationContext,
  input: Omit<StudioLiveInvalidation, "eventId">,
): Promise<void> {
  const namespace = getCloudflareEnv(context.locals).aria_studio_live;
  if (!namespace || !context.request) return;

  const host = new URL(context.request.url).host.toLowerCase();
  const event = StudioLiveInvalidationSchema.parse({
    ...input,
    eventId: crypto.randomUUID(),
  });
  const stub = namespace.get(
    namespace.idFromName(host),
  ) as unknown as StudioLiveRpcStub;
  await stub.publishInvalidation(event).catch((error: unknown) => {
    console.warn("[Studio Live] Invalidation publication failed", {
      eventId: event.eventId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
