import { z } from "zod";

import { log } from "@/lib/utils/logger";
import {
  CaptchaProviderSchema,
  AuthMethodsConfigSchema,
  ListUsersResponseSchema,
  TotpSetupResponseSchema,
  UserSchema,
} from "../../../../lib/auth/types";

interface AuthTransportErrorLike {
  message?: string;
}

interface AuthTransportResult {
  data?: unknown;
  error?: AuthTransportErrorLike | null;
}

const AuthCurrentUserSchema = z.object({
  user: UserSchema,
});

const AuthCaptchaConfigSchema = z.object({
  provider: CaptchaProviderSchema,
  siteKey: z.string().optional(),
  allowedHostnames: z.array(z.string()),
  secretConfigured: z.boolean(),
  managedByAria: z.boolean(),
  managedProvisioningConfigured: z.boolean(),
  managedApiTokenConfigured: z.boolean(),
  managedEncryptionConfigured: z.boolean(),
});

const AuthCreateTurnstileWidgetSchema = z.object({
  success: z.literal(true),
  provider: z.literal("turnstile"),
  siteKey: z.string().min(1),
  allowedHostnames: z.array(z.string()),
});

const AuthSuccessSchema = z.object({
  success: z.literal(true),
});

const AuthMessageSuccessSchema = AuthSuccessSchema.extend({
  message: z.string(),
});

const AuthBackupCodesSchema = z.object({
  backupCodes: z.array(z.string()),
});

const AuthTwoFactorPolicySchema = z.object({
  enforce: z.boolean(),
});

const AuthMethodsConfigResultSchema = z.object({
  config: AuthMethodsConfigSchema,
});

const AuthUserMutationSchema = AuthSuccessSchema.extend({
  user: UserSchema,
  sessionInvalidated: z.boolean().optional(),
});

function getTransportErrorMessage(
  result: AuthTransportResult,
  fallback: string,
): string {
  return result.error?.message ?? fallback;
}

function unwrapAuthResult<TSchema extends z.ZodTypeAny>(
  result: AuthTransportResult,
  schema: TSchema,
  fallback: string,
  invalidMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<TSchema> }
  | { success: false; error: string } {
  if (result.error || !result.data) {
    return {
      success: false,
      error: getTransportErrorMessage(result, fallback),
    };
  }

  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    log("warn", invalidMessage, {
      issues: parsed.error.issues,
      ...context,
    });

    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export function unwrapAuthCurrentUserResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthCurrentUserSchema,
    "Failed to load current user",
    "[AuthSettings] Invalid getMe response",
    context,
  );
}

export function unwrapAuthCaptchaConfigResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthCaptchaConfigSchema,
    "Failed to load CAPTCHA settings",
    "[AuthSettings] Invalid getCaptchaConfig response",
    context,
  );
}

export function unwrapAuthCreateTurnstileWidgetResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthCreateTurnstileWidgetSchema,
    "Failed to create Turnstile login protection",
    "[AuthSettings] Invalid createTurnstileWidget response",
    context,
  );
}

export function unwrapAuthTotpSetupResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    TotpSetupResponseSchema,
    "Failed to start 2FA setup",
    "[AuthSettings] Invalid initTotp response",
    context,
  );
}

export function unwrapAuthMessageSuccessResult(
  result: AuthTransportResult,
  fallback: string,
  invalidMessage: string,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthMessageSuccessSchema,
    fallback,
    invalidMessage,
    context,
  );
}

export function unwrapAuthSuccessResult(
  result: AuthTransportResult,
  fallback: string,
  invalidMessage: string,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthSuccessSchema,
    fallback,
    invalidMessage,
    context,
  );
}

export function unwrapAuthBackupCodesResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthBackupCodesSchema,
    "Failed to regenerate backup codes",
    "[AuthSettings] Invalid regenerateBackupCodes response",
    context,
  );
}

export function unwrapAuthUsersListResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    ListUsersResponseSchema,
    "Failed to load users",
    "[AuthSettings] Invalid listUsers response",
    context,
  );
}

export function unwrapAuthUserMutationResult(
  result: AuthTransportResult,
  fallback: string,
  invalidMessage: string,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthUserMutationSchema,
    fallback,
    invalidMessage,
    context,
  );
}

export function unwrapAuthTwoFactorPolicyResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthTwoFactorPolicySchema,
    "Failed to load 2FA policy",
    "[AuthSettings] Invalid getTwoFactorPolicy response",
    context,
  );
}

export function unwrapAuthMethodsConfigResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthMethodsConfigResultSchema,
    "Failed to load auth methods",
    "[AuthSettings] Invalid getAuthMethodsConfigAction response",
    context,
  );
}

export function unwrapAuthMethodsConfigMutationResult(
  result: AuthTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapAuthResult(
    result,
    AuthSuccessSchema.extend({ config: AuthMethodsConfigSchema }),
    "Failed to save auth methods",
    "[AuthSettings] Invalid updateAuthMethodsConfig response",
    context,
  );
}
