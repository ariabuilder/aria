import type { APIRoute } from "astro";
import { z } from "zod";
import {
  StudioPresenceHeartbeatSchema,
  StudioRevisionCheckpointSchema,
  StudioSyncSnapshotSchema,
} from "../../../../aria/lib/realtime/studioLive";
import { getStorageAdapterAsync } from "../../../../aria/lib/storage/getStorageAdapter";
import type { StorageAdapter } from "../../../../aria/lib/storage/adapter";
import { requireAdminApiCapabilities } from "./_auth";

export const prerender = false;

const SESSION_TTL_MS = 70_000;
const EDIT_LEASE_MS = 45_000;
const SessionQuerySchema = z.object({ sessionId: z.uuid() }).strict();

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function createSnapshot(
  adapter: StorageAdapter,
  now: number,
): Promise<Response> {
  const [state, sessions] = await Promise.all([
    adapter.getContentSiteState(),
    adapter.listStudioPresenceSessions(now),
  ]);
  const checkpoint = state
    ? StudioRevisionCheckpointSchema.parse({
        revisionSeq: state.revisionSeq,
        currentRevisionId: state.currentRevisionId,
        lastMutationKind: state.lastMutationKind,
        lastMutationTarget: state.lastMutationTarget,
        updatedAt: state.updatedAt,
      })
    : null;
  return jsonResponse(
    StudioSyncSnapshotSchema.parse({ checkpoint, sessions, serverTime: now }),
  );
}

export const GET: APIRoute = async ({ locals, cookies }) => {
  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["editPages", "editPageContent", "reviewContent"],
  });
  if (!auth.ok) return auth.response;

  const adapter = await getStorageAdapterAsync(locals);
  return createSnapshot(adapter, Date.now());
};

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["editPages", "editPageContent", "reviewContent"],
  });
  if (!auth.ok) return auth.response;

  const raw: unknown = await request.json().catch(() => null);
  const parsed = StudioPresenceHeartbeatSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { code: "STUDIO_PRESENCE_INVALID", message: "Invalid presence update" },
      400,
    );
  }

  const now = Date.now();
  if (
    parsed.data.connectedAt > parsed.data.lastActivityAt ||
    parsed.data.lastActivityAt > now + 5_000
  ) {
    return jsonResponse(
      {
        code: "STUDIO_PRESENCE_TIME_INVALID",
        message: "Invalid presence timestamp",
      },
      400,
    );
  }

  const adapter = await getStorageAdapterAsync(locals);
  const accepted = await adapter.upsertStudioPresenceSession({
    sessionId: parsed.data.sessionId,
    userId: auth.user.id,
    displayName: auth.user.username,
    avatarUrl: auth.user.avatarUrl ?? null,
    surface: parsed.data.presence.surface,
    resourceType: parsed.data.presence.resourceType,
    resourceId: parsed.data.presence.resourceId,
    state: parsed.data.presence.state,
    dirty: parsed.data.presence.dirty,
    connectedAt: parsed.data.connectedAt,
    lastActivityAt: parsed.data.lastActivityAt,
    leaseExpiresAt:
      parsed.data.presence.state === "editing" ? now + EDIT_LEASE_MS : null,
    expiresAt: now + SESSION_TTL_MS,
  });
  if (!accepted) {
    return jsonResponse(
      {
        code: "STUDIO_PRESENCE_STALE",
        message: "Stale presence update ignored",
      },
      409,
    );
  }
  return createSnapshot(adapter, now);
};

export const DELETE: APIRoute = async ({ locals, cookies, url }) => {
  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["editPages", "editPageContent", "reviewContent"],
  });
  if (!auth.ok) return auth.response;

  const parsed = SessionQuerySchema.safeParse({
    sessionId: url.searchParams.get("sessionId"),
  });
  if (!parsed.success) {
    return jsonResponse(
      { code: "STUDIO_PRESENCE_INVALID", message: "Invalid session" },
      400,
    );
  }

  const adapter = await getStorageAdapterAsync(locals);
  await adapter.deleteStudioPresenceSession(
    parsed.data.sessionId,
    auth.user.id,
  );
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
};
