<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Checkbox } from "@/components/ui/checkbox";
import {
  formatCapabilityLabel,
  resolveEffectiveCapabilities,
  ROLE_DEFAULT_CAPABILITIES,
} from "@/lib/auth/types";
import type {
  AdminDisableTotpInput,
  AdminEnableTotpInput,
  AdminInitTotpInput,
  Capability,
  ChangePasswordInput,
  UserPermissionProfile,
  TotpSetupResponse,
  UpdateUserInput,
} from "@/lib/auth/types";
import { TotpSetupResponseSchema } from "@/lib/auth/types";

import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { studioIcons } from "@/lib/icons";
import type { BootstrapUserId, User } from "@/lib/auth/types";
import PasskeysPanel from "./PasskeysPanel.vue";
import {
  syncSessionUserIfSelf,
  isSessionUserId,
} from "../../composables/useUser";
import { useSettingsDialog } from "@/features/Studio/settings/composables/useSettingsDialog";
import { useStudioI18n } from "@/i18n";

const settingsDialog = useSettingsDialog();
const { t, locale } = useStudioI18n();

const props = defineProps<{
  user: User;
  bootstrapUserId: BootstrapUserId | null;
  canDelete: boolean;
}>();

const isBootstrapAdmin = computed(
  () =>
    props.bootstrapUserId !== null && props.user.id === props.bootstrapUserId,
);
const emit = defineEmits<{
  back: [];
  delete: [user: User];
  "update:user": [user: User];
}>();

const isMediaPickerOpen = ref(false);
const avatarLoading = ref(false);
const infoSaving = ref(false);
const name = ref(props.user.name ?? "");
const email = ref(props.user.email ?? "");
const activeTab = ref<"general" | "security" | "permissions" | "activity">(
  "general",
);

watch(
  () => props.user.id,
  () => {
    activeTab.value = "general";
    name.value = props.user.name ?? "";
    email.value = props.user.email ?? "";
  },
);

const showPermissions = ref(false);
const permissionSaving = ref(false);
const editProfile = ref<UserPermissionProfile>({
  rolePreset: props.user.permissionProfile?.rolePreset ?? props.user.role,
  capabilityOverrides: props.user.permissionProfile?.capabilityOverrides ?? {
    allow: [],
    deny: [],
  },
});

const showPasswordChange = ref(false);
const passwordLoading = ref(false);
const passwordForm = ref({ current: "", new_: "", confirm: "" });
const passwordError = ref("");
const passwordSuccess = ref(false);

const passwordsMatch = computed(
  () => passwordForm.value.new_ === passwordForm.value.confirm,
);
const canChangePassword = computed(
  () =>
    passwordForm.value.current &&
    passwordForm.value.new_.length >= 7 &&
    passwordsMatch.value,
);

const totpLoading = ref(false);
const totpError = ref("");
const totpSuccess = ref(false);
const totpSetupData = ref<TotpSetupResponse | null>(null);
const totpVerifyCode = ref("");
const showTotpSetup = ref(false);
const showTotpDisable = ref(false);
const totpDisablePassword = ref("");

function fmtError(raw: string): string {
  if (raw.startsWith("Failed to validate:")) {
    try {
      const json = raw.slice("Failed to validate:".length).trim();
      const issues = JSON.parse(json) as Array<{ message: string } | undefined>;
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      /* ok */
    }
  }
  return raw;
}

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return fmtError(error.message);
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return fmtError(message);
    }
  }

  return fallback;
}

function throwIfActionError(error: unknown, fallback: string): void {
  if (error) {
    throw new Error(getActionErrorMessage(error, fallback));
  }
}

function syncSelfProfile(updated: User): void {
  if (!isSessionUserId(updated.id)) {
    return;
  }

  syncSessionUserIfSelf({
    id: updated.id,
    avatarUrl: updated.avatarUrl ?? null,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    totpEnabled: updated.totpEnabled,
    permissionProfile: updated.permissionProfile,
  });
  settingsDialog.markSessionProfileDirty();
}

async function handleAvatarSelect(asset: MediaAsset) {
  avatarLoading.value = true;
  try {
    const avatarUrl = asset.deliveryUrl || asset.url;
    const input: UpdateUserInput = {
      id: props.user.id,
      avatarUrl,
    };
    const { error } = await actions.auth.updateUser(input);
    throwIfActionError(error, t("users.detail.avatarUpdateFailed"));
    const nextUser = { ...props.user, avatarUrl };
    emit("update:user", nextUser);
    syncSelfProfile(nextUser);
    toast.success(t("users.detail.avatarUpdated"));
  } catch (err: unknown) {
    toast.error(
      getActionErrorMessage(err, t("users.detail.avatarUpdateFailed")),
    );
  } finally {
    avatarLoading.value = false;
    isMediaPickerOpen.value = false;
  }
}

async function handleAvatarRemove() {
  avatarLoading.value = true;
  try {
    const input: UpdateUserInput = {
      id: props.user.id,
      avatarUrl: null,
    };
    const { error } = await actions.auth.updateUser(input);
    throwIfActionError(error, t("users.detail.avatarRemoveFailed"));
    const nextUser = { ...props.user, avatarUrl: null };
    emit("update:user", nextUser);
    syncSelfProfile(nextUser);
    toast.success(t("users.detail.avatarRemoved"));
  } catch (err: unknown) {
    toast.error(
      getActionErrorMessage(err, t("users.detail.avatarRemoveFailed")),
    );
  } finally {
    avatarLoading.value = false;
  }
}

async function saveInfo() {
  infoSaving.value = true;
  try {
    const nextName = name.value.trim();
    const input: UpdateUserInput = {
      id: props.user.id,
      name: nextName,
      email: email.value,
    };
    const { error } = await actions.auth.updateUser(input);
    throwIfActionError(error, t("users.detail.updateFailed"));
    emit("update:user", {
      ...props.user,
      name: nextName,
      email: email.value,
    });
    toast.success(t("users.detail.updated"));
  } catch (err: unknown) {
    toast.error(getActionErrorMessage(err, t("users.detail.updateFailed")));
  } finally {
    infoSaving.value = false;
  }
}

function onTotpToggle(enabled: boolean) {
  if (enabled && !props.user.totpEnabled) {
    void startTotpSetup();
    return;
  }
  if (!enabled && props.user.totpEnabled) {
    showTotpDisable.value = true;
  }
}

async function startTotpSetup() {
  totpLoading.value = true;
  totpError.value = "";
  try {
    const input: AdminInitTotpInput = {
      userId: props.user.id,
    };
    const { data, error } = await actions.auth.adminInitTotp(input);
    throwIfActionError(error, "Failed to start 2FA setup");
    totpSetupData.value = TotpSetupResponseSchema.parse(data);
    showTotpSetup.value = true;
  } catch (err: unknown) {
    totpError.value = getActionErrorMessage(err, "Failed to start 2FA setup");
  } finally {
    totpLoading.value = false;
  }
}

async function verifyTotpSetup() {
  if (totpVerifyCode.value.length !== 6) return;
  totpLoading.value = true;
  totpError.value = "";
  try {
    const input: AdminEnableTotpInput = {
      userId: props.user.id,
      code: totpVerifyCode.value,
    };
    const { error } = await actions.auth.adminEnableTotp(input);
    throwIfActionError(error, "Failed to verify code");
    totpSuccess.value = true;
    emit("update:user", { ...props.user, totpEnabled: true });
    setTimeout(() => {
      showTotpSetup.value = false;
      totpSuccess.value = false;
      totpVerifyCode.value = "";
    }, 1500);
  } catch (err: unknown) {
    totpError.value = getActionErrorMessage(err, "Failed to verify code");
  } finally {
    totpLoading.value = false;
  }
}

async function disableTotp() {
  totpLoading.value = true;
  totpError.value = "";
  try {
    const input: AdminDisableTotpInput = {
      userId: props.user.id,
      password: totpDisablePassword.value,
    };
    const { error } = await actions.auth.adminDisableTotp(input);
    throwIfActionError(error, "Failed to disable 2FA");
    emit("update:user", { ...props.user, totpEnabled: false });
    showTotpDisable.value = false;
    totpDisablePassword.value = "";
    toast.success("2FA disabled");
  } catch (err: unknown) {
    totpError.value = getActionErrorMessage(err, "Failed to disable 2FA");
  } finally {
    totpLoading.value = false;
  }
}

async function changePassword() {
  passwordLoading.value = true;
  passwordError.value = "";
  try {
    const input: ChangePasswordInput = {
      currentPassword: passwordForm.value.current,
      newPassword: passwordForm.value.new_,
    };
    const { error } = await actions.auth.changePassword(input);
    throwIfActionError(error, "Failed to change password");
    passwordSuccess.value = true;
    setTimeout(() => {
      showPasswordChange.value = false;
      passwordSuccess.value = false;
      passwordForm.value = { current: "", new_: "", confirm: "" };
    }, 1500);
  } catch (err: unknown) {
    passwordError.value = getActionErrorMessage(
      err,
      "Failed to change password",
    );
  } finally {
    passwordLoading.value = false;
  }
}

const capabilityGroups: { label: string; caps: Capability[] }[] = [
  {
    label: t("users.detail.group.pages"),
    caps: [
      "editPages",
      "createPages",
      "deletePages",
      "editPageStructure",
      "editPageContent",
      "editPageSeo",
    ],
  },
  {
    label: t("users.detail.group.publishing"),
    caps: ["publishContent", "unpublishContent", "reviewContent"],
  },
  { label: "CMS", caps: ["editCms"] },
  {
    label: t("users.detail.group.media"),
    caps: ["uploadMedia", "useMediaLibrary", "syncMedia"],
  },
  {
    label: t("users.detail.group.usersRoles"),
    caps: ["manageUsers", "manageRoles"],
  },
  { label: t("users.detail.group.security"), caps: ["manageSecurity"] },
  {
    label: t("users.detail.group.design"),
    caps: ["editSiteSettings"],
  },
  {
    label: t("sidebar.settings"),
    caps: [
      "editDiscoverySettings",
      "viewDiscoverySettings",
      "manageRedirects",
      "viewRedirects",
      "editAnalytics",
      "viewStudioMetrics",
      "editDomains",
      "editCustomCode",
      "editStudioPreferences",
    ],
  },
  {
    label: t("users.detail.group.system"),
    caps: [
      "manageBilling",
      "manageExports",
      "manageBackups",
      "manageIntegrations",
      "manageApiTokens",
    ],
  },
];

async function savePermissions() {
  permissionSaving.value = true;
  try {
    const { error } = await actions.auth.updateUser({
      id: props.user.id,
      role: editProfile.value.rolePreset,
      permissionProfile: {
        rolePreset: editProfile.value.rolePreset,
        capabilityOverrides: editProfile.value.capabilityOverrides,
      },
    });
    if (error) {
      throw new Error(fmtError(error.message ?? "Failed to save permissions"));
    }
    emit("update:user", {
      ...props.user,
      role: editProfile.value.rolePreset,
      permissionProfile: editProfile.value,
    });
    toast.success("Permissions updated");
    showPermissions.value = false;
  } catch (err: unknown) {
    toast.error(
      fmtError(
        err instanceof Error ? err.message : "Failed to save permissions",
      ),
    );
  } finally {
    permissionSaving.value = false;
  }
}

function applyCapabilityOverrides(
  overrides: NonNullable<UserPermissionProfile["capabilityOverrides"]>,
) {
  editProfile.value = { ...editProfile.value, capabilityOverrides: overrides };
}

function setCapabilityEnabled(cap: Capability, enabled: boolean) {
  if (enabled === isCapabilityEnabled(cap)) return;

  const overrides = {
    allow: [...(editProfile.value.capabilityOverrides?.allow ?? [])],
    deny: [...(editProfile.value.capabilityOverrides?.deny ?? [])],
  };
  const defaults = ROLE_DEFAULT_CAPABILITIES[editProfile.value.rolePreset];

  if (defaults.includes(cap)) {
    overrides.deny = enabled
      ? overrides.deny.filter((c) => c !== cap)
      : [...overrides.deny.filter((c) => c !== cap), cap];
  } else {
    overrides.allow = enabled
      ? [...overrides.allow.filter((c) => c !== cap), cap]
      : overrides.allow.filter((c) => c !== cap);
  }
  applyCapabilityOverrides(overrides);
}

function isCapabilityEnabled(cap: Capability): boolean {
  const overrides = editProfile.value.capabilityOverrides;
  const defaults = ROLE_DEFAULT_CAPABILITIES[editProfile.value.rolePreset];
  if (overrides?.deny?.includes(cap)) return false;
  if (overrides?.allow?.includes(cap)) return true;
  return defaults.includes(cap);
}

function roleLabel(role: UserPermissionProfile["rolePreset"]): string {
  const labels = {
    administrator: t("users.administrator"),
    manager: t("users.manager"),
    "content-editor": t("users.contentEditor"),
    contributor: t("users.contributor"),
  };
  return labels[role];
}

function capabilityLabel(capability: Capability): string {
  const labels: Partial<Record<Capability, string>> = {
    manageUsers: t("users.permission.manageUsers"),
    manageRoles: t("users.permission.manageRoles"),
    manageSecurity: t("users.permission.manageSecurity"),
    manageBilling: t("users.permission.manageBilling"),
    manageExports: t("users.permission.manageExports"),
    manageBackups: t("users.permission.manageBackups"),
    manageIntegrations: t("users.permission.manageIntegrations"),
    manageApiTokens: t("users.permission.manageApiTokens"),
    editSiteSettings: t("users.permission.editSiteSettings"),
    editDiscoverySettings: t("users.permission.editDiscoverySettings"),
    viewDiscoverySettings: t("users.permission.viewDiscoverySettings"),
    manageRedirects: t("users.permission.manageRedirects"),
    viewRedirects: t("users.permission.viewRedirects"),
    editAnalytics: t("users.permission.editAnalytics"),
    viewStudioMetrics: t("users.permission.viewStudioMetrics"),
    editDomains: t("users.permission.editDomains"),
    editCustomCode: t("users.permission.editCustomCode"),
    editStudioPreferences: t("users.permission.editStudioPreferences"),
    editPages: t("users.permission.editPages"),
    createPages: t("users.permission.createPages"),
    deletePages: t("users.permission.deletePages"),
    editPageStructure: t("users.permission.editPageStructure"),
    editPageContent: t("users.permission.editPageContent"),
    editPageSeo: t("users.permission.editPageSeo"),
    editCms: t("users.permission.editCms"),
    uploadMedia: t("users.permission.uploadMedia"),
    useMediaLibrary: t("users.permission.useMediaLibrary"),
    syncMedia: t("users.permission.syncMedia"),
    publishContent: t("users.permission.publishContent"),
    unpublishContent: t("users.permission.unpublishContent"),
    reviewContent: t("users.permission.reviewContent"),
  };

  return labels[capability] ?? formatCapabilityLabel(capability);
}
</script>

<template>
  <div class="min-w-0 space-y-0">
    <Teleport defer to="#settings-tab-header">
      <div class="flex items-center gap-2">
        <Button
          variant="headerAction"
          size="icon-header"
          class="shrink-0"
          @click="emit('back')"
        >
          <span :class="[studioIcons.chevronLeft, 'size-4.5']" />
        </Button>
        <span
          class="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          @click="emit('back')"
          >{{ t("users.title") }}</span
        >
        <span class="text-muted-foreground/40">/</span>
        <span class="text-sm font-medium text-foreground">{{
          user.name || user.username
        }}</span>
      </div>
    </Teleport>

    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
      role="tablist"
      :aria-label="t('users.title')"
    >
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeTab === 'general'"
        :variant="activeTab === 'general' ? 'tab-active' : 'tab'"
        @click="activeTab = 'general'"
      >
        {{ t("users.detail.general") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeTab === 'security'"
        :variant="activeTab === 'security' ? 'tab-active' : 'tab'"
        @click="activeTab = 'security'"
      >
        {{ t("users.detail.security") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeTab === 'permissions'"
        :variant="activeTab === 'permissions' ? 'tab-active' : 'tab'"
        @click="activeTab = 'permissions'"
      >
        {{ t("users.detail.permissions") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeTab === 'activity'"
        :variant="activeTab === 'activity' ? 'tab-active' : 'tab'"
        @click="activeTab = 'activity'"
      >
        {{ t("users.detail.activity") }}
      </Button>
    </div>

    <div class="px-12 pt-8 pb-10">
      <div
        v-if="activeTab === 'general'"
        class="flex items-start justify-start gap-6"
      >
        <div class="relative group shrink-0">
          <div
            class="size-30 rounded-md overflow-hidden border border-border bg-sidebar flex items-center justify-center"
            :class="user.avatarUrl ? 'border-solid' : 'border-dashed'"
          >
            <img
              v-if="user.avatarUrl"
              :src="user.avatarUrl"
              :alt="user.username"
              class="size-full object-cover"
            />
            <span
              v-else
              :class="[
                studioIcons.userCircle,
                'size-8 text-muted-foreground/40',
              ]"
            />
          </div>
          <div
            class="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Button
              type="button"
              variant="headerAction"
              size="icon-header"
              class="bg-sidebar! hover:bg-primary!"
              :aria-label="t('users.detail.chooseAvatar')"
              @click="isMediaPickerOpen = true"
            >
              <span :class="[studioIcons.upload, 'size-3.5 text-foreground']" />
            </Button>
            <Button
              v-if="user.avatarUrl"
              type="button"
              variant="headerAction"
              size="icon-header"
              class="bg-sidebar! hover:bg-destructive!"
              :aria-label="t('users.detail.removeAvatar')"
              @click="handleAvatarRemove"
            >
              <span :class="[studioIcons.trash, 'size-3.5 text-foreground']" />
            </Button>
          </div>
          <div
            v-if="avatarLoading"
            class="absolute inset-0 flex items-center justify-center"
          >
            <span
              :class="[
                studioIcons.loading,
                'size-5 text-foreground animate-spin',
              ]"
            />
          </div>
        </div>

        <div class="flex-1 space-y-0">
          <div class="max-w-sm space-y-4 pb-4">
            <div class="flex flex-col gap-2">
              <Label class="text-xs text-muted-foreground">{{
                t("users.detail.name")
              }}</Label>
              <Input
                v-model="name"
                class="h-9.5! text-sm hover:bg-background! bg-input! border-border/50"
                :disabled="infoSaving"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label class="text-xs text-muted-foreground">{{
                t("auth.username")
              }}</Label>
              <Input
                :model-value="user.username"
                class="h-9.5! text-sm bg-input! border-border/50"
                disabled
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label class="text-xs text-muted-foreground">{{
                t("users.detail.email")
              }}</Label>
              <Input
                v-model="email"
                type="email"
                class="h-9.5! text-sm hover:bg-background! bg-input! border-border/50"
                :disabled="infoSaving"
              />
            </div>
            <Button
              size="sm"
              :disabled="infoSaving || !name.trim() || !email"
              @click="saveInfo"
              >{{ t("users.detail.saveProfile") }}</Button
            >
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'security'" class="space-y-0">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="lg:col-span-2">
            <PasskeysPanel :user="user" :can-add="isSessionUserId(user.id)" />
          </div>

          <!-- Two-Factor Auth -->
          <div
            class="flex flex-col bg-input! rounded-sm border border-border/50 border-solid p-4 hover:border-dashed hover:border-border"
          >
            <div
              class="flex flex-1 items-center justify-between min-h-0 select-none"
            >
              <div>
                <p class="text-sm leading-1 font-medium">
                  {{ t("users.detail.twoFactor") }}
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ t("users.detail.twoFactorDescription") }}
                </p>
                <p
                  v-if="totpError && !showTotpSetup && !showTotpDisable"
                  class="text-xs text-destructive mt-1"
                >
                  {{ totpError }}
                </p>
              </div>
              <Switch
                :model-value="user.totpEnabled"
                :disabled="totpLoading || showTotpSetup || showTotpDisable"
                :aria-label="t('users.detail.twoFactor')"
                @update:model-value="onTotpToggle"
              />
            </div>

            <!-- TOTP Setup inline -->
            <div v-if="showTotpSetup" class="mt-4 space-y-3 pt-4">
              <div
                v-if="totpSuccess"
                class="flex items-center gap-2 text-sm text-success"
              >
                <span :class="[studioIcons.check, 'size-4']" />
                {{ t("users.detail.twoFactorEnabled") }}
              </div>
              <template v-else>
                <div
                  v-if="totpSetupData"
                  class="flex flex-col items-center gap-2"
                >
                  <img
                    :src="
                      'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' +
                      encodeURIComponent(totpSetupData.qrCodeUrl)
                    "
                    class="w-40 h-40 bg-background rounded"
                    :alt="t('users.detail.qrCode')"
                  />
                  <p class="text-2xs text-muted-foreground text-center">
                    {{ t("users.detail.scanAuthenticator") }}
                  </p>
                  <code class="font-mono text-sm">{{
                    totpSetupData.secret
                  }}</code>
                </div>
                <div class="flex gap-2">
                  <Input
                    v-model="totpVerifyCode"
                    placeholder="000000"
                    maxlength="6"
                    class="h-8 text-sm w-24 text-center font-mono"
                    @keyup.enter="verifyTotpSetup"
                  />
                  <Button
                    size="sm"
                    :disabled="totpLoading || totpVerifyCode.length !== 6"
                    @click="verifyTotpSetup"
                    >{{ t("users.detail.verify") }}</Button
                  >
                </div>
                <p v-if="totpError" class="text-xs text-destructive">
                  {{ totpError }}
                </p>
              </template>
            </div>

            <!-- TOTP Disable inline -->
            <div
              v-if="showTotpDisable"
              class="mt-4 space-y-3 border-t border-dashed border-border pt-4"
            >
              <p class="text-xs text-muted-foreground">
                {{ t("users.detail.disableTwoFactorDescription") }}
              </p>
              <div class="flex gap-2">
                <Input
                  v-model="totpDisablePassword"
                  type="password"
                  :placeholder="t('users.detail.yourPassword')"
                  class="h-9.5! text-sm"
                  @keyup.enter="disableTotp"
                />
                <Button
                  size="sm"
                  class="h-9.5! text-sm"
                  variant="destructive"
                  :disabled="totpLoading || !totpDisablePassword"
                  @click="disableTotp"
                  >{{ t("users.detail.disable") }}</Button
                >
              </div>
              <p v-if="totpError" class="text-xs text-destructive">
                {{ totpError }}
              </p>
            </div>
          </div>

          <!-- Password -->
          <div
            class="bg-input! rounded-sm border border-border border-solid p-4 hover:border-dashed hover:border-border"
          >
            <div class="flex items-center justify-between select-none">
              <div>
                <p class="text-sm leading-1 font-medium">
                  {{ t("users.detail.password") }}
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ t("users.detail.passwordDescription") }}
                </p>
              </div>
              <Button
                variant="card-action-primary"
                size="sm"
                @click="showPasswordChange = !showPasswordChange"
                >{{ t("users.detail.change") }}</Button
              >
            </div>
            <div
              v-if="showPasswordChange"
              class="mt-4 space-y-3 border-t border-dashed border-border pt-4"
            >
              <div
                v-if="passwordSuccess"
                class="flex items-center gap-2 text-sm text-success"
              >
                <span :class="[studioIcons.check, 'size-4']" />
                {{ t("users.detail.passwordChanged") }}
              </div>
              <template v-else>
                <Input
                  v-model="passwordForm.current"
                  type="password"
                  :placeholder="t('users.detail.currentPassword')"
                  class="h-8 text-sm"
                />
                <Input
                  v-model="passwordForm.new_"
                  type="password"
                  :placeholder="t('users.detail.newPassword')"
                  class="h-8 text-sm"
                />
                <Input
                  v-model="passwordForm.confirm"
                  type="password"
                  :placeholder="t('users.detail.confirmPassword')"
                  class="h-8 text-sm"
                  :class="{
                    'border-destructive':
                      passwordForm.confirm && !passwordsMatch,
                  }"
                />
                <p v-if="passwordError" class="text-xs text-destructive">
                  {{ passwordError }}
                </p>
                <Button
                  size="sm"
                  :disabled="passwordLoading || !canChangePassword"
                  @click="changePassword"
                  >{{ t("users.detail.updatePassword") }}</Button
                >
              </template>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'permissions'" class="space-y-0">
        <div class="flex items-center justify-end">
          <Button
            v-if="!isBootstrapAdmin"
            variant="headerAction"
            size="icon-header"
            @click="showPermissions = !showPermissions"
          >
            {{ showPermissions ? t("common.cancel") : t("email.edit") }}
          </Button>
        </div>

        <div
          v-if="isBootstrapAdmin"
          class="space-y-2 flex flex-col gap-3 bg-input rounded-md border border-border border-solid px-6 py-4 hover:border-dashed hover:border-border"
        >
          <div class="flex items-center justify-between select-none">
            <div>
              <p class="text-lg leading-1 font-medium">
                {{ t("users.administrator") }}
              </p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ t("users.detail.adminDescription") }}
              </p>
            </div>
            <Badge variant="outline">{{ t("users.administrator") }}</Badge>
          </div>
          <div
            v-for="group in capabilityGroups"
            :key="group.label"
            class="space-y-1.5"
          >
            <p
              class="text-2xs font-medium text-muted-foreground/50 uppercase tracking-wider"
            >
              {{ group.label }}
            </p>
            <div class="grid grid-cols-3 gap-x-4 gap-y-1.5">
              <span
                v-for="cap in group.caps"
                :key="cap"
                class="text-sm text-foreground"
              >
                {{ capabilityLabel(cap) }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-else-if="!showPermissions"
          class="flex items-center gap-2 p-6 bg-input rounded-md border border-border border-solid hover:border-dashed hover:border-border select-none"
        >
          <Badge variant="outline" size="lg">{{
            roleLabel(
              props.user.permissionProfile?.rolePreset ?? props.user.role,
            )
          }}</Badge>
          <span class="text-xs text-muted-foreground"
            >{{
              resolveEffectiveCapabilities(
                props.user.permissionProfile ?? { rolePreset: props.user.role },
              ).length
            }}
            capabilities</span
          >
        </div>

        <div
          v-else
          class="space-y-7 pb-4 rounded-md border border-border border-solid bg-input p-6 hover:border-dashed hover:border-border"
        >
          <div class="space-y-1.5">
            <Label
              class="text-2xs! uppercase tracking-wider text-muted-foreground/50 pb-1"
              >{{ t("users.detail.rolePreset") }}</Label
            >
            <Select
              v-model="editProfile.rolePreset"
              :disabled="permissionSaving"
            >
              <SelectTrigger
                class="h-9.5! text-sm w-40! bg-input! border-border border-solid hover:border-dashed hover:border-border"
                ><SelectValue
              /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administrator">{{
                  t("users.administrator")
                }}</SelectItem>
                <SelectItem value="manager">{{
                  t("users.manager")
                }}</SelectItem>
                <SelectItem value="content-editor">{{
                  t("users.contentEditor")
                }}</SelectItem>
                <SelectItem value="contributor">{{
                  t("users.contributor")
                }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-7 pb-4">
            <div
              v-for="group in capabilityGroups"
              :key="group.label"
              class="space-y-1.5"
            >
              <p
                class="text-2xs font-medium text-muted-foreground/50 uppercase tracking-wider"
              >
                {{ group.label }}
              </p>
              <div class="grid grid-cols-3 gap-x-4 gap-y-1.5">
                <div
                  v-for="cap in group.caps"
                  :key="cap"
                  class="flex items-center gap-2 text-sm cursor-pointer select-none"
                  @click="
                    !permissionSaving &&
                    setCapabilityEnabled(cap, !isCapabilityEnabled(cap))
                  "
                >
                  <span class="shrink-0" @click.stop>
                    <Checkbox
                      :model-value="isCapabilityEnabled(cap)"
                      :disabled="permissionSaving"
                      @update:model-value="
                        (value) =>
                          typeof value === 'boolean' &&
                          setCapabilityEnabled(cap, value)
                      "
                    />
                  </span>
                  <span
                    :class="
                      isCapabilityEnabled(cap)
                        ? 'text-foreground'
                        : 'text-muted-foreground/40'
                    "
                    >{{ capabilityLabel(cap) }}</span
                  >
                </div>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            :disabled="permissionSaving"
            @click="savePermissions"
            >{{ t("users.detail.savePermissions") }}</Button
          >
        </div>
      </div>

      <div v-if="activeTab === 'activity'" class="space-y-0">
        <div
          class="space-y-2 text-sm p-6 bg-input rounded-md border border-border border-solid hover:border-dashed hover:border-border"
        >
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{
              t("users.detail.accountCreated")
            }}</span
            ><span class="text-foreground">{{
              new Date(user.createdAt).toLocaleDateString(
                locale === "fr" ? "fr-CA" : "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                },
              )
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t("users.lastLogin") }}</span
            ><span class="text-foreground">{{
              user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleDateString(
                    locale === "fr" ? "fr-CA" : "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )
                : t("users.never")
            }}</span>
          </div>
        </div>
      </div>

      <Teleport v-if="canDelete" defer to="#settings-tab-footer-left">
        <Button variant="destructive" size="sm" @click="emit('delete', user)"
          ><span :class="[studioIcons.trash, 'size-3.5 mr-1.5']" />{{
            t("users.detail.deleteUser")
          }}</Button
        >
      </Teleport>
    </div>

    <MediaPickerDialog
      v-model:open="isMediaPickerOpen"
      :title="t('users.detail.selectAvatar')"
      :description="t('users.detail.selectAvatarDescription')"
      media-type="image"
      @select="handleAvatarSelect"
    />
  </div>
</template>
