import { readonly, ref, shallowRef } from "vue";
import {
  StudioLiveInvalidationSchema,
  StudioLiveServerMessageSchema,
  StudioPresenceHeartbeatSchema,
  StudioPresenceUpdateSchema,
  StudioSyncSnapshotSchema,
  resolveEffectivePresence,
  type StudioLiveInvalidation,
  type StudioPresenceAttachment,
  type StudioPresenceUpdate,
  type StudioRevisionCheckpoint,
} from "@/lib/realtime/studioLive";
import {
  invalidateAllPageResources,
  invalidatePageResourceById,
} from "@/features/Studio/pages/composables/usePageResourceBank";
import { clearPagePolicyCache } from "@/features/Studio/pages/composables/usePageAccessState";
import { invalidateComponentClientCaches } from "@/features/Core/composables/componentCacheCoherence";

type PresenceUpdate = Omit<StudioPresenceUpdate, "type">;
type StudioLiveAvailability = "available" | "unavailable" | "retry";

const SYNC_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const sessions = shallowRef<StudioPresenceAttachment[]>([]);
const isConnected = ref(false);
const reconnectAttempt = ref(0);
const lastSiteRevision = ref(0);

let socket: WebSocket | null = null;
let availabilityProbe: Promise<StudioLiveAvailability> | null = null;
let reconnectTimer: number | null = null;
let pingTimer: number | null = null;
let syncTimer: number | null = null;
let heartbeatTimer: number | null = null;
let syncInFlight: Promise<void> | null = null;
let heartbeatInFlight: Promise<void> | null = null;
let syncAbortController: AbortController | null = null;
let heartbeatAbortController: AbortController | null = null;
let desiredPresence: PresenceUpdate = {
  surface: "studio",
  resourceType: null,
  resourceId: null,
  state: "viewing",
  dirty: false,
};
let shouldReconnect = false;
let studioLiveUnavailable = false;
let storageConnected = false;
let pushConnected = false;
let channel: BroadcastChannel | null = null;
let visibilityListenerInstalled = false;
let sessionId = crypto.randomUUID();
let connectedAt = Date.now();
let presenceRevision = 0;
let lastSnapshotServerTime = 0;
let lastHeartbeatActivityAt = 0;

const appliedEvents = new Set<string>();
const MAX_APPLIED_EVENTS = 200;
const supportsStudioLivePush = import.meta.env.PUBLIC_ARIA_RUNTIME !== "node";

function updateConnectionState(): void {
  isConnected.value = storageConnected || pushConnected;
}

function rememberEvent(eventId: string): boolean {
  if (appliedEvents.has(eventId)) return false;
  appliedEvents.add(eventId);
  if (appliedEvents.size > MAX_APPLIED_EVENTS) {
    const oldest = appliedEvents.values().next().value as string | undefined;
    if (oldest) appliedEvents.delete(oldest);
  }
  return true;
}

function applyInvalidation(event: StudioLiveInvalidation): void {
  if (!rememberEvent(event.eventId)) return;
  const previousRevision = lastSiteRevision.value;
  if (event.siteRevision < previousRevision) return;
  if (
    previousRevision > 0 &&
    event.siteRevision > previousRevision + 1
  ) {
    invalidateAllPageResources("realtime-reconcile");
    clearPagePolicyCache();
  }
  lastSiteRevision.value = Math.max(lastSiteRevision.value, event.siteRevision);

  if (event.resourceType === "page") {
    if (
      event.scopes.some((scope) => scope === "content" || scope === "metadata")
    ) {
      invalidatePageResourceById(event.resourceId, "realtime");
    }
    if (event.scopes.includes("policy")) clearPagePolicyCache();
    return;
  }
  if (event.resourceType === "component") {
    invalidateComponentClientCaches(event.resourceId, "realtime");
    if (event.scopes.includes("render")) {
      invalidateAllPageResources("component-dependency");
    }
    return;
  }
  invalidateAllPageResources("layout-dependency");
}

function invalidateFromCheckpoint(checkpoint: StudioRevisionCheckpoint): void {
  const target = checkpoint.lastMutationTarget;
  switch (checkpoint.lastMutationKind) {
    case "save-page":
    case "delete-page":
    case "save-page-metadata":
      if (target) invalidatePageResourceById(target, "realtime");
      else invalidateAllPageResources("realtime-reconcile");
      if (checkpoint.lastMutationKind === "save-page-metadata") {
        clearPagePolicyCache();
      }
      return;
    case "save-component":
    case "delete-component":
      if (target) invalidateComponentClientCaches(target, "realtime");
      invalidateAllPageResources("component-dependency");
      return;
    case "save-layout":
    case "delete-layout":
      invalidateAllPageResources("layout-dependency");
      return;
    default:
      invalidateAllPageResources("realtime-reconcile");
      clearPagePolicyCache();
  }
}

function applyCheckpoint(checkpoint: StudioRevisionCheckpoint | null): void {
  if (!checkpoint) return;
  const previous = lastSiteRevision.value;
  if (previous === 0) {
    lastSiteRevision.value = checkpoint.revisionSeq;
    return;
  }
  if (checkpoint.revisionSeq < previous) {
    console.warn("[Studio Sync] Stale revision checkpoint ignored", {
      code: "STUDIO_REVISION_STALE",
      previousRevision: previous,
      receivedRevision: checkpoint.revisionSeq,
    });
    return;
  }
  if (checkpoint.revisionSeq === previous) return;

  if (checkpoint.revisionSeq === previous + 1) {
    invalidateFromCheckpoint(checkpoint);
  } else {
    invalidateAllPageResources("realtime-reconcile");
    clearPagePolicyCache();
  }
  lastSiteRevision.value = checkpoint.revisionSeq;
}

function applySyncSnapshot(raw: unknown): boolean {
  const parsed = StudioSyncSnapshotSchema.safeParse(raw);
  if (!parsed.success) return false;
  if (parsed.data.serverTime >= lastSnapshotServerTime) {
    sessions.value = parsed.data.sessions;
    lastSnapshotServerTime = parsed.data.serverTime;
  }
  applyCheckpoint(parsed.data.checkpoint);
  return true;
}

function ensureBroadcastChannel(): void {
  if (channel || typeof BroadcastChannel !== "function") return;
  channel = new BroadcastChannel("aria-studio-live");
  channel.addEventListener("message", (message: MessageEvent<unknown>) => {
    const parsed = StudioLiveInvalidationSchema.safeParse(message.data);
    if (parsed.success) applyInvalidation(parsed.data);
  });
}

function effectivePresence(): PresenceUpdate {
  return typeof document !== "undefined" &&
    document.visibilityState === "hidden"
    ? { ...desiredPresence, state: "away", dirty: false }
    : desiredPresence;
}

function sendSocketPresence(): void {
  const activeSocket = socket;
  if (activeSocket?.readyState !== WebSocket.OPEN) return;
  activeSocket.send(
    JSON.stringify(
      StudioPresenceUpdateSchema.parse({
        type: "presence.update",
        ...effectivePresence(),
      }),
    ),
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const raw: unknown = await response.json();
  return raw;
}

function reconcileStudioSync(): Promise<void> {
  if (syncInFlight) return syncInFlight;
  const controller = new AbortController();
  syncAbortController = controller;
  const task = (async () => {
    try {
      const response = await fetch("/admin/api/studio-sync", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!shouldReconnect) return;
      if (
        !response.ok ||
        !applySyncSnapshot(await readJsonResponse(response))
      ) {
        throw new Error("Invalid Studio sync response");
      }
      if (shouldReconnect) storageConnected = true;
    } catch {
      if (shouldReconnect) storageConnected = false;
    } finally {
      updateConnectionState();
      if (syncAbortController === controller) syncAbortController = null;
      syncInFlight = null;
    }
  })();
  syncInFlight = task;
  return task;
}

function sendStorageHeartbeat(): Promise<void> {
  if (heartbeatInFlight) return heartbeatInFlight;
  const sentPresenceRevision = presenceRevision;
  const controller = new AbortController();
  heartbeatAbortController = controller;
  const lastActivityAt = Math.max(Date.now(), lastHeartbeatActivityAt + 1);
  lastHeartbeatActivityAt = lastActivityAt;
  const heartbeat = StudioPresenceHeartbeatSchema.parse({
    sessionId,
    connectedAt,
    lastActivityAt,
    presence: effectivePresence(),
  });
  const task = (async () => {
    try {
      const response = await fetch("/admin/api/studio-sync", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(heartbeat),
        signal: controller.signal,
      });
      if (!shouldReconnect) return;
      if (response.status === 409) {
        await reconcileStudioSync();
        return;
      }
      if (
        !response.ok ||
        !applySyncSnapshot(await readJsonResponse(response))
      ) {
        throw new Error("Invalid Studio heartbeat response");
      }
      if (shouldReconnect) storageConnected = true;
    } catch {
      if (shouldReconnect) storageConnected = false;
    } finally {
      updateConnectionState();
      if (heartbeatAbortController === controller) {
        heartbeatAbortController = null;
      }
      heartbeatInFlight = null;
      if (shouldReconnect && sentPresenceRevision !== presenceRevision) {
        void sendStorageHeartbeat();
      }
    }
  })();
  heartbeatInFlight = task;
  return task;
}

function sendPresence(): void {
  sendSocketPresence();
  void sendStorageHeartbeat();
}

function startPortableSync(): void {
  if (syncTimer === null) {
    syncTimer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void reconcileStudioSync();
    }, SYNC_INTERVAL_MS);
  }
  if (heartbeatTimer === null) {
    heartbeatTimer = window.setInterval(() => {
      void sendStorageHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }
  void sendStorageHeartbeat();
  void reconcileStudioSync();
}

function handleVisibilityChange(): void {
  presenceRevision += 1;
  sendPresence();
  if (document.visibilityState !== "hidden") void reconcileStudioSync();
}

function clearTimers(): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  if (pingTimer !== null) window.clearInterval(pingTimer);
  if (syncTimer !== null) window.clearInterval(syncTimer);
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  reconnectTimer = null;
  pingTimer = null;
  syncTimer = null;
  heartbeatTimer = null;
}

function scheduleReconnect(): void {
  if (!shouldReconnect || reconnectTimer !== null || !supportsStudioLivePush) {
    return;
  }
  const delay = Math.min(30_000, 500 * 2 ** reconnectAttempt.value);
  reconnectAttempt.value += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectPushTransport();
  }, delay);
}

async function probeStudioLiveAvailability(): Promise<StudioLiveAvailability> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch("/admin/api/studio-live", {
      method: "HEAD",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 204) return "available";
    if (
      response.status === 503 &&
      response.headers.get("x-aria-studio-live") === "unavailable"
    ) {
      return "unavailable";
    }
    return "retry";
  } catch {
    return "retry";
  } finally {
    window.clearTimeout(timeout);
  }
}

function openStudioLiveSocket(): void {
  if (!shouldReconnect) return;
  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const nextSocket = new WebSocket(
    `${protocol}//${window.location.host}/admin/api/studio-live?sessionId=${encodeURIComponent(sessionId)}&connectedAt=${connectedAt}`,
  );
  socket = nextSocket;

  nextSocket.addEventListener("open", () => {
    if (socket !== nextSocket) return;
    pushConnected = true;
    updateConnectionState();
    reconnectAttempt.value = 0;
    sendSocketPresence();
    void reconcileStudioSync();
    pingTimer = window.setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (desiredPresence.state === "editing") sendSocketPresence();
      else socket.send("ping");
      sessions.value = sessions.value.map((session) =>
        resolveEffectivePresence(session, Date.now()),
      );
    }, HEARTBEAT_INTERVAL_MS);
  });

  nextSocket.addEventListener("message", (message: MessageEvent<unknown>) => {
    if (socket !== nextSocket) return;
    if (message.data === "pong" || typeof message.data !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(message.data);
    } catch {
      return;
    }
    const parsed = StudioLiveServerMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    if (parsed.data.type === "presence.snapshot") {
      sessions.value = parsed.data.sessions;
      return;
    }
    applyInvalidation(parsed.data);
  });

  nextSocket.addEventListener("close", () => {
    if (socket !== nextSocket) return;
    pushConnected = false;
    updateConnectionState();
    if (pingTimer !== null) window.clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    void reconcileStudioSync();
    scheduleReconnect();
  });
  nextSocket.addEventListener("error", () => nextSocket.close());
}

function connectPushTransport(): void {
  if (
    !supportsStudioLivePush ||
    studioLiveUnavailable ||
    availabilityProbe ||
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }
  const probe = probeStudioLiveAvailability();
  availabilityProbe = probe;
  void probe.then((availability) => {
    if (availabilityProbe !== probe) return;
    availabilityProbe = null;
    if (!shouldReconnect) return;
    if (availability === "unavailable") {
      studioLiveUnavailable = true;
      return;
    }
    if (availability !== "available") {
      scheduleReconnect();
      return;
    }
    openStudioLiveSocket();
  });
}

export function connectStudioLive(): void {
  if (typeof window === "undefined" || shouldReconnect) return;
  shouldReconnect = true;
  ensureBroadcastChannel();
  if (!visibilityListenerInstalled) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled = true;
  }
  startPortableSync();
  connectPushTransport();
}

export function disconnectStudioLive(): void {
  shouldReconnect = false;
  availabilityProbe = null;
  clearTimers();
  syncAbortController?.abort();
  heartbeatAbortController?.abort();
  syncAbortController = null;
  heartbeatAbortController = null;
  socket?.close(1000, "Studio closed");
  socket = null;
  pushConnected = false;
  storageConnected = false;
  syncInFlight = null;
  heartbeatInFlight = null;
  void fetch(
    `/admin/api/studio-sync?sessionId=${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    },
  ).catch(() => undefined);
  sessionId = crypto.randomUUID();
  connectedAt = Date.now();
  presenceRevision = 0;
  lastSnapshotServerTime = 0;
  lastHeartbeatActivityAt = 0;
  channel?.close();
  channel = null;
  if (visibilityListenerInstalled) {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled = false;
  }
  sessions.value = [];
  updateConnectionState();
}

export function setStudioPresence(update: PresenceUpdate): void {
  desiredPresence = StudioPresenceUpdateSchema.omit({ type: true }).parse(
    update,
  );
  presenceRevision += 1;
  sendPresence();
}

export function publishLocalStudioInvalidation(
  input: StudioLiveInvalidation,
): void {
  const event = StudioLiveInvalidationSchema.parse(input);
  applyInvalidation(event);
  ensureBroadcastChannel();
  channel?.postMessage(event);
}

export function useStudioLive() {
  return {
    sessions: readonly(sessions),
    isConnected: readonly(isConnected),
    reconnectAttempt: readonly(reconnectAttempt),
    lastSiteRevision: readonly(lastSiteRevision),
    connect: connectStudioLive,
    disconnect: disconnectStudioLive,
    setPresence: setStudioPresence,
  };
}
