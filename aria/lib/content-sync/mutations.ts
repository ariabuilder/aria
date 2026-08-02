import type {
  StorageAdapter,
  TouchContentRevisionInput,
} from "../storage/adapter";
import { purgeAllPublicPageCache } from "../cache/service";
import {
  normalizeTouchContentRevisionInput,
  type ParsedTouchContentRevisionInput,
} from "./types";
import { publishStudioInvalidation } from "../realtime/publishStudioInvalidation";
import { log } from "../utils/logger";
import type { StudioInvalidationDelivery } from "../realtime/studioLive";

type ActionContextLike = {
  locals?: App.Locals;
  request?: Request;
};

function assertNeverDelivery(value: never): never {
  throw new Error(`Unhandled Studio invalidation delivery: ${String(value)}`);
}

function recordStudioDelivery(delivery: StudioInvalidationDelivery): void {
  switch (delivery.status) {
    case "delivered":
      return;
    case "unavailable":
      log("debug", "Studio Live push unavailable; revision fallback active", {
        code: "STUDIO_LIVE_UNAVAILABLE",
        eventId: delivery.eventId,
        siteRevision: delivery.siteRevision,
      });
      return;
    case "failed":
      return;
    default:
      assertNeverDelivery(delivery);
  }
}

function liveResourceTypeForMutation(
  mutationKind: TouchContentRevisionInput["mutationKind"],
): "page" | "component" | "layout" | null {
  if (
    mutationKind === "save-page" ||
    mutationKind === "delete-page" ||
    mutationKind === "save-page-metadata"
  ) {
    return "page";
  }
  if (
    mutationKind === "save-component" ||
    mutationKind === "delete-component"
  ) {
    return "component";
  }
  if (mutationKind === "save-layout" || mutationKind === "delete-layout") {
    return "layout";
  }
  return null;
}

function getActorId(context?: ActionContextLike): string | undefined {
  const candidate = (context?.locals as { user?: { id?: unknown } } | undefined)
    ?.user?.id;

  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : undefined;
}

/**
 * Touch the global content revision counter.
 *
 * Canonical per-asset authorship lives on version/singleton rows via
 * AuthorshipSaveContext — not in aria_content_site_state.updated_by.
 */
export async function touchContentRevision(
  adapter: StorageAdapter,
  input: TouchContentRevisionInput,
  context?: ActionContextLike,
) {
  const normalized = normalizeTouchContentRevisionInput(input);

  return adapter.touchContentRevision({
    ...normalized,
    updatedBy: normalized.updatedBy ?? getActorId(context),
  });
}

export async function touchContentRevisionForAction(
  adapter: StorageAdapter,
  mutation: Omit<TouchContentRevisionInput, "updatedBy">,
  context?: ActionContextLike,
) {
  const revision = await touchContentRevision(adapter, mutation, context);

  switch (mutation.mutationKind) {
    case "save-layout":
    case "delete-layout":
    case "save-component":
    case "delete-component":
    case "save-styles":
    case "save-site-settings": {
      await purgeAllPublicPageCache(context ?? {}, mutation.mutationKind);
      break;
    }
    default:
      break;
  }

  const resourceType = liveResourceTypeForMutation(mutation.mutationKind);
  if (resourceType && mutation.mutationTarget) {
    const delivery = await publishStudioInvalidation(context ?? {}, {
      siteRevision: revision.revisionSeq,
      resourceType,
      resourceId: mutation.mutationTarget,
      scopes:
        mutation.mutationKind === "save-page-metadata"
          ? ["metadata", "policy", "render"]
          : ["content", "metadata", "render", "history"],
    });
    recordStudioDelivery(delivery);
  }

  return revision;
}

export function withContentRevisionDefaults(
  input: TouchContentRevisionInput,
  context?: ActionContextLike,
): ParsedTouchContentRevisionInput {
  const normalized = normalizeTouchContentRevisionInput(input);

  return {
    ...normalized,
    updatedBy: normalized.updatedBy ?? getActorId(context),
  };
}
