import { defineAction, ActionError } from "astro:actions";
import {
  EnableTotpInputSchema,
  DisableTotpInputSchema,
  AdminInitTotpInputSchema,
  AdminEnableTotpInputSchema,
  AdminDisableTotpInputSchema,
  AdminRegenerateBackupCodesInputSchema,
  getAuthAdapterAsync,
  verifyPassword,
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  requireAuth,
  requireAdmin,
} from "../../lib/auth";

export const initTotp = defineAction({
  handler: async (_, context) => {
    const user = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    // Check if already enabled
    if (user.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is already enabled",
      });
    }

    // If a previous setup was abandoned, clear its stale state and proceed
    const userRecord = await adapter.getUserByUsername(user.username);
    if (userRecord?.totpSecret) {
      await adapter.updateUser(user.id, {
        totpSecret: null,
        backupCodes: null,
        backupCodesUsed: null,
      });
    }

    // Generate secret and backup codes (generateTotpSecret includes backup codes)
    const totpSetup = await generateTotpSecret(user.username);

    // Store secret temporarily (not enabled yet)
    await adapter.updateUser(user.id, {
      totpSecret: totpSetup.secret,
      backupCodes: JSON.stringify(totpSetup.backupCodesHashed),
      backupCodesUsed: JSON.stringify([]),
      totpEnabled: false,
    });

    return {
      secret: totpSetup.secret,
      qrCodeUrl: totpSetup.qrCodeUrl,
      backupCodes: totpSetup.backupCodes, // plaintext shown to user once
    };
  },
});

/**
 * Enable TOTP (confirm setup)
 *
 * Verifies the TOTP code and enables 2FA.
 */

export const enableTotp = defineAction({
  input: EnableTotpInputSchema,
  handler: async (input, context) => {
    const user = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    // Get the pending secret
    const userRecord = await adapter.getUserByUsername(user.username);
    if (!userRecord?.totpSecret) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "TOTP setup not initialized. Call initTotp first.",
      });
    }

    if (userRecord.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is already enabled",
      });
    }

    // Verify the code
    const isValid = verifyTotpCode(userRecord.totpSecret, input.code);
    if (!isValid) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Invalid verification code. Please try again.",
      });
    }

    await adapter.updateUser(user.id, { totpEnabled: true });

    return { success: true, message: "Two-factor authentication enabled" };
  },
});

/**
 * Disable TOTP
 *
 * Requires password confirmation for security.
 */

export const disableTotp = defineAction({
  input: DisableTotpInputSchema,
  handler: async (input, context) => {
    const user = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const userRecord = await adapter.getUserByUsername(user.username);
    if (!userRecord) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if (!userRecord.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is not enabled",
      });
    }

    const isValid = await verifyPassword(
      input.password,
      userRecord.passwordHash,
    );
    if (!isValid) {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "Password is incorrect",
      });
    }

    await adapter.updateUser(user.id, {
      totpEnabled: false,
      totpSecret: null,
      backupCodes: null,
      backupCodesUsed: null,
    });

    return { success: true, message: "Two-factor authentication disabled" };
  },
});

/**
 * Regenerate backup codes
 *
 * Generates new backup codes for the current user.
 * Old codes are invalidated.
 */

export const regenerateBackupCodes = defineAction({
  handler: async (_, context) => {
    const user = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const userRecord = await adapter.getUserByUsername(user.username);
    if (!userRecord) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if (!userRecord.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is not enabled",
      });
    }

    // Generate new backup codes (returns { plaintext, hashed })
    const { plaintext, hashed } = await generateBackupCodes();

    await adapter.updateUser(user.id, {
      backupCodes: JSON.stringify(hashed),
      backupCodesUsed: JSON.stringify([]),
    });

    // Return plaintext codes for user to save
    return { backupCodes: plaintext };
  },
});

// ADMIN ACTIONS (Require Admin Role)

/**
 * List all users
 *
 * Admin only - returns all users in the system.
 */

export const adminInitTotp = defineAction({
  input: AdminInitTotpInputSchema,
  handler: async (input, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const targetUser = await adapter.getUserById(input.userId);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if (targetUser.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is already enabled for this user",
      });
    }

    // If a previous setup was abandoned, clear its stale state and proceed
    const userRecord = await adapter.getUserByUsername(targetUser.username);
    if (userRecord?.totpSecret) {
      await adapter.updateUser(input.userId, {
        totpSecret: null,
        backupCodes: null,
        backupCodesUsed: null,
      });
    }

    const totpSetup = await generateTotpSecret(targetUser.username);

    // Store secret temporarily (not enabled yet)
    await adapter.updateUser(input.userId, {
      totpSecret: totpSetup.secret,
      backupCodes: JSON.stringify(totpSetup.backupCodesHashed),
      backupCodesUsed: JSON.stringify([]),
      totpEnabled: false,
    });

    return {
      secret: totpSetup.secret,
      qrCodeUrl: totpSetup.qrCodeUrl,
      backupCodes: totpSetup.backupCodes,
    };
  },
});

/**
 * Admin: Enable TOTP for a target user
 *
 * Verifies the TOTP code and enables 2FA for the given user.
 */

export const adminEnableTotp = defineAction({
  input: AdminEnableTotpInputSchema,
  handler: async (input, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const targetUser = await adapter.getUserById(input.userId);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Get full user record for the secret
    const userRecord = await adapter.getUserByUsername(targetUser.username);
    if (!userRecord?.totpSecret) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "TOTP setup not initialized. Call adminInitTotp first.",
      });
    }

    if (userRecord.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is already enabled for this user",
      });
    }

    // Verify the code
    const isValid = verifyTotpCode(userRecord.totpSecret, input.code);
    if (!isValid) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Invalid TOTP code",
      });
    }

    await adapter.updateUser(input.userId, { totpEnabled: true });

    return { success: true, message: "Two-factor authentication enabled" };
  },
});

/**
 * Admin: Disable TOTP for a target user
 *
 * Disables 2FA and clears TOTP secrets/backup codes for the given user.
 */

export const adminDisableTotp = defineAction({
  input: AdminDisableTotpInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    // Verify admin's password before disabling 2FA for a user
    const adminRecord = await adapter.getUserByUsername(currentUser.username);
    if (!adminRecord) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Admin user not found",
      });
    }
    const passwordValid = await verifyPassword(
      input.password,
      adminRecord.passwordHash,
    );
    if (!passwordValid) {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "Password is incorrect",
      });
    }

    const targetUser = await adapter.getUserById(input.userId);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if (!targetUser.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Two-factor authentication is not enabled for this user",
      });
    }

    await adapter.updateUser(input.userId, {
      totpEnabled: false,
      totpSecret: null,
      backupCodes: null,
      backupCodesUsed: null,
    });

    return {
      success: true,
      message: "Two-factor authentication disabled",
    };
  },
});

/**
 * Admin: Regenerate backup codes for a target user
 *
 * Generates new backup codes for the given user (must have 2FA enabled).
 */

export const adminRegenerateBackupCodes = defineAction({
  input: AdminRegenerateBackupCodesInputSchema,
  handler: async (input, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const targetUser = await adapter.getUserById(input.userId);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if (!targetUser.totpEnabled) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message:
          "Cannot regenerate backup codes: 2FA is not enabled for this user",
      });
    }

    const { plaintext, hashed } = await generateBackupCodes();

    await adapter.updateUser(input.userId, {
      backupCodes: JSON.stringify(hashed),
      backupCodesUsed: JSON.stringify([]),
    });

    return { backupCodes: plaintext };
  },
});
