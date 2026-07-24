import { defineAction, ActionError } from "astro:actions";
import {
  BeginPasskeySetupInputSchema,
  BeginPasskeySetupResponseSchema,
  CompletePasskeySetupInputSchema,
  PasskeyLoginOptionsInputSchema,
  PasskeyLoginOptionsResponseSchema,
  PasskeyLoginVerifyInputSchema,
  PasskeyRegisterOptionsInputSchema,
  PasskeyRegisterOptionsResponseSchema,
  PasskeyRegisterVerifyInputSchema,
  PasskeyRegisterVerifyResponseSchema,
  PasskeySummarySchema,
  ListPasskeysInputSchema,
  ListPasskeysResponseSchema,
  RenamePasskeyInputSchema,
  RemovePasskeyInputSchema,
  PendingPasskeySetupSchema,
  type SessionUser,
  type LoginResponse,
  type PendingPasskeySetup,
  getAuthAdapterAsync,
  hashPassword,
  setSessionCookie,
  getClientIp,
  now,
  logAuthEvent,
  createAuthenticationOptions,
  createRegistrationOptions,
  listPasskeys,
  removePasskey,
  renamePasskey,
  requireAuth,
  requireAdmin,
  verifyAuthentication,
  verifyRegistration,
  verifyRegistrationCeremony,
  PasskeyAuthFailureError,
  BOOTSTRAP_USER_CONFIG_KEY,
  getBootstrapAdministratorProfile,
} from "../../lib/auth";
import { parseUserPreferences } from "../../lib/schemas/userPreferences";
import { generateId } from "./_shared";

const PENDING_PASSKEY_SETUP_KEY_PREFIX = "auth_pending_passkey_setup";
const PENDING_PASSKEY_SETUP_TTL_MS = 15 * 60 * 1000;

function pendingPasskeySetupKey(id: string): string {
  return `${PENDING_PASSKEY_SETUP_KEY_PREFIX}:${id}`;
}

function setupExpiry(): string {
  return new Date(Date.now() + PENDING_PASSKEY_SETUP_TTL_MS).toISOString();
}

function isExpiredIso(value: string): boolean {
  return new Date(value).getTime() <= Date.now();
}

async function readPendingPasskeySetup(
  adapter: Awaited<ReturnType<typeof getAuthAdapterAsync>>,
  pendingSetupId: string,
): Promise<PendingPasskeySetup | null> {
  const key = pendingPasskeySetupKey(pendingSetupId);
  const raw = await adapter.getConfig<unknown>(key);
  const parsed = PendingPasskeySetupSchema.safeParse(raw);
  if (!parsed.success) {
    await adapter.deleteConfig(key);
    return null;
  }

  if (isExpiredIso(parsed.data.expiresAt)) {
    await adapter.deleteConfig(key);
    return null;
  }

  return parsed.data;
}

async function deletePendingPasskeySetup(
  adapter: Awaited<ReturnType<typeof getAuthAdapterAsync>>,
  pendingSetupId: string,
): Promise<void> {
  await adapter.deleteConfig(pendingPasskeySetupKey(pendingSetupId));
}

function toPasskeySummary(
  credential: Awaited<ReturnType<typeof listPasskeys>>[number],
) {
  return PasskeySummarySchema.parse({
    id: credential.id,
    credentialId: credential.credentialId,
    counter: credential.counter,
    deviceName: credential.deviceName,
    transports: credential.transports,
    backedUp: credential.backedUp,
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt,
  });
}

export const beginPasskeySetup = defineAction({
  input: BeginPasskeySetupInputSchema,
  handler: async (input, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);

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

    const count = await adapter.countUsers();
    if (count > 0) {
      await adapter.recordLoginAttempt(ip);
      throw new ActionError({
        code: "FORBIDDEN",
        message: "Setup already completed. An admin user already exists.",
      });
    }

    const pendingSetupId = generateId();
    const userId = generateId();
    const registration = await createRegistrationOptions({
      adapter,
      requestUrl: context.request.url,
      user: {
        id: userId,
        username: input.username,
        email: input.email,
      },
      challengeUserId: null,
      existingCredentials: [],
    });

    const pendingSetup = PendingPasskeySetupSchema.parse({
      id: pendingSetupId,
      userId,
      username: input.username,
      email: input.email,
      registerChallengeId: registration.challengeId,
      ip,
      expiresAt: setupExpiry(),
      createdAt: now(),
    });

    await adapter.setConfig(
      pendingPasskeySetupKey(pendingSetupId),
      pendingSetup,
    );

    return BeginPasskeySetupResponseSchema.parse({
      pendingSetupId,
      challengeId: registration.challengeId,
      options: registration.options,
    });
  },
});

/**
 * Complete passkey-first setup after the browser WebAuthn ceremony succeeds.
 */

export const completePasskeySetup = defineAction({
  input: CompletePasskeySetupInputSchema,
  handler: async (input, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);
    const userAgent = context.request.headers.get("user-agent");

    const pendingSetup = await readPendingPasskeySetup(
      adapter,
      input.pendingSetupId,
    );
    if (!pendingSetup) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Passkey setup expired. Start again.",
      });
    }

    if (pendingSetup.registerChallengeId !== input.challengeId) {
      await adapter.recordLoginAttempt(ip);
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Passkey setup expired. Start again.",
      });
    }

    let credential = await verifyRegistrationCeremony({
      adapter,
      requestUrl: context.request.url,
      challengeId: input.challengeId,
      response: input.response,
      userId: pendingSetup.userId,
      deviceName: input.deviceName ?? "First passkey",
    });

    const user = await adapter.createFirstUser({
      id: pendingSetup.userId,
      username: pendingSetup.username,
      email: pendingSetup.email,
      passwordHash: await hashPassword(input.password),
      role: "administrator",
      createdAt: now(),
      permissionProfile: getBootstrapAdministratorProfile(),
    });

    if (!user) {
      await deletePendingPasskeySetup(adapter, input.pendingSetupId);
      throw new ActionError({
        code: "FORBIDDEN",
        message: "Setup already completed. An admin user already exists.",
      });
    }

    try {
      credential = await adapter.createPasskeyCredential(credential);
    } catch (error: unknown) {
      await adapter.deleteUser(user.id);
      throw error;
    }

    await adapter.setConfig(BOOTSTRAP_USER_CONFIG_KEY, user.id);
    await deletePendingPasskeySetup(adapter, input.pendingSetupId);
    await adapter.clearRateLimit(ip);

    const sessionId = generateId();
    await adapter.createSession({
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      rememberMe: false,
      createdAt: now(),
      authMethod: "passkey",
      ip,
      userAgent,
    });

    setSessionCookie(context.cookies, sessionId, false);

    await logAuthEvent(adapter, {
      userId: user.id,
      eventType: "passkey_registered",
      authMethod: "passkey",
      ip,
      userAgent,
      success: true,
      metadata: { bootstrap: true, credentialId: credential.credentialId },
    });

    await logAuthEvent(adapter, {
      userId: user.id,
      eventType: "login_success",
      authMethod: "passkey",
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

export const passkeyLoginOptions = defineAction({
  input: PasskeyLoginOptionsInputSchema,
  handler: async (input, context) => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const matchedUser = input.identifier
      ? await adapter.getUserByIdentifier(input.identifier)
      : null;

    const registration = await createAuthenticationOptions({
      adapter,
      requestUrl: context.request.url,
      userId: matchedUser?.id,
    });

    return PasskeyLoginOptionsResponseSchema.parse(registration);
  },
});

/**
 * Verify passkey login and create a normal Aria session.
 */

export const passkeyLoginVerify = defineAction({
  input: PasskeyLoginVerifyInputSchema,
  handler: async (input, context): Promise<LoginResponse> => {
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);
    const userAgent = context.request.headers.get("user-agent");

    const rateLimit = await adapter.checkRateLimit(ip);
    if (rateLimit.isLockedOut) {
      await logAuthEvent(adapter, {
        eventType: "passkey_auth_failure",
        authMethod: "passkey",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "rate_limited" },
      });
      return {
        status: "error",
        message: "Too many login attempts. Please try again later.",
        remainingAttempts: 0,
      };
    }
    if (rateLimit.isLimited) {
      const breach = await adapter.recordRateLimitBreach(ip);
      await logAuthEvent(adapter, {
        eventType: "passkey_auth_failure",
        authMethod: "passkey",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "rate_limited" },
      });
      return {
        status: "error",
        message: `Too many login attempts. Locked out until ${new Date(breach.lockoutUntil).toLocaleString()}.`,
        remainingAttempts: 0,
      };
    }

    let verification;
    try {
      verification = await verifyAuthentication({
        adapter,
        requestUrl: context.request.url,
        challengeId: input.challengeId,
        response: input.response,
      });
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        const details =
          error instanceof PasskeyAuthFailureError
            ? { code: error.code, responseId: input.response.id }
            : {
                message: error instanceof Error ? error.message : error,
                responseId: input.response.id,
              };
        console.error("[Auth] passkeyLoginVerify failed:", details);
      }
      await adapter.recordLoginAttempt(ip);
      await logAuthEvent(adapter, {
        eventType: "passkey_auth_failure",
        authMethod: "passkey",
        ip,
        userAgent,
        success: false,
        metadata: {
          failureCode:
            error instanceof PasskeyAuthFailureError
              ? error.code
              : "invalid_credentials",
        },
      });
      const message =
        error instanceof PasskeyAuthFailureError &&
        error.code === "credential_not_found"
          ? "This passkey isn't registered with this workspace. Try another passkey or sign in with password."
          : "Passkey sign-in failed. Try again or use another sign-in method.";
      return {
        status: "error",
        message,
        remainingAttempts: rateLimit.remainingAttempts - 1,
      };
    }

    const userRecord = await adapter.getUserById(verification.userId);
    if (!userRecord) {
      await adapter.recordLoginAttempt(ip);
      await logAuthEvent(adapter, {
        userId: verification.userId,
        eventType: "passkey_auth_failure",
        authMethod: "passkey",
        ip,
        userAgent,
        success: false,
        metadata: { failureCode: "invalid_credentials" },
      });
      return {
        status: "error",
        message:
          "Passkey sign-in failed. Try again or use another sign-in method.",
        remainingAttempts: rateLimit.remainingAttempts - 1,
      };
    }

    await adapter.clearRateLimit(ip);
    await adapter.updateUser(userRecord.id, { lastLoginAt: now() });

    const sessionId = generateId();
    const sessionDuration = input.rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
    await adapter.createSession({
      id: sessionId,
      userId: userRecord.id,
      expiresAt: new Date(Date.now() + sessionDuration).toISOString(),
      rememberMe: input.rememberMe,
      createdAt: now(),
      authMethod: "passkey",
      ip,
      userAgent,
    });

    setSessionCookie(context.cookies, sessionId, input.rememberMe);

    await logAuthEvent(adapter, {
      userId: userRecord.id,
      eventType: "login_success",
      authMethod: "passkey",
      ip,
      userAgent,
      success: true,
      metadata: { credentialId: verification.credentialId },
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
 * List passkeys for the current user, or another user when admin.
 */

export const listUserPasskeys = defineAction({
  input: ListPasskeysInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);
    const targetUserId = input.userId ?? currentUser.id;

    if (targetUserId !== currentUser.id) {
      await requireAdmin(context);
    }

    const credentials = await listPasskeys(adapter, targetUserId);
    return ListPasskeysResponseSchema.parse({
      passkeys: credentials.map(toPasskeySummary),
    });
  },
});

/**
 * Create passkey registration options for the signed-in user.
 */

export const passkeyRegisterOptions = defineAction({
  input: PasskeyRegisterOptionsInputSchema,
  handler: async (_, context) => {
    const currentUser = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const registration = await createRegistrationOptions({
      adapter,
      requestUrl: context.request.url,
      user: currentUser,
    });

    return PasskeyRegisterOptionsResponseSchema.parse(registration);
  },
});

/**
 * Verify and store a new passkey for the signed-in user.
 */

export const passkeyRegisterVerify = defineAction({
  input: PasskeyRegisterVerifyInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);
    const userAgent = context.request.headers.get("user-agent");

    try {
      const credential = await verifyRegistration({
        adapter,
        requestUrl: context.request.url,
        challengeId: input.challengeId,
        response: input.response,
        userId: currentUser.id,
        deviceName: input.deviceName ?? "Passkey",
      });

      await logAuthEvent(adapter, {
        userId: currentUser.id,
        eventType: "passkey_registered",
        authMethod: "passkey",
        ip,
        userAgent,
        success: true,
        metadata: { credentialId: credential.credentialId },
      });

      return PasskeyRegisterVerifyResponseSchema.parse({
        success: true,
        passkey: toPasskeySummary(credential),
      });
    } catch (error: unknown) {
      await logAuthEvent(adapter, {
        userId: currentUser.id,
        eventType: "passkey_auth_failure",
        authMethod: "passkey",
        ip,
        userAgent,
        success: false,
        metadata: {
          failureCode: "invalid_credentials",
          reason: error instanceof Error ? error.message : "unknown",
        },
      });

      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Passkey registration failed. Try again.",
      });
    }
  },
});

/**
 * Rename one of the signed-in user's passkeys.
 */

export const renameUserPasskey = defineAction({
  input: RenamePasskeyInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    await renamePasskey(
      adapter,
      currentUser.id,
      input.credentialId,
      input.deviceName,
    );

    const credential = await adapter.getPasskeyCredentialByCredentialId(
      input.credentialId,
    );

    if (!credential || credential.userId !== currentUser.id) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Passkey not found",
      });
    }

    return PasskeyRegisterVerifyResponseSchema.parse({
      success: true,
      passkey: toPasskeySummary(credential),
    });
  },
});

/**
 * Remove a passkey for the signed-in user, or another user when admin.
 */

export const removeUserPasskey = defineAction({
  input: RemovePasskeyInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAuth(context);
    const adapter = await getAuthAdapterAsync(context.locals);
    const ip = getClientIp(context.request);
    const userAgent = context.request.headers.get("user-agent");
    const targetUserId = input.userId ?? currentUser.id;

    if (targetUserId !== currentUser.id) {
      await requireAdmin(context);
    }

    const targetUser = await adapter.getUserById(targetUserId);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    try {
      await removePasskey(adapter, targetUser, input.credentialId);
    } catch (error: unknown) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "Passkey could not be removed.",
      });
    }

    await logAuthEvent(adapter, {
      userId: targetUser.id,
      eventType: "passkey_removed",
      authMethod: "passkey",
      ip,
      userAgent,
      success: true,
      metadata: { credentialId: input.credentialId },
    });

    return { success: true };
  },
});

/**
 * Login action
 *
 * Validates credentials, handles rate limiting, lockout, CAPTCHA, and 2FA.
 */
