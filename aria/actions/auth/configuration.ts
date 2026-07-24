import { defineAction } from "astro:actions";
import {
  UpdateAuthMethodsConfigInputSchema,
  AuthMethodsConfigSchema,
  CONFIG_KEYS,
  getAuthAdapterAsync,
  getAuthMethodsConfig,
  requireCapability,
} from "../../lib/auth";

export const updateAuthMethodsConfig = defineAction({
  input: UpdateAuthMethodsConfigInputSchema,
  handler: async (input, context) => {
    await requireCapability(context, "manageSecurity");
    const adapter = await getAuthAdapterAsync(context.locals);
    const current = await getAuthMethodsConfig(adapter, {
      requestUrl: context.request.url,
      persistDefaultOrigins: false,
    });

    const next = AuthMethodsConfigSchema.parse({
      ...current,
      ...(input.passkey
        ? {
            passkey: input.passkey,
          }
        : {}),
    });

    await adapter.setConfig(CONFIG_KEYS.AUTH_METHODS, next);

    return { success: true, config: next };
  },
});

/**
 * Get modern auth method configuration.
 *
 * Requires manageSecurity. Includes non-secret settings.
 */

export const getAuthMethodsConfigAction = defineAction({
  handler: async (_, context) => {
    await requireCapability(context, "manageSecurity");
    const adapter = await getAuthAdapterAsync(context.locals);
    const config = await getAuthMethodsConfig(adapter, {
      requestUrl: context.request.url,
      persistDefaultOrigins: false,
    });

    return { config: AuthMethodsConfigSchema.parse(config) };
  },
});

// TWO-FACTOR POLICY (Site-wide enforcement)

/**
 * Get two-factor authentication enforcement policy
 *
 * Admin only - retrieve current 2FA enforcement setting.
 */
