import type { StudioI18n, StudioMessageKey } from "@/i18n";

const ACTION_ERROR_KEYS: Readonly<Record<string, StudioMessageKey>> = {
  "CAPTCHA verification required": "auth.captcha.required",
  "CAPTCHA verification failed": "auth.captcha.failed",
  "Invalid email/username or password": "auth.invalidCredentials",
  "Invalid username or password": "auth.invalidCredentials",
  "Invalid credentials": "auth.invalidCredentials",
  "Invalid two-factor authentication code": "auth.totpCodeInvalid",
  "Two-factor authentication code required": "auth.twoFactorRequired",
  "Two-factor authentication setup is required for this account":
    "auth.twoFactorSetupRequired",
  "Passkey setup expired. Start again.": "auth.passkeySetupExpired",
  "Setup already completed. An admin user already exists.":
    "auth.setupAlreadyCompleted",
  "Passkey sign-in failed": "auth.passkeySignInFailed",
  "Passkey sign-in failed. Try again or use password.":
    "auth.passkeySignInRetry",
  "Passkey sign-in failed. Try again or use another sign-in method.":
    "auth.passkeyAlternative",
};

/** Converts public auth action failures into the active Studio locale. */
export function localizeAuthError(
  message: string | undefined,
  t: StudioI18n["t"],
): string {
  if (!message) return t("auth.unexpectedError");

  const remainingAttempts = message.match(/\s\((\d+) attempts remaining\)$/);
  const baseMessage = message.replace(/\s\(\d+ attempts remaining\)$/, "");
  const key = ACTION_ERROR_KEYS[baseMessage];
  const translated = key
    ? t(key)
    : baseMessage.startsWith("Account locked due to too many") ||
        baseMessage.startsWith("Too many login attempts") ||
        baseMessage.startsWith("Too many setup attempts")
      ? t("auth.tooManyAttempts")
      : t("auth.unexpectedError");

  return remainingAttempts
    ? `${translated} ${t("auth.attemptsRemaining", { count: remainingAttempts[1] })}`
    : translated;
}
