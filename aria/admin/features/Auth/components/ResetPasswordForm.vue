<script setup lang="ts">
/**
 * ResetPasswordForm Component
 *
 * Set a new password using a reset token from email.
 *
 * @component
 */

import { computed, ref } from "vue";
import {
  confirmPasswordReset,
  PasswordResetConfirmFormSchema,
} from "..";
import { usePasswordStrength } from "../composables/usePasswordStrength";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  token: string;
}>();

const password = ref("");
const confirmPassword = ref("");
const showPasswords = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const isLoading = ref(false);
const { t } = useStudioI18n();

const { percentWidth, colorClass } = usePasswordStrength(password);

const inputType = computed(() => (showPasswords.value ? "text" : "password"));
const hasPasswordValue = computed(() => password.value.length > 0);
const hasConfirmValue = computed(() => confirmPassword.value.length > 0);
const passwordsMatch = computed(
  () => !confirmPassword.value || password.value === confirmPassword.value,
);
const eyeIconClass = computed(() =>
  showPasswords.value ? "i-hugeicons:view-off" : "i-hugeicons:eye",
);
const buttonText = computed(() =>
  isLoading.value ? t("auth.resetting") : t("auth.resetPassword"),
);

function clearMessages(): void {
  error.value = null;
  success.value = null;
}

async function handleSubmit(): Promise<void> {
  clearMessages();

  const parsedForm = PasswordResetConfirmFormSchema.safeParse({
    token: props.token,
    newPassword: password.value,
    confirmPassword: confirmPassword.value,
  });

  if (!parsedForm.success) {
    error.value =
      parsedForm.error.issues[0]?.message ?? t("auth.invalidResetRequest");
    return;
  }

  isLoading.value = true;

  try {
    const result = await confirmPasswordReset({
      token: parsedForm.data.token,
      newPassword: parsedForm.data.newPassword,
    });

    if (result.error) {
      error.value = result.error;
      return;
    }

    success.value =
      result.data?.message ??
      t("auth.passwordResetSuccess");

    window.setTimeout(() => {
      window.location.href = "/admin/login";
    }, 2000);
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
      <AlertTitle>{{ t("auth.resetAttention") }}</AlertTitle>
      <AlertDescription>
        {{ error }}
      </AlertDescription>
    </Alert>

    <Alert
      v-if="success"
      class="border-dashed border-primary/50 bg-primary/10 text-foreground"
    >
      <span class="i-hugeicons:checkmark-circle-02 text-primary" aria-hidden="true" />
      <AlertTitle>{{ t("auth.passwordUpdated") }}</AlertTitle>
      <AlertDescription>
        {{ success }}
      </AlertDescription>
    </Alert>

    <div class="relative space-y-2">
      <Label
        for="reset-password"
        class="!text-2xs font-mono font-medium uppercase tracking-wider text-muted-foreground"
      >
        {{ t("auth.newPassword") }}
      </Label>
      <Input
        id="reset-password"
        v-model="password"
        :type="inputType"
        autocomplete="new-password"
        :placeholder="t('auth.enterNewPassword')"
        required
        minlength="7"
        class="border-dashed bg-background-70 pr-12"
      />
      <button
        type="button"
        class="absolute right-3 top-[30px] size-5 cursor-pointer text-accent transition-opacity"
        :class="[eyeIconClass, hasPasswordValue ? 'opacity-100' : 'opacity-40']"
        tabindex="-1"
        :aria-label="t('auth.togglePasswordVisibility')"
        @click="showPasswords = !showPasswords"
      />
      <p class="pl-1 text-2xs text-muted-foreground">
        {{ t("auth.minimumPasswordLength") }}
      </p>

      <div
        class="mx-6 mt-4 h-1.5 overflow-hidden rounded-full bg-border transition-opacity duration-300 ease-out motion-reduce:transition-none"
        :class="hasPasswordValue ? 'opacity-50' : 'opacity-0'"
      >
        <div
          class="h-full transition-all duration-300 ease-out motion-reduce:transition-none"
          :class="colorClass"
          :style="{ width: percentWidth }"
        />
      </div>
    </div>

    <div class="relative space-y-2">
      <Label
        for="reset-confirm-password"
        class="!text-2xs font-mono font-medium uppercase tracking-wider text-muted-foreground"
      >
        {{ t("auth.confirmPassword") }}
      </Label>
      <Input
        id="reset-confirm-password"
        v-model="confirmPassword"
        :type="inputType"
        autocomplete="new-password"
        :placeholder="t('auth.confirmNewPassword')"
        required
        class="border-dashed bg-background-70 pr-12"
        :aria-invalid="hasConfirmValue && !passwordsMatch"
      />
      <button
        type="button"
        class="absolute right-3 top-[30px] size-5 cursor-pointer text-primary transition-opacity"
        :class="[eyeIconClass, hasConfirmValue ? 'opacity-100' : 'opacity-0']"
        tabindex="-1"
        :aria-label="t('auth.togglePasswordVisibility')"
        @click="showPasswords = !showPasswords"
      />
      <p
        v-if="hasConfirmValue && !passwordsMatch"
        class="pl-1 text-2xs text-destructive"
      >
        {{ t("auth.passwordsDoNotMatch") }}
      </p>
    </div>

    <Button
      type="submit"
      :disabled="isLoading || (hasConfirmValue && !passwordsMatch)"
      class="w-full"
      size="lg"
    >
      {{ buttonText }}
    </Button>

    <p class="text-center">
      <a
        href="/admin/login"
        class="text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        {{ t("auth.backToSignIn") }}
      </a>
    </p>
  </form>
</template>
