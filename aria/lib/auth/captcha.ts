/**
 * Cloudflare Turnstile verification for password sign-in. The site key is public,
 * but TURNSTILE_SECRET_KEY must only exist in the Worker secret store.
 */

import type { CaptchaConfig } from "./types";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5_000;
export const TURNSTILE_LOGIN_ACTION = "turnstile-spin-v1";

export interface CaptchaResult {
  success: boolean;
  error?: string;
  errorCodes?: string[];
}

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
}

export interface VerifyTurnstileInput {
  token: string;
  secretKey: string;
  remoteIp?: string;
  expectedHostnames: readonly string[];
  expectedAction: string;
  fetcher?: typeof fetch;
}

function failure(error: string, errorCodes: string[] = []): CaptchaResult {
  return { success: false, error, errorCodes };
}

/**
 * Redeem a Turnstile token exactly where the protected login operation
 * runs. A successful provider response is additionally constrained to.
 */
export async function verifyTurnstile({
  token,
  secretKey,
  remoteIp,
  expectedHostnames,
  expectedAction,
  fetcher = fetch,
}: VerifyTurnstileInput): Promise<CaptchaResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) return failure("CAPTCHA token is required");
  if (normalizedToken.length > 2048) return failure("CAPTCHA token is invalid");
  if (!secretKey) return failure("CAPTCHA verification is unavailable");
  if (expectedHostnames.length === 0) {
    return failure("CAPTCHA hostnames are not configured");
  }

  const formData = new URLSearchParams({
    secret: secretKey,
    response: normalizedToken,
    idempotency_key: crypto.randomUUID(),
  });
  if (remoteIp) formData.set("remoteip", remoteIp);

  // A transient network/5xx failure may be retried once. Keep the same
  // idempotency key so Cloudflare treats the retry as the same redemption.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
    try {
      const response = await fetcher(TURNSTILE_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) continue;
        return failure("CAPTCHA verification is unavailable");
      }

      const result = (await response.json()) as TurnstileResponse;
      const errorCodes = result["error-codes"] ?? [];
      if (!result.success) return failure("CAPTCHA verification failed", errorCodes);

      const hostname = result.hostname?.toLowerCase();
      if (!hostname || !expectedHostnames.includes(hostname)) {
        return failure("CAPTCHA hostname verification failed");
      }
      if (result.action !== expectedAction) {
        return failure("CAPTCHA action verification failed");
      }
      return { success: true };
    } catch {
      if (attempt === 0) continue;
      return failure("CAPTCHA verification is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  return failure("CAPTCHA verification is unavailable");
}

export function isCaptchaEnabled(config: CaptchaConfig | null): boolean {
  return config?.provider === "turnstile";
}

export function getDefaultCaptchaConfig(): CaptchaConfig {
  return { provider: "none", allowedHostnames: [], managedByAria: false };
}

export function validateCaptchaConfig(config: CaptchaConfig): {
  valid: boolean;
  error?: string;
} {
  if (config.provider === "none") return { valid: true };
  if (!config.siteKey) return { valid: false, error: "Site key is required" };
  if (config.allowedHostnames.length === 0) {
    return { valid: false, error: "At least one allowed hostname is required" };
  }
  return { valid: true };
}
