import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";
import { z } from "zod";
import type { StudioI18n } from "@/i18n";

import {
  SETUP_WIZARD_STEPS,
  SetupAccountStepSchema,
  SetupRecoveryStepSchema,
  SetupWizardDataSchema,
  type SetupMode,
  type SetupWizardData,
  type SetupWizardState,
  type SetupWizardStep,
} from "../schemas/setupWizard";
import { resolveBrowserPasskeyReadiness } from "../utils/passkeyReadiness";

const initialWizardData = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
} satisfies SetupWizardData;

const initialWizardState = {
  currentStep: "account",
  setupMode: "passkey_shell",
  passkeyReadiness: "checking",
  error: null,
  success: false,
  isLoading: false,
} satisfies SetupWizardState;

export interface UseSetupWizardReturn {
  formData: Ref<SetupWizardData>;
  state: Ref<SetupWizardState>;
  currentStepIndex: ComputedRef<number>;
  canGoBack: ComputedRef<boolean>;
  passkeyCanContinue: ComputedRef<boolean>;
  passwordsMatch: ComputedRef<boolean>;
  hasRecoveryInput: ComputedRef<boolean>;
  setError: (message: string) => void;
  clearError: () => void;
  goBack: () => void;
  goToStep: (step: SetupWizardStep) => void;
  validateAccountStep: () => boolean;
  validateRecoveryStep: () => boolean;
  continueFromPasskey: () => void;
  setLoading: (isLoading: boolean) => void;
  setSuccess: (success: boolean) => void;
  switchToPasswordSetup: () => void;
}

function firstValidationMessage(
  error: z.ZodError,
  t: StudioI18n["t"],
): string {
  const issue = error.issues[0];
  if (!issue) return t("auth.invalidForm");

  switch (issue.path[0]) {
    case "username":
      if (issue.code === "too_small") return t("auth.usernameTooShort");
      if (issue.code === "too_big") return t("auth.usernameTooLong");
      return t("auth.usernameInvalid");
    case "email":
      return t("auth.validEmailRequired");
    case "password":
    case "confirmPassword":
      return issue.code === "custom"
        ? t("auth.passwordsDoNotMatch")
        : t("auth.minimumPasswordLength");
    default:
      return t("auth.invalidForm");
  }
}

export function useSetupWizard(
  setupMode: SetupMode = "passkey_shell",
  t: StudioI18n["t"],
): UseSetupWizardReturn {
  const formData = ref<SetupWizardData>({ ...initialWizardData });
  const state = ref<SetupWizardState>({
    ...initialWizardState,
    setupMode,
  });

  const currentStepIndex = computed(() =>
    SETUP_WIZARD_STEPS.indexOf(state.value.currentStep),
  );

  const canGoBack = computed(() => currentStepIndex.value > 0);

  const passkeyCanContinue = computed(() =>
    ["backend_unavailable", "success"].includes(state.value.passkeyReadiness),
  );

  const passwordsMatch = computed(
    () => formData.value.password === formData.value.confirmPassword,
  );

  const hasRecoveryInput = computed(
    () =>
      formData.value.password.length > 0 ||
      formData.value.confirmPassword.length > 0,
  );

  function clearError(): void {
    state.value.error = null;
  }

  function setError(message: string): void {
    state.value.error = message;
  }

  function goToStep(step: SetupWizardStep): void {
    state.value.currentStep = step;
    clearError();
  }

  function goBack(): void {
    const previousStep = SETUP_WIZARD_STEPS[currentStepIndex.value - 1];
    if (!previousStep) return;
    goToStep(previousStep);
  }

  function switchToPasswordSetup(): void {
    state.value.setupMode = "password_legacy";
    goToStep("recovery");
  }

  function validateAccountStep(): boolean {
    clearError();
    const parsed = SetupAccountStepSchema.safeParse({
      username: formData.value.username,
      email: formData.value.email,
    });
    if (!parsed.success) {
      setError(firstValidationMessage(parsed.error, t));
      return false;
    }
    if (state.value.setupMode === "password_legacy") {
      goToStep("recovery");
      return true;
    }
    if (
      state.value.passkeyReadiness === "unsupported" ||
      state.value.passkeyReadiness === "insecure_context"
    ) {
      switchToPasswordSetup();
      return true;
    }
    goToStep("passkey");
    return true;
  }

  function continueFromPasskey(): void {
    clearError();
    if (!passkeyCanContinue.value) {
      setError(t("auth.passkeyUnavailable"));
      return;
    }
    goToStep("recovery");
  }

  function validateRecoveryStep(): boolean {
    clearError();
    const parsed = SetupRecoveryStepSchema.safeParse({
      password: formData.value.password,
      confirmPassword: formData.value.confirmPassword,
    });
    if (!parsed.success) {
      setError(firstValidationMessage(parsed.error, t));
      return false;
    }

    const fullParsed = SetupWizardDataSchema.safeParse(formData.value);
    if (!fullParsed.success) {
      setError(firstValidationMessage(fullParsed.error, t));
      return false;
    }
    return true;
  }

  function setLoading(isLoading: boolean): void {
    state.value.isLoading = isLoading;
  }

  function setSuccess(success: boolean): void {
    state.value.success = success;
  }

  onMounted(() => {
    if (state.value.setupMode !== "passkey_shell") return;
    state.value.passkeyReadiness = resolveBrowserPasskeyReadiness();
  });

  return {
    formData,
    state,
    currentStepIndex,
    canGoBack,
    passkeyCanContinue,
    passwordsMatch,
    hasRecoveryInput,
    setError,
    clearError,
    goBack,
    goToStep,
    validateAccountStep,
    validateRecoveryStep,
    continueFromPasskey,
    setLoading,
    setSuccess,
    switchToPasswordSetup,
  };
}
