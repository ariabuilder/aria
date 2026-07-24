import { z } from "zod";

import { SetupFormBaseSchema, SetupFormSchema } from "../types";

export const SetupWizardStepSchema = z.enum([
  "account",
  "passkey",
  "recovery",
]);
export type SetupWizardStep = z.infer<typeof SetupWizardStepSchema>;

export const SetupModeSchema = z.enum([
  "password_legacy",
  "passkey_shell",
  "passkey_live",
]);
export type SetupMode = z.infer<typeof SetupModeSchema>;

export const PasskeyReadinessSchema = z.enum([
  "checking",
  "unsupported",
  "insecure_context",
  "ready",
  "pending",
  "success",
  "error",
  "backend_unavailable",
]);
export type PasskeyReadiness = z.infer<typeof PasskeyReadinessSchema>;

export const SetupAccountStepSchema = SetupFormBaseSchema.pick({
  username: true,
  email: true,
});
export type SetupAccountStepData = z.infer<typeof SetupAccountStepSchema>;

export const SetupRecoveryStepSchema = SetupFormBaseSchema.pick({
  password: true,
  confirmPassword: true,
});
export type SetupRecoveryStepData = z.infer<typeof SetupRecoveryStepSchema>;

export const SetupWizardDataSchema = SetupFormSchema;
export type SetupWizardData = z.infer<typeof SetupWizardDataSchema>;

export const SetupWizardStateSchema = z
  .object({
    currentStep: SetupWizardStepSchema,
    setupMode: SetupModeSchema,
    passkeyReadiness: PasskeyReadinessSchema,
    error: z.string().nullable(),
    success: z.boolean(),
    isLoading: z.boolean(),
  })
  .strict();
export type SetupWizardState = z.infer<typeof SetupWizardStateSchema>;

export const SETUP_WIZARD_STEPS = [
  "account",
  "passkey",
  "recovery",
] as const satisfies readonly SetupWizardStep[];
