import { defineAction, ActionError } from "astro:actions";
import {
  ChangePasswordInputSchema,
  RequestPasswordResetInputSchema,
  ConfirmPasswordResetInputSchema,
  PASSWORD_RESET_EXPIRY_MS,
  getAuthAdapterAsync,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  now,
  requireAuth,
} from "../../lib/auth";
import { getEmailRepositoryAsync } from "../../lib/email/getEmailRepository";
import { createEmailService } from "../../lib/email/service";
import { resolveEmailSiteContext } from "../../lib/email/siteScope";
import { generateId } from "./_shared";

export const requestPasswordReset = defineAction({
  input: RequestPasswordResetInputSchema,
  handler: async (input, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);

    const user = await adapter.getUserByEmail(input.email);

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        message: "If that email exists, a reset link has been sent.",
      };
    }

    // Delete any existing reset tokens for this user
    await adapter.deleteUserPasswordResets(user.id);

    const token = generateSecureToken();
    const tokenHash = await hashToken(token);

    const resetId = generateId();
    await adapter.createPasswordReset({
      id: resetId,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS).toISOString(),
      createdAt: now(),
    });

    const resetUrl = new URL("/admin/reset-password", context.request.url);
    resetUrl.searchParams.set("token", token);
    try {
      const emailRepository = await getEmailRepositoryAsync(context.locals);
      const emailService = createEmailService(emailRepository, context.locals);
      const { siteId } = resolveEmailSiteContext(context.locals);
      await emailService.enqueueSystem({
        siteId,
        purpose: "system",
        templateKey: "password_reset",
        variables: {
          username: user.username,
          resetUrl: resetUrl.toString(),
          expiresInMinutes: Math.round(PASSWORD_RESET_EXPIRY_MS / 60_000),
        },
        to: [user.email],
        idempotencyKey: `auth:password-reset:${resetId}`,
        createdByUserId: user.id,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "auth.password_reset_email_enqueue_failed",
          resetId,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }

    return {
      success: true,
      message: "If that email exists, a reset link has been sent.",
    };
  },
});

/**
 * Confirm password reset with token
 *
 * Validates the reset token and sets a new password.
 */

export const confirmPasswordReset = defineAction({
  input: ConfirmPasswordResetInputSchema,
  handler: async (input, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);

    // Hash the token to look it up
    const tokenHash = await hashToken(input.token);
    const resetRecord = await adapter.getPasswordResetByTokenHash(tokenHash);

    if (!resetRecord) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Invalid or expired reset token",
      });
    }

    const passwordHash = await hashPassword(input.newPassword);
    await adapter.updateUser(resetRecord.userId, { passwordHash });

    // Delete the used token
    await adapter.deletePasswordReset(resetRecord.id);

    // Invalidate all sessions for security
    await adapter.deleteUserSessions(resetRecord.userId);

    return {
      success: true,
      message: "Password has been reset. Please log in.",
    };
  },
});

// AUTHENTICATED ACTIONS (Require Login)

/**
 * Get current user info
 *
 * Returns the currently authenticated user.
 */

export const changePassword = defineAction({
  input: ChangePasswordInputSchema,
  handler: async (input, context) => {
    const user = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    // Get full user record with password hash
    const userRecord = await adapter.getUserByUsername(user.username);
    if (!userRecord) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const isValid = await verifyPassword(
      input.currentPassword,
      userRecord.passwordHash,
    );
    if (!isValid) {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "Current password is incorrect",
      });
    }

    const passwordHash = await hashPassword(input.newPassword);
    await adapter.updateUser(user.id, { passwordHash });

    return { success: true, message: "Password changed successfully" };
  },
});

// 2FA ACTIONS (Require Login)

/**
 * Initialize TOTP setup
 *
 * Generates a TOTP secret and backup codes (not yet enabled).
 * User must call enableTotp with a valid code to confirm.
 */
