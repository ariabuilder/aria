import { defineAction, ActionError } from "astro:actions";
import {
  UpdateCaptchaConfigInputSchema,
  CreateTurnstileWidgetInputSchema,
  type CaptchaConfig,
  CONFIG_KEYS,
  getAuthAdapterAsync,
  getClientIp,
  validateCaptchaConfig,
  TurnstileSecretCipher,
  logAuthEvent,
  requireCapability,
} from "../../lib/auth";
import { getStringRuntimeSetting } from "../../lib/cloudflare/env";
import {
  createManagedTurnstileWidget,
  deleteTurnstileWidget,
  resolveTurnstileAccountId,
} from "../../lib/cloudflare/turnstile";
import { getTurnstileSecret, loadCaptchaConfig } from "./_captcha";

export const updateCaptchaConfig = defineAction({
  input: UpdateCaptchaConfigInputSchema,
  handler: async (input, context) => {
    await requireCapability(context, "manageSecurity");
    const adapter = await getAuthAdapterAsync(context.locals);

    const config: CaptchaConfig = {
      provider: input.provider,
      siteKey: input.siteKey?.trim() || undefined,
      allowedHostnames: input.allowedHostnames,
      managedByAria: false,
    };
    const validation = validateCaptchaConfig(config);
    if (!validation.valid) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: validation.error!,
      });
    }
    if (
      config.provider === "turnstile" &&
      !(await getTurnstileSecret(adapter, config, context.locals))
    ) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message:
          "A Turnstile verification secret must be configured before enabling login protection",
      });
    }

    await adapter.setConfig(CONFIG_KEYS.CAPTCHA, config);

    return { success: true };
  },
});

/**
 * Get CAPTCHA configuration
 *
 * Admin only - retrieve current CAPTCHA settings (without secret key).
 */

export const getCaptchaConfig = defineAction({
  handler: async (_, context) => {
    await requireCapability(context, "manageSecurity");
    const adapter = await getAuthAdapterAsync(context.locals);
    const config = await loadCaptchaConfig(adapter);

    return {
      provider: config.provider,
      siteKey: config.siteKey,
      allowedHostnames: config.allowedHostnames,
      secretConfigured: Boolean(
        await getTurnstileSecret(adapter, config, context.locals),
      ),
      managedByAria: config.managedByAria,
      managedProvisioningConfigured: Boolean(
        getStringRuntimeSetting(
          "ARIA_CLOUDFLARE_API_TOKEN",
          context.locals,
        )?.trim() &&
        getStringRuntimeSetting(
          "ARIA_TURNSTILE_ENCRYPTION_KEY_V1",
          context.locals,
        )?.trim(),
      ),
      managedApiTokenConfigured: Boolean(
        getStringRuntimeSetting(
          "ARIA_CLOUDFLARE_API_TOKEN",
          context.locals,
        )?.trim(),
      ),
      managedEncryptionConfigured: Boolean(
        getStringRuntimeSetting(
          "ARIA_TURNSTILE_ENCRYPTION_KEY_V1",
          context.locals,
        )?.trim(),
      ),
    };
  },
});

/** Public, non-secret configuration used to render the login widget. */

export const getLoginCaptchaConfig = defineAction({
  handler: async (_, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const config = await loadCaptchaConfig(adapter);
    const enabled =
      config.provider === "turnstile" &&
      Boolean(config.siteKey) &&
      config.allowedHostnames.length > 0 &&
      Boolean(await getTurnstileSecret(adapter, config, context.locals));

    return enabled
      ? {
          enabled: true as const,
          provider: "turnstile" as const,
          siteKey: config.siteKey!,
        }
      : { enabled: false as const };
  },
});

/**
 * Creates a managed Turnstile widget with the platform-owned Cloudflare token.
 * The token and the provider secret never leave the Worker.
 */

export const createTurnstileWidget = defineAction({
  input: CreateTurnstileWidgetInputSchema,
  handler: async (input, context) => {
    const actor = await requireCapability(context, "manageSecurity");
    const adapter = await getAuthAdapterAsync(context.locals);
    const apiToken = getStringRuntimeSetting(
      "ARIA_CLOUDFLARE_API_TOKEN",
      context.locals,
    )?.trim();
    if (!apiToken) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message:
          "Managed Turnstile setup is unavailable until the platform owner configures the Cloudflare API token in this Worker",
      });
    }

    let accountId: string;
    try {
      accountId = await resolveTurnstileAccountId({
        apiToken,
        accountId: getStringRuntimeSetting(
          "ARIA_CLOUDFLARE_ACCOUNT_ID",
          context.locals,
        )?.trim(),
      });
    } catch {
      throw new ActionError({
        code: "BAD_REQUEST",
        message:
          "Aria could not determine the Cloudflare account. Configure ARIA_CLOUDFLARE_ACCOUNT_ID for a multi-account API token.",
      });
    }

    let widget: { siteKey: string; secretKey: string };
    try {
      widget = await createManagedTurnstileWidget({
        apiToken,
        accountId,
        name: input.name,
        domains: input.allowedHostnames,
      });
    } catch {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Cloudflare could not create the Turnstile widget. Check the Worker token has Turnstile Sites: Edit.",
      });
    }

    try {
      const encrypted = await new TurnstileSecretCipher(context.locals).encrypt(
        {
          siteKey: widget.siteKey,
          secretKey: widget.secretKey,
        },
      );
      const config: CaptchaConfig = {
        provider: "turnstile",
        siteKey: widget.siteKey,
        allowedHostnames: input.allowedHostnames,
        managedByAria: true,
      };
      await adapter.setConfig(CONFIG_KEYS.TURNSTILE_SECRET, encrypted);
      await adapter.setConfig(CONFIG_KEYS.CAPTCHA, config);
    } catch (error) {
      await deleteTurnstileWidget({
        apiToken,
        accountId,
        siteKey: widget.siteKey,
      }).catch(() => {});
      const code = error instanceof Error ? error.message : "";
      const message = code.startsWith("TURNSTILE_ENCRYPTION_KEY")
        ? "Managed Turnstile setup needs ARIA_TURNSTILE_ENCRYPTION_KEY_V1: a 32-byte base64 Worker secret."
        : "Aria could not securely save the Turnstile secret; the new Cloudflare widget was rolled back.";
      throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message });
    }

    await logAuthEvent(adapter, {
      userId: actor.id,
      eventType: "security_settings_updated",
      ip: getClientIp(context.request),
      userAgent: context.request.headers.get("user-agent"),
      success: true,
      metadata: { setting: "turnstile", managedByAria: true },
    });

    return {
      success: true as const,
      provider: "turnstile" as const,
      siteKey: widget.siteKey,
      allowedHostnames: input.allowedHostnames,
    };
  },
});

/**
 * Update modern auth method configuration.
 *
 * Requires manageSecurity. Currently exposes passkey settings used for airgapped fallback.
 */
