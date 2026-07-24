import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type Uint8Array_,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import type { AuthAdapter } from "../adapter";
import { now } from "../session";
import type {
  PasskeyCredential,
  PasskeyTransport,
  NewPasskeyCredential,
  User,
} from "../types";
import { PasskeyTransportsSchema } from "../types";
import {
  getAuthMethodsConfig,
  resolveAllowedOrigins,
  resolveExpectedRpIds,
  resolveRpId,
} from "./registry";

const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeyAuthFailureCode =
  | "credential_not_found"
  | "user_mismatch"
  | "signature_invalid";

export class PasskeyAuthFailureError extends Error {
  readonly code: PasskeyAuthFailureCode;

  constructor(code: PasskeyAuthFailureCode, message = "Passkey sign-in failed.") {
    super(message);
    this.name = "PasskeyAuthFailureError";
    this.code = code;
  }
}

export interface PasskeyRegistrationUser {
  id: string;
  username: string;
  email: string;
}

export interface PasskeyRegistrationOptionsContext {
  adapter: AuthAdapter;
  requestUrl: string;
  user: PasskeyRegistrationUser;
  challengeUserId?: string | null;
  existingCredentials?: PasskeyCredential[];
}

export interface PasskeyRegistrationOptionsResult {
  challengeId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
}

export interface PasskeyVerificationContext {
  adapter: AuthAdapter;
  requestUrl: string;
  challengeId: string;
  response: RegistrationResponseJSON;
  userId: string;
  deviceName?: string | null;
}

export interface PasskeyAuthenticationOptionsContext {
  adapter: Pick<
    AuthAdapter,
    | "createWebauthnChallenge"
    | "getConfig"
    | "listAllPasskeyCredentials"
    | "listPasskeyCredentials"
    | "setConfig"
  >;
  requestUrl: string;
  userId?: string;
}

export interface PasskeyAuthenticationOptionsResult {
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}

type PasskeyConfigAdapter = Pick<AuthAdapter, "getConfig" | "setConfig">;

type PasskeyAuthenticationVerificationAdapter = PasskeyConfigAdapter &
  Pick<
    AuthAdapter,
    | "consumeWebauthnChallenge"
    | "getPasskeyCredentialByCredentialId"
    | "updatePasskeyCredentialUsage"
  >;

export interface PasskeyAuthenticationVerificationContext {
  adapter: PasskeyAuthenticationVerificationAdapter;
  requestUrl: string;
  challengeId: string;
  response: AuthenticationResponseJSON;
}

export interface PasskeyAuthenticationVerificationResult {
  userId: string;
  credentialId: string;
  newCounter: number;
}

type PasskeyRecoveryAdapter = Pick<AuthAdapter, "getUserByUsername">;

type PasskeyRemovalAdapter = Pick<
  AuthAdapter,
  "countPasskeyCredentials" | "deletePasskeyCredential" | "getUserByUsername"
>;

function userIdBytes(userId: string): Uint8Array_ {
  return new TextEncoder().encode(userId).slice();
}

function challengeExpiry(): string {
  return new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS).toISOString();
}

function toWebAuthnCredential(
  credential: PasskeyCredential,
): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: isoBase64URL.toBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports,
  };
}

function normalizeTransports(input: unknown): PasskeyTransport[] {
  return PasskeyTransportsSchema.parse(input);
}

function logPasskeyVerifyFailure(
  code: PasskeyAuthFailureCode,
  details: Record<string, unknown>,
): void {
  if (import.meta.env.DEV) {
    console.error(`[Auth] passkey verify failed (${code}):`, details);
  }
}

async function assertPasskeyEnabled(
  adapter: PasskeyConfigAdapter,
  requestUrl: string,
) {
  const config = await getAuthMethodsConfig(adapter, { requestUrl });
  if (!config.passkey.enabled) {
    throw new Error("Passkeys are disabled for this workspace.");
  }
  return config;
}

export async function createRegistrationOptions(
  context: PasskeyRegistrationOptionsContext,
): Promise<PasskeyRegistrationOptionsResult> {
  const config = await assertPasskeyEnabled(context.adapter, context.requestUrl);
  const rpID = resolveRpId(context.requestUrl);
  const existingCredentials =
    context.existingCredentials ??
    (context.challengeUserId === null
      ? []
      : await context.adapter.listPasskeyCredentials(context.user.id));

  const options = await generateRegistrationOptions({
    rpName: config.passkey.rpName,
    rpID,
    userID: userIdBytes(context.user.id),
    userName: context.user.email,
    userDisplayName: context.user.username,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  const challengeId = crypto.randomUUID();
  await context.adapter.createWebauthnChallenge({
    id: challengeId,
    challenge: options.challenge,
    purpose: "register",
    userId:
      context.challengeUserId === undefined
        ? context.user.id
        : context.challengeUserId,
    expiresAt: challengeExpiry(),
    createdAt: now(),
  });

  return { challengeId, options };
}

export async function verifyRegistration(
  context: PasskeyVerificationContext,
): Promise<PasskeyCredential> {
  const credential = await verifyRegistrationCeremony(context);
  return context.adapter.createPasskeyCredential(credential);
}

export async function verifyRegistrationCeremony(
  context: PasskeyVerificationContext,
): Promise<NewPasskeyCredential> {
  const config = await assertPasskeyEnabled(context.adapter, context.requestUrl);
  const challenge = await context.adapter.consumeWebauthnChallenge(
    context.challengeId,
  );

  if (!challenge || challenge.purpose !== "register") {
    throw new Error("Passkey registration expired. Start again.");
  }

  if (challenge.userId && challenge.userId !== context.userId) {
    throw new Error("Passkey registration does not match this user.");
  }

  const verification = await verifyRegistrationResponse({
    response: context.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: resolveAllowedOrigins(config, context.requestUrl),
    expectedRPID: resolveExpectedRpIds(context.requestUrl),
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new Error("Passkey registration could not be verified.");
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;
  const createdAt = now();

  return {
    id: crypto.randomUUID(),
    userId: context.userId,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    deviceName: context.deviceName ?? null,
    transports: normalizeTransports(credential.transports ?? []),
    backedUp: credentialBackedUp,
    createdAt,
    lastUsedAt: null,
  };
}

export async function createAuthenticationOptions(
  context: PasskeyAuthenticationOptionsContext,
): Promise<PasskeyAuthenticationOptionsResult> {
  await assertPasskeyEnabled(context.adapter, context.requestUrl);

  const credentials = context.userId
    ? await context.adapter.listPasskeyCredentials(context.userId)
    : await context.adapter.listAllPasskeyCredentials();

  const options = await generateAuthenticationOptions({
    rpID: resolveRpId(context.requestUrl),
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports,
    })),
    userVerification: "required",
  });

  const challengeId = crypto.randomUUID();
  await context.adapter.createWebauthnChallenge({
    id: challengeId,
    challenge: options.challenge,
    purpose: "login",
    userId: context.userId ?? null,
    expiresAt: challengeExpiry(),
    createdAt: now(),
  });

  return { challengeId, options };
}

export async function verifyAuthentication(
  context: PasskeyAuthenticationVerificationContext,
): Promise<PasskeyAuthenticationVerificationResult> {
  const config = await assertPasskeyEnabled(context.adapter, context.requestUrl);
  const challenge = await context.adapter.consumeWebauthnChallenge(
    context.challengeId,
  );

  if (!challenge || challenge.purpose !== "login") {
    throw new Error("Passkey sign-in expired. Try again.");
  }

  const credential = await context.adapter.getPasskeyCredentialByCredentialId(
    context.response.id,
  );
  if (!credential) {
    logPasskeyVerifyFailure("credential_not_found", {
      responseId: context.response.id,
    });
    throw new PasskeyAuthFailureError("credential_not_found");
  }

  if (challenge.userId && challenge.userId !== credential.userId) {
    logPasskeyVerifyFailure("user_mismatch", {
      responseId: context.response.id,
      challengeUserId: challenge.userId,
      credentialUserId: credential.userId,
    });
    throw new PasskeyAuthFailureError("user_mismatch");
  }

  const verification = await verifyAuthenticationResponse({
    response: context.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: resolveAllowedOrigins(config, context.requestUrl),
    expectedRPID: resolveExpectedRpIds(context.requestUrl),
    credential: toWebAuthnCredential(credential),
    requireUserVerification: true,
  });

  if (!verification.verified) {
    logPasskeyVerifyFailure("signature_invalid", {
      responseId: context.response.id,
      credentialId: credential.credentialId,
    });
    throw new PasskeyAuthFailureError("signature_invalid");
  }

  const { credentialID, newCounter } = verification.authenticationInfo;
  const nextCounter = Math.max(credential.counter, newCounter);

  await context.adapter.updatePasskeyCredentialUsage(credentialID, {
    counter: nextCounter,
    lastUsedAt: now(),
  });

  return {
    userId: credential.userId,
    credentialId: credentialID,
    newCounter: nextCounter,
  };
}

export async function listPasskeys(
  adapter: AuthAdapter,
  userId: string,
): Promise<PasskeyCredential[]> {
  return adapter.listPasskeyCredentials(userId);
}

export async function countUserPasskeys(
  adapter: AuthAdapter,
  userId: string,
): Promise<number> {
  return adapter.countPasskeyCredentials(userId);
}

export async function userHasRecoveryMethod(
  adapter: PasskeyRecoveryAdapter,
  user: Pick<User, "username">,
): Promise<boolean> {
  const record = await adapter.getUserByUsername(user.username);
  return Boolean(record?.passwordHash && record.passwordHash.length > 0);
}

export async function removePasskey(
  adapter: PasskeyRemovalAdapter,
  user: Pick<User, "id" | "username">,
  credentialId: string,
): Promise<void> {
  const passkeyCount = await adapter.countPasskeyCredentials(user.id);
  const hasRecoveryMethod = await userHasRecoveryMethod(adapter, user);

  if (passkeyCount <= 1 && !hasRecoveryMethod) {
    throw new Error("Add a recovery password or another passkey first.");
  }

  await adapter.deletePasskeyCredential(user.id, credentialId);
}

export async function renamePasskey(
  adapter: AuthAdapter,
  userId: string,
  credentialId: string,
  deviceName: string | null,
): Promise<void> {
  await adapter.renamePasskeyCredential(userId, credentialId, deviceName);
}
