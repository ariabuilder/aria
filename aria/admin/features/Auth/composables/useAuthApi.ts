/**
 * Type-safe wrapper for authentication API calls. Handles Astro action response format.
 */

import { z } from "zod";
import { actions } from "astro:actions";
import type {
  LoginFormData,
  SetupFormData,
  LoginResponse,
  SetupResponse,
  PasswordResetRequestFormData,
  PasswordResetConfirmActionData,
  PasswordResetRequestResponse,
  PasswordResetConfirmResponse,
} from "../types";
import {
  LoginResponseSchema,
  SetupResponseSchema,
  PasswordResetRequestFormSchema,
  PasswordResetConfirmActionSchema,
  PasswordResetRequestResponseSchema,
  PasswordResetConfirmResponseSchema,
} from "../types";
import {
  SessionUserSchema,
  BeginPasskeySetupResponseSchema,
  PasskeyLoginOptionsResponseSchema,
  PublicAuthMethodsAvailabilitySchema,
  type AuthenticationResponseJSONInput,
  type BeginPasskeySetupResponse,
  type PasskeyLoginOptionsResponse,
  type PublicAuthMethodsAvailability,
  type RegistrationResponseJSONInput,
  type SessionUser,
} from "../../../../lib/auth/types";
import { log } from "@/lib/utils/logger";

const ActionErrorSchema = z
  .object({
    message: z.string().optional(),
  })
  .strict();

const CheckSetupRequiredResponseSchema = z
  .object({
    setupRequired: z.boolean(),
  })
  .strict();

const LogoutResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();

const GetCurrentUserResponseSchema = z
  .object({
    error: ActionErrorSchema.optional(),
    user: z.unknown().optional(),
  })
  .strict();

function unwrapActionEnvelope<T>(value: unknown): {
  data?: T;
  error?: { message: string; code?: string };
} {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const response = value as { data?: unknown; error?: unknown };

    if (response.error) {
      const error = response.error;
      const message =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "Unknown error";
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;
      return { error: { message, code } };
    }

    if ("data" in response) {
      return { data: response.data as T };
    }
  }

  return { data: value as T };
}

function parseActionData<T>(
  response: unknown,
  schema: z.ZodType<T>,
): { data?: T; error?: string; errorCode?: string } {
  const parsedTransport = unwrapActionEnvelope<unknown>(response);
  if (parsedTransport.error) {
    return {
      error: parsedTransport.error.message,
      errorCode: parsedTransport.error.code,
    };
  }

  const parsedData = schema.safeParse(parsedTransport.data);
  if (!parsedData.success) {
    return { error: "Invalid action response" };
  }

  return { data: parsedData.data };
}

export async function loginUser(
  formData: LoginFormData,
): Promise<{ data?: LoginResponse; error?: string }> {
  try {
    const response = await actions.auth.login({
      identifier: formData.identifier,
      password: formData.password,
      rememberMe: formData.rememberMe,
      captchaToken: formData.captchaToken,
      totpCode: formData.totpCode || undefined,
    });
    const result = parseActionData(response, LoginResponseSchema);

    if (result.error) {
      return { error: result.error };
    }

    if (result.data?.status === "error") {
      let message = result.data.message || "Login failed";
      if (result.data.remainingAttempts !== undefined) {
        message += ` (${result.data.remainingAttempts} attempts remaining)`;
      }
      return { error: message };
    }

    if (result.data?.status === "totp_setup_required") {
      return {
        error:
          result.data.message ||
          "Two-factor authentication setup is required for this account",
      };
    }

    return { data: result.data };
  } catch (err) {
    log("error", "[Auth] Login error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export type LoginCaptchaConfig =
  | { enabled: false }
  | { enabled: true; provider: "turnstile"; siteKey: string };

const LoginCaptchaConfigSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    provider: z.literal("turnstile"),
    siteKey: z.string().min(1),
  }),
]);

/** Retrieve the public configuration needed to render a login challenge. */
export async function getLoginCaptchaConfig(): Promise<{
  data?: LoginCaptchaConfig;
  error?: string;
}> {
  try {
    const response = await actions.auth.getLoginCaptchaConfig({});
    return parseActionData(response, LoginCaptchaConfigSchema);
  } catch {
    return { error: "Unable to load login protection" };
  }
}

export async function createFirstAdmin(
  formData: SetupFormData,
): Promise<{ data?: SetupResponse; error?: string }> {
  try {
    const response = await actions.auth.createFirstAdmin({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
    });
    const result = parseActionData(response, SetupResponseSchema);

    if (result.error) {
      return { error: result.error };
    }

    if (result.data && !result.data.success) {
      return { error: result.data.message || "Failed to create account" };
    }

    return { data: result.data };
  } catch (err) {
    log("error", "[Auth] Setup error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export async function beginPasskeySetup(
  formData: Pick<SetupFormData, "username" | "email">,
): Promise<{ data?: BeginPasskeySetupResponse; error?: string }> {
  try {
    const response = await actions.auth.beginPasskeySetup({
      username: formData.username,
      email: formData.email,
    });
    return parseActionData(response, BeginPasskeySetupResponseSchema);
  } catch (err: unknown) {
    log("error", "[Auth] Begin passkey setup error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export async function completePasskeySetup(input: {
  pendingSetupId: string;
  challengeId: string;
  response: RegistrationResponseJSONInput;
  password: string;
  confirmPassword: string;
  deviceName?: string | null;
}): Promise<{ data?: SetupResponse; error?: string }> {
  try {
    const response = await actions.auth.completePasskeySetup(input);
    const result = parseActionData(response, SetupResponseSchema);

    if (result.error) {
      return { error: result.error };
    }

    if (result.data && !result.data.success) {
      return { error: result.data.message || "Failed to create account" };
    }

    return { data: result.data };
  } catch (err: unknown) {
    log("error", "[Auth] Complete passkey setup error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export async function passkeyLoginOptions(
  identifier?: string,
): Promise<{ data?: PasskeyLoginOptionsResponse; error?: string }> {
  try {
    const response = await actions.auth.passkeyLoginOptions({
      identifier: identifier || undefined,
    });
    return parseActionData(response, PasskeyLoginOptionsResponseSchema);
  } catch (err: unknown) {
    log("error", "[Auth] Passkey options error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export async function passkeyLoginVerify(input: {
  challengeId: string;
  response: AuthenticationResponseJSONInput;
  rememberMe: boolean;
}): Promise<{ data?: LoginResponse; error?: string }> {
  try {
    const response = await actions.auth.passkeyLoginVerify(input);
    const result = parseActionData(response, LoginResponseSchema);

    if (result.error) {
      return { error: result.error };
    }

    if (result.data?.status === "error") {
      let message = result.data.message || "Passkey sign-in failed";
      if (result.data.remainingAttempts !== undefined) {
        message += ` (${result.data.remainingAttempts} attempts remaining)`;
      }
      return { error: message };
    }

    return { data: result.data };
  } catch (err: unknown) {
    log("error", "[Auth] Passkey verify error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Check if setup is required (no users exist)
 */
export async function checkSetupRequired(): Promise<boolean> {
  try {
    const response = await actions.auth.checkSetupRequired({});
    const result = parseActionData(response, CheckSetupRequiredResponseSchema);

    return result.data?.setupRequired ?? false;
  } catch {
    // If we can't check, assume setup is not required
    return false;
  }
}

export async function getAuthMethodAvailability(): Promise<{
  data?: PublicAuthMethodsAvailability;
  error?: string;
}> {
  try {
    const response = await actions.auth.getAuthMethodAvailability({});
    return parseActionData(response, PublicAuthMethodsAvailabilitySchema);
  } catch (err: unknown) {
    log("error", "[Auth] Auth method availability error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Logout the current user and clear the active session cookie.
 */
export async function logoutUser(): Promise<
  { success: true } | { error: string }
> {
  try {
    const response = await actions.auth.logout({});
    const result = parseActionData(response, LogoutResponseSchema);

    if (result.error || !result.data) {
      return { error: result.error ?? "Failed to log out" };
    }

    return { success: true };
  } catch (err) {
    log("error", "[Auth] Logout error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export async function getCurrentUser(): Promise<{
  data?: SessionUser | null;
  error?: string;
}> {
  try {
    const response = await actions.auth.getMe({});
    const result = parseActionData(response, GetCurrentUserResponseSchema);

    if (result.error) {
      if (
        result.errorCode === "UNAUTHORIZED" ||
        result.errorCode === "NOT_FOUND"
      ) {
        return { data: null };
      }
      return { error: result.error };
    }

    if (result.data?.error) {
      return { error: result.data.error.message || "Failed to fetch user" };
    }

    if (!result.data?.user) {
      return { data: null };
    }

    const parsedUser = SessionUserSchema.safeParse(result.data.user);
    if (!parsedUser.success) {
      return { error: "Invalid user payload" };
    }

    return { data: parsedUser.data };
  } catch (err) {
    log("error", "[Auth] Get current user error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

export async function requestPasswordReset(
  formData: PasswordResetRequestFormData,
): Promise<{ data?: PasswordResetRequestResponse; error?: string }> {
  const parsedInput = PasswordResetRequestFormSchema.safeParse(formData);
  if (!parsedInput.success) {
    return {
      error:
        parsedInput.error.issues[0]?.message ??
        "A valid email address is required",
    };
  }

  try {
    const response = await actions.auth.requestPasswordReset(parsedInput.data);
    const result = parseActionData(response, PasswordResetRequestResponseSchema);

    if (result.error) {
      return { error: result.error };
    }

    return { data: result.data };
  } catch (err) {
    log("error", "[Auth] Request password reset error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Confirm a password reset using the token from the email link.
 */
export async function confirmPasswordReset(
  formData: PasswordResetConfirmActionData,
): Promise<{ data?: PasswordResetConfirmResponse; error?: string }> {
  const parsedInput = PasswordResetConfirmActionSchema.safeParse(formData);
  if (!parsedInput.success) {
    return {
      error:
        parsedInput.error.issues[0]?.message ??
        "A valid reset token and password are required",
    };
  }

  try {
    const response = await actions.auth.confirmPasswordReset(parsedInput.data);
    const result = parseActionData(response, PasswordResetConfirmResponseSchema);

    if (result.error) {
      return { error: result.error };
    }

    return { data: result.data };
  } catch (err) {
    log("error", "[Auth] Confirm password reset error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "An unexpected error occurred" };
  }
}
