import { defineAction } from "astro:actions";
import {
  UpdateTwoFactorPolicyInputSchema,
  type TwoFactorPolicy,
  CONFIG_KEYS,
  getAuthAdapterAsync,
  requireAdmin,
} from "../../lib/auth";

export const getTwoFactorPolicy = defineAction({
  handler: async (_, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const config = await adapter.getConfig<TwoFactorPolicy>(
      CONFIG_KEYS.TWO_FACTOR_POLICY,
    );

    return {
      enforce: config?.enforce ?? false,
    };
  },
});

/**
 * Update two-factor authentication enforcement policy
 *
 * Admin only - enable or disable 2FA enforcement for all users.
 */

export const updateTwoFactorPolicy = defineAction({
  input: UpdateTwoFactorPolicyInputSchema,
  handler: async (input, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const policy: TwoFactorPolicy = {
      enforce: input.enforce,
    };

    await adapter.setConfig(CONFIG_KEYS.TWO_FACTOR_POLICY, policy);

    return { success: true };
  },
});

// ADMIN TOTP MANAGEMENT (Per-user TOTP actions)

/**
 * Admin: Initialize TOTP setup for a target user
 *
 * Generates a TOTP secret and backup codes for the given user.
 * The admin can then scan the QR code or share the secret with the user.
 */
