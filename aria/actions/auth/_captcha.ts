import {
  CONFIG_KEYS,
  CaptchaConfigSchema,
  TurnstileSecretCipher,
  TurnstileSecretEnvelopeSchema,
  type CaptchaConfig,
  getAuthAdapterAsync,
} from "../../lib/auth";
import { getStringRuntimeSetting } from "../../lib/cloudflare/env";

function getWorkerTurnstileSecret(locals: App.Locals): string | undefined {
  const value = getStringRuntimeSetting("TURNSTILE_SECRET_KEY", locals);
  return value?.trim() || undefined;
}

export async function getTurnstileSecret(
  adapter: Pick<Awaited<ReturnType<typeof getAuthAdapterAsync>>, "getConfig">,
  config: CaptchaConfig,
  locals: App.Locals,
): Promise<string | undefined> {
  if (config.managedByAria && config.siteKey) {
    const envelope = await adapter.getConfig<unknown>(
      CONFIG_KEYS.TURNSTILE_SECRET,
    );
    if (!TurnstileSecretEnvelopeSchema.safeParse(envelope).success)
      return undefined;
    try {
      return (
        await new TurnstileSecretCipher(locals).decrypt(
          envelope,
          config.siteKey,
        )
      ).secretKey;
    } catch {
      return undefined;
    }
  }
  return getWorkerTurnstileSecret(locals);
}

function parseCaptchaConfig(value: unknown): CaptchaConfig {
  const parsed = CaptchaConfigSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : { provider: "none", allowedHostnames: [], managedByAria: false };
}

/**
 * Retires legacy persisted CAPTCHA secrets rather than ever reading them.
 */
export async function loadCaptchaConfig(
  adapter: Pick<
    Awaited<ReturnType<typeof getAuthAdapterAsync>>,
    "getConfig" | "setConfig"
  >,
): Promise<CaptchaConfig> {
  const raw = await adapter.getConfig<unknown>(CONFIG_KEYS.CAPTCHA);
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "secretKey" in raw
  ) {
    const disabled: CaptchaConfig = {
      provider: "none",
      allowedHostnames: [],
      managedByAria: false,
    };
    await adapter.setConfig(CONFIG_KEYS.CAPTCHA, disabled);
    return disabled;
  }
  return parseCaptchaConfig(raw);
}
