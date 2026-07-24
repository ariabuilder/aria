<!-- DEV-only floating panel for live `traceStartup` boot timings. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import {
  flushStartupTraceBeacon,
  getStartupTraceStore,
  subscribeStartupTrace,
  type StartupTraceEntry,
} from "./startupTrace";
import { Z_INDEX } from "./zIndex";

const STORAGE_KEY = "aria.startupTracePanel.visible";
const BEACON_ENDPOINT = "/admin/api/_aria-startup-trace";

const isDev = import.meta.env.DEV;

const events = shallowRef<StartupTraceEntry[]>([]);
const cycleLabel = ref<string>("");
const cycleNumber = ref<number>(0);
const isVisible = ref<boolean>(false);
const isExpanded = ref<boolean>(true);
const beaconStatus = ref<"idle" | "sending" | "sent" | "noop">("idle");

let unsubscribe: (() => void) | null = null;

const totalEvents = computed(() => events.value.length);
const latestElapsedMs = computed(() => {
  const last = events.value[events.value.length - 1];
  return last ? last.elapsed : 0;
});

function readInitialVisibility(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistVisibility(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function hydrateExistingEvents(): void {
  const store = getStartupTraceStore();
  if (!store) return;
  events.value = [...store.events];
  cycleNumber.value = store.cycle;
}

function handleKeydown(event: KeyboardEvent): void {
  const isToggleCombo =
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === "t";
  if (!isToggleCombo) return;
  event.preventDefault();
  isVisible.value = !isVisible.value;
  persistVisibility(isVisible.value);
}

async function copyToClipboard(): Promise<void> {
  const payload = JSON.stringify(
    {
      cycle: cycleNumber.value,
      label: cycleLabel.value,
      events: events.value,
    },
    null,
    2,
  );

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(payload);
      return;
    }
  } catch {
    /* fall through to console */
  }
  console.log("[AriaStartup] trace export", payload);
}

function sendBeacon(): void {
  beaconStatus.value = "sending";
  const queued = flushStartupTraceBeacon(BEACON_ENDPOINT);
  beaconStatus.value = queued ? "sent" : "noop";
  window.setTimeout(() => {
    beaconStatus.value = "idle";
  }, 2_000);
}

function formatDetail(detail: StartupTraceEntry["detail"]): string {
  if (!detail) return "";
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

onMounted(() => {
  if (!isDev) return;

  isVisible.value = readInitialVisibility();
  hydrateExistingEvents();

  unsubscribe = subscribeStartupTrace((payload) => {
    if (payload.kind === "cycle") {
      cycleNumber.value = payload.cycle;
      cycleLabel.value = payload.label;
      events.value = [];
      return;
    }
    events.value = [...events.value, payload.entry];
  });

  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div
    v-if="isDev && isVisible"
    class="fixed bottom-3 right-3 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-md border border-dashed border-border bg-background/95 shadow-lg backdrop-blur"
    :style="{ zIndex: Z_INDEX.debug }"
    role="complementary"
    aria-label="Aria startup trace panel"
  >
    <header
      class="flex items-center justify-between gap-2 border-b border-dashed border-border px-3 py-2"
    >
      <div class="flex items-center gap-2 text-2xs">
        <span class="font-mono font-semibold uppercase tracking-wider"
          >Startup&nbsp;Trace</span
        >
        <span class="text-muted-foreground"
          >cycle&nbsp;#{{ cycleNumber }} · {{ totalEvents }} events ·
          {{ latestElapsedMs.toFixed(0) }}&nbsp;ms</span
        >
      </div>
      <div class="flex items-center gap-1">
        <button
          class="rounded border border-dashed border-border px-2 py-0.5 text-3xs hover:bg-muted"
          type="button"
          @click="copyToClipboard"
        >
          copy
        </button>
        <button
          class="rounded border border-dashed border-border px-2 py-0.5 text-3xs hover:bg-muted"
          type="button"
          @click="sendBeacon"
        >
          {{
            beaconStatus === "sending"
              ? "…"
              : beaconStatus === "sent"
                ? "sent"
                : beaconStatus === "noop"
                  ? "n/a"
                  : "beacon"
          }}
        </button>
        <button
          class="rounded border border-dashed border-border px-2 py-0.5 text-3xs hover:bg-muted"
          type="button"
          :aria-pressed="isExpanded"
          @click="isExpanded = !isExpanded"
        >
          {{ isExpanded ? "−" : "+" }}
        </button>
      </div>
    </header>

    <div
      v-if="isExpanded"
      class="max-h-[40vh] overflow-y-auto px-3 py-2 font-mono text-3xs leading-tight"
    >
      <ol class="flex flex-col gap-0.5">
        <li
          v-for="entry in events"
          :key="`${entry.cycle}-${entry.seq}`"
          class="grid grid-cols-[3.25rem_1fr] items-baseline gap-2"
        >
          <span class="text-right tabular-nums text-muted-foreground"
            >+{{ entry.elapsed.toFixed(0) }}ms</span
          >
          <span class="break-words">
            <span class="text-foreground">{{ entry.event }}</span>
            <span
              v-if="entry.detail"
              class="ml-1 text-muted-foreground"
              >{{ formatDetail(entry.detail) }}</span
            >
          </span>
        </li>
        <li v-if="events.length === 0" class="text-muted-foreground">
          Waiting for events…
        </li>
      </ol>
    </div>

    <footer
      class="border-t border-dashed border-border px-3 py-1.5 text-3xs text-muted-foreground"
    >
      ⌘/Ctrl + ⇧ + T to toggle
    </footer>
  </div>
</template>
