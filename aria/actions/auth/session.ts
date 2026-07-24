import { defineAction, ActionError } from "astro:actions";
import {
  LoginInputSchema,
  type LoginResponse,
  type TwoFactorPolicy,
  CONFIG_KEYS,
  getAuthAdapterAsync,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromCookies,
  getClientIp,
  now,
  verifyTotpCode,
  verifyBackupCode,
  verifyTurnstile,
  TURNSTILE_LOGIN_ACTION,
  logAuthEvent,
  requireAuth,
} from "../../lib/auth";
import {
  mergeUserPreferences,
  parseUserPreferences,
  serializeUserPreferences,
  UserPreferencesUpdateSchema,
} from "../../lib/schemas/userPreferences";
import { AppearanceUpdateSchema } from "../../lib/schemas/appearance";
import { getTurnstileSecret, loadCaptchaConfig } from "./_captcha";
import { generateId } from "./_shared";

export const login = defineAction({
  input: LoginInputSchema,
  handler: async (input, context): Promise<LoginResponse> => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);
    const userAgent = context.request.headers.get("user-agent");

    const rateLimit = await adapter.checkRateLimit(ip);

    // If locked out, return immediately
    if (rateLimit.isLockedOut) {
      const lockoutEnd = new Date(rateLimit.lockoutUntil!);
      const hoursRemaining = Math.ceil(
        (lockoutEnd.getTime() - Date.now()) / (1000 * 60 * 60),
      );
      await logAuthEvent(adapter, {
        eventType: "login_failure",
        authMethod: "password",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "rate_limited" },
      });
      return {
        status: "error",
        message: `Account locked due to too many failed attempts. Try again in ${hoursRemaining} hour(s).`,
        remainingAttempts: 0,
      };
    }

    // If rate limited, trigger a lockout breach
    if (rateLimit.isLimited) {
      const breach = await adapter.recordRateLimitBreach(ip);
      const lockoutEnd = new Date(breach.lockoutUntil);
      const hoursRemaining = Math.ceil(
        (lockoutEnd.getTime() - Date.now()) / (1000 * 60 * 60),
      );
      await logAuthEvent(adapter, {
        eventType: "login_failure",
        authMethod: "password",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "rate_limited" },
      });
      return {
        status: "error",
        message: `Too many login attempts. Account locked for ${hoursRemaining} hour(s).`,
        remainingAttempts: 0,
      };
    }

    // Check CAPTCHA if configured
    const captchaConfig = await loadCaptchaConfig(adapter);
    if (captchaConfig.provider === "turnstile") {
      if (!input.captchaToken) {
        await adapter.recordLoginAttempt(ip);
        await logAuthEvent(adapter, {
          eventType: "login_failure",
          authMethod: "password",
          ip,
          userAgent,
          success: false,
          metadata: { failureCode: "captcha_required" },
        });
        return {
          status: "error",
          message: "CAPTCHA verification required",
          remainingAttempts: rateLimit.remainingAttempts - 1,
        };
      }

      const captchaSecret = await getTurnstileSecret(
        adapter,
        captchaConfig,
        context.locals,
      );
      const captchaResult = captchaSecret
        ? await verifyTurnstile({
            token: input.captchaToken,
            secretKey: captchaSecret,
            remoteIp: ip === "unknown" ? undefined : ip,
            expectedHostnames: captchaConfig.allowedHostnames,
            expectedAction: TURNSTILE_LOGIN_ACTION,
          })
        : { success: false, error: "CAPTCHA verification is unavailable" };

      if (!captchaResult.success) {
        await adapter.recordLoginAttempt(ip);
        await logAuthEvent(adapter, {
          eventType: "login_failure",
          authMethod: "password",
          ip,
          userAgent,
          success: false,
          metadata: { failureCode: "captcha_failed" },
        });
        return {
          status: "error",
          message: "CAPTCHA verification failed",
          remainingAttempts: rateLimit.remainingAttempts - 1,
        };
      }
    }

    // Find user by identifier (email or username)
    const userRecord = await adapter.getUserByIdentifier(input.identifier);
    if (!userRecord) {
      await adapter.recordLoginAttempt(ip);
      await logAuthEvent(adapter, {
        eventType: "login_failure",
        authMethod: "password",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "invalid_credentials" },
      });
      return {
        status: "error",
        message: "Invalid email/username or password",
        remainingAttempts: rateLimit.remainingAttempts - 1,
      };
    }

    const passwordValid = await verifyPassword(
      input.password,
      userRecord.passwordHash,
    );
    if (!passwordValid) {
      await adapter.recordLoginAttempt(ip);
      await logAuthEvent(adapter, {
        userId: userRecord.id,
        eventType: "login_failure",
        authMethod: "password",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "invalid_credentials" },
      });
      return {
        status: "error",
        message: "Invalid username or password",
        remainingAttempts: rateLimit.remainingAttempts - 1,
      };
    }

    // Check 2FA enforcement policy (site-wide)
    const twoFactorPolicy = await adapter.getConfig<TwoFactorPolicy>(
      CONFIG_KEYS.TWO_FACTOR_POLICY,
    );
    if (twoFactorPolicy?.enforce && !userRecord.totpEnabled) {
      await logAuthEvent(adapter, {
        userId: userRecord.id,
        eventType: "login_failure",
        authMethod: "password",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "totp_setup_required" },
      });
      return {
        status: "totp_setup_required",
        message:
          "Two-factor authentication is required by site policy. Please contact an administrator to enable 2FA for your account.",
      };
    }

    // Check 2FA if enabled
    if (userRecord.totpEnabled) {
      if (!input.totpCode) {
        await logAuthEvent(adapter, {
          userId: userRecord.id,
          eventType: "login_failure",
          authMethod: "password",
          ip,
          userAgent,
          success: false,
          metadata: { failureCode: "totp_required" },
        });
        return {
          status: "totp_required",
          message: "Two-factor authentication code required",
        };
      }

      const totpSecret = await adapter.getTotpSecret(userRecord.id);
      if (totpSecret) {
        const totpValid = verifyTotpCode(totpSecret, input.totpCode);
        if (!totpValid) {
          const backupResult = await adapter.getBackupCodes(userRecord.id);
          if (backupResult) {
            const codeIndex = await verifyBackupCode(
              input.totpCode,
              backupResult.codes,
              backupResult.usedIndices,
            );
            if (codeIndex >= 0) {
              await adapter.markBackupCodeUsed(userRecord.id, codeIndex);
            } else {
              await adapter.recordLoginAttempt(ip);
              await logAuthEvent(adapter, {
                userId: userRecord.id,
                eventType: "login_failure",
                authMethod: "password",
                ip,
                userAgent,
                success: false,
                metadata: { failureCode: "totp_invalid" },
              });
              return {
                status: "error",
                message: "Invalid two-factor authentication code",
                remainingAttempts: rateLimit.remainingAttempts - 1,
              };
            }
          } else {
            await adapter.recordLoginAttempt(ip);
            await logAuthEvent(adapter, {
              userId: userRecord.id,
              eventType: "login_failure",
              authMethod: "password",
              ip,
              userAgent,
              success: false,
              metadata: { failureCode: "totp_invalid" },
            });
            return {
              status: "error",
              message: "Invalid two-factor authentication code",
              remainingAttempts: rateLimit.remainingAttempts - 1,
            };
          }
        }
      }
    }

    // Success! Clear rate limit and create session
    await adapter.clearRateLimit(ip);

    await adapter.updateUser(userRecord.id, { lastLoginAt: now() });

    const sessionId = generateId();
    const sessionDuration = input.rememberMe
      ? 30 * 24 * 60 * 60 * 1000 // 30 days
      : 7 * 24 * 60 * 60 * 1000; // 7 days

    await adapter.createSession({
      id: sessionId,
      userId: userRecord.id,
      expiresAt: new Date(Date.now() + sessionDuration).toISOString(),
      rememberMe: input.rememberMe,
      createdAt: now(),
      authMethod: "password",
      ip,
      userAgent,
    });

    setSessionCookie(context.cookies, sessionId, input.rememberMe);

    await logAuthEvent(adapter, {
      userId: userRecord.id,
      eventType: "login_success",
      authMethod: "password",
      ip,
      userAgent,
      success: true,
      metadata: null,
    });

    return {
      status: "success",
      user: {
        id: userRecord.id,
        username: userRecord.username,
        email: userRecord.email,
        role: userRecord.role,
        permissionProfile: userRecord.permissionProfile,
        totpEnabled: userRecord.totpEnabled,
        avatarUrl: userRecord.avatarUrl,
        preferences: parseUserPreferences(userRecord.preferences),
      },
    };
  },
});

/**
 * Logout action
 *
 * Destroys the current session and clears the cookie.
 */

export const logout = defineAction({
  handler: async (_, context) => {
    const sessionId = getSessionIdFromCookies(context.cookies);

    if (sessionId) {
      const adapter = await getAuthAdapterAsync(context.locals);
      const session = await adapter.getSession(sessionId);
      await adapter.deleteSession(sessionId);
      await logAuthEvent(adapter, {
        userId: session?.userId ?? null,
        eventType: "logout",
        authMethod: session?.authMethod ?? "session",
        ip: getClientIp(context.request),
        userAgent: context.request.headers.get("user-agent"),
        success: true,
        metadata: null,
      });
    }

    clearSessionCookie(context.cookies);

    return { success: true };
  },
});

/**
 * Request password reset via email
 *
 * Sends a password reset link to the user's email.
 */

export const getMe = defineAction({
  handler: async (_, context) => {
    const sessionUser = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);
    const userRecord = await adapter.getUserById(sessionUser.id);

    if (!userRecord) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return { user: userRecord };
  },
});

/**
 * Update current user's preferences (appearance, future settings)
 */

export const updatePreferences = defineAction({
  input: UserPreferencesUpdateSchema,
  handler: async (input, context) => {
    const user = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);
    const currentRecord = await adapter.getUserById(user.id);

    if (!currentRecord) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const current = parseUserPreferences(currentRecord.preferences);
    const merged = mergeUserPreferences(current, input);

    if (input.appearance) {
      AppearanceUpdateSchema.parse(input.appearance);
    }

    const updated = await adapter.updateUser(user.id, {
      preferences: serializeUserPreferences(merged),
    });

    return {
      success: true,
      preferences: parseUserPreferences(updated.preferences),
    };
  },
});

/**
 * Change own password
 *
 * Self-service password change (requires current password).
 */
