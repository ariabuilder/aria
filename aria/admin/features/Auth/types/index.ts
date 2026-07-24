/**
 * Auth Feature Types
 *
 * Type-safe definitions for authentication forms and API responses.
 */

import { z } from "zod";
import { SessionUserSchema } from "../../../../lib/auth/types";

// FORM SCHEMAS (Zod)

export const LoginFormSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
  captchaToken: z.string().min(1).max(2048).optional(),
  totpCode: z
    .string()
    .length(6, "Code must be 6 digits")
    .or(z.literal(""))
    .optional(),
});

export const SetupFormBaseSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        "Username must start with a letter and contain only letters, numbers, and underscores",
      ),
    email: z.email(),
    password: z.string().min(7, "Password must be at least 7 characters"),
    confirmPassword: z.string().min(7, "Please confirm your password"),
  })
  .strict();

export const SetupFormSchema = SetupFormBaseSchema.refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  },
);

export const PasswordResetRequestFormSchema = z.object({
  email: z.email("A valid email address is required"),
});

export const PasswordResetConfirmActionSchema = z
  .object({
    token: z.string().trim().min(1, "Reset token is required"),
    newPassword: z.string().min(7, "Password must be at least 7 characters"),
  })
  .strict();

export const PasswordResetConfirmFormSchema =
  PasswordResetConfirmActionSchema.extend({
    confirmPassword: z.string().min(7, "Please confirm your password"),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// FORM TYPES (derived from schemas)

export type LoginFormData = z.infer<typeof LoginFormSchema>;
export type SetupFormData = z.infer<typeof SetupFormSchema>;
export type PasswordResetRequestFormData = z.infer<
  typeof PasswordResetRequestFormSchema
>;
export type PasswordResetConfirmActionData = z.infer<
  typeof PasswordResetConfirmActionSchema
>;
export type PasswordResetConfirmFormData = z.infer<
  typeof PasswordResetConfirmFormSchema
>;

export type LoginStatus =
  | "success"
  | "error"
  | "totp_required"
  | "totp_setup_required";

export const LoginResponseSchema = z
  .object({
    status: z.enum([
      "success",
      "error",
      "totp_required",
      "totp_setup_required",
    ]),
    message: z.string().optional(),
    remainingAttempts: z.int().nonnegative().optional(),
    user: SessionUserSchema.optional(),
  })
  .strict();

export interface LoginResponse {
  status: LoginStatus;
  message?: string;
  remainingAttempts?: number;
  user?: z.infer<typeof SessionUserSchema>;
}

export const SetupResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    user: SessionUserSchema.optional(),
  })
  .strict();

export interface SetupResponse {
  success: boolean;
  message?: string;
  user?: z.infer<typeof SessionUserSchema>;
}

export const PasswordResetRequestResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .strict();

export interface PasswordResetRequestResponse {
  success: boolean;
  message?: string;
}

export const PasswordResetConfirmResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .strict();

export interface PasswordResetConfirmResponse {
  success: boolean;
  message?: string;
}

export type PasswordStrength = "weak" | "medium" | "strong";

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number;
  feedback: string[];
}

export interface AuthFormState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

export interface LoginFormState extends AuthFormState {
  showTotpInput: boolean;
}

export interface SetupFormState extends AuthFormState {
  passwordStrength: PasswordStrength;
}
