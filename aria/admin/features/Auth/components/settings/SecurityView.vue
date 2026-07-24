<script setup lang="ts">
import { ref, onMounted } from "vue";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import SettingsRow from "@/features/Studio/settings/components/SettingsRow.vue";
import { useStudioI18n } from "@/i18n";
import type { CaptchaProvider } from "@/lib/auth/types";
import {
  unwrapAuthMethodsConfigMutationResult,
  unwrapAuthMethodsConfigResult,
  unwrapAuthCaptchaConfigResult,
  unwrapAuthCreateTurnstileWidgetResult,
  unwrapAuthSuccessResult,
  unwrapAuthTwoFactorPolicyResult,
} from "../../composables/authSettingsActionResults";
const { t } = useStudioI18n();

// Hugeicons icon classes (UnoCSS)
const icons = {
  shield: "i-hugeicons:shield-01",
  check: "i-hugeicons:checkmark-circle-02",
  loader: "i-hugeicons:refresh",
  alertCircle: "i-hugeicons:alert-circle",
  alertTriangle: "i-hugeicons:alert-01",
  eye: "i-hugeicons:eye",
  eyeOff: "i-hugeicons:view-off",
} as const;

// 2FA Enforcement Policy
const enforceTwoFactor = ref(false);
const enforceTwoFactorLoading = ref(false);
const enforceTwoFactorSaving = ref(false);

const passkeyEnabled = ref(true);
const passkeyRpName = ref("Aria");
const passkeyAllowedOrigins = ref("");
const passkeyCurrentRpId = ref("Current host");
const passkeyLoading = ref(false);
const passkeySaving = ref(false);
const passkeyError = ref<string | null>(null);
const passkeySuccess = ref(false);

const captchaProvider = ref<CaptchaProvider>("none");
const captchaSiteKey = ref("");
const captchaAllowedHostnames = ref("");
const captchaSecretConfigured = ref(false);
const captchaManagedByAria = ref(false);
const captchaManagedProvisioningConfigured = ref(false);
const captchaManagedApiTokenConfigured = ref(false);
const captchaManagedEncryptionConfigured = ref(false);
const captchaLoading = ref(false);
const captchaSaving = ref(false);
const captchaProvisioning = ref(false);
const captchaError = ref<string | null>(null);
const captchaSuccess = ref(false);

const captchaProviderOptions: {
  value: CaptchaProvider;
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: t("security.disabled"),
    description: t("security.captcha.none"),
  },
  {
    value: "turnstile",
    label: "Cloudflare Turnstile",
    description: t("security.captcha.turnstile"),
  },
];

function parseOrigins(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function loadAuthMethodsConfig() {
  passkeyLoading.value = true;
  passkeyError.value = null;
  try {
    const { data, error } = await actions.auth.getAuthMethodsConfigAction();
    const result = unwrapAuthMethodsConfigResult(
      { data, error },
      { source: "SecurityView.loadAuthMethodsConfig" },
    );
    if (!result.success) {
      passkeyError.value = result.error;
      return;
    }

    passkeyEnabled.value = result.data.config.passkey.enabled;
    passkeyRpName.value = result.data.config.passkey.rpName;
    passkeyAllowedOrigins.value =
      result.data.config.passkey.allowedOrigins.join("\n");
  } catch {
    passkeyError.value = t("security.passkeys.loadFailed");
  } finally {
    passkeyLoading.value = false;
  }
}

async function saveAuthMethodsConfig() {
  passkeySaving.value = true;
  passkeyError.value = null;
  try {
    const { data, error } = await actions.auth.updateAuthMethodsConfig({
      passkey: {
        enabled: passkeyEnabled.value,
        rpName: passkeyRpName.value,
        allowedOrigins: parseOrigins(passkeyAllowedOrigins.value),
      },
    });
    const result = unwrapAuthMethodsConfigMutationResult(
      { data, error },
      { source: "SecurityView.saveAuthMethodsConfig" },
    );
    if (!result.success) {
      passkeyError.value = result.error;
      return;
    }

    passkeyEnabled.value = result.data.config.passkey.enabled;
    passkeyRpName.value = result.data.config.passkey.rpName;
    passkeyAllowedOrigins.value =
      result.data.config.passkey.allowedOrigins.join("\n");
    passkeySuccess.value = true;
    setTimeout(() => {
      passkeySuccess.value = false;
    }, 2000);
  } catch {
    passkeyError.value = t("security.passkeys.saveFailed");
  } finally {
    passkeySaving.value = false;
  }
}

async function loadTwoFactorPolicy() {
  enforceTwoFactorLoading.value = true;
  try {
    const { data, error } = await actions.auth.getTwoFactorPolicy();
    const result = unwrapAuthTwoFactorPolicyResult(
      { data, error },
      { source: "SecurityView.loadTwoFactorPolicy" },
    );
    if (!result.success) return;

    enforceTwoFactor.value = result.data.enforce;
  } catch (e) {
    // Policy not configured, use default (false)
  } finally {
    enforceTwoFactorLoading.value = false;
  }
}

async function saveTwoFactorPolicy() {
  enforceTwoFactorSaving.value = true;
  try {
    const { data, error } = await actions.auth.updateTwoFactorPolicy({
      enforce: enforceTwoFactor.value,
    });
    const result = unwrapAuthSuccessResult(
      { data, error },
      "Failed to save 2FA enforcement policy",
      "[AuthSettings] Invalid updateTwoFactorPolicy response",
      { source: "SecurityView.saveTwoFactorPolicy" },
    );
    if (!result.success) return;
  } catch (e) {
  } finally {
    enforceTwoFactorSaving.value = false;
  }
}

async function loadCaptchaConfig() {
  captchaLoading.value = true;
  try {
    const { data, error } = await actions.auth.getCaptchaConfig();
    const result = unwrapAuthCaptchaConfigResult(
      { data, error },
      { source: "SecurityView.loadCaptchaConfig" },
    );
    if (!result.success) return;

    captchaProvider.value = result.data.provider;
    captchaSiteKey.value = result.data.siteKey ?? "";
    captchaAllowedHostnames.value = result.data.allowedHostnames.join("\n");
    captchaSecretConfigured.value = result.data.secretConfigured;
    captchaManagedByAria.value = result.data.managedByAria;
    captchaManagedProvisioningConfigured.value =
      result.data.managedProvisioningConfigured;
    captchaManagedApiTokenConfigured.value =
      result.data.managedApiTokenConfigured;
    captchaManagedEncryptionConfigured.value =
      result.data.managedEncryptionConfigured;
  } catch (e) {
    // Config not found, use defaults
  } finally {
    captchaLoading.value = false;
  }
}

async function createTurnstileWidget() {
  captchaProvisioning.value = true;
  captchaError.value = null;
  try {
    const allowedHostnames = captchaAllowedHostnames.value
      .split(/\r?\n/)
      .map((hostname) => hostname.trim())
      .filter(Boolean);
    const { data, error } = await actions.auth.createTurnstileWidget({
      allowedHostnames,
      name: "Aria password login",
    });
    const result = unwrapAuthCreateTurnstileWidgetResult(
      { data, error },
      { source: "SecurityView.createTurnstileWidget" },
    );
    if (!result.success) {
      captchaError.value = result.error;
      return;
    }
    captchaProvider.value = "turnstile";
    captchaSiteKey.value = result.data.siteKey;
    captchaAllowedHostnames.value = result.data.allowedHostnames.join("\n");
    captchaManagedByAria.value = true;
    captchaSecretConfigured.value = true;
    captchaSuccess.value = true;
    setTimeout(() => {
      captchaSuccess.value = false;
    }, 2000);
  } catch {
    captchaError.value = t("security.captcha.provisionFailed");
  } finally {
    captchaProvisioning.value = false;
  }
}

async function saveCaptchaConfig() {
  captchaSaving.value = true;
  captchaError.value = null;
  try {
    const { data, error } = await actions.auth.updateCaptchaConfig({
      provider: captchaProvider.value,
      siteKey: captchaSiteKey.value || undefined,
      allowedHostnames: captchaAllowedHostnames.value
        .split(/\r?\n/)
        .map((hostname) => hostname.trim())
        .filter(Boolean),
    });
    const result = unwrapAuthSuccessResult(
      { data, error },
      "Failed to save CAPTCHA settings",
      "[AuthSettings] Invalid updateCaptchaConfig response",
      { source: "SecurityView.saveCaptchaConfig" },
    );
    if (!result.success) {
      captchaError.value = result.error;
      return;
    }

    captchaSuccess.value = true;
    setTimeout(() => {
      captchaSuccess.value = false;
    }, 2000);
  } catch (e) {
    captchaError.value = t("security.captcha.saveFailed");
  } finally {
    captchaSaving.value = false;
  }
}

onMounted(() => {
  passkeyCurrentRpId.value = window.location.hostname;
  if (!captchaAllowedHostnames.value) {
    captchaAllowedHostnames.value = window.location.hostname;
  }
  loadAuthMethodsConfig();
  loadTwoFactorPolicy();
  loadCaptchaConfig();
});
</script>

<template>
  <div class="space-y-10" role="form" :aria-label="t('security.settings')">
    <SettingsRow :label="t('security.passkeys.title')" full-width>
      <template #description>
        <span class="block">
          {{ t("security.passkeys.description") }}
        </span>
        <span class="block">
          {{ t("security.passkeys.warning") }}
        </span>
      </template>

      <div
        class="rounded-md border border-border border-solid bg-input px-6 py-4 hover:border-dashed hover:border-border"
      >
        <div class="flex items-center justify-between gap-4 pb-5">
          <div class="min-w-0 space-y-1">
            <template v-if="passkeyLoading">
              <div
                class="h-4 w-32 animate-pulse rounded-sm bg-muted-foreground/15"
              />
              <div
                class="h-3 w-56 animate-pulse rounded-sm bg-muted-foreground/10"
              />
            </template>
            <template v-else>
              <p class="text-sm font-medium text-foreground leading-4">
                {{ t("security.passkeys.signIn") }}
              </p>
              <p class="text-xs text-muted-foreground leading-0">
                {{
                  passkeyEnabled
                    ? t("security.passkeys.enabled")
                    : t("security.passkeys.disabled")
                }}
              </p>
            </template>
          </div>

          <Switch
            :model-value="passkeyEnabled"
            :disabled="passkeyLoading || passkeySaving"
            @update:model-value="(value) => (passkeyEnabled = value)"
          />
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-1.5">
            <Label
              for="passkey-rp-name"
              class="text-2xs! uppercase tracking-wider text-muted-foreground/50"
            >
              {{ t("security.passkeys.workspaceName") }}
            </Label>
            <Input
              id="passkey-rp-name"
              v-model="passkeyRpName"
              class="h-9.5! text-sm bg-background/60! border-border"
              :disabled="passkeyLoading || passkeySaving"
            />
          </div>

          <div class="space-y-1.5">
            <Label
              for="passkey-rp-id"
              class="text-2xs! uppercase tracking-wider text-muted-foreground/50"
            >
              {{ t("security.passkeys.currentRpId") }}
            </Label>
            <Input
              id="passkey-rp-id"
              :model-value="passkeyCurrentRpId"
              class="h-9.5! text-sm bg-background/60! border-border font-mono"
              disabled
            />
          </div>

          <div class="space-y-1.5 md:col-span-2">
            <Label
              for="passkey-origins"
              class="text-2xs! uppercase tracking-wider text-muted-foreground/50"
            >
              {{ t("security.passkeys.allowedOrigins") }}
            </Label>
            <textarea
              id="passkey-origins"
              v-model="passkeyAllowedOrigins"
              class="min-h-20 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="passkeyLoading || passkeySaving"
              placeholder="https://admin.example.com"
            />
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3">
          <p v-if="passkeyError" class="text-xs text-destructive">
            {{ passkeyError }}
          </p>
          <p v-else-if="passkeySuccess" class="text-xs text-success">
            {{ t("security.passkeys.saved") }}
          </p>
          <span v-else />

          <Button
            type="button"
            size="sm"
            :disabled="passkeyLoading || passkeySaving || !passkeyRpName"
            @click="saveAuthMethodsConfig"
          >
            <span
              v-if="passkeySaving"
              :class="[icons.loader, 'size-3.5 mr-1.5 animate-spin']"
            />
            {{ t("common.save") }}
          </Button>
        </div>
      </div>
    </SettingsRow>

    <SettingsRow :label="t('security.twoFactor.title')" full-width>
      <template #description>
        <span class="block">
          {{ t("security.twoFactor.description") }}
        </span>
        <span class="block">
          {{ t("security.twoFactor.help") }}
        </span>
      </template>
      <div
        class="rounded-md border border-border border-solid bg-input px-6 py-4 hover:border-dashed hover:border-border"
      >
        <div class="flex items-center justify-between gap-0">
          <div class="min-w-0 flex-1 space-y-1 pb-4">
            <template v-if="enforceTwoFactorLoading">
              <div
                class="h-4 w-36 animate-pulse rounded-sm bg-muted-foreground/15"
              />
              <div
                class="h-3 w-52 animate-pulse rounded-sm bg-muted-foreground/10"
              />
            </template>
            <template v-else>
              <p class="text-sm font-medium text-foreground leading-4">
                {{ t("security.twoFactor.enforce") }}
              </p>
              <p class="text-xs text-muted-foreground leading-0">
                {{
                  enforceTwoFactor
                    ? t("security.twoFactor.required")
                    : t("security.twoFactor.optional")
                }}
              </p>
            </template>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <span
              class="inline-flex w-16 items-center justify-end gap-1.5 text-2xs text-muted-foreground transition-opacity duration-150"
              :class="
                enforceTwoFactorSaving && !enforceTwoFactorLoading
                  ? 'opacity-100'
                  : 'opacity-0'
              "
              aria-live="polite"
              :aria-hidden="!enforceTwoFactorSaving"
            >
              <span :class="[icons.loader, 'size-3 animate-spin']" />
              {{ t("common.saving") }}
            </span>

            <div
              v-if="enforceTwoFactorLoading"
              :class="[
                icons.loader,
                'size-5 animate-spin text-muted-foreground',
              ]"
            />
            <Switch
              v-else
              :model-value="enforceTwoFactor"
              :disabled="enforceTwoFactorSaving"
              @update:model-value="
                (val) => {
                  enforceTwoFactor = val;
                  saveTwoFactorPolicy();
                }
              "
            />
          </div>
        </div>
      </div>
    </SettingsRow>

    <SettingsRow
      :label="t('security.captcha.title')"
      :description="t('security.captcha.description')"
      full-width
    >
      <div
        class="rounded-md border border-border border-solid bg-input px-6 py-4 space-y-6 hover:border-dashed hover:border-border"
      >
        <div
          v-if="captchaLoading"
          class="flex items-center justify-center py-8"
        >
          <div
            :class="[icons.loader, 'size-6 animate-spin text-muted-foreground']"
          />
        </div>

        <template v-else>
          <div class="space-y-4">
            <div class="space-y-4">
              <Label>{{ t("security.captcha.provider") }}</Label>
              <Select v-model="captchaProvider">
                <SelectTrigger class="w-full">
                  <SelectValue
                    :placeholder="t('security.captcha.selectProvider')"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in captchaProviderOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    <div class="flex flex-col gap-1">
                      <span>{{ option.label }}</span>
                      <span class="text-xs text-muted-foreground">{{
                        option.description
                      }}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <template v-if="captchaProvider !== 'none'">
              <div class="rounded-md border border-border bg-background/50 px-3 py-3 text-sm">
                <p class="font-medium">{{ t("security.captcha.managedSetup") }}</p>
                <p class="mt-1 text-muted-foreground">
                  {{ t("security.captcha.managedSetupHelp") }}
                </p>
                <Button
                  type="button"
                  size="sm"
                  class="mt-3"
                  :disabled="captchaProvisioning || !captchaManagedProvisioningConfigured || !captchaAllowedHostnames.trim()"
                  @click="createTurnstileWidget"
                >
                  <span
                    v-if="captchaProvisioning"
                    :class="[icons.loader, 'mr-1.5 size-3.5 animate-spin']"
                  />
                  {{ captchaManagedByAria ? t("security.captcha.replaceManaged") : t("security.captcha.createManaged") }}
                </Button>
                <p
                  v-if="!captchaManagedProvisioningConfigured"
                  class="mt-2 text-xs text-muted-foreground"
                >
                  {{
                    captchaManagedApiTokenConfigured && !captchaManagedEncryptionConfigured
                      ? t("security.captcha.managedEncryptionMissing")
                      : t("security.captcha.managedUnavailable")
                  }}
                </p>
              </div>

              <div class="space-y-2">
                <Label
                  class="text-xs font-medium text-foreground leading-4"
                  for="captcha-site-key"
                  >{{ t("security.captcha.siteKey") }}</Label
                >
                <Input
                  id="captcha-site-key"
                  v-model="captchaSiteKey"
                  :placeholder="t('security.captcha.siteKeyPlaceholder')"
                  :disabled="captchaManagedByAria"
                />
              </div>

              <div class="space-y-2">
                <Label
                  class="text-xs font-medium text-foreground leading-4"
                  for="captcha-allowed-hostnames"
                  >{{ t("security.captcha.allowedHostnames") }}</Label
                >
                <textarea
                  id="captcha-allowed-hostnames"
                  v-model="captchaAllowedHostnames"
                  rows="3"
                  :placeholder="t('security.captcha.allowedHostnamesPlaceholder')"
                  class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p class="text-xs text-muted-foreground">
                  {{ t("security.captcha.allowedHostnamesHelp") }}
                </p>
              </div>

              <div class="rounded-md border border-border bg-background/50 px-3 py-2 text-sm">
                <p class="font-medium">
                  {{ t("security.captcha.secretStatus") }}
                </p>
                <p class="mt-1 text-muted-foreground">
                  {{ captchaSecretConfigured ? (captchaManagedByAria ? t("security.captcha.managedSecretConfigured") : t("security.captcha.secretConfigured")) : t("security.captcha.secretMissing") }}
                </p>
              </div>
            </template>
          </div>

          <div
            v-if="captchaError"
            class="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md"
          >
            <div :class="[icons.alertCircle, 'size-3.5']" />
            {{ captchaError }}
          </div>

          <div class="flex items-center justify-between">
            <div
              v-if="captchaSuccess"
              class="flex items-center gap-2 text-sm text-success"
            >
              <div :class="[icons.check, 'size-3.5']" />
              {{ t("security.captcha.saved") }}
            </div>
            <div v-else />

            <Button
              @click="saveCaptchaConfig"
              :disabled="captchaSaving"
              class="gap-2"
            >
              <div
                v-if="captchaSaving"
                :class="[icons.loader, 'size-3.5 animate-spin']"
              />
              {{ t("security.captcha.save") }}
            </Button>
          </div>
        </template>
      </div>
    </SettingsRow>
  </div>
</template>

<style scoped></style>
