import { readonly, ref, shallowRef } from "vue";
import {
  StudioLiveInvalidationSchema,
  StudioLiveServerMessageSchema,
  StudioPresenceUpdateSchema,
  resolveEffectivePresence,
  type StudioLiveInvalidation,
  type StudioPresenceAttachment,
  type StudioPresenceUpdate,
} from "@/lib/realtime/studioLive";
import {
  invalidateAllPageResources,
  invalidatePageResourceById,
} from "@/features/Studio/pages/composables/usePageResourceBank";
import { clearPagePolicyCache } from "@/features/Studio/pages/composables/usePageAccessState";
import { invalidateComponentResource } from "@/features/Studio/components/composables/useComponentResourceBank";

type PresenceUpdate = Omit<StudioPresenceUpdate, "type">;
type StudioLiveAvailability = "available" | "unavailable" | "retry";

const sessions = shallowRef<StudioPresenceAttachment[]>([]);
const isConnected = ref(false);
const reconnectAttempt = ref(0);
const lastSiteRevision = ref(0);

let socket: WebSocket | null = null;
let availabilityProbe: Promise<StudioLiveAvailability> | null = null;
let reconnectTimer: number | null = null;
let pingTimer: number | null = null;
let desiredPresence: PresenceUpdate = {
  surface: "studio",
  resourceType: null,
  resourceId: null,
  state: "viewing",
  dirty: false,
};
let shouldReconnect = false;
let studioLiveUnavailable = false;
let channel: BroadcastChannel | null = null;
let visibilityListenerInstalled = false;

const appliedEvents = new Set<string>();
const MAX_APPLIED_EVENTS = 200;
const supportsStudioLive = import.meta.env.PUBLIC_ARIA_RUNTIME !== "node";

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
  lastSiteRevision.value = Math.max(lastSiteRevision.value, event.siteRevision);

  if (event.resourceType === "page") {
    if (
      event.scopes.some((scope) => scope === "content" || scope === "metadata")
    ) {
      invalidatePageResourceById(event.resourceId, "realtime");
    }
    if (event.scopes.includes("policy")) clearPagePolicyCache();
  } else if (event.resourceType === "component") {
    invalidateComponentResource(event.resourceId, "realtime");
    if (event.scopes.includes("render")) {
      invalidateAllPageResources("component-dependency");
    }
  } else if (event.resourceType === "layout") {
    invalidateAllPageResources("layout-dependency");
  }
}

function ensureBroadcastChannel(): void {
  if (channel || typeof BroadcastChannel !== "function") return;
  channel = new BroadcastChannel("aria-studio-live");
  channel.addEventListener("message", (message: MessageEvent<unknown>) => {
    const parsed = StudioLiveInvalidationSchema.safeParse(message.data);
    if (parsed.success) applyInvalidation(parsed.data);
  });
}

function sendPresence(): void {
  const activeSocket = socket;
  if (activeSocket?.readyState !== WebSocket.OPEN) return;
  const update =
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? { ...desiredPresence, state: "away" as const, dirty: false }
      : desiredPresence;
  activeSocket.send(
    JSON.stringify(
      StudioPresenceUpdateSchema.parse({
        type: "presence.update",
        ...update,
      }),
    ),
  );
}

function handleVisibilityChange(): void {
  sendPresence();
}

function clearTimers(): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  if (pingTimer !== null) window.clearInterval(pingTimer);
  reconnectTimer = null;
  pingTimer = null;
}

function scheduleReconnect(): void {
  if (!shouldReconnect || reconnectTimer !== null) return;
  const delay = Math.min(30_000, 500 * 2 ** reconnectAttempt.value);
  reconnectAttempt.value += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectStudioLive();
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
    // The endpoint explicitly marks a missing Durable Object binding. Do not
    // keep retrying in Node/local mode, but continue retrying transient 503s.
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
    `${protocol}//${window.location.host}/admin/api/studio-live`,
  );
  socket = nextSocket;

  nextSocket.addEventListener("open", () => {
    if (socket !== nextSocket) return;
    isConnected.value = true;
    reconnectAttempt.value = 0;
    sendPresence();
    pingTimer = window.setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (desiredPresence.state === "editing") {
        sendPresence();
      } else {
        socket.send("ping");
      }
      sessions.value = sessions.value.map((session) =>
        resolveEffectivePresence(session, Date.now()),
      );
    }, 25_000);
  });

  nextSocket.addEventListener("message", (message) => {
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
    isConnected.value = false;
    sessions.value = [];
    if (pingTimer !== null) window.clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    scheduleReconnect();
  });

  nextSocket.addEventListener("error", () => nextSocket.close());
}

export function connectStudioLive(): void {
  if (typeof window === "undefined" || !supportsStudioLive) return;
  if (
    studioLiveUnavailable ||
    availabilityProbe ||
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  shouldReconnect = true;
  ensureBroadcastChannel();
  if (!visibilityListenerInstalled) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled = true;
  }

  const probe = probeStudioLiveAvailability();
  availabilityProbe = probe;
  void probe.then((availability) => {
    if (availabilityProbe !== probe) return;
    availabilityProbe = null;
    if (!shouldReconnect) return;
    if (availability === "unavailable") {
      studioLiveUnavailable = true;
      shouldReconnect = false;
      return;
    }
    if (availability !== "available") {
      scheduleReconnect();
      return;
    }
    openStudioLiveSocket();
  });
}

export function disconnectStudioLive(): void {
  shouldReconnect = false;
  availabilityProbe = null;
  clearTimers();
  socket?.close(1000, "Studio closed");
  socket = null;
  channel?.close();
  channel = null;
  if (visibilityListenerInstalled) {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled = false;
  }
  sessions.value = [];
  isConnected.value = false;
}

export function setStudioPresence(update: PresenceUpdate): void {
  desiredPresence = StudioPresenceUpdateSchema.omit({ type: true }).parse(
    update,
  );
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
