import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AriaStudioLiveNamespace,
  AriaStudioLiveStub,
} from "../../lib/cloudflare/env";
import { publishStudioInvalidation } from "../../lib/realtime/publishStudioInvalidation";
import {
  StudioInvalidationDeliverySchema,
  StudioPresenceHeartbeatSchema,
  StudioRevisionCheckpointSchema,
  StudioSyncSnapshotSchema,
} from "../../lib/realtime/studioLive";

const RESOURCE_ID = "page-home";

function createNamespace(
  publishInvalidation: AriaStudioLiveStub["publishInvalidation"],
): AriaStudioLiveNamespace {
  return {
    getByName: () => ({
      fetch: async () => new Response(null),
      publishInvalidation,
    }),
  };
}

describe("Studio Live runtime contracts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates delivery, checkpoint, heartbeat, and snapshot payloads", () => {
    const sessionId = crypto.randomUUID();
    const checkpoint = StudioRevisionCheckpointSchema.parse({
      revisionSeq: 12,
      currentRevisionId: crypto.randomUUID(),
      lastMutationKind: "save-page",
      lastMutationTarget: RESOURCE_ID,
      updatedAt: new Date(0).toISOString(),
    });
    const heartbeat = StudioPresenceHeartbeatSchema.parse({
      sessionId,
      connectedAt: 100,
      lastActivityAt: 110,
      presence: {
        surface: "composer",
        resourceType: "page",
        resourceId: RESOURCE_ID,
        state: "editing",
        dirty: true,
      },
    });

    expect(heartbeat.sessionId).toBe(sessionId);
    expect(
      StudioSyncSnapshotSchema.parse({
        checkpoint,
        sessions: [],
        serverTime: 120,
      }).checkpoint,
    ).toEqual(checkpoint);
    expect(
      StudioInvalidationDeliverySchema.safeParse({
        status: "failed",
        eventId: crypto.randomUUID(),
        siteRevision: 12,
        code: "STUDIO_LIVE_RPC_FAILED",
      }).success,
    ).toBe(true);
  });

  it("fails closed for malformed external payloads", () => {
    expect(
      StudioPresenceHeartbeatSchema.safeParse({
        sessionId: "not-a-uuid",
        connectedAt: -1,
        lastActivityAt: 0,
        presence: {},
      }).success,
    ).toBe(false);
    expect(
      StudioRevisionCheckpointSchema.safeParse({
        revisionSeq: -1,
        currentRevisionId: "",
        lastMutationKind: "",
        updatedAt: "",
      }).success,
    ).toBe(false);
    expect(
      StudioInvalidationDeliverySchema.safeParse({
        status: "failed",
        eventId: crypto.randomUUID(),
        siteRevision: 1,
        code: "PLATFORM_MESSAGE",
      }).success,
    ).toBe(false);
  });

  it("returns unavailable without a Cloudflare binding", async () => {
    const result = await publishStudioInvalidation(
      {},
      {
        siteRevision: 3,
        resourceType: "page",
        resourceId: RESOURCE_ID,
        scopes: ["content"],
      },
    );
    expect(result).toMatchObject({ status: "unavailable", siteRevision: 3 });
  });

  it("reports RPC failure without rejecting the committed mutation", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const result = await publishStudioInvalidation(
      {
        locals: {
          cfBindings: {
            aria_studio_live: createNamespace(async () => {
              throw new Error("platform rejection");
            }),
          },
        },
        request: new Request("https://aria.test/admin"),
      },
      {
        siteRevision: 4,
        resourceType: "page",
        resourceId: RESOURCE_ID,
        scopes: ["render"],
      },
    );

    expect(result).toMatchObject({
      status: "failed",
      siteRevision: 4,
      code: "STUDIO_LIVE_RPC_FAILED",
    });
    expect(warning).toHaveBeenCalledOnce();
  });

  it("reports delivery after the typed RPC completes", async () => {
    const publish = vi.fn<AriaStudioLiveStub["publishInvalidation"]>(
      async () => undefined,
    );
    const result = await publishStudioInvalidation(
      {
        locals: {
          cfBindings: { aria_studio_live: createNamespace(publish) },
        },
        request: new Request("https://aria.test/admin"),
      },
      {
        siteRevision: 5,
        resourceType: "layout",
        resourceId: "layout-main",
        scopes: ["render"],
      },
    );
    expect(result).toMatchObject({ status: "delivered", siteRevision: 5 });
    expect(publish).toHaveBeenCalledOnce();
  });
});
