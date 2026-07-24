/**
 * Auth domain types shared by adapters and auth actions.
 */

import { z } from "zod";
import type {
  AuthenticationResponseJSON as ServerAuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON as ServerPublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON as ServerPublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON as ServerRegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  UserPreferencesSchema,
  parseUserPreferences,
} from "../schemas/userPreferences";

export const ActorRefSchema = z.object({
  id: z.string().min(1, "Actor ID is required"),
  username: z.string().optional(),
  email: z.email().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const SYSTEM_ACTOR: ActorRef = { id: "system", username: "system" };

// ROLE PRESETS & CAPABILITIES

export const RolePresetSchema = z.enum([
  "administrator",
  "manager",
  "content-editor",
  "contributor",
]);
export type RolePreset = z.infer<typeof RolePresetSchema>;

/** Backward-compatible alias */
export const UserRoleSchema = RolePresetSchema;
export type UserRole = RolePreset;

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  administrator: "Administrator",
  manager: "Manager",
  "content-editor": "Content Editor",
  contributor: "Contributor",
};

export function formatUserRoleLabel(role: UserRole | null | undefined): string {
  if (!role) return "";
  return USER_ROLE_LABELS[role] ?? role;
}

export const CapabilitySchema = z.enum([
  "manageUsers",
  "manageRoles",
  "manageSecurity",
  "manageBilling",
  "manageExports",
  "manageBackups",
  "manageIntegrations",
  "manageApiTokens",
  "viewEmailDelivery",
  "manageEmailDelivery",
  "editSiteSettings",
  "editDiscoverySettings",
  "viewDiscoverySettings",
  "manageRedirects",
  "viewRedirects",
  "editAnalytics",
  "viewStudioMetrics",
  "editDomains",
  "editCustomCode",
  "editPages",
  "createPages",
  "deletePages",
  "editPageStructure",
  "editPageContent",
  "editPageSeo",
  "editCms",
  "uploadMedia",
  "useMediaLibrary",
  "syncMedia",
  "publishContent",
  "unpublishContent",
  "reviewContent",
  "moderateComments",
  "editStudioPreferences",
  "useStudioAgent",
  "viewAgentSettings",
  "editAgentSettings",
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manageUsers: "Manage users",
  manageRoles: "Manage roles",
  manageSecurity: "Manage security",
  manageBilling: "Manage billing",
  manageExports: "Export site data",
  manageBackups: "Manage backups",
  manageIntegrations: "Manage integrations",
  manageApiTokens: "Manage API credentials",
  viewEmailDelivery: "View email delivery",
  manageEmailDelivery: "Manage email delivery",
  editSiteSettings: "Edit site settings",
  editDiscoverySettings: "Edit discovery settings",
  viewDiscoverySettings: "View discovery settings",
  manageRedirects: "Manage redirects",
  viewRedirects: "View redirects",
  editAnalytics: "Edit analytics",
  viewStudioMetrics: "View traffic metrics in Studio",
  editDomains: "Edit domains",
  editCustomCode: "Edit custom code",
  editPages: "Manage pages",
  createPages: "Create pages",
  deletePages: "Delete pages",
  editPageStructure: "Edit page layout",
  editPageContent: "Edit page content",
  editPageSeo: "Edit SEO",
  editCms: "Edit CMS",
  uploadMedia: "Upload media",
  useMediaLibrary: "Use media library",
  syncMedia: "Sync media",
  publishContent: "Publish content",
  unpublishContent: "Unpublish content",
  reviewContent: "Review content",
  moderateComments: "Moderate public comments",
  editStudioPreferences: "Edit studio preferences",
  useStudioAgent: "Use Aria Composer agent",
  viewAgentSettings: "View agent settings",
  editAgentSettings: "Edit agent settings",
};

export function formatCapabilityLabel(cap: Capability): string {
  return CAPABILITY_LABELS[cap];
}

export const ROLE_DEFAULT_CAPABILITIES: Record<RolePreset, Capability[]> = {
  administrator: [
    "manageUsers",
    "manageRoles",
    "manageSecurity",
    "manageBilling",
    "manageExports",
    "manageBackups",
    "manageIntegrations",
    "manageApiTokens",
    "viewEmailDelivery",
    "manageEmailDelivery",
    "editSiteSettings",
    "editDiscoverySettings",
    "viewDiscoverySettings",
    "manageRedirects",
    "viewRedirects",
    "editAnalytics",
    "viewStudioMetrics",
    "editDomains",
    "editCustomCode",
    "editPages",
    "createPages",
    "deletePages",
    "editPageStructure",
    "editPageContent",
    "editPageSeo",
    "editCms",
    "uploadMedia",
    "useMediaLibrary",
    "syncMedia",
    "publishContent",
    "unpublishContent",
    "reviewContent",
    "moderateComments",
    "editStudioPreferences",
    "useStudioAgent",
    "viewAgentSettings",
    "editAgentSettings",
  ],
  manager: [
    "viewStudioMetrics",
    "editPages",
    "createPages",
    "deletePages",
    "editPageStructure",
    "editPageContent",
    "editPageSeo",
    "editCms",
    "editSiteSettings",
    "editDiscoverySettings",
    "viewDiscoverySettings",
    "manageRedirects",
    "viewRedirects",
    "uploadMedia",
    "useMediaLibrary",
    "syncMedia",
    "manageExports",
    "manageBackups",
    "publishContent",
    "unpublishContent",
    "moderateComments",
    "editStudioPreferences",
    "useStudioAgent",
    "viewAgentSettings",
    "editAgentSettings",
  ],
  "content-editor": [
    "viewStudioMetrics",
    "viewDiscoverySettings",
    "viewRedirects",
    "editPageContent",
    "editCms",
    "uploadMedia",
    "useMediaLibrary",
    "editStudioPreferences",
    "useStudioAgent",
    "viewAgentSettings",
  ],
  contributor: [
    "editCms",
    "editStudioPreferences",
    "uploadMedia",
    "useMediaLibrary",
    "useStudioAgent",
    "viewAgentSettings",
  ],
};

export const UserPermissionProfileSchema = z.object({
  rolePreset: RolePresetSchema,
  capabilityOverrides: z
    .object({
      allow: z.array(CapabilitySchema).optional(),
      deny: z.array(CapabilitySchema).optional(),
    })
    .optional(),
});
export type UserPermissionProfile = z.infer<typeof UserPermissionProfileSchema>;

export function resolveEffectiveCapabilities(
  profile: UserPermissionProfile,
): Capability[] {
  const defaults = ROLE_DEFAULT_CAPABILITIES[profile.rolePreset];
  const o = profile.capabilityOverrides;
  if (!o) return defaults;
  let r = [...defaults];
  if (o.allow)
    for (const c of o.allow) {
      if (!r.includes(c)) r.push(c);
    }
  if (o.deny) r = r.filter((c) => !o.deny!.includes(c));
  return r;
}

/** Build a permission profile from a role preset, optionally preserving overrides. */
export function buildPermissionProfile(
  rolePreset: RolePreset,
  capabilityOverrides?: UserPermissionProfile["capabilityOverrides"],
): UserPermissionProfile {
  if (!capabilityOverrides) {
    return { rolePreset };
  }

  const allow = capabilityOverrides.allow?.length
    ? [...capabilityOverrides.allow]
    : undefined;
  const deny = capabilityOverrides.deny?.length
    ? [...capabilityOverrides.deny]
    : undefined;

  if (!allow && !deny) {
    return { rolePreset };
  }

  return {
    rolePreset,
    capabilityOverrides: { allow, deny },
  };
}

function sortedCapabilities(caps: Capability[] | undefined): Capability[] {
  return caps ? [...caps].sort() : [];
}

function capabilityOverridesEqual(
  a: UserPermissionProfile["capabilityOverrides"],
  b: UserPermissionProfile["capabilityOverrides"],
): boolean {
  const allowA = sortedCapabilities(a?.allow);
  const allowB = sortedCapabilities(b?.allow);
  const denyA = sortedCapabilities(a?.deny);
  const denyB = sortedCapabilities(b?.deny);

  return (
    allowA.length === allowB.length &&
    denyA.length === denyB.length &&
    allowA.every((cap, index) => cap === allowB[index]) &&
    denyA.every((cap, index) => cap === denyB[index])
  );
}

/** Deep-compare permission profiles for session invalidation. */
export function permissionProfilesEqual(
  a: UserPermissionProfile | undefined,
  b: UserPermissionProfile | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.rolePreset !== b.rolePreset) return false;
  return capabilityOverridesEqual(a.capabilityOverrides, b.capabilityOverrides);
}

export const AssetAuthorshipSchema = z.object({
  createdBy: ActorRefSchema.optional(),
  createdAt: z.string().optional(),
  updatedBy: ActorRefSchema.optional(),
  updatedAt: z.string().optional(),
  publishedBy: ActorRefSchema.optional(),
  publishedAt: z.string().optional(),
  reviewedBy: ActorRefSchema.optional(),
  reviewedAt: z.string().optional(),
  assignedTo: z.string().optional(),
  contributors: z
    .array(
      z.object({
        actor: ActorRefSchema,
        role: z.string().optional(),
      }),
    )
    .optional(),
});
export type AssetAuthorship = z.infer<typeof AssetAuthorshipSchema>;

export const VersionAuthorshipSchema = z.object({
  createdBy: ActorRefSchema.optional(),
  createdAt: z.string().min(1, "Version creation timestamp is required"),
});
export type VersionAuthorship = z.infer<typeof VersionAuthorshipSchema>;

/**
 * Username validation rules:
 * - 3-30 characters
 * - Must start with a letter
 * - Only letters, numbers, and underscores allowed
 */
export const UsernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    "Username must start with a letter and contain only letters, numbers, and underscores",
  );

export const UserNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be at most 120 characters");

/**
 * Password validation - minimum 7 characters
 */
export const PasswordSchema = z
  .string()
  .min(7, "Password must be at least 7 characters");

const StoredUserPreferencesSchema = z.preprocess((input) => {
  const parsed = parseUserPreferences(input);
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}, UserPreferencesSchema.optional());

/**
 * Public user data (safe to expose to frontend)
 */
export const UserSchema = z.object({
  id: z.uuid(),
  username: UsernameSchema,
  name: UserNameSchema.nullable().optional(),
  email: z.email(),
  role: UserRoleSchema,
  permissionProfile: UserPermissionProfileSchema.optional(),
  totpEnabled: z.boolean().default(false),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  avatarUrl: z.string().nullable().optional(),
  preferences: StoredUserPreferencesSchema,
});
export type User = z.infer<typeof UserSchema>;

/**
 * Full user record from database (includes sensitive fields)
 */
export const UserRecordSchema = UserSchema.extend({
  passwordHash: z.string(),
  totpSecret: z.string().nullable().optional(),
  backupCodes: z.string().nullable().optional(), // JSON array of hashed codes
  backupCodesUsed: z.string().nullable().optional(), // JSON array of used indices
});
export type UserRecord = z.infer<typeof UserRecordSchema>;

/**
 * User for context.locals (minimal, safe subset)
 */
export const SessionUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: UserNameSchema.nullable().optional(),
  email: z.email(),
  role: UserRoleSchema,
  permissionProfile: UserPermissionProfileSchema.optional(),
  totpEnabled: z.boolean(),
  avatarUrl: z.string().nullable().optional(),
  preferences: StoredUserPreferencesSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const AuthMethodSchema = z.enum([
  "passkey",
  "password",
  "magic_link",
  "oauth",
  "cloudflare_access",
  "session",
]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

/**
 * Session data stored in KV/SQLite
 */
export const SessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  expiresAt: z.iso.datetime(),
  rememberMe: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  authMethod: AuthMethodSchema.nullable().optional(),
  ip: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const PasskeyTransportSchema = z.enum([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);
export type PasskeyTransport = z.infer<typeof PasskeyTransportSchema>;

export const PasskeyTransportsSchema = z.preprocess((input) => {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return [];
  }
}, z.array(PasskeyTransportSchema).default([]));
export type PasskeyTransports = z.infer<typeof PasskeyTransportsSchema>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasChallenge(value: unknown): boolean {
  return isObjectRecord(value) && typeof value.challenge === "string";
}

export const PublicKeyCredentialCreationOptionsJSONSchema =
  z.custom<ServerPublicKeyCredentialCreationOptionsJSON>(hasChallenge);
export type PublicKeyCredentialCreationOptionsJSON = z.infer<
  typeof PublicKeyCredentialCreationOptionsJSONSchema
>;

export const PublicKeyCredentialRequestOptionsJSONSchema =
  z.custom<ServerPublicKeyCredentialRequestOptionsJSON>(hasChallenge);
export type PublicKeyCredentialRequestOptionsJSON = z.infer<
  typeof PublicKeyCredentialRequestOptionsJSONSchema
>;

export const RegistrationClientExtensionResultsSchema = z
  .custom<ServerRegistrationResponseJSON["clientExtensionResults"]>(
    isObjectRecord,
  )
  .default({});

export const AuthenticationClientExtensionResultsSchema = z
  .custom<ServerAuthenticationResponseJSON["clientExtensionResults"]>(
    isObjectRecord,
  )
  .default({});

export const WebAuthnCredentialAttachmentSchema = z
  .enum(["cross-platform", "platform"])
  .optional();

export const RegistrationResponseJSONSchema: z.ZodType<ServerRegistrationResponseJSON> =
  z
    .object({
      id: z.string().min(1),
      rawId: z.string().min(1),
      response: z
        .object({
          clientDataJSON: z.string().min(1),
          attestationObject: z.string().min(1),
          authenticatorData: z.string().min(1).optional(),
          transports: z.array(PasskeyTransportSchema).optional(),
          publicKey: z.string().min(1).optional(),
          publicKeyAlgorithm: z.int().optional(),
        })
        .strict(),
      type: z.literal("public-key"),
      clientExtensionResults: RegistrationClientExtensionResultsSchema,
      authenticatorAttachment: WebAuthnCredentialAttachmentSchema,
    })
    .strict();
export type RegistrationResponseJSONInput = z.infer<
  typeof RegistrationResponseJSONSchema
>;

export const AuthenticationResponseJSONSchema: z.ZodType<ServerAuthenticationResponseJSON> =
  z
    .object({
      id: z.string().min(1),
      rawId: z.string().min(1),
      response: z
        .object({
          clientDataJSON: z.string().min(1),
          authenticatorData: z.string().min(1),
          signature: z.string().min(1),
          userHandle: z.string().optional(),
        })
        .strict(),
      type: z.literal("public-key"),
      clientExtensionResults: AuthenticationClientExtensionResultsSchema,
      authenticatorAttachment: WebAuthnCredentialAttachmentSchema,
    })
    .strict();
export type AuthenticationResponseJSONInput = z.infer<
  typeof AuthenticationResponseJSONSchema
>;

export const PasskeyCredentialSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  credentialId: z.string().min(1),
  publicKey: z.string().min(1),
  counter: z.int().nonnegative(),
  deviceName: z.string().nullable().optional(),
  transports: PasskeyTransportsSchema,
  backedUp: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable().optional(),
});
export type PasskeyCredential = z.infer<typeof PasskeyCredentialSchema>;

export const PasskeySummarySchema = PasskeyCredentialSchema.omit({
  publicKey: true,
  userId: true,
});
export type PasskeySummary = z.infer<typeof PasskeySummarySchema>;

export const ListPasskeysInputSchema = z
  .object({
    userId: z.uuid().optional(),
  })
  .strict();
export type ListPasskeysInput = z.infer<typeof ListPasskeysInputSchema>;

export const ListPasskeysResponseSchema = z
  .object({
    passkeys: z.array(PasskeySummarySchema),
  })
  .strict();
export type ListPasskeysResponse = z.infer<typeof ListPasskeysResponseSchema>;

export const PasskeyRegisterOptionsInputSchema = z
  .object({
    deviceName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export type PasskeyRegisterOptionsInput = z.infer<
  typeof PasskeyRegisterOptionsInputSchema
>;

export const PasskeyRegisterOptionsResponseSchema = z
  .object({
    challengeId: z.uuid(),
    options: PublicKeyCredentialCreationOptionsJSONSchema,
  })
  .strict();
export type PasskeyRegisterOptionsResponse = z.infer<
  typeof PasskeyRegisterOptionsResponseSchema
>;

export const PasskeyRegisterVerifyInputSchema = z
  .object({
    challengeId: z.uuid(),
    response: RegistrationResponseJSONSchema,
    deviceName: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict();
export type PasskeyRegisterVerifyInput = z.infer<
  typeof PasskeyRegisterVerifyInputSchema
>;

export const PasskeyRegisterVerifyResponseSchema = z
  .object({
    success: z.literal(true),
    passkey: PasskeySummarySchema,
  })
  .strict();
export type PasskeyRegisterVerifyResponse = z.infer<
  typeof PasskeyRegisterVerifyResponseSchema
>;

export const RenamePasskeyInputSchema = z
  .object({
    credentialId: z.string().min(1),
    deviceName: z.string().trim().min(1).max(80),
  })
  .strict();
export type RenamePasskeyInput = z.infer<typeof RenamePasskeyInputSchema>;

export const RemovePasskeyInputSchema = z
  .object({
    credentialId: z.string().min(1),
    userId: z.uuid().optional(),
  })
  .strict();
export type RemovePasskeyInput = z.infer<typeof RemovePasskeyInputSchema>;

export const NewPasskeyCredentialSchema = PasskeyCredentialSchema.extend({
  deviceName: z.string().nullable().optional(),
  lastUsedAt: z.iso.datetime().nullable().optional(),
});
export type NewPasskeyCredential = z.infer<typeof NewPasskeyCredentialSchema>;

export const WebauthnChallengePurposeSchema = z.enum(["register", "login"]);
export type WebauthnChallengePurpose = z.infer<
  typeof WebauthnChallengePurposeSchema
>;

export const WebauthnChallengeSchema = z.object({
  id: z.uuid(),
  challenge: z.string().min(1),
  purpose: WebauthnChallengePurposeSchema,
  userId: z.uuid().nullable().optional(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type WebauthnChallenge = z.infer<typeof WebauthnChallengeSchema>;

export const NewWebauthnChallengeSchema = WebauthnChallengeSchema;
export type NewWebauthnChallenge = z.infer<typeof NewWebauthnChallengeSchema>;

export const SESSION_DURATION = {
  DEFAULT: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  REMEMBER_ME: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
} as const;

/**
 * Session cookie configuration Uses SameSite=Lax which CSRF protection for most
 * cases. Combined with Aria's middleware origin check for form.
 */
export const SESSION_COOKIE = {
  NAME: "aria_session",
  OPTIONS: {
    httpOnly: true,
    secure: false, // Set dynamically in setSessionCookie based on env
    sameSite: "lax" as const,
    path: "/",
  },
} as const;

export const CreateUserInputSchema = z.object({
  username: UsernameSchema,
  name: UserNameSchema.optional(),
  email: z.email(),
  password: PasswordSchema,
  role: UserRoleSchema,
  permissionProfile: UserPermissionProfileSchema.optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

/**
 * Create first admin (setup wizard) — role is forced to admin
 */
export const CreateFirstAdminInputSchema = z
  .object({
    username: UsernameSchema,
    email: z.email(),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type CreateFirstAdminInput = z.infer<typeof CreateFirstAdminInputSchema>;

export const BeginPasskeySetupInputSchema = z
  .object({
    username: UsernameSchema,
    email: z.email(),
  })
  .strict();
export type BeginPasskeySetupInput = z.infer<
  typeof BeginPasskeySetupInputSchema
>;

export const BeginPasskeySetupResponseSchema = z
  .object({
    pendingSetupId: z.uuid(),
    challengeId: z.uuid(),
    options: PublicKeyCredentialCreationOptionsJSONSchema,
  })
  .strict();
export type BeginPasskeySetupResponse = z.infer<
  typeof BeginPasskeySetupResponseSchema
>;

export const CompletePasskeySetupInputSchema = z
  .object({
    pendingSetupId: z.uuid(),
    challengeId: z.uuid(),
    response: RegistrationResponseJSONSchema,
    password: PasswordSchema,
    confirmPassword: z.string(),
    deviceName: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type CompletePasskeySetupInput = z.infer<
  typeof CompletePasskeySetupInputSchema
>;

export const PasskeyLoginOptionsInputSchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
  })
  .strict();
export type PasskeyLoginOptionsInput = z.infer<
  typeof PasskeyLoginOptionsInputSchema
>;

export const PasskeyLoginOptionsResponseSchema = z
  .object({
    challengeId: z.uuid(),
    options: PublicKeyCredentialRequestOptionsJSONSchema,
  })
  .strict();
export type PasskeyLoginOptionsResponse = z.infer<
  typeof PasskeyLoginOptionsResponseSchema
>;

export const PasskeyLoginVerifyInputSchema = z
  .object({
    challengeId: z.uuid(),
    response: AuthenticationResponseJSONSchema,
    rememberMe: z.boolean().default(false),
  })
  .strict();
export type PasskeyLoginVerifyInput = z.infer<
  typeof PasskeyLoginVerifyInputSchema
>;

export const PendingPasskeySetupSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    username: UsernameSchema,
    email: z.email(),
    registerChallengeId: z.uuid(),
    ip: z.string().min(1),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type PendingPasskeySetup = z.infer<typeof PendingPasskeySetupSchema>;

export const UpdateUserInputSchema = z.object({
  id: z.uuid(),
  name: UserNameSchema.nullable().optional(),
  email: z.email().optional(),
  role: UserRoleSchema.optional(),
  avatarUrl: z.string().nullable().optional(),
  permissionProfile: UserPermissionProfileSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;

export const DeleteUserInputSchema = z.object({
  id: z.uuid(),
});
export type DeleteUserInput = z.infer<typeof DeleteUserInputSchema>;

export const LoginInputSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
  // Turnstile documents a 2,048-character maximum. Bound this at the action
  // boundary so malicious clients cannot turn CAPTCHA into a large-payload
  // endpoint.
  captchaToken: z.string().trim().min(1).max(2048).optional(),
  totpCode: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "TOTP code must be numeric")
    .optional(),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

/**
 * Reset user password input (admin action)
 */
export const ResetUserPasswordInputSchema = z.object({
  userId: z.uuid(),
  newPassword: PasswordSchema,
});
export type ResetUserPasswordInput = z.infer<
  typeof ResetUserPasswordInputSchema
>;

export const RequestPasswordResetInputSchema = z.object({
  email: z.email(),
});
export type RequestPasswordResetInput = z.infer<
  typeof RequestPasswordResetInputSchema
>;

export const ConfirmPasswordResetInputSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: PasswordSchema,
});
export type ConfirmPasswordResetInput = z.infer<
  typeof ConfirmPasswordResetInputSchema
>;

export const EnableTotpInputSchema = z.object({
  code: z
    .string()
    .length(6, "TOTP code must be 6 digits")
    .regex(/^\d{6}$/, "TOTP code must be numeric"),
});
export type EnableTotpInput = z.infer<typeof EnableTotpInputSchema>;

export const DisableTotpInputSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
export type DisableTotpInput = z.infer<typeof DisableTotpInputSchema>;

/**
 * Captcha provider options
 */
export const CaptchaProviderSchema = z.enum(["none", "turnstile"]);
export type CaptchaProvider = z.infer<typeof CaptchaProviderSchema>;

const CaptchaHostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "Enter a hostname without a protocol, path, wildcard, or port",
  );

/**
 * Captcha configuration
 */
export const CaptchaConfigSchema = z.object({
  provider: CaptchaProviderSchema,
  siteKey: z.string().optional(),
  allowedHostnames: z.array(CaptchaHostnameSchema).default([]),
  /** Present only for a widget created by Aria; it is never secret. */
  managedByAria: z.boolean().default(false),
});
export type CaptchaConfig = z.infer<typeof CaptchaConfigSchema>;

export const UpdateCaptchaConfigInputSchema = z.object({
  provider: CaptchaProviderSchema,
  siteKey: z.string().optional(),
  allowedHostnames: z.array(CaptchaHostnameSchema).default([]),
});
export type UpdateCaptchaConfigInput = z.infer<
  typeof UpdateCaptchaConfigInputSchema
>;

export const CreateTurnstileWidgetInputSchema = z.object({
  allowedHostnames: z.array(CaptchaHostnameSchema).min(1).max(10),
  name: z.string().trim().min(1).max(254).default("Aria password login"),
});
export type CreateTurnstileWidgetInput = z.infer<
  typeof CreateTurnstileWidgetInputSchema
>;

/**
 * Login response — discriminated union by status
 */
export const LoginResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), user: SessionUserSchema }),
  z.object({ status: z.literal("totp_required"), message: z.string() }),
  z.object({ status: z.literal("totp_setup_required"), message: z.string() }),
  z.object({
    status: z.literal("error"),
    message: z.string(),
    remainingAttempts: z.number().optional(),
  }),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const TotpSetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeUrl: z.string(),
  backupCodes: z.array(z.string()),
});
export type TotpSetupResponse = z.infer<typeof TotpSetupResponseSchema>;

export const RATE_LIMIT = {
  MAX_ATTEMPTS: 10,
  WINDOW_MS: 15 * 60 * 1000,
  LOCKOUT_THRESHOLDS: [
    { breaches: 1, duration: 15 * 60 * 1000 },
    { breaches: 2, duration: 60 * 60 * 1000 },
    { breaches: 3, duration: 24 * 60 * 60 * 1000 },
  ],
} as const;

export const RateLimitRecordSchema = z.object({
  ip: z.string(),
  attempts: z.int().min(0),
  lastAttempt: z.iso.datetime(),
});
export type RateLimitRecord = z.infer<typeof RateLimitRecordSchema>;

export const PasswordResetRecordSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  tokenHash: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type PasswordResetRecord = z.infer<typeof PasswordResetRecordSchema>;

export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export const CONFIG_KEYS = {
  AUTH_METHODS: "auth_methods_config",
  CAPTCHA: "captcha_config",
  TURNSTILE_SECRET: "captcha_turnstile_secret_v1",
  TWO_FACTOR_POLICY: "two_factor_policy",
} as const;

export const OAuthProviderConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    clientId: z.string().min(1).optional(),
    clientSecretConfigured: z.boolean().default(false),
    redirectUri: z.url().optional(),
  })
  .strict();
export type OAuthProviderConfig = z.infer<typeof OAuthProviderConfigSchema>;

export const PasskeyAuthMethodConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    rpName: z.string().trim().min(1).default("Aria"),
    allowedOrigins: z.array(z.url()).default([]),
  })
  .strict();
export type PasskeyAuthMethodConfig = z.infer<
  typeof PasskeyAuthMethodConfigSchema
>;

export const MagicLinkAuthMethodConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    expiryMinutes: z.int().min(5).max(60).default(15),
  })
  .strict();
export type MagicLinkAuthMethodConfig = z.infer<
  typeof MagicLinkAuthMethodConfigSchema
>;

export const PasswordAuthMethodConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    recoveryOnly: z.boolean().default(true),
  })
  .strict();
export type PasswordAuthMethodConfig = z.infer<
  typeof PasswordAuthMethodConfigSchema
>;

export const OAuthAuthMethodConfigSchema = z
  .object({
    github: OAuthProviderConfigSchema.optional(),
    google: OAuthProviderConfigSchema.optional(),
  })
  .strict()
  .default({});
export type OAuthAuthMethodConfig = z.infer<typeof OAuthAuthMethodConfigSchema>;

export const CloudflareAccessAuthMethodConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    teamDomain: z.string().min(1).optional(),
    audience: z.string().min(1).optional(),
  })
  .strict();
export type CloudflareAccessAuthMethodConfig = z.infer<
  typeof CloudflareAccessAuthMethodConfigSchema
>;

export const AuthMethodsConfigSchema = z
  .object({
    passkey: PasskeyAuthMethodConfigSchema.default({
      enabled: true,
      rpName: "Aria",
      allowedOrigins: [],
    }),
    magicLink: MagicLinkAuthMethodConfigSchema.default({
      enabled: false,
      expiryMinutes: 15,
    }),
    password: PasswordAuthMethodConfigSchema.default({
      enabled: true,
      recoveryOnly: true,
    }),
    oauth: OAuthAuthMethodConfigSchema,
    cloudflareAccess: CloudflareAccessAuthMethodConfigSchema.default({
      enabled: false,
    }),
  })
  .strict();
export type AuthMethodsConfig = z.infer<typeof AuthMethodsConfigSchema>;

export const PublicAuthMethodsAvailabilitySchema = z
  .object({
    passkey: z
      .object({
        enabled: z.boolean(),
        rpName: z.string(),
      })
      .strict(),
    password: z
      .object({
        enabled: z.boolean(),
        recoveryOnly: z.boolean(),
      })
      .strict(),
    magicLink: z
      .object({
        enabled: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type PublicAuthMethodsAvailability = z.infer<
  typeof PublicAuthMethodsAvailabilitySchema
>;

export const UpdateAuthMethodsConfigInputSchema = z
  .object({
    passkey: PasskeyAuthMethodConfigSchema.optional(),
  })
  .strict();
export type UpdateAuthMethodsConfigInput = z.infer<
  typeof UpdateAuthMethodsConfigInputSchema
>;

export const AuthEventTypeSchema = z.enum([
  "login_success",
  "login_failure",
  "logout",
  "session_revoked",
  "passkey_registered",
  "passkey_removed",
  "passkey_auth_failure",
  "magic_link_sent",
  "magic_link_consumed",
  "security_settings_updated",
]);
export type AuthEventType = z.infer<typeof AuthEventTypeSchema>;

export const AuthFailureCodeSchema = z.enum([
  "invalid_credentials",
  "rate_limited",
  "captcha_required",
  "captcha_failed",
  "totp_required",
  "totp_setup_required",
  "totp_invalid",
]);
export type AuthFailureCode = z.infer<typeof AuthFailureCodeSchema>;

export const AuthEventMetadataSchema = z.record(z.string(), z.unknown());
export type AuthEventMetadata = z.infer<typeof AuthEventMetadataSchema>;

export const AuthEventSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid().nullable(),
    eventType: AuthEventTypeSchema,
    authMethod: AuthMethodSchema.nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    success: z.boolean(),
    metadata: AuthEventMetadataSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type AuthEvent = z.infer<typeof AuthEventSchema>;

export const NewAuthEventSchema = AuthEventSchema.omit({
  id: true,
  createdAt: true,
});
export type NewAuthEvent = z.infer<typeof NewAuthEventSchema>;

export const AuthEventQuerySchema = z
  .object({
    userId: z.uuid().optional(),
    eventType: AuthEventTypeSchema.optional(),
    authMethod: AuthMethodSchema.optional(),
    success: z.boolean().optional(),
    limit: z.int().positive().max(250).default(50),
  })
  .strict();
export type AuthEventQuery = z.infer<typeof AuthEventQuerySchema>;

export const TwoFactorPolicySchema = z.object({
  enforce: z.boolean(),
});
export type TwoFactorPolicy = z.infer<typeof TwoFactorPolicySchema>;

export const UpdateTwoFactorPolicyInputSchema = z.object({
  enforce: z.boolean(),
});
export type UpdateTwoFactorPolicyInput = z.infer<
  typeof UpdateTwoFactorPolicyInputSchema
>;

export const VerifyBackupCodeInputSchema = z.object({
  code: z.string().min(1, "Backup code is required"),
});
export type VerifyBackupCodeInput = z.infer<typeof VerifyBackupCodeInputSchema>;

export const AdminInitTotpInputSchema = z.object({ userId: z.uuid() });
export type AdminInitTotpInput = z.infer<typeof AdminInitTotpInputSchema>;

export const AdminEnableTotpInputSchema = z.object({
  userId: z.uuid(),
  code: z
    .string()
    .length(6, "TOTP code must be 6 digits")
    .regex(/^\d{6}$/, "TOTP code must be numeric"),
});
export type AdminEnableTotpInput = z.infer<typeof AdminEnableTotpInputSchema>;

export const AdminDisableTotpInputSchema = z.object({
  userId: z.uuid(),
  password: z.string().min(1, "Password is required to confirm"),
});
export type AdminDisableTotpInput = z.infer<typeof AdminDisableTotpInputSchema>;

export const AdminRegenerateBackupCodesInputSchema = z.object({
  userId: z.uuid(),
});
export type AdminRegenerateBackupCodesInput = z.infer<
  typeof AdminRegenerateBackupCodesInputSchema
>;

export const AuthSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});
export type AuthSuccessResponse = z.infer<typeof AuthSuccessResponseSchema>;

export const SetupRequiredResponseSchema = z.object({
  setupRequired: z.boolean(),
});
export type SetupRequiredResponse = z.infer<typeof SetupRequiredResponseSchema>;

export const BootstrapUserIdSchema = z.uuid();
export type BootstrapUserId = z.infer<typeof BootstrapUserIdSchema>;

export const BootstrapUserConfigValueSchema = BootstrapUserIdSchema;

export const ListUsersResponseSchema = z.object({
  users: z.array(UserSchema),
  bootstrapUserId: BootstrapUserIdSchema.nullable(),
});
export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;
