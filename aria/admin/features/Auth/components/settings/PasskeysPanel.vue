<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ListPasskeysResponseSchema,
  PasskeyRegisterOptionsResponseSchema,
  PasskeyRegisterVerifyResponseSchema,
  RegistrationResponseJSONSchema,
  type PasskeySummary,
  type User,
} from "@/lib/auth/types";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  user: Pick<User, "id" | "username">;
  canAdd: boolean;
}>();
const { t, locale } = useStudioI18n();

const passkeys = ref<PasskeySummary[]>([]);
const drafts = ref<Record<string, string>>({});
const loading = ref(false);
const savingId = ref<string | null>(null);
const adding = ref(false);
const errorMessage = ref<string | null>(null);

const hasPasskeys = computed(() => passkeys.value.length > 0);

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function setDrafts(nextPasskeys: PasskeySummary[]): void {
  drafts.value = Object.fromEntries(
    nextPasskeys.map((passkey) => [
      passkey.credentialId,
      passkey.deviceName ?? t("users.passkeys.defaultName"),
    ]),
  );
}

function formatPasskeyDate(value: string | null | undefined): string {
  if (!value) return t("users.passkeys.notUsedYet");
  return new Date(value).toLocaleDateString(
    locale.value === "fr" ? "fr-CA" : "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

async function loadPasskeys(): Promise<void> {
  loading.value = true;
  errorMessage.value = null;

  try {
    const { data, error } = await actions.auth.listUserPasskeys({
      userId: props.user.id,
    });

    if (error) {
      errorMessage.value = getActionErrorMessage(
        error,
        t("users.passkeys.loadFailed"),
      );
      return;
    }

    const parsed = ListPasskeysResponseSchema.safeParse(data);
    if (!parsed.success) {
      errorMessage.value = t("users.passkeys.loadFailed");
      return;
    }

    passkeys.value = parsed.data.passkeys;
    setDrafts(parsed.data.passkeys);
  } catch {
    errorMessage.value = t("users.passkeys.loadFailed");
  } finally {
    loading.value = false;
  }
}

async function addPasskey(): Promise<void> {
  if (!props.canAdd) return;

  adding.value = true;
  errorMessage.value = null;

  try {
    const { data, error } = await actions.auth.passkeyRegisterOptions({
      deviceName: t("users.passkeys.thisDevice"),
    });

    if (error) {
      errorMessage.value = getActionErrorMessage(
        error,
        t("users.passkeys.setupStartFailed"),
      );
      return;
    }

    const parsedOptions = PasskeyRegisterOptionsResponseSchema.safeParse(data);
    if (!parsedOptions.success) {
      errorMessage.value = t("users.passkeys.setupStartFailed");
      return;
    }

    const response = await startRegistration({
      optionsJSON: parsedOptions.data.options,
    });

    const verifiedResponse = RegistrationResponseJSONSchema.parse(response);
    const { data: verifyData, error: verifyError } =
      await actions.auth.passkeyRegisterVerify({
        challengeId: parsedOptions.data.challengeId,
        response: verifiedResponse,
        deviceName: t("users.passkeys.thisDevice"),
      });

    if (verifyError) {
      errorMessage.value = getActionErrorMessage(
        verifyError,
        t("users.passkeys.setupFailed"),
      );
      return;
    }

    const parsedVerify =
      PasskeyRegisterVerifyResponseSchema.safeParse(verifyData);
    if (!parsedVerify.success) {
      errorMessage.value = t("users.passkeys.setupFailed");
      return;
    }

    await loadPasskeys();
    toast.success(t("users.passkeys.added"));
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error && error.name === "NotAllowedError"
        ? t("users.passkeys.setupCanceled")
        : t("users.passkeys.setupFailed");
  } finally {
    adding.value = false;
  }
}

async function renamePasskey(passkey: PasskeySummary): Promise<void> {
  const deviceName = drafts.value[passkey.credentialId]?.trim();
  if (!deviceName || deviceName === passkey.deviceName) return;

  savingId.value = passkey.credentialId;
  errorMessage.value = null;

  try {
    const { data, error } = await actions.auth.renameUserPasskey({
      credentialId: passkey.credentialId,
      deviceName,
    });

    if (error) {
      errorMessage.value = getActionErrorMessage(
        error,
        t("users.passkeys.renameFailed"),
      );
      return;
    }

    const parsed = PasskeyRegisterVerifyResponseSchema.safeParse(data);
    if (!parsed.success) {
      errorMessage.value = t("users.passkeys.renameFailed");
      return;
    }

    passkeys.value = passkeys.value.map((existing) =>
      existing.credentialId === parsed.data.passkey.credentialId
        ? parsed.data.passkey
        : existing,
    );
    drafts.value[parsed.data.passkey.credentialId] =
      parsed.data.passkey.deviceName ?? t("users.passkeys.defaultName");
    toast.success(t("users.passkeys.renamed"));
  } catch {
    errorMessage.value = t("users.passkeys.renameFailed");
  } finally {
    savingId.value = null;
  }
}

async function removeSelectedPasskey(passkey: PasskeySummary): Promise<void> {
  savingId.value = passkey.credentialId;
  errorMessage.value = null;

  try {
    const { error } = await actions.auth.removeUserPasskey({
      userId: props.user.id,
      credentialId: passkey.credentialId,
    });

    if (error) {
      errorMessage.value = getActionErrorMessage(
        error,
        t("users.passkeys.removeFailed"),
      );
      return;
    }

    passkeys.value = passkeys.value.filter(
      (existing) => existing.credentialId !== passkey.credentialId,
    );
    delete drafts.value[passkey.credentialId];
    toast.success(t("users.passkeys.removed"));
  } catch {
    errorMessage.value = t("users.passkeys.removeFailed");
  } finally {
    savingId.value = null;
  }
}

watch(
  () => props.user.id,
  () => {
    void loadPasskeys();
  },
);

onMounted(() => {
  void loadPasskeys();
});
</script>

<template>
  <div
    class="col-span-2 space-y-3 bg-input! rounded-sm border border-border border-solid p-4 hover:border-dashed hover:border-border"
  >
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm m-0 font-medium">
          {{ t("users.passkeys.title") }}
        </p>
        <p class="text-xs m-0 text-muted-foreground mt-0.5">
          {{ t("users.passkeys.description") }}
        </p>
      </div>

      <Button
        v-if="canAdd"
        type="button"
        size="sm"
        variant="card-action-primary"
        :disabled="adding || loading"
        @click="addPasskey"
      >
        <span
          :class="[
            adding ? studioIcons.loading : studioIcons.plus,
            'size-3.5 mr-1.5',
            adding ? 'animate-spin' : '',
          ]"
        />
        {{ t("users.passkeys.add") }}
      </Button>
    </div>

    <p v-if="errorMessage" class="text-xs text-destructive">
      {{ errorMessage }}
    </p>

    <div v-if="loading" class="space-y-2">
      <div class="h-9 rounded-sm bg-muted-foreground/10 animate-pulse" />
      <div class="h-9 rounded-sm bg-muted-foreground/10 animate-pulse" />
    </div>

    <div v-else-if="!hasPasskeys" class="text-xs text-muted-foreground">
      {{ t("users.passkeys.empty") }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="passkey in passkeys"
        :key="passkey.credentialId"
        class="grid grid-cols-[1fr_auto_auto] items-start justify-between rounded-sm border border-border/50 bg-background/40 px-3 py-3"
      >
        <div class="min-w-0 space-y-4">
          <Input
            v-model="drafts[passkey.credentialId]"
            class="h-8! bg-transparent! border-border/50 text-xs"
            :disabled="!canAdd || savingId === passkey.credentialId"
            @keyup.enter="renamePasskey(passkey)"
          />
          <p class="truncate text-2xs m-0 pl-2 text-muted-foreground/60">
            {{
              t("users.passkeys.lastUsed", {
                date: formatPasskeyDate(passkey.lastUsedAt),
              })
            }}
          </p>
        </div>

        <div class="flex flex-row gap-0 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :disabled="!canAdd || savingId === passkey.credentialId"
          :aria-label="t('users.passkeys.rename')"
          @click="renamePasskey(passkey)"
        >
          <span
            :class="[
              savingId === passkey.credentialId
                ? studioIcons.loading
                : studioIcons.check,
              'size-3.5',
              savingId === passkey.credentialId ? 'animate-spin' : '',
            ]"
          />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          :disabled="savingId === passkey.credentialId"
          :aria-label="t('users.passkeys.remove')"
          @click="removeSelectedPasskey(passkey)"
        >
          <span :class="[studioIcons.trash, 'size-3.5']" />
        </Button>
      </div>
      </div>
    </div>
  </div>
</template>
