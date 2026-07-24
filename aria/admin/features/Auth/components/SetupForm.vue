<script setup lang="ts">
/**
 * SetupForm Component Passkey-first setup shell for creating the first
 * admin account. Mutations remain behind Astro Actions; browser WebAuthn.
 */

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStudioI18n } from "@/i18n";
import { localizeAuthError } from "../utils/localizeAuthError";
import { startRegistration } from "@simplewebauthn/browser";
import { onMounted } from "vue";
import {
  beginPasskeySetup,
  completePasskeySetup,
  createFirstAdmin,
  getAuthMethodAvailability,
} from "../composables/useAuthApi";
import { useSetupWizard } from "../composables/useSetupWizard";
import SetupAccountStep from "./setup/SetupAccountStep.vue";
import SetupPasskeyStep from "./setup/SetupPasskeyStep.vue";
import SetupRecoveryStep from "./setup/SetupRecoveryStep.vue";
import SetupStepIndicator from "./setup/SetupStepIndicator.vue";
import {
  RegistrationResponseJSONSchema,
  type RegistrationResponseJSONInput,
} from "@/lib/auth/types";

const { t } = useStudioI18n();
const wizard = useSetupWizard("passkey_shell", t);

interface PendingPasskeyCeremony {
  pendingSetupId: string;
  challengeId: string;
  response: RegistrationResponseJSONInput;
}

let pendingPasskeyCeremony: PendingPasskeyCeremony | null = null;

const isPasswordOnlySetup = () =>
  wizard.state.value.setupMode === "password_legacy";

function handleNext(): void {
  if (wizard.state.value.currentStep === "account") {
    if (!wizard.validateAccountStep()) return;
    return;
  }

  if (wizard.state.value.currentStep === "passkey") {
    void createPasskey();
  }
}

function handleFormSubmit(): void {
  if (wizard.state.value.currentStep === "recovery") {
    void handleSubmit();
    return;
  }

  handleNext();
}

async function createPasskey(): Promise<void> {
  wizard.clearError();
  if (wizard.state.value.passkeyReadiness !== "ready") {
    wizard.setError(t("auth.passkeyUnavailable"));
    return;
  }

  wizard.setLoading(true);

  try {
    const { data, error } = await beginPasskeySetup({
      username: wizard.formData.value.username,
      email: wizard.formData.value.email,
    });

    if (error || !data) {
      wizard.setError(
        error ? localizeAuthError(error, t) : t("auth.passkeySetupStartFailed"),
      );
      return;
    }

    const response = await startRegistration({ optionsJSON: data.options });
    pendingPasskeyCeremony = {
      pendingSetupId: data.pendingSetupId,
      challengeId: data.challengeId,
      response: RegistrationResponseJSONSchema.parse(response),
    };

    wizard.state.value.passkeyReadiness = "success";
    wizard.goToStep("recovery");
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === "NotAllowedError"
        ? t("auth.passkeySetupCancelled")
        : t("auth.passkeySetupRetry");
    wizard.setError(message);
  } finally {
    wizard.setLoading(false);
  }
}

async function handleSubmit(): Promise<void> {
  if (!wizard.validateRecoveryStep()) return;
  if (!isPasswordOnlySetup() && !pendingPasskeyCeremony) {
    wizard.setError(t("auth.createPasskeyFirst"));
    wizard.goToStep("passkey");
    return;
  }

  wizard.setLoading(true);

  try {
    const { data, error } = isPasswordOnlySetup()
      ? await createFirstAdmin(wizard.formData.value)
      : await completePasskeySetup({
          ...pendingPasskeyCeremony,
          password: wizard.formData.value.password,
          confirmPassword: wizard.formData.value.confirmPassword,
          deviceName: "First passkey",
        });

    if (error) {
      wizard.setError(localizeAuthError(error, t));
      wizard.setLoading(false);
      return;
    }

    if (data?.success) {
      wizard.setSuccess(true);
      setTimeout(() => {
        window.location.href = "/admin";
      }, 900);
      return;
    }

    wizard.setError(
      data?.message
        ? localizeAuthError(data.message, t)
        : t("auth.createAccountFailed"),
    );
  } catch {
    wizard.setError(t("common.failed"));
  } finally {
    wizard.setLoading(false);
  }
}

onMounted(() => {
  void (async () => {
    const { data } = await getAuthMethodAvailability();
    if (data?.passkey.enabled === false) {
      wizard.state.value.setupMode = "password_legacy";
      wizard.state.value.passkeyReadiness = "backend_unavailable";
    }
  })();
});
</script>

<template>
  <form class="space-y-7" @submit.prevent="handleFormSubmit">
    <input
      v-if="wizard.state.value.currentStep === 'recovery'"
      type="text"
      name="username"
      autocomplete="username"
      :value="wizard.formData.value.username"
      hidden
      readonly
    />

    <SetupStepIndicator :current-step="wizard.state.value.currentStep" />

    <Alert
      v-if="wizard.state.value.error"
      variant="destructive"
      class="border-dashed"
    >
      <span class="i-hugeicons:alert-02" aria-hidden="true" />
      <AlertTitle>{{ t("auth.setupAttention") }}</AlertTitle>
      <AlertDescription>
        {{ wizard.state.value.error }}
      </AlertDescription>
    </Alert>

    <Alert
      v-if="wizard.state.value.success"
      class="border-dashed border-primary/50 bg-primary/10 text-foreground"
    >
      <span class="i-hugeicons:checkmark-circle-02 text-primary" aria-hidden="true" />
      <AlertTitle>{{ t("auth.accountCreated") }}</AlertTitle>
      <AlertDescription>{{ t("auth.openingStudio") }}</AlertDescription>
    </Alert>

    <SetupAccountStep
      v-if="wizard.state.value.currentStep === 'account'"
      v-model:form-data="wizard.formData.value"
    />

    <SetupPasskeyStep
      v-else-if="
        wizard.state.value.currentStep === 'passkey' && !isPasswordOnlySetup()
      "
      :readiness="wizard.state.value.passkeyReadiness"
      @use-password-setup="wizard.switchToPasswordSetup()"
    />

    <SetupRecoveryStep v-else v-model:form-data="wizard.formData.value" />

    <div class="flex items-center gap-3">
      <Button
        v-if="wizard.canGoBack.value"
        type="button"
        variant="outline"
        class="flex-1 h-9!"
        size="lg"
        :disabled="wizard.state.value.isLoading || wizard.state.value.success"
        @click="wizard.goBack"
      >
        {{ t("auth.back") }}
      </Button>

      <Button
        v-if="wizard.state.value.currentStep !== 'recovery'"
        type="submit"
        variant="default"
        class="flex-1 h-9!"
        size="lg"
        :disabled="wizard.state.value.isLoading || wizard.state.value.success"
      >
        {{ t("auth.continue") }}
      </Button>

      <Button
        v-else
        type="submit"
        class="flex-1 h-9!"
        variant="default"
        size="lg"
        :disabled="wizard.state.value.isLoading || wizard.state.value.success"
      >
        {{ wizard.state.value.isLoading ? t("auth.creating") : t("auth.createAccount") }}
      </Button>
    </div>
  </form>
</template>
