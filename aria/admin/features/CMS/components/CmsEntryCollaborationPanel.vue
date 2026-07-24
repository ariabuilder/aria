<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";

const props = defineProps<{
  collectionId: string;
  entryId: string;
  locale: string;
  canEdit: boolean;
}>();

const peers = ref<Array<{ actorId: string; expiresAt: string }>>([]);
const lockOwnerId = ref<string | null>(null);
const leaseToken = ref("");
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const hasOtherEditor = computed(() => peers.value.some((peer) => peer.actorId !== lockOwnerId.value));

function newLeaseToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(16, "0");
}

async function heartbeat(): Promise<void> {
  if (!props.canEdit || !props.collectionId || !props.entryId) return;
  if (!leaseToken.value) leaseToken.value = newLeaseToken();
  try {
    const [presence, lock, active] = await Promise.all([
      actions.cms.workflows.heartbeatPresence({ collectionId: props.collectionId, entryId: props.entryId, locale: props.locale, leaseToken: leaseToken.value }),
      actions.cms.workflows.acquireLock({ collectionId: props.collectionId, entryId: props.entryId, locale: props.locale, leaseToken: leaseToken.value }),
      actions.cms.workflows.listPresence({ collectionId: props.collectionId, entryId: props.entryId, locale: props.locale }),
    ]);
    if (!presence.error && !active.error) peers.value = active.data ?? [];
    lockOwnerId.value = lock.error || !lock.data ? "other" : lock.data.actorId;
  } catch {
    // Presence and advisory locks are intentionally non-blocking.
  }
}

function start(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  void heartbeat();
  heartbeatTimer = setInterval(() => void heartbeat(), 30_000);
}

function stop(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (leaseToken.value && props.collectionId && props.entryId) {
    void actions.cms.workflows.releaseLock({ collectionId: props.collectionId, entryId: props.entryId, locale: props.locale, leaseToken: leaseToken.value });
  }
  leaseToken.value = "";
  peers.value = [];
  lockOwnerId.value = null;
}

onMounted(start);
onBeforeUnmount(stop);
watch(() => [props.collectionId, props.entryId, props.locale, props.canEdit], () => { stop(); if (props.canEdit) start(); });
</script>

<template>
  <section v-if="canEdit" class="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2" aria-live="polite">
    <p class="m-0 text-xs text-muted-foreground">
      <span v-if="hasOtherEditor || lockOwnerId === 'other'">Another editor may be working here. Saves still use version checks.</span>
      <span v-else-if="peers.length > 1">{{ peers.length }} editors are active. Your lock is advisory.</span>
      <span v-else>Autosave and advisory collaboration are active.</span>
    </p>
    <span class="text-2xs text-muted-foreground">{{ peers.length }} active</span>
  </section>
</template>
