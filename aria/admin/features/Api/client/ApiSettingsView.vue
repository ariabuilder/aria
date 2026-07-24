<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useCapabilities } from "@/composables/useCapabilities";
import { DeleteConfirmDialog } from "@/features/Studio/core/components";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ApiCredentialPublic, ApiScope } from "@lib/api/schemas";
import { isApiKeyringConfigurationError } from "./apiCredentialErrors";

const { hasCapability } = useCapabilities();
const { t } = useStudioI18n();
const credentials = ref<ApiCredentialPublic[]>([]);
const name = ref("");
const selectedScopes = ref<ApiScope[]>(["collections:read", "entries:read"]);
const createdToken = ref<string | null>(null);
const createOpen = ref(false);
const credentialKind = ref<"personal" | "service">("personal");
const keyringReady = ref<boolean | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const credentialPendingRemoval = ref<ApiCredentialPublic | null>(null);

const canManageService = computed(() => hasCapability("manageApiTokens"));
const activeCredentialCount = computed(
  () => credentials.value.filter((credential) => !credential.revokedAt).length,
);
const scopeOptions = computed<Array<{ scope: ApiScope; disabled: boolean }>>(
  () => [
    { scope: "collections:read", disabled: !hasCapability("editCms") },
    { scope: "entries:read", disabled: !hasCapability("editCms") },
    { scope: "entries:write", disabled: !hasCapability("editCms") },
    {
      scope: "entries:publish",
      disabled:
        !hasCapability("publishContent") && !hasCapability("unpublishContent"),
    },
  ],
);

function isSelected(scope: ApiScope): boolean {
  return selectedScopes.value.includes(scope);
}

function openCreateDialog(kind: "personal" | "service"): void {
  credentialKind.value = kind;
  createdToken.value = null;
  createOpen.value = true;
}

function closeCreateDialog(): void {
  if (loading.value) return;
  createOpen.value = false;
  createdToken.value = null;
  name.value = "";
  selectedScopes.value = ["collections:read", "entries:read"];
}

function setScope(scope: ApiScope, enabled: boolean | "indeterminate"): void {
  selectedScopes.value =
    enabled === true
      ? Array.from(new Set([...selectedScopes.value, scope]))
      : selectedScopes.value.filter((value) => value !== scope);
}

async function loadCredentials(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const statusResult = await actions.apiTokens.status({});
    if (statusResult.error) throw statusResult.error;
    keyringReady.value = statusResult.data?.ready === true;
    if (!keyringReady.value) {
      error.value = t("settings.api.keyringNotConfigured");
    }
    const result = await actions.apiTokens.list({});
    if (result.error) throw result.error;
    credentials.value = (result.data ?? []) as ApiCredentialPublic[];
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : t("settings.api.loadFailed");
  } finally {
    loading.value = false;
  }
}

async function createCredential(): Promise<void> {
  if (!name.value.trim() || selectedScopes.value.length === 0) return;
  loading.value = true;
  error.value = null;
  try {
    const result = await actions.apiTokens.create({
      name: name.value.trim(),
      kind: credentialKind.value,
      scopes: selectedScopes.value,
    });
    if (result.error) throw result.error;
    const created = result.data as {
      credential: ApiCredentialPublic;
      token: string;
    };
    createdToken.value = created.token;
    await loadCredentials();
  } catch (cause) {
    if (isApiKeyringConfigurationError(cause)) {
      keyringReady.value = false;
      error.value = t("settings.api.keyringNotConfigured");
    } else {
      error.value =
        cause instanceof Error ? cause.message : t("settings.api.createFailed");
    }
    loading.value = false;
  }
}

async function copyToken(): Promise<void> {
  if (!createdToken.value) return;
  try {
    await navigator.clipboard.writeText(createdToken.value);
    toast.success(t("settings.api.tokenCopied"));
  } catch {
    toast.error(t("settings.api.copyFailed"));
  }
}

async function revokeCredential(id: string): Promise<void> {
  loading.value = true;
  try {
    const result = await actions.apiTokens.revoke({ id });
    if (result.error) throw result.error;
    await loadCredentials();
  } catch (cause) {
    toast.error(
      cause instanceof Error ? cause.message : t("settings.api.revokeFailed"),
    );
    loading.value = false;
  }
}

function requestCredentialRemoval(credential: ApiCredentialPublic): void {
  credentialPendingRemoval.value = credential;
}

async function removeCredential(): Promise<void> {
  const credential = credentialPendingRemoval.value;
  if (!credential) return;
  loading.value = true;
  try {
    const result = await actions.apiTokens.remove({ id: credential.id });
    if (result.error) throw result.error;
    credentialPendingRemoval.value = null;
    await loadCredentials();
  } catch (cause) {
    toast.error(
      cause instanceof Error ? cause.message : t("settings.api.removeFailed"),
    );
    loading.value = false;
  }
}

onMounted(() => void loadCredentials());
</script>

<template>
  <div class="space-y-4">
    <Teleport defer to="#settings-tab-actions">
      <Select
        v-if="keyringReady === true"
        :model-value="''"
        :disabled="loading"
        @update:model-value="openCreateDialog($event as 'personal' | 'service')"
      >
        <SelectTrigger
          hide-icon
          :class="
            cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'border border-border/50 border-solid bg-sidebar/40 px-4 py-1 text-sm placeholder:text-muted-foreground shadow-none transition-[color,box-shadow] outline-none focus:outline-none focus:ring-0 hover:bg-sidebar/80 hover:border-border/50 hover:border-solid focus-visible:border-border focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid focus-visible:shadow-none focus-active:border-primary/80 focus-active:bg-sidebar data-[state=open]:border-border data-[state=open]:bg-sidebar/80 data-[state=open]:ring-border/50 data-[state=open]:ring-[1px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start rounded-sm cursor-pointer',
            )
          "
        >
          <span :class="[studioIcons.plus, 'size-3.5']" aria-hidden="true" />
          <SelectValue :placeholder="t('settings.api.addCredential')" />
        </SelectTrigger>
        <SelectContent side="left">
          <SelectItem value="personal">
            {{ t("settings.api.personalCredential") }}
          </SelectItem>
          <SelectItem v-if="canManageService" value="service">
            {{ t("settings.api.serviceCredential") }}
          </SelectItem>
        </SelectContent>
      </Select>
    </Teleport>

    <p
      v-if="keyringReady === false"
      role="alert"
      class="rounded-md border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground"
    >
      {{ t("settings.api.keyringNotConfigured") }}
    </p>

    <div
      v-else-if="error"
      role="alert"
      class="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {{ error }}
    </div>

    <section v-if="keyringReady === true" class="space-y-3 pt-2">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="font-medium tracking-tight">{{ t("settings.api.credentialsTitle") }}</h3>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t("settings.api.credentialsDescription") }}
          </p>
        </div>
        <span class="text-xs text-muted-foreground">{{ t("settings.api.activeCount", { count: activeCredentialCount }) }}</span>
      </div>
      <p
        v-if="!loading && credentials.length === 0"
        class="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
      >
        {{ t("settings.api.empty") }}
      </p>
      <div v-if="credentials.length" class="space-y-3">
        <div
          v-for="credential in credentials"
          :key="credential.id"
          class="flex flex-col gap-4 rounded-md border border-border/50 bg-input px-4 py-4 shadow-sm transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5"
          :class="credential.revokedAt ? 'opacity-70' : 'hover:border-border/50! hover:bg-background! hover:text-primary-foreground!'"
        >
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ credential.name }}</span>
              <Badge variant="secondary" size="xs">{{ credential.kind }}</Badge>
              <Badge v-if="credential.revokedAt" variant="outline" size="xs" class="border-destructive/35 text-destructive">
                {{ t("settings.api.revoked") }}
              </Badge>
            </div>
            <p class="font-mono text-xs text-muted-foreground">
              aria_api_{{ credential.tokenPrefix }}.…
            </p>
            <div class="flex flex-wrap gap-1.5">
              <Badge
                v-for="scope in credential.scopes"
                :key="scope"
                variant="outline"
                size="xs"
                class="border-border bg-background/60 text-muted-foreground"
              >
                {{ t(`settings.api.scope.${scope}`) }}
              </Badge>
            </div>
          </div>
          <Button
            v-if="!credential.revokedAt"
            size="xs"
            variant="outline"
            class="self-start text-destructive hover:border-destructive hover:text-destructive sm:self-auto"
            :disabled="loading"
            @click="revokeCredential(credential.id)"
          >
            {{ t("settings.api.revoke") }}
          </Button>
          <Button
            v-else
            size="xs"
            variant="ghost-outline"
            class="self-start text-muted-foreground hover:border-destructive hover:text-destructive sm:self-auto"
            :disabled="loading"
            @click="requestCredentialRemoval(credential)"
          >
            <span :class="[studioIcons.trash, 'size-3.5']" aria-hidden="true" />
            {{ t("settings.api.remove") }}
          </Button>
        </div>
      </div>
    </section>

    <Dialog :open="createOpen" @update:open="(open) => { if (!open) closeCreateDialog(); }">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle v-if="!createdToken">{{ t("settings.api.createTitle") }}</DialogTitle>
          <DialogTitle v-else>{{ t("settings.api.copyNow") }}</DialogTitle>
          <DialogDescription v-if="!createdToken">
            {{ t("settings.api.createDescription") }}
          </DialogDescription>
          <DialogDescription v-else>{{ t("settings.api.copyOnce") }}</DialogDescription>
        </DialogHeader>

        <template v-if="!createdToken">
          <div class="space-y-5 py-2">
            <label class="block space-y-2">
              <span class="text-sm font-medium text-foreground">{{ t("settings.api.nameLabel") }}</span>
              <Input
                v-model="name"
                :placeholder="t('settings.api.namePlaceholder')"
                :disabled="loading"
                maxlength="120"
              />
              <span class="text-xs leading-4 text-muted-foreground">{{ t("settings.api.nameHint") }}</span>
            </label>
            <fieldset class="space-y-3">
              <legend class="text-xs font-medium text-muted-foreground">
                {{ t("settings.api.permissions") }}
              </legend>
              <div class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <label
                  v-for="option in scopeOptions"
                  :key="option.scope"
                  class="flex items-center gap-2 text-sm"
                  :class="option.disabled ? 'opacity-45' : ''"
                >
                  <Checkbox
                    :model-value="isSelected(option.scope)"
                    :disabled="loading || option.disabled"
                    @update:model-value="setScope(option.scope, $event)"
                  />
                  <span>{{ t(`settings.api.scope.${option.scope}`) }}</span>
                </label>
              </div>
            </fieldset>
            <p class="text-xs text-muted-foreground">{{ t("settings.api.principalHint") }}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" :disabled="loading" @click="closeCreateDialog">{{ t("common.cancel") }}</Button>
            <Button
              size="sm"
              :disabled="loading || !name.trim() || selectedScopes.length === 0"
              @click="createCredential"
            >
              {{ t("settings.api.createCredential") }}
            </Button>
          </DialogFooter>
        </template>

        <template v-else>
          <div class="flex overflow-hidden rounded-sm border border-border bg-background">
            <code class="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-xs leading-5 text-foreground">{{ createdToken }}</code>
            <Button size="sm" variant="secondary" class="m-1 shrink-0" @click="copyToken">
              <span :class="[studioIcons.copy, 'size-3.5']" aria-hidden="true" />
              {{ t("settings.api.copyToken") }}
            </Button>
          </div>
          <DialogFooter>
            <Button size="sm" @click="closeCreateDialog">{{ t("common.done") }}</Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>

    <DeleteConfirmDialog
      :open="credentialPendingRemoval !== null"
      :title="t('settings.api.removeConfirmTitle')"
      :description="t('settings.api.removeConfirmDescription')"
      :item-name="credentialPendingRemoval?.name"
      :confirm-label="t('settings.api.remove')"
      :is-loading="loading"
      @update:open="(open) => { if (!open) credentialPendingRemoval = null; }"
      @confirm="removeCredential"
    />
  </div>
</template>
