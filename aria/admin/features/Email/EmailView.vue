<script setup lang="ts">
import { actions } from "astro:actions";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { z } from "zod";
import { useUser } from "@/features/Auth/composables/useUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmailConnectionCreateSchema,
  EmailConnectionSchema,
  EmailDeliveryStatusSchema,
  EmailRouteSchema,
  SafeEmailDeliverySchema,
  CloudflareEmailConfigSchema,
  SmtpConfigSchema,
} from "../../../lib/email/types";

defineOptions({ name: "EmailView" });
const TabSchema = z.enum(["overview", "connections", "routing", "outbox"]);
type Tab = z.infer<typeof TabSchema>;
type EmailConnection = z.infer<typeof EmailConnectionSchema>;
const tab = ref<Tab>("overview"),
  loading = ref(false),
  connections = ref<EmailConnection[]>([]),
  routes = ref<z.infer<typeof EmailRouteSchema>[]>([]),
  deliveries = ref<z.infer<typeof SafeEmailDeliverySchema>[]>([]),
  overview = ref<Record<string, number>>({});
const provider = ref<"cloudflare_email" | "smtp">("cloudflare_email"),
  selectedConnectionProvider = ref(""),
  showConnectionForm = ref(false),
  name = ref(""),
  fromEmail = ref(""),
  fromName = ref(""),
  replyTo = ref(""),
  accountId = ref(""),
  zoneId = ref(""),
  sendingDomain = ref(""),
  apiToken = ref(""),
  smtpHost = ref(""),
  smtpPort = ref<465 | 587>(465),
  smtpUsername = ref(""),
  smtpPassword = ref(""),
  testConnectionId = ref(""),
  testRecipient = ref("");
const expandedConnectionId = ref(""),
  editingConnectionId = ref(""),
  editName = ref(""),
  editEnabled = ref(true),
  editFromEmail = ref(""),
  editFromName = ref(""),
  editReplyTo = ref(""),
  editAccountId = ref(""),
  editZoneId = ref(""),
  editSendingDomain = ref(""),
  editSmtpHost = ref(""),
  editSmtpPort = ref<465 | 587>(465),
  editSmtpUsername = ref(""),
  editSecret = ref("");
const systemRoute = ref<string[]>([]),
  formsRoute = ref<string[]>([]),
  statusFilter = ref<z.infer<typeof EmailDeliveryStatusSchema> | undefined>();
const settingsActionsTarget = ref<Element | null>(null);
const { user, fetchUser } = useUser();
const { t } = useStudioI18n();
const enabledConnections = computed(() =>
  connections.value.filter((connection) => connection.enabled),
);
async function resolveSettingsActionsTarget(): Promise<void> {
  await nextTick();
  settingsActionsTarget.value = document.querySelector("#settings-tab-actions");
}
function applyDefaultTestRecipient(): void {
  if (testRecipient.value.trim() || !user.value?.email) {
    return;
  }

  testRecipient.value = user.value.email;
}
function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
function setProvider(value: unknown): void {
  provider.value = value === "smtp" ? "smtp" : "cloudflare_email";
}
function openConnectionForm(value: unknown): void {
  if (value !== "smtp" && value !== "cloudflare_email") return;
  setProvider(value);
  selectedConnectionProvider.value = "";
  showConnectionForm.value = true;
  tab.value = "connections";
}
function setSmtpPort(value: unknown): void {
  smtpPort.value = Number(value) === 587 ? 587 : 465;
}
function setEditSmtpPort(value: unknown): void {
  editSmtpPort.value = Number(value) === 587 ? 587 : 465;
}
function toggleConnectionDetails(connection: EmailConnection): void {
  expandedConnectionId.value =
    expandedConnectionId.value === connection.id ? "" : connection.id;
}
function startEditingConnection(connection: EmailConnection): void {
  const smtp = SmtpConfigSchema.safeParse(connection.config);
  const cloudflare = CloudflareEmailConfigSchema.safeParse(connection.config);

  editingConnectionId.value = connection.id;
  expandedConnectionId.value = connection.id;
  editName.value = connection.name;
  editEnabled.value = connection.enabled;
  editFromEmail.value = connection.fromEmail;
  editFromName.value = connection.fromName ?? "";
  editReplyTo.value = connection.replyToEmail ?? "";
  editSecret.value = "";

  editSmtpHost.value = smtp.success ? smtp.data.host : "";
  editSmtpPort.value = smtp.success ? smtp.data.port : 465;
  editSmtpUsername.value = smtp.success ? smtp.data.username : "";
  editAccountId.value = cloudflare.success ? cloudflare.data.accountId : "";
  editZoneId.value = cloudflare.success ? cloudflare.data.zoneId : "";
  editSendingDomain.value = cloudflare.success
    ? cloudflare.data.sendingDomain
    : "";
}
function cancelEditingConnection(): void {
  editingConnectionId.value = "";
  editSecret.value = "";
}
function smtpConfig(connection: EmailConnection) {
  const parsed = SmtpConfigSchema.safeParse(connection.config);
  return parsed.success ? parsed.data : null;
}
function cloudflareConfig(connection: EmailConnection) {
  const parsed = CloudflareEmailConfigSchema.safeParse(connection.config);
  return parsed.success ? parsed.data : null;
}
function connectionProviderLabel(connection: EmailConnection): string {
  if (connection.provider === "smtp") return "SMTP";
  if (connection.provider === "cloudflare_email")
    return t("email.provider.cloudflare");
  return t("email.provider.preview");
}
function routePurposeLabel(purpose: "system" | "forms"): string {
  return purpose === "system"
    ? t("email.route.system")
    : t("email.route.forms");
}
function deliveryPurposeLabel(purpose: "system" | "forms"): string {
  return purpose === "system"
    ? t("email.purpose.system")
    : t("email.purpose.forms");
}
function connectionHealthLabel(connection: EmailConnection): string {
  switch (connection.healthState) {
    case "healthy":
      return t("email.health.verified");
    case "failed":
      return t("email.health.failed");
    case "degraded":
      return t("email.health.degraded");
    default:
      return t("email.health.untested");
  }
}
function deliveryStatusLabel(
  status: z.infer<typeof EmailDeliveryStatusSchema>,
): string {
  const labels = {
    pending: t("email.deliveryStatus.pending"),
    processing: t("email.deliveryStatus.processing"),
    retry_scheduled: t("email.deliveryStatus.retryScheduled"),
    accepted: t("email.deliveryStatus.accepted"),
    failed_permanent: t("email.deliveryStatus.failedPermanent"),
    canceled: t("email.deliveryStatus.canceled"),
  };

  return labels[status];
}
function buildConnectionInput(): z.infer<typeof EmailConnectionCreateSchema> {
  const common = {
    name: name.value.trim(),
    enabled: true,
    fromEmail: fromEmail.value.trim(),
    fromName: optionalText(fromName.value),
    replyToEmail: optionalText(replyTo.value),
  };
  if (provider.value === "cloudflare_email") {
    return {
      ...common,
      provider: "cloudflare_email",
      config: {
        accountId: accountId.value.trim(),
        zoneId: zoneId.value.trim(),
        sendingDomain: sendingDomain.value.trim(),
      },
      secret: { apiToken: apiToken.value.trim() },
    };
  }
  const port = smtpPort.value;
  return {
    ...common,
    provider: "smtp",
    config: {
      host: smtpHost.value.trim(),
      port,
      security: port === 465 ? "tls" : "starttls",
      username: smtpUsername.value.trim(),
      authMethod: "plain",
    },
    secret: { password: smtpPassword.value },
  };
}
function buildConnectionPatch(connection: EmailConnection) {
  const common = {
    name: editName.value.trim(),
    enabled: editEnabled.value,
    fromEmail: editFromEmail.value.trim(),
    fromName: optionalText(editFromName.value) ?? null,
    replyToEmail: optionalText(editReplyTo.value) ?? null,
  };

  if (connection.provider === "smtp") {
    const port = editSmtpPort.value;
    return {
      ...common,
      config: {
        host: editSmtpHost.value.trim(),
        port,
        security: port === 465 ? "tls" : "starttls",
        username: editSmtpUsername.value.trim(),
        authMethod: "plain",
      },
    };
  }

  if (connection.provider === "cloudflare_email") {
    return {
      ...common,
      config: {
        accountId: editAccountId.value.trim(),
        zoneId: editZoneId.value.trim(),
        sendingDomain: editSendingDomain.value.trim(),
      },
    };
  }

  return common;
}
function connectionInputError(
  error: z.ZodError<z.infer<typeof EmailConnectionCreateSchema>>,
): string {
  const first = error.issues[0];
  return first?.message
    ? t("email.connectionDetailsInvalid", { message: first.message })
    : t("email.connectionDetailsRetry");
}
function emailActionMessage(message: string | undefined): string {
  switch (message) {
    case "EMAIL_KEY_ID_UNAVAILABLE":
      return t("email.encryptionNotConfigured");
    case "EMAIL_KEY_ID_INVALID":
      return t("email.encryptionKeyIdInvalid");
    case "EMAIL_KEY_UNAVAILABLE":
      return t("email.encryptionKeyMissing");
    case "EMAIL_KEY_INVALID":
      return t("email.encryptionKeyInvalid");
    default:
      return message ?? t("email.operationFailed");
  }
}
async function createConnectionViaAction(
  input: z.infer<typeof EmailConnectionCreateSchema>,
): Promise<void> {
  const result = await actions.email.connections.create(input);
  if (result.error) {
    throw new Error(emailActionMessage(result.error.message));
  }
  EmailConnectionSchema.parse(result.data);
}
function fail(error: unknown): void {
  toast.error(
    error instanceof Error ? error.message : t("email.operationFailed"),
  );
}
async function load(): Promise<void> {
  loading.value = true;
  try {
    const [c, r, o, d] = await Promise.all([
      actions.email.connections.list({}),
      actions.email.routes.list({}),
      actions.email.outbox.overview({}),
      actions.email.outbox.list({ limit: 50, status: statusFilter.value }),
    ]);
    if (c.error) throw new Error(c.error.message);
    if (r.error) throw new Error(r.error.message);
    if (o.error) throw new Error(o.error.message);
    if (d.error) throw new Error(d.error.message);
    connections.value = z.array(EmailConnectionSchema).parse(c.data);
    routes.value = z.array(EmailRouteSchema).parse(r.data);
    overview.value = z.record(z.string(), z.number()).parse(o.data);
    deliveries.value = z.array(SafeEmailDeliverySchema).parse(d.data.items);
    systemRoute.value = routes.value
      .filter((item) => item.purpose === "system")
      .map((item) => item.connectionId);
    formsRoute.value = routes.value
      .filter((item) => item.purpose === "forms")
      .map((item) => item.connectionId);
    if (
      testConnectionId.value &&
      !connections.value.some(
        (connection) =>
          connection.enabled && connection.id === testConnectionId.value,
      )
    ) {
      testConnectionId.value = "";
    }
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function createConnection(): Promise<void> {
  loading.value = true;
  try {
    const parsed = EmailConnectionCreateSchema.safeParse(
      buildConnectionInput(),
    );
    if (!parsed.success) {
      toast.error(connectionInputError(parsed.error));
      return;
    }
    await createConnectionViaAction(parsed.data);
    toast.success(t("email.connectionCreated"));
    showConnectionForm.value = false;
    name.value = "";
    apiToken.value = "";
    smtpPassword.value = "";
    await load();
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function verify(id: string): Promise<void> {
  const result = await actions.email.connections.verify({ id });
  if (result.error) return fail(new Error(result.error.message));
  result.data.ok
    ? toast.success(result.data.message)
    : toast.error(result.data.message);
  await load();
}
async function sendTest(id: string): Promise<void> {
  if (!testRecipient.value) return toast.error(t("email.enterTestRecipient"));
  const result = await actions.email.connections.sendTest({
    id,
    to: testRecipient.value,
  });
  if (result.error) return fail(new Error(result.error.message));
  if (result.data.delivery.status === "failed_permanent") {
    toast.error(result.data.delivery.lastErrorMessage ?? t("email.testFailed"));
  } else {
    toast.success(
      result.data.delivery.status === "accepted"
        ? t("email.testSent")
        : result.data.wakeUpPending
          ? t("email.testQueuedWakeup")
          : t("email.testQueued"),
    );
  }
  await load();
}
async function saveConnection(connection: EmailConnection): Promise<void> {
  loading.value = true;
  try {
    const result = await actions.email.connections.update({
      id: connection.id,
      patch: buildConnectionPatch(connection),
    });
    if (result.error) throw new Error(result.error.message);

    const secret = editSecret.value.trim();
    if (secret) {
      const secretResult = await actions.email.connections.replaceSecret({
        id: connection.id,
        secret:
          connection.provider === "cloudflare_email"
            ? { apiToken: secret }
            : { password: editSecret.value },
      });
      if (secretResult.error) throw new Error(secretResult.error.message);
    }

    toast.success(t("email.connectionUpdated"));
    cancelEditingConnection();
    await load();
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function sendSelectedTest(): Promise<void> {
  const connectionId =
    testConnectionId.value || enabledConnections.value[0]?.id;
  if (!connectionId) return toast.error(t("email.addEnabledConnection"));
  await sendTest(connectionId);
}
async function remove(id: string): Promise<void> {
  if (!confirm(t("email.deleteConnectionConfirm"))) return;
  const result = await actions.email.connections.delete({ id });
  if (result.error) return fail(new Error(result.error.message));
  await load();
}
async function saveRoute(
  purpose: "system" | "forms",
  value: string[],
): Promise<void> {
  const result = await actions.email.routes.replacePurpose({
    purpose,
    connectionIds: value,
  });
  if (result.error) return fail(new Error(result.error.message));
  toast.success(t("email.routeSaved", { purpose: routePurposeLabel(purpose) }));
  await load();
}
async function setRouteSelection(
  purpose: "system" | "forms",
  value: string,
): Promise<void> {
  const ids = value && value !== "__none__" ? [value] : [];
  if (purpose === "system") systemRoute.value = ids;
  else formsRoute.value = ids;
  await saveRoute(purpose, ids);
}
async function retry(id: string): Promise<void> {
  const result = await actions.email.outbox.retry({ id });
  if (result.error) return fail(new Error(result.error.message));
  toast.success(t("email.retryQueued"));
  await load();
}
async function cancel(id: string): Promise<void> {
  const result = await actions.email.outbox.cancel({ id });
  if (result.error) return fail(new Error(result.error.message));
  await load();
}
watch(() => user.value?.email, applyDefaultTestRecipient, { immediate: true });
onMounted(() => {
  void resolveSettingsActionsTarget();
  void fetchUser().then(applyDefaultTestRecipient);
  void load();
});
</script>

<template>
  <Teleport
    :to="settingsActionsTarget ?? undefined"
    :disabled="!settingsActionsTarget"
  >
    <div class="flex items-center gap-2">
      <Select
        :model-value="selectedConnectionProvider"
        :disabled="loading"
        @update:model-value="openConnectionForm"
      >
        <SelectTrigger
          hide-icon
          class="h-9! w-auto! min-w-0 shrink-0 border border-dashed border-border bg-input px-3 text-xs text-muted-foreground hover:border-border/50! hover:bg-background! hover:text-foreground!"
        >
          <SelectValue :placeholder="`+ ${t('email.addConnection')}`" />
        </SelectTrigger>
        <SelectContent side="left">
          <SelectItem value="cloudflare_email">
            Cloudflare Email Service
          </SelectItem>
          <SelectItem value="smtp">{{ t("email.provider.smtp") }}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        class="h-9! w-9! shrink-0"
        :title="t('email.refresh')"
        :aria-label="t('email.refresh')"
        :disabled="loading"
        @click="load"
      >
        <span
          :class="[
            studioIcons.refresh,
            'size-3.5 shrink-0',
            loading ? 'animate-spin' : '',
          ]"
        />
      </Button>
    </div>
  </Teleport>

  <div
    class="min-w-0 space-y-0 p-0 page-card-enter z-10 bg-background"
    role="form"
    :aria-label="t('email.settings')"
  >
    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
      role="tablist"
      :aria-label="t('email.sections')"
    >
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'overview'"
        :variant="tab === 'overview' ? 'tab-active' : 'tab'"
        @click="tab = 'overview'"
      >
        {{ t("email.overview") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'connections'"
        :variant="tab === 'connections' ? 'tab-active' : 'tab'"
        @click="tab = 'connections'"
      >
        {{ t("email.connections") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'routing'"
        :variant="tab === 'routing' ? 'tab-active' : 'tab'"
        @click="tab = 'routing'"
      >
        {{ t("email.routing") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="tab === 'outbox'"
        :variant="tab === 'outbox' ? 'tab-active' : 'tab'"
        @click="tab = 'outbox'"
      >
        {{ t("email.outbox") }}
      </Button>
    </div>

    <div class="px-10 py-7">
      <section v-if="tab === 'overview'" class="max-w-3xl space-y-8">
        <div class="space-y-2">
          <h4 class="m-0 font-serif text-xl font-medium text-foreground">
            {{ t("email.deliveryOverview") }}
          </h4>
          <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t("email.deliveryOverviewDescription") }}
          </p>
        </div>

        <div class="space-y-3">
          <h5
            class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            Outbox
          </h5>
          <div class="divide-y divide-border/70 border-y border-border/70">
            <div class="flex items-center justify-between gap-4 py-3">
              <span class="text-sm text-foreground">{{
                t("email.accepted")
              }}</span>
              <span class="text-sm tabular-nums text-muted-foreground">
                {{ overview.accepted ?? 0 }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-4 py-3">
              <span class="text-sm text-foreground">{{
                t("email.pending")
              }}</span>
              <span class="text-sm tabular-nums text-muted-foreground">
                {{ overview.pending ?? 0 }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-4 py-3">
              <span class="text-sm text-foreground">{{
                t("email.processing")
              }}</span>
              <span class="text-sm tabular-nums text-muted-foreground">
                {{ overview.processing ?? 0 }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-4 py-3">
              <span class="text-sm text-foreground">{{
                t("email.scheduledRetry")
              }}</span>
              <span class="text-sm tabular-nums text-muted-foreground">
                {{ overview.retry_scheduled ?? 0 }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-4 py-3">
              <span class="text-sm text-foreground">{{
                t("email.failedPermanent")
              }}</span>
              <span class="text-sm tabular-nums text-muted-foreground">
                {{ overview.failed_permanent ?? 0 }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="tab === 'connections'" class="max-w-4xl space-y-7">
        <div class="space-y-2">
          <h4 class="m-0 font-serif text-xl font-medium text-foreground">
            {{ t("email.connections") }}
          </h4>
          <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t("email.connectionsDescription") }}
          </p>
        </div>

        <form
          v-if="showConnectionForm"
          class="space-y-4 border-y border-border/70 py-5"
          @submit.prevent="createConnection"
        >
          <div class="flex items-center justify-between gap-3">
            <h5
              class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              {{ t("email.addConnection") }}
            </h5>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-9"
              @click="showConnectionForm = false"
            >
              {{ t("email.cancel") }}
            </Button>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <Select :model-value="provider" @update:model-value="setProvider">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('email.selectProvider')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudflare_email">
                  Cloudflare Email Service
                </SelectItem>
                <SelectItem value="smtp">{{
                  t("email.provider.smtp")
                }}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              v-model="name"
              required
              :placeholder="t('email.connectionName')"
            />
            <Input
              v-model="fromEmail"
              required
              type="email"
              :placeholder="t('email.fromEmail')"
            />
            <Input v-model="fromName" :placeholder="t('email.fromName')" />
            <Input
              v-model="replyTo"
              type="email"
              :placeholder="t('email.replyToOptional')"
            />
            <template v-if="provider === 'cloudflare_email'">
              <Input
                v-model="accountId"
                required
                :placeholder="t('email.cloudflareAccountId')"
              />
              <Input
                v-model="zoneId"
                required
                :placeholder="t('email.zoneId')"
              />
              <Input
                v-model="sendingDomain"
                required
                :placeholder="t('email.sendingDomain')"
              />
              <Input
                v-model="apiToken"
                required
                type="password"
                :placeholder="t('email.emailSendingApiToken')"
              />
            </template>
            <template v-else>
              <Input
                v-model="smtpHost"
                required
                :placeholder="t('email.smtpHost')"
              />
              <Select :model-value="smtpPort" @update:model-value="setSmtpPort">
                <SelectTrigger class="w-full">
                  <SelectValue :placeholder="t('email.port')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="465">465 implicit TLS</SelectItem>
                  <SelectItem :value="587">587 STARTTLS</SelectItem>
                </SelectContent>
              </Select>
              <Input
                v-model="smtpUsername"
                required
                :placeholder="t('email.username')"
              />
              <Input
                v-model="smtpPassword"
                required
                type="password"
                :placeholder="t('email.password')"
              />
            </template>
          </div>
          <Button type="submit" size="sm" class="h-9" :disabled="loading">
            {{ t("email.createSecurely") }}
          </Button>
        </form>

        <div class="space-y-3">
          <h5
            class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            {{ t("email.providers") }}
          </h5>
          <div
            v-if="connections.length"
            class="divide-y divide-border/70 border-y border-border/70"
          >
            <article
              v-for="connection in connections"
              :key="connection.id"
              class="py-4"
            >
              <div
                class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  @click="toggleConnectionDetails(connection)"
                >
                  <div
                    class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                  >
                    <h5
                      class="m-0 truncate text-sm font-medium text-foreground"
                    >
                      {{ connection.name }}
                    </h5>
                    <span class="text-xs text-muted-foreground">
                      {{ connectionProviderLabel(connection) }}
                    </span>
                    <span
                      class="text-xs"
                      :class="
                        connection.healthState === 'healthy'
                          ? 'text-primary'
                          : connection.healthState === 'failed'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      "
                    >
                      {{ connectionHealthLabel(connection) }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-xs text-muted-foreground">
                    {{ connection.fromEmail }}
                    <template v-if="smtpConfig(connection)">
                      · {{ smtpConfig(connection)?.host }}:{{
                        smtpConfig(connection)?.port
                      }}
                    </template>
                    <template v-else-if="cloudflareConfig(connection)">
                      · {{ cloudflareConfig(connection)?.sendingDomain }}
                    </template>
                  </p>
                  <p
                    v-if="connection.lastErrorMessage"
                    class="mt-2 text-xs text-destructive"
                  >
                    {{ connection.lastErrorMessage }}
                  </p>
                </button>

                <div class="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-9"
                    @click="verify(connection.id)"
                  >
                    {{ t("email.verify") }}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-9 px-2"
                    @click="startEditingConnection(connection)"
                  >
                    {{ t("email.edit") }}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-9 w-9 p-0!"
                    :aria-label="
                      t('email.deleteConnectionAria', { name: connection.name })
                    "
                    @click="remove(connection.id)"
                  >
                    <span
                      :class="[studioIcons.trash, 'size-4']"
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </div>

              <div
                v-if="expandedConnectionId === connection.id"
                class="mt-4 border-t border-border/70 pt-4"
              >
                <div
                  v-if="editingConnectionId !== connection.id"
                  class="flex flex-wrap gap-x-6 gap-y-3 text-sm"
                >
                  <div>
                    <p class="text-xs text-muted-foreground">
                      {{ t("email.from") }}
                    </p>
                    <p>{{ connection.fromEmail }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-muted-foreground">
                      {{ t("email.fromName") }}
                    </p>
                    <p>{{ connection.fromName || t("email.notSet") }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-muted-foreground">
                      {{ t("email.replyTo") }}
                    </p>
                    <p>{{ connection.replyToEmail || t("email.notSet") }}</p>
                  </div>
                  <template v-if="smtpConfig(connection)">
                    <div>
                      <p class="text-xs text-muted-foreground">
                        {{ t("email.host") }}
                      </p>
                      <p>{{ smtpConfig(connection)?.host }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        {{ t("email.port") }}
                      </p>
                      <p>{{ smtpConfig(connection)?.port }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        {{ t("email.username") }}
                      </p>
                      <p>{{ smtpConfig(connection)?.username }}</p>
                    </div>
                  </template>
                  <template v-else-if="cloudflareConfig(connection)">
                    <div>
                      <p class="text-xs text-muted-foreground">
                        {{ t("email.account") }}
                      </p>
                      <p>{{ cloudflareConfig(connection)?.accountId }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        {{ t("email.zone") }}
                      </p>
                      <p>{{ cloudflareConfig(connection)?.zoneId }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        {{ t("email.domain") }}
                      </p>
                      <p>{{ cloudflareConfig(connection)?.sendingDomain }}</p>
                    </div>
                  </template>
                  <div>
                    <p class="text-xs text-muted-foreground">
                      {{ t("email.credential") }}
                    </p>
                    <p>
                      {{
                        connection.credentialState === "configured"
                          ? t("email.configured")
                          : connection.credentialState
                      }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-muted-foreground">
                      {{ t("email.enabled") }}
                    </p>
                    <p>
                      {{ connection.enabled ? t("email.yes") : t("email.no") }}
                    </p>
                  </div>
                </div>

                <form
                  v-else
                  class="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
                  @submit.prevent="saveConnection(connection)"
                >
                  <Input
                    v-model="editName"
                    required
                    :placeholder="t('email.connectionName')"
                  />
                  <Input
                    v-model="editFromEmail"
                    required
                    type="email"
                    :placeholder="t('email.fromEmail')"
                  />
                  <Input
                    v-model="editFromName"
                    :placeholder="t('email.fromName')"
                  />
                  <Input
                    v-model="editReplyTo"
                    type="email"
                    :placeholder="t('email.replyToOptional')"
                  />
                  <template v-if="connection.provider === 'smtp'">
                    <Input
                      v-model="editSmtpHost"
                      required
                      :placeholder="t('email.smtpHost')"
                    />
                    <Select
                      :model-value="editSmtpPort"
                      @update:model-value="setEditSmtpPort"
                    >
                      <SelectTrigger class="w-full">
                        <SelectValue :placeholder="t('email.port')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem :value="465">465 TLS</SelectItem>
                        <SelectItem :value="587">587 STARTTLS</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      v-model="editSmtpUsername"
                      required
                      :placeholder="t('email.username')"
                    />
                    <Input
                      v-model="editSecret"
                      type="password"
                      :placeholder="t('email.newSmtpPassword')"
                    />
                  </template>
                  <template
                    v-else-if="connection.provider === 'cloudflare_email'"
                  >
                    <Input
                      v-model="editAccountId"
                      required
                      :placeholder="t('email.cloudflareAccountId')"
                    />
                    <Input
                      v-model="editZoneId"
                      required
                      :placeholder="t('email.zoneId')"
                    />
                    <Input
                      v-model="editSendingDomain"
                      required
                      :placeholder="t('email.sendingDomain')"
                    />
                    <Input
                      v-model="editSecret"
                      type="password"
                      :placeholder="t('email.newApiToken')"
                    />
                  </template>
                  <label class="flex h-9 items-center gap-2 text-sm">
                    <input v-model="editEnabled" type="checkbox" />
                    {{ t("email.enabled") }}
                  </label>
                  <div class="flex gap-2 md:col-span-2 lg:col-span-3">
                    <Button
                      type="submit"
                      size="sm"
                      class="h-9"
                      :disabled="loading"
                    >
                      {{ t("common.save") }}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      class="h-9"
                      @click="cancelEditingConnection"
                    >
                      {{ t("email.cancel") }}
                    </Button>
                  </div>
                </form>
              </div>
            </article>
          </div>
          <p
            v-else
            class="border-y border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground"
          >
            {{ t("email.noConnections") }}
          </p>
        </div>

        <div
          class="flex flex-col gap-2 border-y border-border/70 py-4 sm:flex-row sm:items-center"
        >
          <Select
            v-if="enabledConnections.length"
            :model-value="testConnectionId || enabledConnections[0]?.id"
            :disabled="loading"
            @update:model-value="testConnectionId = String($event)"
          >
            <SelectTrigger class="h-9! w-full sm:w-56">
              <SelectValue :placeholder="t('email.connection')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="connection in enabledConnections"
                :key="connection.id"
                :value="connection.id"
              >
                {{ connection.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-model="testRecipient"
            class="h-9!"
            type="email"
            :placeholder="t('email.testRecipient')"
          />
          <Button
            type="button"
            variant="outline"
            class="h-9 shrink-0"
            :disabled="loading || !testRecipient || !enabledConnections.length"
            @click="sendSelectedTest"
          >
            {{ t("email.sendTest") }}
          </Button>
        </div>
      </section>

      <section v-else-if="tab === 'routing'" class="max-w-3xl space-y-7">
        <div class="space-y-2">
          <h4 class="m-0 font-serif text-xl font-medium text-foreground">
            {{ t("email.routing") }}
          </h4>
          <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t("email.routingDescription") }}
          </p>
        </div>

        <div class="divide-y divide-border/70 border-y border-border/70">
          <div
            v-for="purpose in ['system', 'forms'] as const"
            :key="purpose"
            class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <h5 class="m-0 text-sm font-medium capitalize text-foreground">
                {{ routePurposeLabel(purpose) }}
              </h5>
              <p class="mt-1 text-xs text-muted-foreground">
                {{
                  purpose === "system"
                    ? t("email.route.systemDescription")
                    : t("email.route.formsDescription")
                }}
              </p>
            </div>
            <Select
              :disabled="loading"
              :model-value="
                purpose === 'system'
                  ? (systemRoute[0] ?? '__none__')
                  : (formsRoute[0] ?? '__none__')
              "
              @update:model-value="setRouteSelection(purpose, $event)"
            >
              <SelectTrigger class="w-full sm:w-72">
                <SelectValue :placeholder="t('email.disabled')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{{
                  t("email.disabled")
                }}</SelectItem>
                <SelectItem
                  v-for="connection in connections.filter(
                    (item) => item.enabled,
                  )"
                  :key="connection.id"
                  :value="connection.id"
                >
                  {{ connection.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section v-else class="space-y-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="space-y-2">
            <h4 class="m-0 font-serif text-xl font-medium text-foreground">
              Outbox
            </h4>
            <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Recent delivery attempts, retries, cancellations, and permanent
              failures.
            </p>
          </div>
          <Select
            :model-value="statusFilter ?? '__all__'"
            @update:model-value="
              statusFilter = $event === '__all__' ? undefined : $event;
              load();
            "
          >
            <SelectTrigger class="h-9! w-auto min-w-36">
              <SelectValue :placeholder="t('email.allStatuses')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{{
                t("email.allStatuses")
              }}</SelectItem>
              <SelectItem
                v-for="status in EmailDeliveryStatusSchema.options"
                :key="status"
                :value="status"
              >
                {{ deliveryStatusLabel(status) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="overflow-x-auto border-y border-border/70">
          <table
            class="w-full min-w-[760px] table-fixed border-collapse text-sm"
          >
            <colgroup>
              <col style="width: 18%" />
              <col style="width: 52%" />
              <col style="width: 10%" />
              <col style="width: 20%" />
            </colgroup>
            <thead>
              <tr class="border-b border-border/70">
                <th
                  class="py-3 pr-5 text-left text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {{ t("email.created") }}
                </th>
                <th
                  class="px-5 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {{ t("email.delivery") }}
                </th>
                <th
                  class="px-5 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {{ t("email.tries") }}
                </th>
                <th
                  class="py-3 pl-5 text-left text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {{ t("email.status") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="delivery in deliveries"
                :key="delivery.id"
                class="border-b border-border/50 last:border-b-0"
              >
                <td class="py-4 pr-5 align-top text-xs text-muted-foreground">
                  {{ new Date(delivery.createdAt).toLocaleString() }}
                </td>
                <td class="min-w-0 whitespace-normal px-5 py-4 align-top">
                  <div class="min-w-0 space-y-1">
                    <div class="break-words text-sm font-medium">
                      {{ delivery.subject ?? delivery.templateKey }}
                    </div>
                    <div class="break-all text-xs text-muted-foreground">
                      {{ delivery.to.join(", ") }}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {{ deliveryPurposeLabel(delivery.purpose) }}
                    </div>
                  </div>
                </td>
                <td
                  class="px-5 py-4 align-top text-sm tabular-nums text-muted-foreground"
                >
                  {{ delivery.attemptCount }}
                </td>
                <td class="py-4 pl-5 align-top">
                  <p class="text-xs capitalize text-muted-foreground">
                    {{ deliveryStatusLabel(delivery.status) }}
                  </p>
                  <div class="mt-2 flex gap-2">
                    <Button
                      v-if="delivery.status === 'failed_permanent'"
                      size="sm"
                      variant="outline"
                      class="h-8"
                      @click="retry(delivery.id)"
                    >
                      Retry
                    </Button>
                    <Button
                      v-if="
                        ['pending', 'retry_scheduled'].includes(delivery.status)
                      "
                      size="sm"
                      variant="ghost"
                      class="h-8"
                      @click="cancel(delivery.id)"
                    >
                      Cancel
                    </Button>
                  </div>
                </td>
              </tr>
              <tr v-if="!deliveries.length">
                <td colspan="4" class="p-8 text-center text-muted-foreground">
                  No delivery records.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
