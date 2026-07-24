import { describe, expect, it } from "vitest";
import {
  StudioPresenceAttachmentSchema,
  StudioPresenceUpdateSchema,
  resolveEffectivePresence,
} from "../../../lib/realtime/studioLive";

const now = 1_750_000_000_000;

function session(overrides: Record<string, unknown> = {}) {
  return StudioPresenceAttachmentSchema.parse({
    sessionId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    displayName: "Andy",
    avatarUrl: null,
    surface: "composer",
    resourceType: "page",
    resourceId: "page-home",
    state: "editing",
    dirty: true,
    connectedAt: now - 10_000,
    lastActivityAt: now - 1_000,
    leaseExpiresAt: now + 45_000,
    ...overrides,
  });
}

describe("Studio live presence contracts", () => {
  it("downgrades an expired editing lease without preserving dirty state", () => {
    expect(
      resolveEffectivePresence(session({ leaseExpiresAt: now - 1 }), now),
    ).toMatchObject({
      state: "viewing",
      dirty: false,
      leaseExpiresAt: null,
    });
  });

  it("keeps an active editing lease", () => {
    expect(resolveEffectivePresence(session(), now)).toMatchObject({
      state: "editing",
      dirty: true,
      leaseExpiresAt: now + 45_000,
    });
  });

  it("strips identity fields supplied by a browser presence update", () => {
    expect(
      StudioPresenceUpdateSchema.parse({
        type: "presence.update",
        surface: "studio",
        resourceType: "page",
        resourceId: "page-home",
        state: "editing",
        dirty: false,
        displayName: "Impersonated user",
      }),
    ).not.toHaveProperty("displayName");
  });

  it("keeps the maximum serialized attachment below Cloudflare's 2 KiB limit", () => {
    const attachment = session({
      displayName: "A".repeat(120),
      avatarUrl: `https://example.com/${"a".repeat(1_000)}`,
      resourceId: "r".repeat(255),
    });

    expect(new TextEncoder().encode(JSON.stringify(attachment)).byteLength).toBeLessThan(
      2_048,
    );
  });
});
