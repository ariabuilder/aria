import type { AriaCloudflareEnv } from "../lib/cloudflare/env";
import {
  StudioLiveInvalidationSchema,
  StudioPresenceAttachmentSchema,
  StudioPresenceUpdateSchema,
  resolveEffectivePresence,
  type StudioLiveInvalidation,
  type StudioLiveServerMessage,
  type StudioPresenceAttachment,
} from "../lib/realtime/studioLive";

const LIVE_USER_HEADER = "x-aria-studio-live-user";
const EDIT_LEASE_MS = 45_000;

type StudioLiveSocket = WebSocket & {
  serializeAttachment(attachment: unknown): void;
  deserializeAttachment(): unknown;
};

type StudioLiveState = {
  acceptWebSocket(socket: StudioLiveSocket, tags?: string[]): void;
  getWebSockets(tag?: string): StudioLiveSocket[];
  setWebSocketAutoResponse(pair: unknown): void;
};

type StudioLiveRuntime = typeof globalThis & {
  WebSocketPair: new () => {
    0: StudioLiveSocket;
    1: StudioLiveSocket;
  };
  WebSocketRequestResponsePair: new (
    request: string,
    response: string,
  ) => unknown;
};

type LiveUserIdentity = Pick<
  StudioPresenceAttachment,
  "userId" | "displayName" | "avatarUrl"
>;

function parseIdentity(request: Request): LiveUserIdentity | null {
  const encoded = request.headers.get(LIVE_USER_HEADER);
  if (!encoded) return null;

  try {
    const value = JSON.parse(decodeURIComponent(encoded)) as unknown;
    const parsed = StudioPresenceAttachmentSchema.pick({
      userId: true,
      displayName: true,
      avatarUrl: true,
    }).safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class AriaStudioLive {
  private readonly state: StudioLiveState;

  constructor(state: StudioLiveState, _env: AriaCloudflareEnv) {
    this.state = state;
    const runtime = globalThis as StudioLiveRuntime;
    this.state.setWebSocketAutoResponse(
      new runtime.WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const identity = parseIdentity(request);
    if (!identity) return new Response("Unauthorized", { status: 401 });

    const runtime = globalThis as StudioLiveRuntime;
    const pair = new runtime.WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const attachment: StudioPresenceAttachment = {
      sessionId: crypto.randomUUID(),
      ...identity,
      surface: "studio",
      resourceType: null,
      resourceId: null,
      state: "viewing",
      dirty: false,
      connectedAt: now,
      lastActivityAt: now,
      leaseExpiresAt: null,
    };

    this.state.acceptWebSocket(server, [`user:${identity.userId}`]);
    server.serializeAttachment(attachment);
    this.broadcastPresenceSnapshot();

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit);
  }

  async publishInvalidation(input: StudioLiveInvalidation): Promise<void> {
    const event = StudioLiveInvalidationSchema.parse(input);
    this.broadcast({ type: "resource.invalidate", ...event });
  }

  webSocketMessage(ws: StudioLiveSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;

    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      return;
    }

    const update = StudioPresenceUpdateSchema.safeParse(raw);
    const current = StudioPresenceAttachmentSchema.safeParse(
      ws.deserializeAttachment(),
    );
    if (!update.success || !current.success) return;

    const now = Date.now();
    const next: StudioPresenceAttachment = {
      ...current.data,
      surface: update.data.surface,
      resourceType: update.data.resourceType,
      resourceId: update.data.resourceId,
      state: update.data.state,
      dirty: update.data.dirty,
      lastActivityAt: now,
      leaseExpiresAt:
        update.data.state === "editing" ? now + EDIT_LEASE_MS : null,
    };
    ws.serializeAttachment(next);
    this.broadcastPresenceSnapshot();
  }

  webSocketClose(
    ws: StudioLiveSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): void {
    ws.close(code, reason);
    this.broadcastPresenceSnapshot(ws);
  }

  webSocketError(ws: StudioLiveSocket): void {
    ws.close(1011, "WebSocket error");
    this.broadcastPresenceSnapshot(ws);
  }

  private sessions(exclude?: StudioLiveSocket): StudioPresenceAttachment[] {
    const now = Date.now();
    const sessions: StudioPresenceAttachment[] = [];

    for (const socket of this.state.getWebSockets()) {
      if (socket === exclude) continue;
      const parsed = StudioPresenceAttachmentSchema.safeParse(
        socket.deserializeAttachment(),
      );
      if (parsed.success) {
        sessions.push(resolveEffectivePresence(parsed.data, now));
      }
    }

    return sessions;
  }

  private broadcastPresenceSnapshot(exclude?: StudioLiveSocket): void {
    this.broadcast({
      type: "presence.snapshot",
      sessions: this.sessions(exclude),
      serverTime: Date.now(),
    });
  }

  private broadcast(message: StudioLiveServerMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(serialized);
      } catch {
        socket.close(1011, "Send failed");
      }
    }
  }
}
