<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useCapabilities } from "@/composables/useCapabilities";
import { useStudioMetrics } from "@/features/Studio/metrics/composables/useStudioMetrics";
import { useStudioI18n } from "@/i18n";
import type { AnalyticsProviderId } from "@/lib/storage/adapter";
import type { AnalyticsProviderField } from "@/lib/analytics/providers";
import { studioIcons } from "@/lib/icons";
import { useSettingsTabHydrate } from "../composables/useSettingsTabHydrate";
import SettingsRow from "./SettingsRow.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const {
  analytics,
  ANALYTICS_PROVIDERS,
  loadSettings,
  isAnalyticsProviderActive,
  activateAnalyticsProvider,
  deactivateAnalyticsProvider,
  removeAnalyticsProvider,
  setAnalyticsProviderField,
  setStudioCloudflareTraffic,
} = useSiteSettings();
const { t } = useStudioI18n();

const { hasCapability } = useCapabilities();
const {
  availability,
  isCloudflarePlatform,
  refreshAvailability,
  clearMetricsSessionCache,
  isLoadingAvailability,
} = useStudioMetrics();

const canEditAnalytics = computed(() => hasCapability("editAnalytics"));
const canCheckStudioMetrics = computed(
  () => hasCapability("viewStudioMetrics") || hasCapability("editAnalytics"),
);

const CLOUDFLARE_ZONE_ANALYTICS_TOKEN_URL =
  "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=%2A&zoneId=all&name=Aria%20Zone%20Analytics";
const CLOUDFLARE_ZONE_ID_DOCS_URL =
  "https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/";
const ARIA_CLOUDFLARE_ANALYTICS_DOCS_URL =
  "https://ariabuilder.io/docs/deployment/cloudflare/";

const isLoading = ref(false);
const isSaving = ref(false);
const studioTrafficToggleChecked = ref(
  Boolean(analytics.value.studioDisplay?.cloudflareTraffic),
);

function resolveStudioTrafficToggle(): boolean {
  if (availability.value?.siteToggleEnabled != null) {
    return availability.value.siteToggleEnabled;
  }
  return Boolean(analytics.value.studioDisplay?.cloudflareTraffic);
}

watch(
  [availability, () => analytics.value.studioDisplay?.cloudflareTraffic],
  () => {
    const resolved = resolveStudioTrafficToggle();

    if (!isSaving.value && studioTrafficToggleChecked.value !== resolved) {
      studioTrafficToggleChecked.value = resolved;
    }
  },
  { immediate: true },
);

const studioTrafficCredentialsBlocked = computed(() => {
  const a = availability.value;
  if (!a) return true;
  return (
    a.platform !== "cloudflare" ||
    !a.credentialsReady ||
    a.analyticsReadGranted === false
  );
});

const studioTrafficSwitchDisabled = computed(() => {
  if (!canEditAnalytics.value) return true;
  if (isLoading.value) return true;
  if (isLoadingAvailability.value && !availability.value) return true;
  return studioTrafficCredentialsBlocked.value;
});

const showStudioTrafficWarnings = computed(() => {
  const a = availability.value;
  if (!a) return false;
  return (
    a.hostMismatch ||
    a.siteUrlMismatch ||
    a.analyticsReadGranted === false ||
    (a.platform === "cloudflare" && !a.credentialsReady)
  );
});

const selectedProviderId = ref<AnalyticsProviderId | "">("");
const fieldDrafts = reactive<Record<string, Record<string, string>>>({});

const sortedProviders = computed(() =>
  [...ANALYTICS_PROVIDERS].sort((a, b) => a.label.localeCompare(b.label)),
);

const listedProviderIds = computed<AnalyticsProviderId[]>(() => {
  const providerIds = Object.keys(
    analytics.value.providers,
  ) as AnalyticsProviderId[];
  return sortedProviders.value
    .map((provider) => provider.id)
    .filter((providerId) => providerIds.includes(providerId));
});

const listedProviders = computed(() =>
  listedProviderIds.value
    .map((providerId) =>
      sortedProviders.value.find((provider) => provider.id === providerId),
    )
    .filter((provider) => provider !== undefined),
);

const availableProviders = computed(() =>
  sortedProviders.value.filter(
    (provider) => !listedProviderIds.value.includes(provider.id),
  ),
);

const hasAvailableProviders = computed(
  () => availableProviders.value.length > 0,
);
const hasListedProviders = computed(() => listedProviders.value.length > 0);

function providerFieldLabel(
  providerId: AnalyticsProviderId,
  field: AnalyticsProviderField,
): string {
  const key = `${providerId}.${field.key}`;
  const labels: Record<string, string> = {
    domain: t("settings.analytics.field.domain"),
    scriptSrc: t("settings.analytics.field.scriptUrl"),
    siteId: t("settings.analytics.field.siteId"),
    "matomo.baseUrl": t("settings.analytics.field.matomoUrl"),
    websiteId: t("settings.analytics.field.websiteId"),
    hostUrl: t("settings.analytics.field.hostUrl"),
    pixelId: t("settings.analytics.field.pixelId"),
    partnerId: t("settings.analytics.field.partnerId"),
    measurementId: t("settings.analytics.field.measurementId"),
    containerId: t("settings.analytics.field.containerId"),
  };

  return labels[key] ?? labels[field.key] ?? field.label;
}

function validateField(field: AnalyticsProviderField, value: string): boolean {
  if (field.required && value.trim().length === 0) {
    return false;
  }

  if (!value.trim()) {
    return true;
  }

  if (field.type === "url") {
    try {
      new URL(value);
    } catch {
      return false;
    }
  }

  if (field.key === "domain") {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim())) {
      return false;
    }
  }

  if (field.pattern) {
    const regex = new RegExp(field.pattern);
    if (!regex.test(value)) {
      return false;
    }
  }

  return true;
}

function ensureProviderDraft(providerId: AnalyticsProviderId): void {
  if (!fieldDrafts[providerId]) {
    fieldDrafts[providerId] = {
      ...(analytics.value.providers[providerId] ?? {}),
    };
  }
}

watch(
  analytics,
  (nextValue) => {
    const providerIds = Object.keys(
      nextValue.providers,
    ) as AnalyticsProviderId[];

    for (const providerId of providerIds) {
      fieldDrafts[providerId] = {
        ...(nextValue.providers[providerId] ?? {}),
      };
    }

    for (const providerId of Object.keys(fieldDrafts)) {
      if (!providerIds.includes(providerId as AnalyticsProviderId)) {
        delete fieldDrafts[providerId];
      }
    }
  },
  { immediate: true, deep: true },
);

async function hydrateAnalyticsTab(): Promise<void> {
  isLoading.value = true;
  try {
    await loadSettings({ force: true });
    if (canCheckStudioMetrics.value) {
      await refreshAvailability(true);
    }
    studioTrafficToggleChecked.value = resolveStudioTrafficToggle();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.loadFailed"),
    );
  } finally {
    isLoading.value = false;
  }
}

useSettingsTabHydrate({
  tabId: "analytics",
  hydrate: hydrateAnalyticsTab,
});

async function onStudioTrafficToggle(enabled: boolean): Promise<void> {
  if (!canEditAnalytics.value || isSaving.value) return;

  const previous = studioTrafficToggleChecked.value;
  studioTrafficToggleChecked.value = enabled;

  isSaving.value = true;
  try {
    await setStudioCloudflareTraffic(enabled);
    if (!enabled) {
      clearMetricsSessionCache();
    }
    await refreshAvailability(true);
    studioTrafficToggleChecked.value = resolveStudioTrafficToggle();
  } catch (error) {
    studioTrafficToggleChecked.value = previous;
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.studioTraffic.updateFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onActivateSelectedProvider(): Promise<void> {
  if (!selectedProviderId.value) {
    return;
  }

  const providerId = selectedProviderId.value;
  isSaving.value = true;
  try {
    await activateAnalyticsProvider(providerId);
    ensureProviderDraft(providerId);
    selectedProviderId.value = "";
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.activateFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onSelectProvider(value: unknown): Promise<void> {
  if (typeof value !== "string" || !value) {
    selectedProviderId.value = "";
    return;
  }

  selectedProviderId.value = value as AnalyticsProviderId;
  await onActivateSelectedProvider();
}

async function onDeactivateProvider(
  providerId: AnalyticsProviderId,
): Promise<void> {
  isSaving.value = true;
  try {
    await deactivateAnalyticsProvider(providerId);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.deactivateFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onActivateProvider(
  providerId: AnalyticsProviderId,
): Promise<void> {
  isSaving.value = true;
  try {
    await activateAnalyticsProvider(providerId);
    ensureProviderDraft(providerId);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.activateFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onRemoveProvider(
  providerId: AnalyticsProviderId,
): Promise<void> {
  isSaving.value = true;
  try {
    await removeAnalyticsProvider(providerId);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.removeFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onFieldBlur(
  providerId: AnalyticsProviderId,
  field: AnalyticsProviderField,
): Promise<void> {
  if (!isAnalyticsProviderActive(providerId)) {
    return;
  }

  const value = fieldDrafts[providerId]?.[field.key] ?? "";

  if (!validateField(field, value)) {
    toast.error(
      t("settings.analytics.invalidField", {
        field: providerFieldLabel(providerId, field),
      }),
    );
    return;
  }

  isSaving.value = true;
  try {
    await setAnalyticsProviderField(providerId, field.key, value);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.analytics.saveFieldFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <Teleport defer to="#settings-tab-actions">
    <Select
      :model-value="selectedProviderId"
      :disabled="isLoading || isSaving || !hasAvailableProviders"
      @update:model-value="onSelectProvider"
    >
      <SelectTrigger
        hide-icon
        class="h-9.5! w-auto! min-w-0 shrink-0 border border-border/50 border-dashed bg-input px-3 text-sm text-muted-foreground hover:border-border/50! hover:bg-background! hover:text-primary-foreground! active:border-border/50! active:bg-background! active:text-primary-foreground! focus:border-border/50! focus:bg-background! focus:text-primary-foreground!"
      >
        <SelectValue
          :placeholder="
            hasAvailableProviders
              ? t('settings.analytics.addProvider')
              : t('settings.analytics.allProvidersAdded')
          "
        />
      </SelectTrigger>
      <SelectContent side="left">
        <SelectItem
          v-for="provider in availableProviders"
          :key="provider.id"
          :value="provider.id"
        >
          {{ provider.label }}
        </SelectItem>
      </SelectContent>
    </Select>
  </Teleport>
  <div
    class="space-y-8"
    role="form"
    :aria-label="t('settings.analytics.formLabel')"
  >
    <section class="space-y-4" aria-labelledby="visitor-analytics-heading">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3
            id="visitor-analytics-heading"
            class="m-0 text-base font-medium text-foreground"
          >
            {{ t("settings.analytics.visitor.title") }}
          </h3>
          <p class="text-xs text-muted-foreground mt-1">
            {{ t("settings.analytics.visitor.description") }}
          </p>
        </div>
      </div>

      <div
        v-if="!hasListedProviders"
        class="rounded-md border border-dashed p-4 text-sm font-medium text-center w-1/2 mx-auto"
        :style="{
          borderColor: 'var(--border)',
          color: 'var(--muted-foreground)',
          backgroundColor: 'var(--input)',
        }"
      >
        {{ t("settings.analytics.empty") }}
      </div>

      <div
        v-for="provider in listedProviders"
        :key="provider.id"
        class="rounded-sm border border-border border-solid px-5 py-2 space-y-3 bg-input/50"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-3">
              <span
                class="inline-block w-1.5 h-4 rounded-[1px]"
                :style="{
                  backgroundColor: isAnalyticsProviderActive(provider.id)
                    ? 'var(--primary)'
                    : 'var(--muted-foreground)',
                }"
              />

              <h4
                class="text-lg font-serif font-medium leading-0"
                :style="{ color: 'var(--foreground)' }"
              >
                {{ provider.label }}
              </h4>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0 mt-2">
            <Button
              v-if="isAnalyticsProviderActive(provider.id)"
              variant="outline"
              size="sm"
              class="h-9.5!"
              :disabled="isSaving"
              :aria-label="
                t('settings.analytics.deactivateAria', {
                  provider: provider.label,
                })
              "
              @click="onDeactivateProvider(provider.id)"
            >
              {{ t("settings.analytics.deactivate") }}
            </Button>
            <Button
              v-else
              variant="outline"
              size="sm"
              class="h-9.5!"
              :disabled="isSaving"
              :aria-label="
                t('settings.analytics.activateAria', {
                  provider: provider.label,
                })
              "
              @click="onActivateProvider(provider.id)"
            >
              {{ t("settings.analytics.activate") }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              class="h-9.5!"
              :disabled="isSaving"
              :aria-label="
                t('settings.analytics.removeAria', { provider: provider.label })
              "
              @click="onRemoveProvider(provider.id)"
            >
              {{ t("settings.analytics.remove") }}
            </Button>
          </div>
        </div>

        <div v-if="fieldDrafts[provider.id]" class="space-y-7">
          <div
            v-for="field in provider.fields"
            :key="field.key"
            class="space-y-3"
          >
            <label class="text-sm font-medium text-foreground">
              {{ providerFieldLabel(provider.id, field) }}
            </label>
            <Input
              v-model="fieldDrafts[provider.id][field.key]"
              :type="field.type === 'url' ? 'url' : 'text'"
              :placeholder="field.placeholder"
              class="font-mono text-sm h-9.5! hover:bg-background! bg-input! border-border/50"
              :disabled="isSaving || !isAnalyticsProviderActive(provider.id)"
              @blur="onFieldBlur(provider.id, field)"
            />
            <p
              v-if="
                !validateField(field, fieldDrafts[provider.id][field.key] || '')
              "
              class="text-xs text-destructive"
            >
              {{
                t("settings.analytics.invalidField", {
                  field: providerFieldLabel(provider.id, field),
                })
              }}
            </p>
          </div>
        </div>

        <div v-if="provider.docsUrl" class="pt-4 pb-2 text-right">
          <a
            :href="provider.docsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-xs hover:underline text-muted-foreground group"
          >
            <span
              :class="[
                studioIcons.info,
                'size-3.5 text-muted-foreground/70 group-hover:text-primary',
              ]"
            />
            <span>{{ t("settings.analytics.providerDocs") }}</span>
          </a>
        </div>
      </div>
    </section>

    <section
      v-if="canCheckStudioMetrics && isCloudflarePlatform"
      class="space-y-3"
      :aria-label="t('settings.analytics.studioTraffic.title')"
    >
      <SettingsRow
        :label="t('settings.analytics.studioTraffic.title')"
        :description="t('settings.analytics.studioTraffic.description')"
        input-id="studio-traffic-toggle"
      >
        <Switch
          id="studio-traffic-toggle"
          :model-value="studioTrafficToggleChecked"
          :disabled="studioTrafficSwitchDisabled"
          class="data-[state=unchecked]:bg-input"
          @update:model-value="onStudioTrafficToggle"
        />
      </SettingsRow>

      <p
        v-if="canEditAnalytics"
        class="text-xs leading-relaxed text-muted-foreground"
      >
        <span class="font-medium">{{
          t("settings.analytics.studioTraffic.requires")
        }}</span>
        {{ t("settings.analytics.studioTraffic.requirements") }}
        <a
          href="https://ariabuilder.io"
          target="_blank"
          rel="noopener noreferrer"
          class="underline underline-offset-2 hover:opacity-80"
          >{{ t("settings.analytics.docs") }}</a
        >
        {{ t("settings.analytics.studioTraffic.moreInfo") }}
      </p>

      <p
        v-if="!canEditAnalytics && availability?.cloudflareTrafficEnabled"
        class="text-xs text-muted-foreground"
      >
        {{ t("settings.analytics.studioTraffic.enabledReadOnly") }}
      </p>

      <div
        v-if="showStudioTrafficWarnings"
        class="rounded-md border border-border bg-sidebar px-4 py-3 space-y-3 text-sm"
      >
        <div
          v-if="availability?.hostMismatch"
          class="text-xs text-amber-600 dark:text-amber-500"
        >
          {{ t("settings.analytics.warning.zoneMismatch") }}
          <code class="text-xs">siteUrl</code>
          <template v-if="availability.siteHost">
            ({{ availability.siteHost }}
            <template v-if="availability.zoneName">
              {{
                t("settings.analytics.warning.vsZone", {
                  zone: availability.zoneName,
                })
              }}</template
            >).
          </template>
          {{ t("settings.analytics.warning.zoneMismatchSuffix") }}
        </div>
        <div
          v-else-if="availability?.analyticsReadGranted === false"
          class="text-xs text-amber-600 dark:text-amber-500"
        >
          {{ t("settings.analytics.warning.missingPermissionBefore") }}
          <strong class="font-medium">Zone → Analytics → Read</strong>
          {{ t("settings.analytics.warning.missingPermissionAfter") }}
        </div>
        <div
          v-else-if="availability?.siteUrlMismatch"
          class="text-xs text-amber-600 dark:text-amber-500"
        >
          {{ t("settings.analytics.warning.siteUrlBefore") }}
          <code class="text-xs">Site URL</code>
          {{ t("settings.analytics.warning.siteUrlSetTo") }}
          <strong>{{ availability.siteHost }}</strong
          >{{ t("settings.analytics.warning.siteUrlAccessingFrom") }}
          <strong>{{ availability.requestHost }}</strong
          >{{ t("settings.analytics.warning.siteUrlData") }}
          <a
            href="/admin/dashboard?settings=general"
            target="_self"
            class="underline underline-offset-2 hover:opacity-80"
            >{{ t("settings.analytics.warning.updateSiteUrl") }}</a
          >
          {{ t("settings.analytics.warning.to") }}
          <code class="text-xs">{{ availability.suggestedSiteUrl }}</code
          >.
        </div>
        <div
          v-else-if="
            availability?.platform === 'cloudflare' &&
            !availability?.credentialsReady
          "
          class="space-y-3 text-xs text-muted-foreground"
        >
          <p class="font-medium text-foreground">
            {{ t("settings.analytics.warning.credentialsOptional") }}
          </p>
          <p>
            {{ t("settings.analytics.warning.credentialsOneClickComplete") }}
          </p>
          <ol class="list-decimal space-y-2 pl-5">
            <li>
              <a
                :href="CLOUDFLARE_ZONE_ANALYTICS_TOKEN_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="underline underline-offset-2 hover:text-foreground"
              >
                {{ t("settings.analytics.warning.createToken") }}
              </a>
              {{ t("settings.analytics.warning.scopeToken") }}
              <strong class="font-medium text-foreground"
                >Zone → Analytics → Read</strong
              >.
            </li>
            <li>
              {{ t("settings.analytics.warning.copyZoneIdBefore") }}
              <a
                :href="CLOUDFLARE_ZONE_ID_DOCS_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="underline underline-offset-2 hover:text-foreground"
              >
                {{ t("settings.analytics.warning.zoneId") }}
              </a>
              {{ t("settings.analytics.warning.copyZoneIdAfter") }}
            </li>
            <li>
              {{ t("settings.analytics.warning.addWorkerValuesBefore") }}
              <code class="text-xs">ARIA_CLOUDFLARE_ANALYTICS_TOKEN</code>
              {{ t("settings.analytics.warning.asSecret") }}
              <code class="text-xs">ARIA_CLOUDFLARE_ZONE_ID</code>
              {{ t("settings.analytics.warning.asVariable") }}
            </li>
          </ol>
          <p>
            {{ t("settings.analytics.warning.zoneReadOptional") }}
          </p>
          <p>
            {{ t("settings.analytics.warning.workersDev") }}
          </p>
          <a
            :href="ARIA_CLOUDFLARE_ANALYTICS_DOCS_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex text-xs underline underline-offset-2 hover:text-foreground"
            >{{ t("settings.analytics.warning.openSetupGuide") }}</a
          >
        </div>
      </div>
    </section>
  </div>
</template>
