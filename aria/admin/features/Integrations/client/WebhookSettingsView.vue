<script setup lang="ts">
import { actions } from "astro:actions";
import { computed, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStudioI18n } from "@/i18n";
import { useCapabilities } from "@/composables/useCapabilities";
import SettingsRow from "@/features/Studio/settings/components/SettingsRow.vue";
import { useSettingsDialog } from "@/features/Studio/settings";
import ApiSettingsView from "@/features/Api/client/ApiSettingsView.vue";
import OAuthGrantSettingsView from "./OAuthGrantSettingsView.vue";
import type {
  EnabledWebhookEventType,
  WebhookEndpointPublic,
} from "@lib/integrations/webhooks/repository";
import type { WebhookDeliveryPublic } from "@lib/integrations/webhooks/maintenance";

type WebhookReadiness = Readonly<{
  ready: boolean;
  keyringReady: boolean;
  egressReady: boolean;
  egressMode: "allowlist" | "proxy" | "loopback-development" | null;
  queueReady: boolean | null;
  workerReady: boolean | null;
  runtime: "cloudflare" | "node";
  eventTypes: readonly EnabledWebhookEventType[];
}>;

type DeliveryOverviewRow = Readonly<{
  state: string;
  total: number;
  oldest: string | null;
}>;

type IntegrationTab = "api" | "webhooks" | "apps";

const { t } = useStudioI18n();
const { hasCapability } = useCapabilities();
const settingsDialog = useSettingsDialog();

const canViewSiteApi = computed(
  () => hasCapability("editCms") || hasCapability("manageApiTokens"),
);
const canViewDeliveryIntegrations = computed(() =>
  hasCapability("manageIntegrations"),
);

function resolveDefaultTab(): IntegrationTab {
  if (settingsDialog.activeTab.value === "api" && canViewSiteApi.value) {
    return "api";
  }
  if (canViewSiteApi.value) return "api";
  if (canViewDeliveryIntegrations.value) return "webhooks";
  return "apps";
}

const readiness = ref<WebhookReadiness | null>(null);
const endpoints = ref<WebhookEndpointPublic[]>([]);
const deliveries = ref<WebhookDeliveryPublic[]>([]);
const overview = ref<DeliveryOverviewRow[]>([]);
const subscriptionDrafts = ref<Record<string, EnabledWebhookEventType[]>>({});
const name = ref("");
const url = ref("");
const payloadMode = ref<"reference" | "published_snapshot">("reference");
const selectedEventTypes = ref<EnabledWebhookEventType[]>([
  "cms.entry.published.v1",
]);
const revealedSecret = ref<string | null>(null);
const revealedSecretLabel = ref("");
const createOpen = ref(false);
const tab = ref<IntegrationTab>(resolveDefaultTab());
const expandedEndpointId = ref<string | null>(null);
const deliveriesOpen = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const webhooksLoaded = ref(false);

const eventTypes = computed(
  () => readiness.value?.eventTypes ?? ([] as EnabledWebhookEventType[]),
);
const isSnapshotMode = computed(
  () => payloadMode.value === "published_snapshot",
);
const canCreate = computed(
  () =>
    readiness.value?.ready === true &&
    name.value.trim().length > 0 &&
    url.value.trim().length > 0 &&
    selectedEventTypes.value.length > 0,
);
const deliveryTotal = computed(() =>
  overview.value.reduce((total, row) => total + row.total, 0),
);
const failedDeliveryTotal = computed(
  () => overview.value.find((row) => row.state === "terminal")?.total ?? 0,
);
const readinessWarning = computed(() => {
  const status = readiness.value;
  if (!status || status.ready) return null;
  if (!status.keyringReady) {
    return t("settings.integrations.readinessMissingKeyring");
  }
  if (!status.egressReady) {
    return t("settings.integrations.readinessMissingEgress");
  }
  if (status.runtime === "cloudflare" && status.queueReady !== true) {
    return t("settings.integrations.readinessMissingQueue");
  }
  if (status.runtime === "node" && status.workerReady !== true) {
    return t("settings.integrations.readinessMissingWorker");
  }
  return t("settings.integrations.readinessWarning");
});

function messageFrom(cause: unknown, fallback: string): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }
  return fallback;
}

function setPayloadMode(value: unknown): void {
  if (value !== "reference" && value !== "published_snapshot") return;
  payloadMode.value = value;
  if (value === "published_snapshot") {
    selectedEventTypes.value = selectedEventTypes.value.filter(isSnapshotEvent);
    if (selectedEventTypes.value.length === 0) {
      selectedEventTypes.value = ["cms.entry.published.v1"];
    }
  }
}

function openCreateDialog(): void {
  revealedSecret.value = null;
  createOpen.value = true;
}

function closeCreateDialog(): void {
  if (loading.value) return;
  createOpen.value = false;
  revealedSecret.value = null;
  revealedSecretLabel.value = "";
  name.value = "";
  url.value = "";
  payloadMode.value = "reference";
  selectedEventTypes.value = ["cms.entry.published.v1"];
}

function isSnapshotEvent(
  eventType: EnabledWebhookEventType,
): eventType is "cms.entry.published.v1" | "cms.entry.updated_published.v1" {
  return (
    eventType === "cms.entry.published.v1" ||
    eventType === "cms.entry.updated_published.v1"
  );
}

function eventAllowedForMode(eventType: EnabledWebhookEventType): boolean {
  return !isSnapshotMode.value || isSnapshotEvent(eventType);
}

function eventLabel(eventType: EnabledWebhookEventType): string {
  return t(`settings.integrations.event.${eventType}`);
}

function toggleEndpointDetails(endpointId: string): void {
  expandedEndpointId.value =
    expandedEndpointId.value === endpointId ? null : endpointId;
}

function toggleSelectedEvent(
  eventType: EnabledWebhookEventType,
  checked: boolean | "indeterminate",
): void {
  if (!eventAllowedForMode(eventType)) return;
  selectedEventTypes.value =
    checked === true
      ? Array.from(new Set([...selectedEventTypes.value, eventType]))
      : selectedEventTypes.value.filter((value) => value !== eventType);
}

function toggleEndpointEvent(
  endpoint: WebhookEndpointPublic,
  eventType: EnabledWebhookEventType,
  checked: boolean | "indeterminate",
): void {
  if (
    endpoint.payloadMode === "published_snapshot" &&
    !isSnapshotEvent(eventType)
  ) {
    return;
  }
  const current = subscriptionDrafts.value[endpoint.id] ?? [];
  subscriptionDrafts.value = {
    ...subscriptionDrafts.value,
    [endpoint.id]:
      checked === true
        ? Array.from(new Set([...current, eventType]))
        : current.filter((value) => value !== eventType),
  };
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [statusResult, endpointResult, overviewResult, deliveryResult] =
      await Promise.all([
        actions.webhooks.status({}),
        actions.webhooks.list({}),
        actions.webhooks.deliveryOverview({}),
        actions.webhooks.listDeliveries({ limit: 30 }),
      ]);
    if (statusResult.error) throw statusResult.error;
    if (endpointResult.error) throw endpointResult.error;
    if (overviewResult.error) throw overviewResult.error;
    if (deliveryResult.error) throw deliveryResult.error;
    readiness.value = statusResult.data as WebhookReadiness;
    endpoints.value = (endpointResult.data ?? []) as WebhookEndpointPublic[];
    overview.value = (overviewResult.data ?? []) as DeliveryOverviewRow[];
    deliveries.value = (deliveryResult.data ?? []) as WebhookDeliveryPublic[];
    subscriptionDrafts.value = Object.fromEntries(
      endpoints.value.map((endpoint) => [
        endpoint.id,
        endpoint.eventTypes.filter((eventType) =>
          eventTypes.value.includes(eventType as EnabledWebhookEventType),
        ) as EnabledWebhookEventType[],
      ]),
    );
    webhooksLoaded.value = true;
  } catch (cause) {
    error.value = messageFrom(cause, t("settings.integrations.loadFailed"));
  } finally {
    loading.value = false;
  }
}

async function createEndpoint(): Promise<void> {
  if (!canCreate.value) return;
  loading.value = true;
  error.value = null;
  try {
    const result = await actions.webhooks.create({
      name: name.value.trim(),
      url: url.value.trim(),
      payloadMode: payloadMode.value,
      eventTypes: selectedEventTypes.value,
    });
    if (result.error) throw result.error;
    const created = result.data as { secret: string };
    revealedSecret.value = created.secret;
    revealedSecretLabel.value = name.value.trim();
    name.value = "";
    url.value = "";
    payloadMode.value = "reference";
    selectedEventTypes.value = ["cms.entry.published.v1"];
    createOpen.value = false;
    await load();
    toast.success(t("settings.integrations.created"));
  } catch (cause) {
    error.value = messageFrom(cause, t("settings.integrations.createFailed"));
    loading.value = false;
  }
}

async function copySecret(): Promise<void> {
  if (!revealedSecret.value) return;
  try {
    await navigator.clipboard.writeText(revealedSecret.value);
    toast.success(t("settings.integrations.secretCopied"));
  } catch {
    toast.error(t("settings.integrations.copyFailed"));
  }
}

async function rotateSecret(endpoint: WebhookEndpointPublic): Promise<void> {
  loading.value = true;
  try {
    const result = await actions.webhooks.rotateSecret({ id: endpoint.id });
    if (result.error) throw result.error;
    const rotated = result.data as { secret: string };
    revealedSecret.value = rotated.secret;
    revealedSecretLabel.value = endpoint.name;
    await load();
    toast.success(t("settings.integrations.rotated"));
  } catch (cause) {
    toast.error(messageFrom(cause, t("settings.integrations.rotateFailed")));
    loading.value = false;
  }
}

async function setStatus(
  endpoint: WebhookEndpointPublic,
  status: "active" | "paused" | "disabled",
): Promise<void> {
  loading.value = true;
  try {
    const result = await actions.webhooks.setStatus({
      id: endpoint.id,
      status,
      reason: status === "disabled" ? "Disabled in Studio" : null,
    });
    if (result.error) throw result.error;
    await load();
  } catch (cause) {
    toast.error(messageFrom(cause, t("settings.integrations.statusFailed")));
    loading.value = false;
  }
}

async function saveSubscriptions(
  endpoint: WebhookEndpointPublic,
): Promise<void> {
  const eventTypes = subscriptionDrafts.value[endpoint.id] ?? [];
  if (eventTypes.length === 0) {
    toast.error(t("settings.integrations.subscriptionRequired"));
    return;
  }
  loading.value = true;
  try {
    const result = await actions.webhooks.updateSubscriptions({
      id: endpoint.id,
      eventTypes,
    });
    if (result.error) throw result.error;
    await load();
    toast.success(t("settings.integrations.subscriptionsSaved"));
  } catch (cause) {
    toast.error(
      messageFrom(cause, t("settings.integrations.subscriptionsFailed")),
    );
    loading.value = false;
  }
}

async function retryDelivery(delivery: WebhookDeliveryPublic): Promise<void> {
  loading.value = true;
  try {
    const result = await actions.webhooks.retryDelivery({
      id: delivery.id,
      reason: "Manual retry from Studio",
    });
    if (result.error) throw result.error;
    await load();
    toast.success(t("settings.integrations.retryQueued"));
  } catch (cause) {
    toast.error(messageFrom(cause, t("settings.integrations.retryFailed")));
    loading.value = false;
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function selectIntegrationTab(nextTab: IntegrationTab): void {
  tab.value = nextTab;
  if (settingsDialog.activeTab.value === "api") {
    settingsDialog.activeTab.value = "integrations";
  }
}

function ensureValidTab(): void {
  if (tab.value === "api" && !canViewSiteApi.value) {
    tab.value = canViewDeliveryIntegrations.value ? "webhooks" : "apps";
    return;
  }
  if (
    (tab.value === "webhooks" || tab.value === "apps") &&
    !canViewDeliveryIntegrations.value
  ) {
    tab.value = canViewSiteApi.value ? "api" : "apps";
  }
}

async function ensureWebhooksLoaded(): Promise<void> {
  if (!canViewDeliveryIntegrations.value || webhooksLoaded.value || loading.value) {
    return;
  }
  await load();
}

watch(
  () => settingsDialog.activeTab.value,
  (activeTab) => {
    if (activeTab === "api" && canViewSiteApi.value) {
      tab.value = "api";
    }
  },
  { immediate: true },
);

watch(
  [canViewSiteApi, canViewDeliveryIntegrations],
  () => {
    ensureValidTab();
  },
  { immediate: true },
);

watch(
  tab,
  (nextTab) => {
    if (nextTab === "webhooks") {
      void ensureWebhooksLoaded();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (tab.value === "webhooks") {
    void ensureWebhooksLoaded();
  }
});
</script>

<template>
  <Teleport defer to="#settings-tab-actions">
    <Button
      v-if="tab === 'webhooks'"
      size="sm"
      variant="secondary"
      class="border border-border/50 border-solid bg-sidebar/40 px-4 py-1 text-sm placeholder:text-muted-foreground shadow-none transition-[color,box-shadow] outline-none focus:outline-none focus:ring-0 hover:bg-sidebar/80 hover:border-border/50 hover:border-solid focus-visible:border-border focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid focus-visible:shadow-none focus-active:border-primary/80 focus-active:bg-sidebar data-[state=open]:border-border data-[state=open]:bg-sidebar/80 data-[state=open]:ring-border/50 data-[state=open]:ring-[1px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start rounded-sm cursor-pointer"
"
      :disabled="loading || !readiness?.ready"
      @click="openCreateDialog"
    >
      <span class="i-lucide:plus size-3.5" aria-hidden="true" />
      {{ t("settings.integrations.addEndpoint") }}
    </Button>
  </Teleport>

  <div class="min-w-0 space-y-0 bg-background page-card-enter">
    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
      role="tablist"
      :aria-label="t('settings.meta.integrations.title')"
    >
      <Button
        v-if="canViewSiteApi"
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'api'"
        :variant="tab === 'api' ? 'tab-active' : 'tab'"
        @click="selectIntegrationTab('api')"
      >
        {{ t("settings.tab.api") }}
      </Button>
      <Button
        v-if="canViewDeliveryIntegrations"
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'webhooks'"
        :variant="tab === 'webhooks' ? 'tab-active' : 'tab'"
        @click="selectIntegrationTab('webhooks')"
      >
        {{ t("settings.integrations.webhooks") }}
      </Button>
      <Button
        v-if="canViewDeliveryIntegrations"
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'apps'"
        :variant="tab === 'apps' ? 'tab-active' : 'tab'"
        @click="selectIntegrationTab('apps')"
      >
        {{ t("settings.integrations.connectedApps") }}
      </Button>
    </div>

    <div class="px-10 py-7">
      <section v-if="tab === 'api'" class="mx-auto max-w-3xl">
        <ApiSettingsView />
      </section>

      <section v-else-if="tab === 'apps'" class="mx-auto max-w-3xl">
        <OAuthGrantSettingsView />
      </section>

      <template v-else-if="tab === 'webhooks'">
        <div class="mx-auto max-w-3xl space-y-8 pb-10">
          <section class="space-y-4">
            <SettingsRow
              :label="t('settings.integrations.runtime')"
              :description="
                readiness?.ready
                  ? t('settings.integrations.serviceReady')
                  : t('settings.integrations.setupRequired')
              "
              input-id="webhook-runtime-status"
            >
              <div
                id="webhook-runtime-status"
                class="flex items-center gap-2 text-sm"
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="readiness?.ready ? 'bg-emerald-500' : 'bg-amber-500'"
                  aria-hidden="true"
                />
                <span
                  v-if="readiness"
                  class="truncate capitalize font-medium text-foreground"
                >
                  {{ readiness.runtime }}
                </span>
              </div>
            </SettingsRow>

            <p
              v-if="readiness && !readiness.ready"
              role="alert"
              class="text-sm text-amber-700 dark:text-amber-400"
            >
              {{ readinessWarning }}
            </p>

            <p v-if="error" role="alert" class="text-sm text-destructive">
              {{ error }}
            </p>

      <Dialog :open="createOpen" @update:open="(open) => { if (!open) closeCreateDialog(); }">
        <DialogContent class="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
            {{ t("settings.integrations.createTitle") }}
            </DialogTitle>
            <DialogDescription>
            {{ t("settings.integrations.createDescription") }}
            </DialogDescription>
          </DialogHeader>

        <div class="grid gap-3 py-2 sm:grid-cols-2">
          <Input
            v-model="name"
            :placeholder="t('settings.integrations.namePlaceholder')"
            maxlength="120"
            :disabled="loading"
          />
          <Input
            v-model="url"
            type="url"
            :placeholder="t('settings.integrations.urlPlaceholder')"
            :disabled="loading"
          />
        </div>

        <fieldset class="space-y-3">
          <legend class="text-xs font-medium text-muted-foreground">
            {{ t("settings.integrations.events") }}
          </legend>
          <div class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <label
              v-for="eventType in eventTypes"
              :key="eventType"
              class="flex items-center gap-2 text-sm"
              :class="!eventAllowedForMode(eventType) ? 'opacity-45' : ''"
            >
              <Checkbox
                :model-value="selectedEventTypes.includes(eventType)"
                :disabled="loading || !eventAllowedForMode(eventType)"
                @update:model-value="toggleSelectedEvent(eventType, $event)"
              />
              <span>{{ eventLabel(eventType) }}</span>
            </label>
          </div>
        </fieldset>

        <details class="group text-sm">
          <summary
            class="flex w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <span
              class="i-lucide:chevron-right size-4 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            {{ t("settings.integrations.advanced") }}
          </summary>
          <div class="mt-3 pl-5">
            <Select
              :model-value="payloadMode"
              :disabled="loading"
              @update:model-value="setPayloadMode"
            >
              <SelectTrigger class="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reference">
                  {{ t("settings.integrations.payload.reference") }}
                </SelectItem>
                <SelectItem value="published_snapshot">
                  {{ t("settings.integrations.payload.snapshot") }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </details>

        <DialogFooter>
          <Button size="sm" variant="outline" @click="closeCreateDialog">
            {{ t("settings.integrations.cancel") }}
          </Button>
          <Button
            size="sm"
            :disabled="loading || !canCreate"
            @click="createEndpoint"
          >
            {{ t("settings.integrations.create") }}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>

    <section
      v-if="revealedSecret"
      class="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5"
    >
      <div>
        <h3 class="text-sm font-medium">
          {{
            t("settings.integrations.copySecretNow", {
              name: revealedSecretLabel,
            })
          }}
        </h3>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t("settings.integrations.copySecretOnce") }}
        </p>
      </div>
      <div class="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
        <code class="min-w-0 flex-1 truncate text-xs">{{
          revealedSecret
        }}</code>
        <Button size="xs" variant="ghost" @click="copySecret">
          <span class="i-lucide:copy size-3.5" aria-hidden="true" />
          {{ t("settings.integrations.copy") }}
        </Button>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-sm font-medium">
        {{ t("settings.integrations.endpointsTitle") }}
      </h3>

      <p
        v-if="!loading && endpoints.length === 0"
        class="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground"
      >
        {{ t("settings.integrations.empty") }}
      </p>

      <div v-else class="overflow-hidden rounded-xl border border-border">
        <article
          v-for="endpoint in endpoints"
          :key="endpoint.id"
          class="border-b border-border last:border-b-0"
        >
          <div class="flex min-h-16 items-center gap-2 px-4">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
              @click="toggleEndpointDetails(endpoint.id)"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :class="
                  endpoint.status === 'active'
                    ? 'bg-emerald-500'
                    : endpoint.status === 'paused'
                      ? 'bg-amber-500'
                      : 'bg-muted-foreground/40'
                "
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{
                  endpoint.name
                }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{
                  endpoint.url
                }}</span>
              </span>
              <span
                class="hidden text-xs capitalize text-muted-foreground sm:block"
              >
                {{ endpoint.status }}
              </span>
              <span
                class="i-lucide:chevron-down size-4 shrink-0 text-muted-foreground transition-transform"
                :class="expandedEndpointId === endpoint.id ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  :disabled="loading"
                  :aria-label="t('settings.integrations.endpointActions')"
                >
                  <span class="i-lucide:ellipsis size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-44">
                <DropdownMenuItem @click="rotateSecret(endpoint)">
                  {{ t("settings.integrations.rotate") }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="endpoint.status === 'active'"
                  @click="setStatus(endpoint, 'paused')"
                >
                  {{ t("settings.integrations.pause") }}
                </DropdownMenuItem>
                <DropdownMenuItem v-else @click="setStatus(endpoint, 'active')">
                  {{ t("settings.integrations.activate") }}
                </DropdownMenuItem>
                <template v-if="endpoint.status !== 'disabled'">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    @click="setStatus(endpoint, 'disabled')"
                  >
                    {{ t("settings.integrations.disable") }}
                  </DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            v-if="expandedEndpointId === endpoint.id"
            class="space-y-5 border-t border-border bg-muted/20 px-5 py-5"
          >
            <div class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <label
                v-for="eventType in eventTypes"
                :key="eventType"
                class="flex items-center gap-2 text-sm"
                :class="
                  endpoint.payloadMode === 'published_snapshot' &&
                  !isSnapshotEvent(eventType)
                    ? 'opacity-45'
                    : ''
                "
              >
                <Checkbox
                  :model-value="
                    (subscriptionDrafts[endpoint.id] ?? []).includes(eventType)
                  "
                  :disabled="
                    loading ||
                    (endpoint.payloadMode === 'published_snapshot' &&
                      !isSnapshotEvent(eventType))
                  "
                  @update:model-value="
                    toggleEndpointEvent(endpoint, eventType, $event)
                  "
                />
                <span>{{ eventLabel(eventType) }}</span>
              </label>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-muted-foreground">
                {{
                  endpoint.payloadMode === "reference"
                    ? t("settings.integrations.payload.reference")
                    : t("settings.integrations.payload.snapshot")
                }}
                · {{ t("settings.integrations.secretPrefix") }}
                {{ endpoint.secretPrefix }}…
              </p>
              <Button
                size="xs"
                variant="outline"
                :disabled="loading"
                @click="saveSubscriptions(endpoint)"
              >
                {{ t("settings.integrations.save") }}
              </Button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="border-t border-border pt-2">
      <button
        type="button"
        class="flex w-full items-center gap-3 py-3 text-left"
        @click="deliveriesOpen = !deliveriesOpen"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium">{{
            t("settings.integrations.deliveriesTitle")
          }}</span>
          <span class="block text-xs text-muted-foreground">
            {{
              failedDeliveryTotal > 0
                ? t("settings.integrations.deliverySummaryFailed", {
                    total: deliveryTotal,
                    failed: failedDeliveryTotal,
                  })
                : t("settings.integrations.deliverySummary", {
                    total: deliveryTotal,
                  })
            }}
          </span>
        </span>
        <span
          class="i-lucide:chevron-down size-4 text-muted-foreground transition-transform"
          :class="deliveriesOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>

      <div v-if="deliveriesOpen" class="pb-4 pt-2">
        <div class="mb-2 flex justify-end">
          <Button size="xs" variant="ghost" :disabled="loading" @click="load">
            <span class="i-lucide:refresh-cw size-3.5" aria-hidden="true" />
            {{ t("settings.integrations.refresh") }}
          </Button>
        </div>
        <p
          v-if="!loading && deliveries.length === 0"
          class="py-6 text-center text-sm text-muted-foreground"
        >
          {{ t("settings.integrations.noDeliveries") }}
        </p>
        <div
          v-else
          class="divide-y divide-border rounded-xl border border-border"
        >
          <div
            v-for="delivery in deliveries"
            :key="delivery.id"
            class="flex items-center gap-3 px-4 py-3"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="
                delivery.state === 'succeeded'
                  ? 'bg-emerald-500'
                  : delivery.state === 'terminal'
                    ? 'bg-destructive'
                    : 'bg-amber-500'
              "
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ delivery.endpointName }} ·
                {{ eventLabel(delivery.eventType as EnabledWebhookEventType) }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ formatTimestamp(delivery.updatedAt) }} ·
                {{ delivery.state }} · {{ delivery.attemptCount }}
                {{ t("settings.integrations.attemptsShort") }}
              </p>
            </div>
            <Button
              v-if="delivery.state === 'terminal'"
              size="xs"
              variant="ghost"
              :disabled="loading"
              @click="retryDelivery(delivery)"
            >
              {{ t("settings.integrations.retry") }}
            </Button>
          </div>
        </div>
      </div>
    </section>
  </div>
      </template>
    </div>
  </div>
</template>
