/**
 * Public API for authentication components and composables.
 */

// Page Components (for Astro mounting)
export { default as LoginPage } from "./pages/LoginPage.vue";
export { default as SetupPage } from "./pages/SetupPage.vue";

export { default as LoginForm } from "./components/LoginForm.vue";
export { default as SetupForm } from "./components/SetupForm.vue";
export { default as AuthLayout } from "./components/AuthLayout.vue";
export { default as PasswordInput } from "./components/PasswordInput.vue";
export { default as AuthSecurityView } from "./components/settings/SecurityView.vue";
export { default as AuthUsersView } from "./components/settings/UsersView.vue";

export {
  usePasswordStrength,
  calculatePasswordStrength,
} from "./composables/usePasswordStrength";
export { useLoginShell } from "./composables/useLoginShell";
export { useSetupWizard } from "./composables/useSetupWizard";
export { usePasswordVisibility } from "./composables/usePasswordVisibility";
export {
  loginUser,
  createFirstAdmin,
  checkSetupRequired,
  getCurrentUser,
  logoutUser,
  requestPasswordReset,
  confirmPasswordReset,
} from "./composables/useAuthApi";
export { useUser, patchSessionUser, syncSessionUserIfSelf, isSessionUserId } from "./composables/useUser";
export type { UseUserReturn } from "./composables/useUser";

export type {
  LoginFormData,
  SetupFormData,
  PasswordResetRequestFormData,
  PasswordResetConfirmActionData,
  PasswordResetConfirmFormData,
  LoginResponse,
  SetupResponse,
  PasswordResetRequestResponse,
  PasswordResetConfirmResponse,
  PasswordStrength,
  PasswordStrengthResult,
  AuthFormState,
  LoginFormState,
  SetupFormState,
} from "./types";

export {
  LoginFormSchema,
  SetupFormSchema,
  PasswordResetRequestFormSchema,
  PasswordResetConfirmActionSchema,
  PasswordResetConfirmFormSchema,
} from "./types";

export {
  LoginShellStateSchema,
  MagicLinkAvailabilitySchema,
} from "./schemas/loginShell";
export type { LoginShellState, MagicLinkAvailability } from "./schemas/loginShell";

export {
  PasskeyReadinessSchema,
  SetupAccountStepSchema,
  SetupModeSchema,
  SetupRecoveryStepSchema,
  SetupWizardDataSchema,
  SetupWizardStateSchema,
  SetupWizardStepSchema,
} from "./schemas/setupWizard";
export type {
  PasskeyReadiness,
  SetupAccountStepData,
  SetupMode,
  SetupRecoveryStepData,
  SetupWizardData,
  SetupWizardState,
  SetupWizardStep,
} from "./schemas/setupWizard";
