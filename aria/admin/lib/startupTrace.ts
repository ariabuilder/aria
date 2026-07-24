type StartupTraceDetail = Record<string, unknown>;

export interface StartupTraceEntry {
  cycle: number;
  seq: number;
  event: string;
  timestamp: number;
  elapsed: number;
  detail?: StartupTraceDetail;
}

export type StartupTraceListener = (
  event:
    | { kind: "entry"; entry: StartupTraceEntry }
    | { kind: "cycle"; cycle: number; label: string; startedAt: number },
) => void;

interface StartupTraceStore {
  cycle: number;
  seq: number;
  startedAt: number;
  events: StartupTraceEntry[];
  counters: Record<string, number>;
  listeners: Set<StartupTraceListener>;
  dump: () => void;
}

declare global {
  interface Window {
    __ARIA_STARTUP_TRACE__?: StartupTraceStore;
  }
}

const TRACE_PREFIX = "[AriaStartup]";

function isTraceEnabled(): boolean {
  return import.meta.env.DEV && typeof window !== "undefined";
}

function createStore(): StartupTraceStore {
  return {
    cycle: 0,
    seq: 0,
    startedAt: performance.now(),
    events: [],
    counters: {},
    listeners: new Set<StartupTraceListener>(),
    dump() {
      console.groupCollapsed(
        `${TRACE_PREFIX} dump cycle=${this.cycle} events=${this.events.length}`,
      );
      console.table(
        this.events.map((entry) => ({
          cycle: entry.cycle,
          seq: entry.seq,
          event: entry.event,
          elapsedMs: entry.elapsed.toFixed(1),
          detail: entry.detail,
        })),
      );
      console.groupEnd();
    },
  };
}

function notifyListeners(
  store: StartupTraceStore,
  payload: Parameters<StartupTraceListener>[0],
): void {
  for (const listener of store.listeners) {
    try {
      listener(payload);
    } catch (error) {
      console.error(`${TRACE_PREFIX} listener error`, error);
    }
  }
}

function getStore(): StartupTraceStore | null {
  if (!isTraceEnabled()) return null;

  if (!window.__ARIA_STARTUP_TRACE__) {
    window.__ARIA_STARTUP_TRACE__ = createStore();
  }

  return window.__ARIA_STARTUP_TRACE__;
}

function pushEntry(
  store: StartupTraceStore,
  event: string,
  detail?: StartupTraceDetail,
): StartupTraceEntry {
  const timestamp = performance.now();
  const entry: StartupTraceEntry = {
    cycle: store.cycle,
    seq: ++store.seq,
    event,
    timestamp,
    elapsed: timestamp - store.startedAt,
    detail,
  };

  store.events.push(entry);

  try {
    performance.mark(`aria-startup:${store.cycle}:${entry.seq}:${event}`);
  } catch {
    // Ignore Performance API mark failures.
  }

  if (detail) {
    console.log(
      `${TRACE_PREFIX} +${entry.elapsed.toFixed(1)}ms #${entry.seq} ${event}`,
      detail,
    );
  } else {
    console.log(
      `${TRACE_PREFIX} +${entry.elapsed.toFixed(1)}ms #${entry.seq} ${event}`,
    );
  }

  notifyListeners(store, { kind: "entry", entry });

  return entry;
}

export function startStartupTraceCycle(
  label: string,
  detail?: StartupTraceDetail,
): void {
  const store = getStore();
  if (!store) return;

  store.cycle += 1;
  store.seq = 0;
  store.startedAt = performance.now();
  store.events = [];
  store.counters = {};

  notifyListeners(store, {
    kind: "cycle",
    cycle: store.cycle,
    label,
    startedAt: store.startedAt,
  });

  pushEntry(store, label, detail);
}

export function subscribeStartupTrace(
  listener: StartupTraceListener,
): () => void {
  const store = getStore();
  if (!store) return () => undefined;
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

/**
 * Fire-and-forget POST of the current trace cycle to a beacon endpoint. Uses `navigator.
 */
export function flushStartupTraceBeacon(endpoint: string): boolean {
  const store = getStore();
  if (!store || store.events.length === 0) return false;

  const payload = JSON.stringify({
    cycle: store.cycle,
    startedAt: store.startedAt,
    capturedAt: performance.now(),
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    events: store.events,
  });

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    return navigator.sendBeacon(endpoint, blob);
  }

  if (typeof fetch === "function") {
    void fetch(endpoint, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
    return true;
  }

  return false;
}

export function traceStartup(
  event: string,
  detail?: StartupTraceDetail,
): StartupTraceEntry | null {
  const store = getStore();
  if (!store) return null;
  return pushEntry(store, event, detail);
}

export function nextStartupInstanceId(key: string): number {
  const store = getStore();
  if (!store) return 0;

  const nextId = (store.counters[key] ?? 0) + 1;
  store.counters[key] = nextId;
  return nextId;
}

export function getStartupTraceStore(): StartupTraceStore | null {
  return getStore();
}
