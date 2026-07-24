<script setup lang="ts">
/**
 * ForgotPasswordForm Component
 *
 * Request a password reset email.
 *
 * @component
 */

import { ref, computed } from "vue";
import {
  PasswordResetRequestFormSchema,
  requestPasswordReset,
} from "..";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudioI18n } from "@/i18n";

const email = ref("");
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const isLoading = ref(false);
const { t } = useStudioI18n();

const buttonText = computed(() =>
  isLoading.value ? t("auth.sending") : t("auth.sendResetLink"),
);

function clearMessages(): void {
  error.value = null;
  success.value = null;
}

async function handleSubmit(): Promise<void> {
  clearMessages();

  const parsedForm = PasswordResetRequestFormSchema.safeParse({
    email: email.value,
  });

  if (!parsedForm.success) {
    error.value =
      parsedForm.error.issues[0]?.message ??
      t("auth.validEmailRequired");
    return;
  }

  isLoading.value = true;

  try {
    const result = await requestPasswordReset(parsedForm.data);
    if (result.error) {
      error.value = result.error;
      return;
    }

    success.value =
      result.data?.message ??
      t("auth.resetLinkSent");
    email.value = "";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <Alert
      v-if="error"
      variant="destructive"
      class="border-dashed animate-shake"
    >
      <span class="i-hugeicons:alert-02" aria-hidden="true" />
      <AlertTitle>{{ t("auth.resetRequestAttention") }}</AlertTitle>
      <AlertDescription>
        {{ error }}
      </AlertDescription>
    </Alert>

    <Alert
      v-if="success"
      class="border-dashed border-border/50 bg-background/50"
    >
      <span class="i-hugeicons:mail-01" aria-hidden="true" />
      <AlertTitle>{{ t("auth.checkInbox") }}</AlertTitle>
      <AlertDescription>
        {{ success }}
      </AlertDescription>
    </Alert>

    <div class="space-y-2">
      <Label
        for="email"
        class="text-sm! text-muted-foreground"
      >
        {{ t("auth.email") }}
      </Label>
      <Input
        id="email"
        v-model="email"
        type="email"
        :placeholder="t('auth.enterEmail')"
        required
        autocomplete="email"
        class="bg-background-70 border-dashed"
      />
    </div>

    <Button
      type="submit"
      :disabled="isLoading"
      class="w-full"
      size="lg"
    >
      {{ buttonText }}
    </Button>

    <p class="text-center">
      <a
        href="/admin/login"
        class="text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {{ t("auth.backToSignIn") }}
      </a>
    </p>
  </form>
</template>
