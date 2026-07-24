<script setup lang="ts">
import { actions } from "astro:actions";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import type { OAuthGrantSummary } from "@lib/oauth/repository";

type OAuthStatus = Readonly<{
  enabled: boolean;
  canonicalOrigin: string | null;
}>;

const { t } = useStudioI18n();
const status = ref<OAuthStatus | null>(null);
const grants = ref<OAuthGrantSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const confirmingId = ref<string | null>(null);

const activeGrants = computed(() =>
  grants.value.filter((grant) => grant.status === "active"),
);

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

function formatTimestamp(value: string | null): string {
  if (!value) return t("settings.integrations.oauth.never");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function scopeLabel(scope: string): string {
  return t(`settings.integrations.oauth.scope.${scope}`);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [statusResult, grantResult] = await Promise.all([
      actions.oauth.status({}),
      actions.oauth.listGrants({}),
    ]);
    if (statusResult.error) throw statusResult.error;
    if (grantResult.error) throw grantResult.error;
    status.value = statusResult.data as OAuthStatus;
    grants.value = (grantResult.data ?? []) as OAuthGrantSummary[];
  } catch (cause) {
    error.value = messageFrom(
      cause,
      t("settings.integrations.oauth.loadFailed"),
    );
  } finally {
    loading.value = false;
  }
}

async function revoke(grant: OAuthGrantSummary): Promise<void> {
  loading.value = true;
  try {
    const result = await actions.oauth.revokeGrant({
      id: grant.id,
      reason: "Disconnected in Studio",
    });
    if (result.error) throw result.error;
    confirmingId.value = null;
    await load();
    toast.success(t("settings.integrations.oauth.disconnected"));
  } catch (cause) {
    toast.error(
      messageFrom(cause, t("settings.integrations.oauth.disconnectFailed")),
    );
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h3 class="text-sm font-medium">
          {{ t("settings.integrations.oauth.title") }}
        </h3>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t("settings.integrations.oauth.description") }}
        </p>
      </div>
      <div
        v-if="status"
        class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="status.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50'"
          aria-hidden="true"
        />
        {{
          status.enabled
            ? t("settings.integrations.oauth.enabled")
            : t("settings.integrations.oauth.disabled")
        }}
      </div>
    </div>

    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ error }}
    </p>

    <div v-if="activeGrants.length" class="divide-y">
      <div
        v-for="grant in activeGrants"
        :key="grant.id"
        class="flex items-center justify-between gap-5 py-3"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ grant.clientName }}
            <span class="font-normal text-muted-foreground">
              · {{ grant.principalUsername }}
            </span>
          </p>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            {{ grant.scopes.map(scopeLabel).join(" · ") }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t("settings.integrations.oauth.lastUsed") }}
            {{ formatTimestamp(grant.lastUsedAt) }}
          </p>
        </div>

        <div v-if="confirmingId === grant.id" class="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            :disabled="loading"
            @click="confirmingId = null"
          >
            {{ t("settings.integrations.oauth.cancel") }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="loading"
            @click="revoke(grant)"
          >
            {{ t("settings.integrations.oauth.confirmDisconnect") }}
          </Button>
        </div>
        <Button
          v-else
          variant="ghost"
          size="sm"
          :disabled="loading"
          @click="confirmingId = grant.id"
        >
          {{ t("settings.integrations.oauth.disconnect") }}
        </Button>
      </div>
    </div>

    <p v-else-if="!loading" class="text-sm text-muted-foreground">
      {{ t("settings.integrations.oauth.empty") }}
    </p>
  </section>
</template>
