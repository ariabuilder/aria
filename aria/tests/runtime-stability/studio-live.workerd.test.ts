import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  StudioLiveInvalidationSchema,
  StudioLiveServerMessageSchema,
} from "../../lib/realtime/studioLive";

function nextSocketMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for Studio Live message")),
      2_000,
    );
    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        if (typeof event.data !== "string") {
          reject(new Error("Studio Live emitted a non-text message"));
          return;
        }
        try {
          resolve(JSON.parse(event.data));
        } catch (error: unknown) {
          reject(error);
        }
      },
      { once: true },
    );
  });
}

describe("Studio Live Durable Object RPC", () => {
  it("publishes a schema-valid invalidation through the real workerd stub", async () => {
    const namespace = env.aria_studio_live;
    if (!namespace) throw new Error("Studio Live test binding is unavailable");
    const stub = namespace.getByName("aria.test");
    const sessionId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const identity = encodeURIComponent(
      JSON.stringify({
        sessionId,
        connectedAt: 100,
        userId,
        displayName: "Runtime Tester",
        avatarUrl: null,
      }),
    );
    const response = await stub.fetch(
      new Request("https://aria.test/studio-live", {
        headers: {
          Upgrade: "websocket",
          "x-aria-studio-live-user": identity,
        },
      }),
    );
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    expect(socket).toBeDefined();
    if (!socket) throw new Error("Workerd did not return a WebSocket");
    socket.accept();

    const presenceMessage = StudioLiveServerMessageSchema.parse(
      await nextSocketMessage(socket),
    );
    expect(presenceMessage.type).toBe("presence.snapshot");

    const invalidation = StudioLiveInvalidationSchema.parse({
      eventId: crypto.randomUUID(),
      siteRevision: 7,
      resourceType: "page",
      resourceId: "home",
      scopes: ["content", "render"],
    });
    const messagePromise = nextSocketMessage(socket);
    await stub.publishInvalidation(invalidation);
    const message = StudioLiveServerMessageSchema.parse(await messagePromise);
    expect(message).toEqual({ type: "resource.invalidate", ...invalidation });
    socket.close(1000, "Test complete");
  });
});
