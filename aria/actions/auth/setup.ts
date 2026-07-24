import { defineAction, ActionError } from "astro:actions";
import {
  PublicAuthMethodsAvailabilitySchema,
  CreateFirstAdminInputSchema,
  type SessionUser,
  getAuthAdapterAsync,
  getAuthMethodsConfig,
  hashPassword,
  setSessionCookie,
  getClientIp,
  now,
  logAuthEvent,
  BOOTSTRAP_USER_CONFIG_KEY,
  getBootstrapAdministratorProfile,
} from "../../lib/auth";
import { generateId } from "./_shared";

export const checkSetupRequired = defineAction({
  handler: async (_, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const count = await adapter.countUsers();
    return { setupRequired: count === 0 };
  },
});

/**
 * Public auth method availability for setup/login UI decisions.
 *
 * Exposes only non-secret capability flags.
 */

export const getAuthMethodAvailability = defineAction({
  handler: async (_, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const config = await getAuthMethodsConfig(adapter, {
      requestUrl: context.request.url,
      persistDefaultOrigins: false,
    });

    return PublicAuthMethodsAvailabilitySchema.parse({
      passkey: {
        enabled: config.passkey.enabled,
        rpName: config.passkey.rpName,
      },
      password: {
        enabled: config.password.enabled,
        recoveryOnly: config.password.recoveryOnly,
      },
      magicLink: {
        enabled: config.magicLink.enabled,
      },
    });
  },
});

/**
 * Create the first admin user (setup wizard)
 *
 * Only works when no users exist in the system.
 * Does NOT require authentication but IS rate limited.
 */

export const createFirstAdmin = defineAction({
  input: CreateFirstAdminInputSchema,
  handler: async (input, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);
    const userAgent = context.request.headers.get("user-agent");

    // Rate limiting for setup endpoint (prevents enumeration/DoS)
    const rateLimit = await adapter.checkRateLimit(ip);
    if (rateLimit.isLockedOut) {
      throw new ActionError({
        code: "TOO_MANY_REQUESTS",
        message: `Account locked due to too many attempts. Try again after ${new Date(rateLimit.lockoutUntil!).toLocaleString()}.`,
      });
    }
    if (rateLimit.isLimited) {
      const breach = await adapter.recordRateLimitBreach(ip);
      throw new ActionError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many setup attempts. Locked out until ${new Date(breach.lockoutUntil).toLocaleString()}.`,
      });
    }

    // The conditional insert is the bootstrap claim. Only one concurrent
    // request can observe an empty users table and create the first user.
    const passwordHash = await hashPassword(input.password);
    const user = await adapter.createFirstUser({
      id: generateId(),
      username: input.username,
      email: input.email,
      passwordHash,
      role: "administrator",
      createdAt: now(),
      permissionProfile: getBootstrapAdministratorProfile(),
    });

    if (!user) {
      await adapter.recordLoginAttempt(ip);
      throw new ActionError({
        code: "FORBIDDEN",
        message: "Setup already completed. An admin user already exists.",
      });
    }

    await adapter.setConfig(BOOTSTRAP_USER_CONFIG_KEY, user.id);

    // Clear rate limit on success
    await adapter.clearRateLimit(ip);

    const sessionId = generateId();
    await adapter.createSession({
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      rememberMe: false,
      createdAt: now(),
      authMethod: "password",
      ip,
      userAgent,
    });

    setSessionCookie(context.cookies, sessionId, false);

    await logAuthEvent(adapter, {
      userId: user.id,
      eventType: "login_success",
      authMethod: "password",
      ip,
      userAgent,
      success: true,
      metadata: { bootstrap: true },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissionProfile: user.permissionProfile,
        totpEnabled: user.totpEnabled,
        avatarUrl: user.avatarUrl,
        preferences: user.preferences,
      } satisfies SessionUser,
    };
  },
});

/**
 * Begin passkey-first setup.
 *
 * Stores a short-lived pending setup record with the recovery password already
 * hashed, then returns WebAuthn registration options for the browser ceremony.
 */
