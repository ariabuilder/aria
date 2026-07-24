/**
 * Re-exports all auth utilities for external use. Helper functions for route protection.
 */

export type {
  UserRole,
  User,
  UserRecord,
  Session,
  SessionUser,
  CaptchaConfig,
  CreateTurnstileWidgetInput,
  CaptchaProvider,
  LoginResponse,
  TwoFactorPolicy,
  TotpSetupResponse,
  AuthMethod,
  AuthEvent,
  AuthEventMetadata,
  AuthEventQuery,
  AuthEventType,
  AuthFailureCode,
  NewAuthEvent,
  NewPasskeyCredential,
  NewWebauthnChallenge,
  AuthenticationResponseJSONInput,
  BeginPasskeySetupInput,
  BeginPasskeySetupResponse,
  CompletePasskeySetupInput,
  AuthMethodsConfig,
  PublicAuthMethodsAvailability,
  UpdateAuthMethodsConfigInput,
  CloudflareAccessAuthMethodConfig,
  MagicLinkAuthMethodConfig,
  OAuthAuthMethodConfig,
  OAuthProviderConfig,
  PasskeyAuthMethodConfig,
  PasskeyCredential,
  PasskeySummary,
  ListPasskeysInput,
  ListPasskeysResponse,
  PasskeyLoginOptionsInput,
  PasskeyLoginOptionsResponse,
  PasskeyLoginVerifyInput,
  PasskeyRegisterOptionsInput,
  PasskeyRegisterOptionsResponse,
  PasskeyRegisterVerifyInput,
  PasskeyRegisterVerifyResponse,
  PasskeyTransport,
  PasskeyTransports,
  PendingPasskeySetup,
  PasswordAuthMethodConfig,
  PublicKeyCredentialCreationOptionsJSON,
  RemovePasskeyInput,
  RenamePasskeyInput,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSONInput,
  WebauthnChallenge,
  WebauthnChallengePurpose,
  ActorRef,
  AssetAuthorship,
  VersionAuthorship,
  Capability,
  RolePreset,
  UserPermissionProfile,
  BootstrapUserId,
  ListUsersResponse,
} from "./types";
export {
  UserRoleSchema,
  UsernameSchema,
  PasswordSchema,
  UserSchema,
  UserRecordSchema,
  SessionSchema,
  SessionUserSchema,
  LoginInputSchema,
  CreateUserInputSchema,
  CreateFirstAdminInputSchema,
  UpdateUserInputSchema,
  DeleteUserInputSchema,
  ChangePasswordInputSchema,
  ResetUserPasswordInputSchema,
  RequestPasswordResetInputSchema,
  ConfirmPasswordResetInputSchema,
  TotpSetupResponseSchema,
  EnableTotpInputSchema,
  DisableTotpInputSchema,
  VerifyBackupCodeInputSchema,
  CaptchaProviderSchema,
  CaptchaConfigSchema,
  UpdateCaptchaConfigInputSchema,
  CreateTurnstileWidgetInputSchema,
  UpdateTwoFactorPolicyInputSchema,
  AdminInitTotpInputSchema,
  AdminEnableTotpInputSchema,
  AdminDisableTotpInputSchema,
  AdminRegenerateBackupCodesInputSchema,
  AuthMethodSchema,
  AuthEventMetadataSchema,
  AuthEventQuerySchema,
  AuthEventSchema,
  AuthEventTypeSchema,
  AuthFailureCodeSchema,
  NewAuthEventSchema,
  NewPasskeyCredentialSchema,
  NewWebauthnChallengeSchema,
  AuthenticationResponseJSONSchema,
  BeginPasskeySetupInputSchema,
  BeginPasskeySetupResponseSchema,
  CompletePasskeySetupInputSchema,
  AuthMethodsConfigSchema,
  PublicAuthMethodsAvailabilitySchema,
  UpdateAuthMethodsConfigInputSchema,
  CloudflareAccessAuthMethodConfigSchema,
  MagicLinkAuthMethodConfigSchema,
  OAuthAuthMethodConfigSchema,
  OAuthProviderConfigSchema,
  PasskeyAuthMethodConfigSchema,
  PasskeyCredentialSchema,
  PasskeySummarySchema,
  ListPasskeysInputSchema,
  ListPasskeysResponseSchema,
  PasskeyLoginOptionsInputSchema,
  PasskeyLoginOptionsResponseSchema,
  PasskeyLoginVerifyInputSchema,
  PasskeyRegisterOptionsInputSchema,
  PasskeyRegisterOptionsResponseSchema,
  PasskeyRegisterVerifyInputSchema,
  PasskeyRegisterVerifyResponseSchema,
  PasskeyTransportSchema,
  PasskeyTransportsSchema,
  PendingPasskeySetupSchema,
  PasswordAuthMethodConfigSchema,
  PublicKeyCredentialCreationOptionsJSONSchema,
  RemovePasskeyInputSchema,
  RenamePasskeyInputSchema,
  PublicKeyCredentialRequestOptionsJSONSchema,
  RegistrationResponseJSONSchema,
  WebauthnChallengePurposeSchema,
  WebauthnChallengeSchema,
  RateLimitRecordSchema,
  PasswordResetRecordSchema,
  AuthSuccessResponseSchema,
  LoginResponseSchema,
  SetupRequiredResponseSchema,
  ListUsersResponseSchema,
  BootstrapUserIdSchema,
  BootstrapUserConfigValueSchema,
  RATE_LIMIT,
  SESSION_DURATION,
  SESSION_COOKIE,
  CONFIG_KEYS,
  PASSWORD_RESET_EXPIRY_MS,
  ActorRefSchema,
  AssetAuthorshipSchema,
  VersionAuthorshipSchema,
  CapabilitySchema,
  RolePresetSchema,
  UserPermissionProfileSchema,
  ROLE_DEFAULT_CAPABILITIES,
  resolveEffectiveCapabilities,
  buildPermissionProfile,
  permissionProfilesEqual,
} from "./types";

export {
  CAPABILITY_OPERATIONS,
  OperationIdSchema,
  getOperationsForCapability,
  getCapabilitiesForOperation,
  type OperationId,
} from "./capabilityOperations";

export { hasEffectiveCapability } from "./hasEffectiveCapability";

export { logAuthEvent, type LogAuthEventInput } from "./audit";
export {
  TurnstileSecretCipher,
  TurnstileSecretEnvelopeSchema,
  type TurnstileSecretEnvelope,
} from "./turnstileSecrets";

export {
  getAuthMethodsConfig,
  isAuthMethodEnabled,
  resolveAllowedOrigins,
  resolveExpectedRpIds,
  resolveRpId,
  type AuthMethodsConfigOptions,
} from "./methods/registry";

export {
  countUserPasskeys,
  createAuthenticationOptions,
  createRegistrationOptions,
  listPasskeys,
  PasskeyAuthFailureError,
  removePasskey,
  renamePasskey,
  userHasRecoveryMethod,
  verifyAuthentication,
  verifyRegistration,
  verifyRegistrationCeremony,
  type PasskeyAuthFailureCode,
  type PasskeyAuthenticationOptionsContext,
  type PasskeyAuthenticationOptionsResult,
  type PasskeyAuthenticationVerificationContext,
  type PasskeyAuthenticationVerificationResult,
  type PasskeyRegistrationOptionsContext,
  type PasskeyRegistrationOptionsResult,
  type PasskeyRegistrationUser,
  type PasskeyVerificationContext,
} from "./methods/passkey";

export {
  buildAuthorshipSaveContext,
  buildMediaAuthorshipContext,
  buildMediaAuthorshipContextFromSession,
  buildSystemAuthorshipSaveContext,
  parseAuthorshipSaveContext,
  resolveUserPermissionProfile,
  sessionUserToActorRef,
} from "../authorship/stamping";

export type { AuthAdapter, KVNamespace } from "./adapter";
export { getAuthAdapterAsync } from "./getAuthAdapter";

export {
  BOOTSTRAP_USER_CONFIG_KEY,
  getBootstrapAdministratorProfile,
  isBootstrapAdministratorProfile,
  resolveBootstrapUserId,
  isBootstrapUser,
  assertUserDeletable,
  assertBootstrapPermissionsImmutable,
  normalizeBootstrapUser,
  countResolvedAdministrators,
  canDeleteUserInSettings,
  assertNotLastAdministrator,
} from "./bootstrapUser";

export {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
} from "./password";
export {
  getSessionIdFromCookies,
  setSessionCookie,
  clearSessionCookie,
  sessionKey,
  rateLimitKey,
  lockoutKey,
  getClientIp,
  now,
  isExpired,
} from "./session";
export {
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  verifyBackupCode,
} from "./totp";
export {
  verifyTurnstile,
  validateCaptchaConfig,
  TURNSTILE_LOGIN_ACTION,
} from "./captcha";
export { sendPasswordResetEmail } from "./email";

import type { ActionAPIContext } from "astro:actions";
import { ActionError } from "astro:actions";
import type { SessionUser, UserRole, Capability } from "./types";
import {
  CapabilitySchema,
  resolveEffectiveCapabilities,
} from "./types";
import {
  getCapabilitiesForOperation,
  OperationIdSchema,
  type OperationId,
} from "./capabilityOperations";
import { resolveUserPermissionProfile } from "../authorship/permissionProfile";
import { getSessionIdFromCookies } from "./session";
import { getAuthAdapterAsync } from "./getAuthAdapter";
import { getStorageAdapterAsync } from "../storage/getStorageAdapter";
import { readSessionUserFromLocals } from "../runtime/requestLocals";

/**
 * Require authentication for an action
 *
 * Extracts session from cookies, validates it, and returns the user.
 * Throws ActionError UNAUTHORIZED if not authenticated.
 *
 * @param context - Astro action context
 * @returns The authenticated user
 * @throws ActionError with code "UNAUTHORIZED" if no valid session
 *
 * @example
 * export const server = {
 *   someAction: defineAction({
 *     handler: async (_, context) => {
 *       const user = await requireAuth(context);
 *       // user is now typed as SessionUser
 *     },
 *   }),
 * };
 */
export async function requireAuth(
  context: ActionAPIContext,
): Promise<SessionUser> {
  // Middleware already validates the session for /admin requests and stores
  // the user on locals — reuse it to avoid one KV GET + one D1 user lookup
  // per Astro Action invocation. Falls back to a full validation when the
  // request did not pass through the admin middleware path.
  const memoizedUser = readSessionUserFromLocals(context.locals);
  if (memoizedUser) {
    return memoizedUser;
  }

  const sessionId = getSessionIdFromCookies(context.cookies);

  if (!sessionId) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const adapter = await getAuthAdapterAsync(context.locals);
  const user = await adapter.getSessionUser(sessionId);

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Session expired or invalid",
    });
  }

  // Cache for subsequent helpers in the same request (e.g. requireRole +
  // requireAuth invoked together, or multiple actions in a batched request).
  context.locals.user = user;

  return user;
}

/**
 * Require a specific role (or higher) for an action
 *
 * Validates authentication and then checks the user's role.
 * Role hierarchy: administrator > manager > content-editor > contributor
 *
 * @param context - Astro action context
 * @param requiredRole - The minimum role required
 * @returns The authenticated user
 * @throws ActionError UNAUTHORIZED if not authenticated
 * @throws ActionError FORBIDDEN if insufficient permissions
 *
 * @example
 * export const server = {
 *   adminAction: defineAction({
 *     handler: async (_, context) => {
 *       const user = await requireRole(context, "administrator");
 *       // user is guaranteed to be an administrator
 *     },
 *   }),
 * };
 */
export async function requireRole(
  context: ActionAPIContext,
  requiredRole: UserRole,
): Promise<SessionUser> {
  const user = await requireAuth(context);

  const roleHierarchy: Record<UserRole, number> = {
    administrator: 4,
    manager: 3,
    "content-editor": 2,
    contributor: 1,
  };

  const userLevel = roleHierarchy[user.role];
  const requiredLevel = roleHierarchy[requiredRole];

  if (userLevel < requiredLevel) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: `Requires ${requiredRole} role`,
    });
  }

  return user;
}

/**
 * Check if the user is an administrator
 *
 * Convenience function for requireRole(context, "administrator")
 */
export async function requireAdmin(
  context: ActionAPIContext,
): Promise<SessionUser> {
  return requireRole(context, "administrator");
}

/**
 * Require a specific capability for an action.
 *
 * Uses the user's effective capability set (role preset + overrides).
 */
export async function requireCapability(
  context: ActionAPIContext,
  capability: Capability,
): Promise<SessionUser> {
  const parsedCapability = CapabilitySchema.parse(capability);
  const user = await requireAuth(context);
  const profile = resolveUserPermissionProfile(user);
  const effective = resolveEffectiveCapabilities(profile);

  if (!effective.includes(parsedCapability)) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: `Requires ${parsedCapability} capability`,
    });
  }

  return user;
}

/**
 * Require permission for a module.action operation ID.
 *
 * Succeeds when the user has at least one mapped capability. Fails closed when
 * the operation has no capability mapping.
 */
export async function requireOperation(
  context: ActionAPIContext,
  operationId: OperationId,
): Promise<SessionUser> {
  const parsedOperation = OperationIdSchema.parse(operationId);
  const requiredCapabilities = getCapabilitiesForOperation(parsedOperation);

  if (requiredCapabilities.length === 0) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: `Operation not permitted: ${parsedOperation}`,
    });
  }

  const user = await requireAuth(context);
  const profile = resolveUserPermissionProfile(user);
  const effective = resolveEffectiveCapabilities(profile);
  const allowed = requiredCapabilities.some((capability) =>
    effective.includes(capability),
  );

  if (!allowed) {
    try {
      const adapter = await getStorageAdapterAsync(context.locals);
      await adapter.appendSettingsAuditEntry({
        category: "security",
        action: "denied",
        actorId: user.id,
        actorUsername: user.username,
        summary: `Denied operation ${parsedOperation}`,
        payload: { operation: parsedOperation },
      });
    } catch {
      // Audit logging must not block authorization failures.
    }

    throw new ActionError({
      code: "FORBIDDEN",
      message: `Operation not permitted: ${parsedOperation}`,
    });
  }

  return user;
}

/**
 * Optional auth - returns user if authenticated, null otherwise
 *
 * Does NOT throw an error if not authenticated.
 * Use this for pages that show different content for logged-in users.
 *
 * @param context - Astro action context
 * @returns The authenticated user or null
 *
 * @example
 * export const server = {
 *   optionalAuthAction: defineAction({
 *     handler: async (_, context) => {
 *       const user = await getAuthUser(context);
 *       if (user) {
 *         // user is logged in
 *       } else {
 *         // anonymous user
 *       }
 *     },
 *   }),
 * };
 */
export async function getAuthUser(
  context: ActionAPIContext,
): Promise<SessionUser | null> {
  const memoizedUser = readSessionUserFromLocals(context.locals);
  if (memoizedUser) {
    return memoizedUser;
  }

  const sessionId = getSessionIdFromCookies(context.cookies);
  if (!sessionId) return null;

  const adapter = await getAuthAdapterAsync(context.locals);
  const user = await adapter.getSessionUser(sessionId);
  if (user) {
    context.locals.user = user;
  }
  return user;
}
